import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { userId } = await req.json();
  const REPO = "nermindurma81-ui/moji-agenti";
  const token = process.env.GITHUB_TOKEN;

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/agents.json`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { agents } = JSON.parse(Buffer.from((await res.json()).content, 'base64').toString());

    for (const a of agents) {
      const soulRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${a.folder}/soul.md`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const soul = Buffer.from((await soulRes.json()).content, 'base64').toString();
      
      await sb.from('system_settings').upsert({ 
        user_id: userId, 
        key: `agent_config_${a.id}`, 
        value: JSON.stringify({ ...a, soul }) 
      });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }); }
}
