import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- CORS KONFIGURACIJA ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  try {
    const { message, userId, conversationId, agentId } = await req.json();

    // 1. POVUCI BRAIN PODATKE
    const { data: stngs } = await sb.from('system_settings').select('*');
    const { data: skls } = await sb.from('installed_skills').select('*');
    const soul = stngs?.find(s => s.key === 'soul')?.value || "";
    const identity = stngs?.find(s => s.key === 'identity')?.value || "Ti si Kralj.";
    const sysPrompt = `${identity}\n${soul}\nSKILLS:\n${skls?.map(s => s.instructions).join('\n')}`;

    let aiText = "";

    // 2. LOGIKA: AKO JE BESPLATNI KODER (POLLINATIONS)
    if (agentId === 'koder-pro') {
      const res = await fetch('https://text.pollinations.ai/', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{role:'system', content: sysPrompt}, {role:'user', content: message}],
          model: "openai"
        })
      });
      aiText = await res.text();
    } 
    // 3. FAILOVER LOGIKA (GROQ -> GITHUB)
    else {
      const { data: tokens } = await sb.from('ai_tokens').select('*').eq('is_active', true).order('last_used', {ascending: true});
      const groqKey = tokens?.find(t => t.provider === 'groq')?.token || process.env.GROQ_API_KEY;
      
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{role:'system', content: sysPrompt}, {role:'user', content: message}]
        })
      });
      const data = await res.json();
      aiText = data.choices[0].message.content;
    }

    // 4. SNIMI PORUKE
    await sb.from('chat_messages').insert([
      { conversation_id: conversationId, role: 'user', content: message, user_id: userId },
      { conversation_id: conversationId, role: 'assistant', content: aiText, user_id: userId }
    ]);

    return NextResponse.json({ text: aiText }, { headers: corsHeaders });
  } catch (e: any) { 
    return NextResponse.json({ error: e.message }, { status: 500, headers: corsHeaders }); 
  }
}
