// Unutar POST funkcije, pre slanja zahteva AI-u:

// 1. Ako je izabran agent (npr. koder-pro), povuci njegovu konfiguraciju
const { data: agentConfig } = await sb.from('system_settings')
  .select('value').eq('key', `agent_config_${agentId}`).single();

if (agentConfig) {
  const config = JSON.parse(agentConfig.value);
  
  // 2. Dodaj tvoje SKILLOVE iz Kralj-backup-a (nadogradnja besplatnog AI-ja)
  const { data: skills } = await sb.from('installed_skills').select('*').eq('user_id', userId);
  const skillInstructions = skills?.map(s => `[SKILL: ${s.name}]: ${s.instructions}`).join('\n');

  const finalSystemPrompt = `${config.soul}\n\nINSTALLED TOOLS:\n${skillInstructions}`;

  // 3. POZOVI POLLINATIONS (Potpuno FREE)
  if (config.engine === 'pollinations') {
    const response = await fetch('https://text.pollinations.ai/', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: message }
        ],
        model: config.model, // 'openai' (što je GPT-4o-mini nivo)
        seed: 42
      })
    });
    const aiText = await response.text();
    
    // Snimi u bazu i vrati odgovor...
    return NextResponse.json({ text: aiText });
  }
}
