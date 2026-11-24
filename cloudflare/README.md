# Cloudflare TTS backend

A small personal-use proxy for Fish Audio Jarvis TTS, with Gemini available only when explicitly selected.

## Strict zero-cost and privacy rules
- Use Cloudflare Workers Free only.
- Fish Audio requests must use the exact model ID `s2.1-pro-free`. The Worker pins this model in the request header so the API cannot silently fall back to paid `s2.1-pro`.
- Fish Audio currently advertises free API access through November 30, 2026, subject to its Fair Use Policy. Continued free access is not guaranteed.
- Do not add a payment method or enable paid billing.
- No automatic provider fallback. If Fish Audio returns HTTP 429 or another error, this API returns an error and stops.
- Gemini can be selected only by sending `"provider":"gemini"`; keep that API project on a verified free tier and do not enable billing.
- The Worker does not log or persist request text or generated audio.
- Fish Audio states that requests may be used to improve model quality. Do not send passwords, private messages, personal records, or other sensitive text to Fish Audio.
- Gemini Interactions are sent with `store: false`.

Fish Audio free API details and current end date:
https://fish.audio/blog/s2-1-pro-free-api/

Fish Audio TTS API reference:
https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech

## 1. Secrets and configuration

In Cloudflare Worker Settings > Variables and Secrets, configure:

**Secrets**
- `FISH_API_KEY`: Fish Audio API key.
- `APP_ACCESS_TOKEN`: a long random token used by your own app to access this endpoint.
- `GEMINI_API_KEY`: optional, only if you intend to select Gemini explicitly.

**Plain-text variables**
- `FISH_VOICE_ID`: defaults to the approved Jarvis voice ID `680d74fbef69419f87cfc70f092a1451`.
- `MAX_TEXT_CHARS`: maximum text length, capped at 2,000.
- `GEMINI_MODEL` and `DEFAULT_VOICE`: used only for explicit Gemini requests.

Keep all keys in Cloudflare Secrets. Never commit them, put them in the client app, or send them in chat.

Generate an app token locally, for example:
`openssl rand -hex 32`

## 2. Deploy with Wrangler

Requires Node.js and npm on the development machine. No phone or Termux is required.

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler secret put FISH_API_KEY
npx wrangler secret put APP_ACCESS_TOKEN
# Optional, only if Gemini is deliberately retained:
npx wrangler secret put GEMINI_API_KEY
npm run typecheck
npm run deploy
```

When prompted, paste each secret directly into the terminal. Do not put secret values in shell history, source files, GitHub Actions logs, or chat.

The deployed URL will resemble:
`https://voiceassistant.<your-account>.workers.dev`

## 3. Test

Health check:

```bash
curl https://voiceassistant.<your-account>.workers.dev/health
```

Synthesize the default Jarvis voice:

```bash
curl -X POST \
  "https://voiceassistant.<your-account>.workers.dev/api/tts" \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Сэр, все системы работают штатно."}' \
  --output jarvis.wav
```

The default provider is Fish Audio S2.1 Pro Free, with the selected Jarvis voice. Audio is requested as 24 kHz WAV to preserve the Android app's existing WAV playback contract.

To deliberately use Gemini instead, send `"provider":"gemini"` and optionally `"voice"` and `"style"`. This is not an automatic fallback.

## API contract

`POST /api/tts`

Headers:
- `Authorization: Bearer <APP_ACCESS_TOKEN>`
- `Content-Type: application/json`

Default Fish Audio request:

```json
{
  "text": "Текст для озвучивания"
}
```

Optional explicit Gemini request:

```json
{
  "text": "Текст для озвучивания",
  "provider": "gemini",
  "voice": "Orus",
  "style": "Спокойная, уверенная, естественная русская речь"
}
```

Success: `audio/wav`

Errors:
- `400`: invalid JSON, empty text, or unsupported provider/voice.
- `401`: missing/incorrect app token.
- `413`: text exceeds the configured limit.
- `429`: selected provider quota/rate limit reached. No fallback.
- `502`: upstream service or response error.
- `503`: required server secret is missing.

Maximum text length: 2,000 characters per request. Keep longer assistant responses split into smaller speech chunks.
