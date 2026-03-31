import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { message, userId, conversationId } = await req.json();

    // 1. POVUCI PODATKE IZ BAZE (Identity + Soul + Tokens)
    const { data: stngs } = await sb.from('system_settings').select('*').eq('user_id', userId);
    const { data: skls } = await sb.from('installed_skills').select('*').eq('user_id', userId);
    const { data: tokens } = await sb.from('ai_tokens').select('*').eq('is_active', true).order('last_used', { ascending: true });

    const soul = stngs?.find(s => s.key === 'soul')?.value || "Ti si Kralj, AI asistent.";
    const identity = stngs?.find(s => s.key === 'identity')?.value || "Ime: Kralj 👑";
    const systemPrompt = `${identity}\n${soul}\nSKILLS:\n${skls?.map(s => s.instructions).join('\n')}`;

    // 2. FAILOVER LOGIKA (Prvo Groq, pa GitHub)
    let aiText = "";
    let success = false;
    const activeTokens = [...(tokens?.filter(t => t.provider === 'groq') || []), ...(tokens?.filter(t => t.provider === 'github') || [])];

    for (const t of activeTokens) {
      const endpoint = t.provider === 'groq' ? "https://api.groq.com/openai/v1/chat/completions" : "https://models.inference.ai.azure.com/chat/completions";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${t.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: t.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o',
          messages: [{role: 'system', content: systemPrompt}, {role: 'user', content: message}]
        })
      });

      if (res.status === 429) {
        await sb.from('ai_tokens').update({ is_active: false, limited_at: new Date() }).eq('id', t.id);
        continue;
      }
      const data = await res.json();
      aiText = data.choices[0].message.content;
      await sb.from('ai_tokens').update({ last_used: new Date() }).eq('id', t.id);
      success = true; break;
    }

    if (!success) throw new Error("Svi AI resursi su iscrpljeni.");

    // 3. SAČUVAJ U BAZU
    await sb.from('chat_messages').insert([{conversation_id: conversationId, role: 'user', content: message}, {conversation_id: conversationId, role: 'assistant', content: aiText}]);
    return NextResponse.json({ text: aiText });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
