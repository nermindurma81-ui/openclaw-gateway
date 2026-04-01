import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- ČELIČNI CORS HEADERS ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 1. DOZVOLA ZA BROWSER (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// 2. TESTNI REZERVNI LINK (GET) - Da ne vidiš više Not Found
export async function GET() {
  return NextResponse.json({ status: "Kralj Gateway je Online 👑", version: "2.5.0" }, { headers: corsHeaders });
}

// 3. GLAVNA LOGIKA (POST)
export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  try {
    const body = await req.json();
    const { message, userId, conversationId, agentId, action, repo } = body;

    // --- STVARNA SINKRONIZACIJA ---
    if (action === 'sync') {
      const h = { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };
      const soulRes = await fetch(`https://api.github.com/repos/${repo}/contents/SOUL.md`, { headers: h });
      const soulData = await soulRes.json();
      const soul = Buffer.from(soulData.content, 'base64').toString();
      await sb.from('system_settings').upsert({ key: 'bot_soul', value: soul });
      await sb.from('system_settings').upsert({ key: 'is_provisioned', value: 'true' });
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    // --- STVARNI CHAT ---
    const { data: stngs } = await sb.from('system_settings').select('*');
    const soul = stngs?.find(s => s.key === 'bot_soul')?.value || "Ti si Kralj.";
    
    // Zovi Groq (Realna konekcija)
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{role: 'system', content: soul}, {role: 'user', content: message}]
      })
    });
    const data = await res.json();
    const aiText = data.choices[0].message.content;

    // Snimi u bazu
    await sb.from('chat_messages').insert([{ role: 'user', content: message }, { role: 'assistant', content: aiText }]);

    return NextResponse.json({ text: aiText }, { headers: corsHeaders });
  } catch (e: any) { 
    return NextResponse.json({ error: e.message }, { status: 500, headers: corsHeaders }); 
  }
}
