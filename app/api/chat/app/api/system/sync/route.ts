import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { userId } = await req.json();
  const repo = "nermindurma81-ui/Kralj-backup-master";
  const h = { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };

  try {
    const files = ['SOUL.md', 'IDENTITY.md'];
    for (const f of files) {
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/${f}`, { headers: h });
      if (r.ok) {
        const d = await r.json();
        await sb.from('system_settings').upsert({ user_id: userId, key: f.replace('.md','').toLowerCase(), value: Buffer.from(d.content, 'base64').toString() });
      }
    }
    const sr = await fetch(`https://api.github.com/repos/${repo}/contents/skills`, { headers: h });
    if (sr.ok) {
      const folders = await sr.json();
      for (const f of folders) {
        const sRes = await fetch(`${f.url.split('?')[0]}/SKILL.md`, { headers: h });
        if (sRes.ok) {
          const sData = await sRes.json();
          await sb.from('installed_skills').upsert({ user_id: userId, name: f.name, instructions: Buffer.from(sData.content, 'base64').toString() });
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }); }
}
