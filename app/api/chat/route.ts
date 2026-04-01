import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  try {
    const { message, userId, conversationId, instanceId, agentId, fileUrl, action, repo } = await req.json();

    // --- REAL LOGIC: SYNC (PROVISIONING) ---
    if (action === 'sync') {
      const h = { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` };
      const soulRes = await fetch(`https://api.github.com/repos/${repo}/contents/SOUL.md`, { headers: h });
      const soulData = await soulRes.json();
      const soul = Buffer.from(soulData.content, 'base64').toString();
      
      await sb.from('system_settings').upsert({ key: `soul_${instanceId}`, value: soul });

      const skRes = await fetch(`https://api.github.com/repos/${repo}/contents/skills`, { headers: h });
      if (skRes.ok) {
        const folders = await skRes.json();
        for (const f of folders) {
          const file = await fetch(`${f.url.split('?')[0]}/SKILL.md`, { headers: h });
          if (file.ok) {
            const d = await file.json();
            await sb.from('installed_skills').upsert({ instance_id: instanceId, name: f.name, instructions: Buffer.from(d.content, 'base64').toString() });
          }
        }
      }
      return new NextResponse(JSON.stringify({ success: true }), { headers: cors });
    }

    // --- REAL LOGIC: CHAT GATEWAY ---
    const { data: stngs } = await sb.from('system_settings').select('*');
    const { data: skls } = await sb.from('installed_skills').select('*').eq('instance_id', instanceId);
    const { data: tokens } = await sb.from('ai_tokens').select('*').eq('is_active', true).order('last_used', { ascending: true });

    const soul = stngs?.find(s => s.key === `soul_${instanceId}`)?.value || "";
    const skills = skls?.map(s => `[TOOL: ${s.name}]: ${s.instructions}`).join('\n');
    const systemPrompt = `IDENTITY: Kralj 👑\nSOUL: ${soul}\nSKILLS:\n${skills}\n${fileUrl ? `Korisnik je priložio fajl: ${fileUrl}` : ''}`;

    let aiText = "";
    let success = false;

    // Failover Array: [Groq, GitHub, Pollinations]
    const providers = [
      { id: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
      { id: 'github', url: 'https://models.inference.ai.azure.com/chat/completions', model: 'gpt-4o' }
    ];

    for (const p of providers) {
      const pToken = tokens?.find(t => t.provider === p.id)?.token || (p.id === 'groq' ? process.env.GROQ_API_KEY : null);
      if (!pToken) continue;

      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${pToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: p.model, messages: [{role:'system', content: systemPrompt}, {role:'user', content: message}] })
      });

      if (res.status === 200) {
        const d = await res.json();
        aiText = d.choices[0].message.content;
        await sb.from('ai_tokens').update({ last_used: new Date() }).eq('token', pToken);
        success = true; break;
      } else if (res.status === 429) {
        await sb.from('ai_tokens').update({ is_active: false }).eq('token', pToken);
      }
    }

    // Zadnja šansa: Pollinations (Free)
    if (!success) {
      const res = await fetch('https://text.pollinations.ai/', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{role:'system', content: systemPrompt}, {role:'user', content: message}], model: "openai" })
      });
      aiText = await res.text();
    }

    await sb.from('chat_messages').insert([{ conversation_id: conversationId, role: 'user', content: message, file_url: fileUrl }, { conversation_id: conversationId, role: 'assistant', content: aiText }]);

    return new NextResponse(JSON.stringify({ text: aiText }), { status: 200, headers: cors });
  } catch (e: any) { return new NextResponse(JSON.stringify({ error: e.message }), { status: 500, headers: cors }); }
}
