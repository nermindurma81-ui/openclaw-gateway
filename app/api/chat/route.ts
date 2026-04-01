import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { message, action, repo } = await req.json();

    // 1. STVARNI SYNC SA GITHUB-A
    if (action === 'sync') {
      const ghToken = process.env.GITHUB_TOKEN;
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/SOUL.md`, {
        headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const data = await res.json();
      const soul = Buffer.from(data.content, 'base64').toString();
      await sb.from('system_settings').upsert({ key: 'bot_soul', value: soul });
      return NextResponse.json({ success: true }, { headers });
    }

    // 2. STVARNI CHAT (GROQ / POLLINATIONS)
    const { data: stngs } = await sb.from('system_settings').select('*');
    const soul = stngs?.find(s => s.key === 'bot_soul')?.value || "Ti si Kralj.";
    
    // Zovi Groq (fizički)
    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{role: 'system', content: soul}, {role: 'user', content: message}]
      })
    });
    const aiData = await aiRes.json();
    const text = aiData.choices[0].message.content;

    // Snimi u bazu
    await sb.from('chat_messages').insert([{ role: 'user', content: message }, { role: 'assistant', content: text }]);

    return NextResponse.json({ text }, { headers });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500, headers }); }
}
