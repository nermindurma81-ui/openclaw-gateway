import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { userId } = await req.json();
  
  // TAČAN NAZIV TVOG REPOA
  const repo = "nermindurma81-ui/Kralj-backup"; 
  
  const token = process.env.GITHUB_TOKEN;
  const h = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' };

  try {
    // 1. Sinkronizacija osnovnih fajlova (SOUL i IDENTITY)
    const files = ['SOUL.md', 'IDENTITY.md'];
    for (const f of files) {
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/${f}`, { headers: h });
      if (r.ok) {
        const d = await r.json();
        const content = Buffer.from(d.content, 'base64').toString('utf-8');
        await sb.from('system_settings').upsert({ user_id: userId, key: f.replace('.md','').toLowerCase(), value: content });
      }
    }

    // 2. Sinkronizacija Skillova iz foldera /skills
    const sr = await fetch(`https://api.github.com/repos/${repo}/contents/skills`, { headers: h });
    if (sr.ok) {
      const folders = await sr.json();
      for (const f of folders) {
        // Ulazimo u svaki podfolder skilla i tražimo SKILL.md
        const sRes = await fetch(`https://api.github.com/repos/${repo}/contents/skills/${f.name}/SKILL.md`, { headers: h });
        if (sRes.ok) {
          const sData = await sRes.json();
          const sContent = Buffer.from(sData.content, 'base64').toString('utf-8');
          await sb.from('installed_skills').upsert({ 
            user_id: userId, 
            name: f.name, 
            slug: f.name, 
            instructions: sContent 
          });
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (e: any) { 
    return NextResponse.json({ error: e.message }, { status: 500 }); 
  }
}
