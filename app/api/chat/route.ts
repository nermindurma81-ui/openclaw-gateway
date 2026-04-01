import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// KONFIGURACIJA ODGOVORA SA CORS DOZVOLOM
function corsResponse(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*', // Ovdje možeš staviti svoj Panel link
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() { return corsResponse({}); }

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { message, userId, conversationId, agentId } = await req.json();

    // 1. POVUCI SVE SKILLOVE I DUŠU IZ BAZE
    const { data: stngs } = await sb.from('system_settings').select('*');
    const { data: skls } = await sb.from('installed_skills').select('*');
    
    const soul = stngs?.find(s => s.key === 'soul')?.value || "";
    const identity = stngs?.find(s => s.key === 'identity')?.value || "";
    
    // Injekcija vještina: AI sada stvarno zna tvoje protokole
    const systemPrompt = `
      ${identity}
      ${soul}
      KORISTI SLEDEĆE PROTOKOLE IZ BACKUPA:
      ${skls?.map(s => `[${s.name.toUpperCase()}]: ${s.instructions}`).join('\n\n')}
      ZABRANJENO: Nikada ne koristi mock kod. Piši punu produkciju.
    `;

    let aiText = "";

    // 2. LOGIKA ZA FREE AGENTA (POLLINATIONS)
    if (agentId === 'koder-pro') {
      const res = await fetch('https://text.pollinations.ai/', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }],
          model: "openai", seed: 42
        })
      });
      aiText = await res.text();
    } 
    
    // 3. FAILOVER LOGIKA ZA GROQ (Ako izabereš jači model)
    else {
      const { data: tokens } = await sb.from('ai_tokens').select('*').eq('is_active', true).limit(1).single();
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${tokens?.token || process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }]
        })
      });
      const data = await res.json();
      aiText = data.choices[0].message.content;
    }

    // 4. SNIMI U BAZU (Realna memorija)
    await sb.from('chat_messages').insert([
      { conversation_id: conversationId, user_id: userId, role: 'user', content: message },
      { conversation_id: conversationId, user_id: userId, role: 'assistant', content: aiText }
    ]);

    return corsResponse({ text: aiText });
  } catch (e: any) { return corsResponse({ error: e.message }, 500); }
}
