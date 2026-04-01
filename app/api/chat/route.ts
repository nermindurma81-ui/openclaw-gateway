import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { message, userId, conversationId, agentId } = await req.json();

    // 1. POVUCI KONFIGURACIJU AGENTA IZ BAZE (ONU KOJU JE SYNC UBACIO)
    const { data: agentData } = await sb.from('system_settings').select('value').eq('key', `agent_config_${agentId}`).single();
    if (!agentData) throw new Error("Agent nije pronađen u bazi. Uradi Sync.");
    
    const config = JSON.parse(agentData.value);

    // 2. POVUCI TVOJE SKILLOVE IZ BACKUPA (AGENTIC CODING ITD.)
    const { data: skls } = await sb.from('installed_skills').select('*').eq('user_id', userId);
    const skillSet = skls?.map(s => `[SKILL: ${s.name}]: ${s.instructions}`).join('\n');

    const finalPrompt = `${config.soul}\n\nKORISTI OVE PROTOKOLE:\n${skillSet}`;

    let aiText = "";

    // 3. AKO JE AGENT NA POLLINATIONS MOTORU (POTPUNO BESPLATNO)
    if (config.engine === 'pollinations') {
      const res = await fetch('https://text.pollinations.ai/', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: finalPrompt },
            { role: "user", content: message }
          ],
          model: config.model, // 'openai'
          seed: 42
        })
      });
      aiText = await res.text(); // Pollinations vraća čist tekst
    } 
    
    // Ovdje može ostati fallback na Groq/GitHub ako agent to zahtjeva...

    // 4. SNIMI U BAZU
    await sb.from('chat_messages').insert([
        { conversation_id: conversationId, user_id: userId, role: 'user', content: message },
        { conversation_id: conversationId, user_id: userId, role: 'assistant', content: aiText }
    ]);

    return NextResponse.json({ text: aiText });

  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
