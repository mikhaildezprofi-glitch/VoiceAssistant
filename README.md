# VoiceAssistant

Personal cloud voice assistant TTS backend.

## Fixed constraints
- Cloud-first, personal use.
- Cloudflare Workers Free only.
- Default TTS: Fish Audio Jarvis using the pinned `s2.1-pro-free` API model.
- Fish Audio currently advertises free access through November 30, 2026, subject to Fair Use; future free access is not guaranteed.
- No payment method, paid billing, paid model, or automatic provider fallback.
- Gemini is retained only as an explicitly selected alternate provider; it must remain on a verified free tier with billing disabled.
- API keys are stored only as Cloudflare Worker Secrets. Never commit secrets or put them in the Android client.
- The Worker does not log or persist request text or generated audio. Fish Audio may use requests to improve model quality, so sensitive text must not be sent to it.

## API
- `POST /api/tts`: accepts JSON `{"text":"..."}` and returns WAV audio. Fish Audio Jarvis is the default.
- `GET /health`: health check without exposing configuration or secrets.

## Deployment
See `cloudflare/README.md` for setup, secrets, API behavior, and deployment instructions.
