# openclaw-gateway

OpenClaw AI Gateway — deployano na Railway.

## Environment Variables

| Variable | Opis | Obavezno |
|----------|------|----------|
| `GATEWAY_TOKEN` | Bearer token za autentikaciju | Da |
| `GROQ_API_KEY` | Groq API ključ (gsk_...) | Da (ili GITHUB_TOKEN) |
| `GITHUB_TOKEN` | GitHub Models token (ghp_...) | Opcionalno |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Opcionalno |
| `PORT` | Port (Railway postavlja automatski) | Ne |

## Deploy

1. Push na GitHub
2. railway.app → New Project → Deploy from GitHub
3. Dodaj Environment Variables
4. Settings → Networking → Generate Domain
5. Kopiraj URL → uneси u openclaw-panel kao GATEWAY_URL
