# VoiceAssistant

Personal cloud voice assistant TTS backend.

## Fixed constraints
- Cloud-first, personal use.
- Zero-cost operation only: no billing account, bank card, paid API, paid GPU, or automatic paid fallback.
- Primary TTS: Google Gemini 3.8 Flash TTS Free Tier.
- Backend: Cloudflare Workers Free.
- API keys are stored only as Cloudflare Worker secrets. Never commit secrets or put them in a client app.
- If a free-tier quota is exhausted, return a clear error and stop. Never switch to paid usage automatically.

## Planned API
- `POST /api/tts`: accept JSON `{"text":"..."}`, return generated WAV audio.
- `GET /health`: health check without exposing configuration or secrets.

## Deployment
See `cloudflare/README.md` for setup and deployment instructions.
