#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 9110;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'changeme';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');

// Ensure directory exists
if (!fs.existsSync(OPENCLAW_DIR)) {
  fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
}

// ── Build config ─────────────────────────────────────────────
const config = {
  port: PORT,  // ✅ Koristi Railway PORT
  host: '0.0.0.0',  // ✅ KRITIČNO: slušaj na svim interface-ima
  gatewayToken: GATEWAY_TOKEN,
  logLevel: 'info',
  models: {
    providers: {},
  },
  agents: {
    defaults: {
      model: {
        primary: 'github/Llama-3.3-70B-Instruct',
      },
    },
  },
};

// Add Groq if key exists
if (GROQ_API_KEY) {
  config.models.providers.groq = {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: GROQ_API_KEY,
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    ],
    defaultModel: 'llama-3.1-8b-instant',
    maxTokens: 16384,
  };
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
console.log('✓ Host: 0.0.0.0');
console.log('✓ Providers:', Object.keys(config.models.providers).join(', ') || 'none');

// ── Launch gateway ───────────────────────────────────────────
console.log('\n🐾 Starting OpenClaw Gateway...\n');

const openclaw = spawn('npx', ['openclaw', 'gateway', 'start'], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    HOME: os.homedir(),
    PORT: PORT,  // ✅ Proslijedi PORT u env
    HOST: '0.0.0.0'  // ✅ Proslijedi HOST u env
  },
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
