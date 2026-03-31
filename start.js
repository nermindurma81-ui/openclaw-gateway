const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Config dir ──────────────────────────────────────────────
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const WORKSPACE_DIR = path.join(OPENCLAW_DIR, 'workspace');

[OPENCLAW_DIR, WORKSPACE_DIR, path.join(WORKSPACE_DIR, 'memory')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Workspace files ─────────────────────────────────────────
const workspaceFiles = {
  'AGENTS.md': `# AGENTS.md
## Session Startup
1. Read SOUL.md
2. Read USER.md
3. Read memory/YYYY-MM-DD.md for recent context

## Memory
- Daily notes: memory/YYYY-MM-DD.md
- Long-term: MEMORY.md

## Red Lines
- Don't exfiltrate private data
- Don't run destructive commands without asking
`,
  'SOUL.md': `# SOUL.md
Be genuinely helpful. Have opinions. Be resourceful before asking.
Earn trust through competence.
`,
  'IDENTITY.md': `# IDENTITY.md
- Name: Claw
- Creature: AI familiar
- Vibe: sharp, warm, resourceful
- Emoji: 🐾
`,
  'USER.md': `# USER.md
- Name: 
- Timezone: 
- Notes: 
`,
  'MEMORY.md': `# MEMORY.md
Long-term memory. Updated by agent when important things happen.
`,
  'HEARTBEAT.md': `# HEARTBEAT.md
System heartbeat log.
`,
};

Object.entries(workspaceFiles).forEach(([name, content]) => {
  const p = path.join(WORKSPACE_DIR, name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, content);
});

// ── Build config from env ───────────────────────────────────
const PORT = parseInt(process.env.PORT || '9110');
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'changeme';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const config = {
  update: { checkOnStart: false },
  browser: { enabled: false },
  models: {
    providers: {},
  },
  agents: {
    defaults: {
      workspace: WORKSPACE_DIR,
      maxConcurrent: 4,
      subagents: { maxConcurrent: 8 },
    },
  },
  tools: { profile: 'full' },
  commands: {
    native: 'auto',
    nativeSkills: 'auto',
    restart: true,
    ownerDisplay: 'raw',
  },
  cron: { enabled: true },
  channels: {},
  gateway: {
    port: PORT,
    mode: 'local',
    bind: '0.0.0.0',
    auth: {
      mode: 'token',
      token: GATEWAY_TOKEN,
    },
    controlUi: { allowInsecureAuth: true },
  },
};

// Add model providers only if keys exist
if (GROQ_API_KEY) {
  config.models.providers.groq = {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: GROQ_API_KEY,
    api: 'openai-completions',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B (Groq)',
        reasoning: true,
        input: ['text'],
        contextWindow: 131072,
        maxTokens: 32768,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B (Groq)',
        reasoning: false,
        input: ['text'],
        contextWindow: 131072,
        maxTokens: 8192,
      },
    ],
  };
  config.agents.defaults.model = {
    primary: 'groq/llama-3.3-70b-versatile',
    fallbacks: ['groq/llama-3.1-8b-instant'],
  };
}

if (GITHUB_TOKEN) {
  config.models.providers.github = {
    baseUrl: 'https://models.inference.ai.azure.com',
    apiKey: GITHUB_TOKEN,
    api: 'openai-completions',
    models: [
      {
        id: 'Llama-3.3-70B-Instruct',
        name: 'Llama 3.3 70B (GitHub)',
        reasoning: true,
        input: ['text'],
        contextWindow: 131072,
        maxTokens: 32768,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini (GitHub)',
        reasoning: false,
        input: ['text', 'image'],
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
  };
  if (!config.agents.defaults.model) {
    config.agents.defaults.model = {
      primary: 'github/Llama-3.3-70B-Instruct',
    };
  }
}

if (TELEGRAM_TOKEN) {
  config.channels.telegram = {
    enabled: true,
    botToken: TELEGRAM_TOKEN,
    dmPolicy: 'pairing',
    groupPolicy: 'disabled',
    streaming: 'partial',
  };
}

// ── Write config ─────────────────────────────────────────────
const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('✓ Config written to', configPath);
console.log('✓ Gateway token:', GATEWAY_TOKEN);
console.log('✓ Port:', PORT);
console.log('✓ Providers:', Object.keys(config.models.providers).join(', ') || 'none');

// ── Launch gateway ───────────────────────────────────────────
console.log('\n🐾 Starting OpenClaw Gateway...\n');

const openclaw = spawn('npx', ['openclaw', 'gateway', 'start'], {
  stdio: 'inherit',
  env: { ...process.env, HOME: os.homedir() },
  shell: true,
});

openclaw.on('error', (err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});

openclaw.on('exit', (code) => {
  console.log('Gateway exited with code', code);
  process.exit(code || 0);
});

// Forward signals
process.on('SIGTERM', () => openclaw.kill('SIGTERM'));
process.on('SIGINT', () => openclaw.kill('SIGINT'));
