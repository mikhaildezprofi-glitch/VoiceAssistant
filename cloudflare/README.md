# Cloudflare TTS backend

A small personal-use proxy for Gemini 3.8 Flash TTS.

## Strict zero-cost rules
- Use Cloudflare Workers Free only.
- Use Gemini API Free Tier only.
- Do not add a payment method or enable paid billing.
- No paid fallback, GPU host, or automatic provider switching.
- If Gemini returns HTTP 429, this API returns HTTP 429 and stops.
- Gemini Interactions are sent with `store: false`.
- Text and generated audio are not written to logs or persistent storage.

Cloudflare Workers Free currently has a daily request limit and a 10 ms CPU limit per invocation. The Worker only validates the request, makes one upstream fetch, and decodes the returned audio. See the official limits:
https://developers.cloudflare.com/workers/platform/limits/

Gemini TTS Free Tier pricing and data-use conditions:
https://ai.google.dev/gemini-api/docs/pricing

## 1. Create a free Gemini API key
1. Open https://aistudio.google.com/app/apikey
2. Sign in with a Google account.
3. Create an API key in a project eligible for Gemini API Free Tier.
4. Do not enable billing or add a payment method.
5. Do not commit the key or send it in chat.

Gemini TTS model: `gemini-3.8-flash-tts`

REST endpoint:
`https://generativelanguage.googleapis.com/v1beta/interactions`

Official TTS documentation:
https://ai.google.dev/gemini-api/docs/speech-generation

## 2. Create a Cloudflare Worker
1. Open https://dash.cloudflare.com/
2. Open Workers & Pages and create a Worker named `voiceassistant-tts`.
3. Deploy this folder using Wrangler (commands below), or paste the built Worker code through the dashboard.
4. In Worker Settings > Variables and Secrets, add these as **secrets**:
   - `GEMINI_API_KEY`: the key from Google AI Studio.
   - `APP_ACCESS_TOKEN`: a long random token used by your own app to access this endpoint.
5. Keep the Worker on the Free plan. Do not upgrade or enable paid usage.

Generate an app token locally, for example:
`openssl rand -hex 32`

## 3. Deploy with Wrangler
Requires Node.js and npm on the development machine. No phone or Termux is required.

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_ACCESS_TOKEN
npm run typecheck
npm run deploy
```

When prompted, paste each secret directly into the terminal. Do not put secret values in shell history, source files, GitHub Actions logs, or chat.

The deployed URL will resemble:
`https://voiceassistant-tts.<your-account>.workers.dev`

## 4. Test
Health check:

```bash
curl https://voiceassistant-tts.<your-account>.workers.dev/health
```

Synthesize speech:

```bash
curl -X POST \
  "https://voiceassistant-tts.<your-account>.workers.dev/api/tts" \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Добрый день. Все системы работают штатно.","voice":"Orus"}' \
  --output test.wav
```

The API returns WAV audio. The default voice is `Orus`; other allowed prebuilt voices are `Charon`, `Fenrir`, `Puck`, `Rasalgethi`, `Alnilam`, and `Gacrux`. Compare them with the same Russian test phrases before choosing the final voice.

## API contract

`POST /api/tts`

Headers:
- `Authorization: Bearer <APP_ACCESS_TOKEN>`
- `Content-Type: application/json`

Body:
```json
{
  "text": "Текст для озвучивания",
  "voice": "Orus",
  "style": "Спокойная, уверенная, естественная русская речь"
}
```

Success: `audio/wav`

Errors:
- `400`: invalid JSON, empty text, or unsupported voice.
- `401`: missing/incorrect app token.
- `413`: text exceeds the configured limit.
- `429`: Gemini free quota/rate limit reached. No paid fallback.
- `502`: upstream service or response error.
- `503`: server secrets are missing.

Maximum text length: 5,000 characters per request.
