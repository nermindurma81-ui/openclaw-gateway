import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders }); }

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { message, userId, conversationId, agentId, fileUrl } = await req.json();

    // 1. POVUCI SVE IZ BAZE
    const { data: stngs } = await sb.from('system_settings').select('*');
    const { data: skls } = await sb.from('installed_skills').select('*');
    const ollamaUrl = stngs?.find(s => s.key === 'ollama_url')?.value;
    const soul = stngs?.find(s => s.key === 'soul')?.value || "";
    const skills = skls?.map(s => `[${s.name}]: ${s.instructions}`).join('\n');
    
    const systemPrompt = `IDENTITY: Kralj 👑\nSOUL: ${soul}\nSKILLS:\n${skills}\n${fileUrl ? `KORISNIK JE POSLAO FAJL: ${fileUrl}` : ''}`;

    let aiText = "";

    // 2. LOGIKA IZVORA
    if (agentId === 'ollama-local') {
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        body: JSON.stringify({ model: "llama3", prompt: `${systemPrompt}\n\nUser: ${message}`, stream: false })
      });
      const data = await res.json();
      aiText = data.response;
    } else if (agentId === 'koder-pro') {
      const res = await fetch('https://text.pollinations.ai/', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{role:'system', content: systemPrompt}, {role:'user', content: message}], model: "openai" })
      });
      aiText = await res.text();
    } else {
      // Groq / GitHub Failover logic (ovdje ide raniji dugački kod za failover)
      const { data: tokens } = await sb.from('ai_tokens').select('*').eq('is_active', true).limit(1).single();
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${tokens?.token || process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{role:'system', content: systemPrompt}, {role:'user', content: message}] })
      });
      const data = await res.json();
      aiText = data.choices[0].message.content;
    }

    // 3. SNIMI U BAZU
    await sb.from('chat_messages').insert([{ conversation_id: conversationId, user_id: userId, role: 'user', content: message, file_url: fileUrl }, { conversation_id: conversationId, user_id: userId, role: 'assistant', content: aiText }]);

    return new NextResponse(JSON.stringify({ text: aiText }), { status: 200, headers: corsHeaders });
  } catch (e: any) { return new NextResponse(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
}
