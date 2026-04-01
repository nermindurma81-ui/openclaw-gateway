import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// INICIJALIZACIJA SUPABASE SA SERVICE ROLE KLJUČEM (ZA BYPASS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { message, userId, conversationId, agentId } = await req.json();

    // 1. ADMIN BYPASS LOGIKA
    // Ako šalješ ID nula, sistem te automatski tretira kao Nermina (Unlimited)
    const IS_ADMIN_BYPASS = (userId === '00000000-0000-0000-0000-000000000000');
    const adminEmail = "nermindurma81@gmail.com";

    // 2. POVUCI "MOZAK" IZ BAZE (SOUL + IDENTITY + SKILLS)
    // Ovo su podaci koje je Sync povukao sa tvog Kralj-backup repoa
    const { data: stngs } = await supabaseAdmin.from('system_settings').select('key, value');
    const { data: skls } = await supabaseAdmin.from('installed_skills').select('name, instructions');

    const soul = stngs?.find(s => s.key === 'soul')?.value || "Pričaj bratski na bosanskom.";
    const identity = stngs?.find(s => s.key === 'identity')?.value || "Ti si Kralj 👑.";
    const skillSet = skls?.map(s => `[SKILL: ${s.name}]: ${s.instructions}`).join('\n\n');

    const systemInstructions = `
      ${identity}
      ${soul}
      
      KORISTI OVE INSTALIRANE PROTOKOLE:
      ${skillSet}
      
      NAPOMENA: Nikada ne koristi mock kod. Piši pravu produkciju.
    `;

    let aiText = "";

    // --- CASE A: AGENT HUB (POLLINATIONS - POTPUNO FREE BEZ KLJUČA) ---
    // Ako je korisnik izabrao koder-pro ili nekog drugog free bota
    if (agentId === 'koder-pro' || !process.env.GROQ_API_KEY) {
      const res = await fetch('https://text.pollinations.ai/', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemInstructions },
            { role: "user", content: message }
          ],
          model: "openai", // Pollinations koristi GPT-4o-mini nivo modela
          seed: 42
        })
      });
      aiText = await res.text();
    } 
    
    // --- CASE B: FAILOVER GATEWAY (GROQ -> GITHUB MODELS) ---
    // Ako Pollinations nije opcija ili želimo jače modele
    else {
      // Reaktiviraj tokene kojima je istekao limit (stariji od 24h)
      await supabaseAdmin.from('ai_tokens').update({ is_active: true, limited_at: null })
        .lt('limited_at', new Date(Date.now() - 86400000).toISOString());

      const { data: tokens } = await supabaseAdmin.from('ai_tokens')
        .select('*')
        .eq('is_active', true)
        .order('last_used', { ascending: true });

      // Spoji Groq i GitHub tokene (Groq ima prioritet)
      const allTokens = [
        ...(tokens?.filter(t => t.provider === 'groq') || []),
        ...(tokens?.filter(t => t.provider === 'github') || [])
      ];

      let success = false;
      for (const t of allTokens) {
        const endpoint = t.provider === 'groq' 
          ? "https://api.groq.com/openai/v1/chat/completions" 
          : "https://models.inference.ai.azure.com/chat/completions";

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { 
              "Authorization": `Bearer ${t.token}`,
              "Content-Type": "application/json" 
            },
            body: JSON.stringify({
              model: t.provider === 'groq' ? "llama-3.3-70b-versatile" : "gpt-4o",
              messages: [
                { role: "system", content: systemInstructions },
                { role: "user", content: message }
              ]
            })
          });

          if (res.status === 429) { // Rate limit reached
            await supabaseAdmin.from('ai_tokens').update({ is_active: false, limited_at: new Date() }).eq('id', t.id);
            continue; 
          }

          const data = await res.json();
          aiText = data.choices[0].message.content;
          await supabaseAdmin.from('ai_tokens').update({ last_used: new Date() }).eq('id', t.id);
          success = true;
          break;
        } catch (e) {
          console.error("Token error, trying next...");
        }
      }

      // Ako ništa od tokena ne radi, probaj master GROQ_API_KEY iz env-a
      if (!success && process.env.GROQ_API_KEY) {
        const masterRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemInstructions },
              { role: "user", content: message }
            ]
          })
        });
        const masterData = await masterRes.json();
        aiText = masterData.choices[0].message.content;
      }
    }

    if (!aiText) throw new Error("AI Engine nije vratio odgovor.");

    // 3. SNIMI SESIJU U SUPABASE (DA PAMTI CHAT)
    await supabaseAdmin.from('chat_messages').insert([
      { 
        conversation_id: conversationId, 
        user_id: userId, 
        role: 'user', 
        content: message 
      },
      { 
        conversation_id: conversationId, 
        user_id: userId, 
        role: 'assistant', 
        content: aiText 
      }
    ]);

    return NextResponse.json({ text: aiText });

  } catch (error: any) {
    console.error("Gateway Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
