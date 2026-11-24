interface Env {
  GEMINI_API_KEY?: string;
  FISH_API_KEY?: string;
  APP_ACCESS_TOKEN: string;
  GEMINI_MODEL?: string;
  DEFAULT_VOICE?: string;
  FISH_VOICE_ID?: string;
  MAX_TEXT_CHARS?: string;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const FISH_ENDPOINT = "https://api.fish.audio/v1/tts";
const FISH_MODEL = "s2.1-pro-free";
const DEFAULT_FISH_VOICE_ID = "680d74fbef69419f87cfc70f092a1451";

const ALLOWED_VOICES = new Set([
  "Orus",
  "Charon",
  "Fenrir",
  "Puck",
  "Rasalgethi",
  "Alnilam",
  "Gacrux"
]);

const DEFAULT_STYLE =
  "Спокойный, сдержанный, уверенный мужской голос виртуального помощника. " +
  "Естественная русская речь, чёткая дикция, нейтральное произношение без театральности. " +
  "Умеренный темп, ровная интонация, короткие естественные паузы. " +
  "Не добавляй слова, которых нет в исходном тексте.";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extractAudio(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    output_audio?: { data?: string };
    steps?: Array<{
      type?: string;
      content?: Array<{ type?: string; data?: string }>;
    }>;
  };

  if (body.output_audio?.data) return body.output_audio.data;

  const steps = body.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== "model_output") continue;
    const audio = (step.content ?? []).find(
      (item) => item.type === "audio" && typeof item.data === "string"
    );
    if (audio?.data) return audio.data;
  }
  return null;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u00A0\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function audioResponse(audio: ArrayBuffer, voiceName: string): Response {
  return new Response(audio, {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "content-disposition": 'inline; filename="voiceassistant.wav"',
      "content-length": String(audio.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-voice-name": voiceName
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", service: "voiceassistant" });
    }

    if (request.method !== "POST" || url.pathname !== "/api/tts") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.APP_ACCESS_TOKEN) {
      return json({ error: "Server access token is not configured" }, 503);
    }

    const auth = request.headers.get("authorization") ?? "";
    const suppliedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!safeEqual(suppliedToken, env.APP_ACCESS_TOKEN)) {
      return json({ error: "Unauthorized" }, 401);
    }

    let input: {
      text?: unknown;
      voice?: unknown;
      style?: unknown;
      provider?: unknown;
    };
    try {
      input = await request.json() as typeof input;
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }

    if (typeof input.text !== "string") {
      return json({ error: 'Field "text" must be a string' }, 400);
    }

    const text = normalizeText(input.text);
    const maxChars = Math.min(
      Math.max(Number.parseInt(env.MAX_TEXT_CHARS ?? "2000", 10) || 2000, 1),
      2000
    );

    if (!text) return json({ error: "Text must not be empty" }, 400);
    if (text.length > maxChars) {
      return json({ error: `Text exceeds the ${maxChars}-character limit` }, 413);
    }

    const provider = input.provider === undefined ? "fish" : input.provider;
    if (provider !== "fish" && provider !== "gemini") {
      return json({ error: 'Field "provider" must be "fish" or "gemini"' }, 400);
    }

    if (provider === "fish") {
      if (!env.FISH_API_KEY) {
        return json({ error: "Fish Audio API key is not configured" }, 503);
      }

      let upstream: Response;
      try {
        upstream = await fetch(FISH_ENDPOINT, {
          method: "POST",
          headers: {
            "authorization": `Bearer ${env.FISH_API_KEY}`,
            "content-type": "application/json",
            "model": FISH_MODEL
          },
          body: JSON.stringify({
            text,
            reference_id: env.FISH_VOICE_ID ?? DEFAULT_FISH_VOICE_ID,
            format: "wav",
            sample_rate: 24000,
            latency: "normal"
          })
        });
      } catch {
        return json({ error: "Fish Audio TTS is temporarily unreachable" }, 502);
      }

      if (!upstream.ok) {
        if (upstream.status === 429) {
          return json({
            error: "Fish Audio free-tier quota or rate limit reached. No fallback was attempted."
          }, 429);
        }
        if (upstream.status === 401 || upstream.status === 403) {
          return json({ error: "Fish Audio API key was rejected or lacks access" }, 502);
        }
        return json({
          error: "Fish Audio TTS request failed",
          upstreamStatus: upstream.status
        }, 502);
      }

      try {
        const audio = await upstream.arrayBuffer();
        if (audio.byteLength < 44) {
          return json({ error: "Fish Audio returned an invalid WAV response" }, 502);
        }
        return audioResponse(audio, "Jarvis");
      } catch {
        return json({ error: "Fish Audio response could not be read" }, 502);
      }
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "Gemini API key is not configured" }, 503);
    }

    const defaultVoice = env.DEFAULT_VOICE ?? "Orus";
    const voice = typeof input.voice === "string" ? input.voice : defaultVoice;
    if (!ALLOWED_VOICES.has(voice)) {
      return json({ error: "Unsupported voice", allowedVoices: [...ALLOWED_VOICES] }, 400);
    }

    const style =
      typeof input.style === "string" && input.style.trim()
        ? input.style.trim().slice(0, 500)
        : DEFAULT_STYLE;

    let upstream: Response;
    try {
      upstream = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: env.GEMINI_MODEL ?? "gemini-3.8-flash-tts",
          store: false,
          input: [{
            type: "user_input",
            content: [{
              type: "text",
              text,
              annotations: [{
                type: "speech_metadata",
                style
              }]
            }]
          }],
          response_format: { type: "audio" },
          generation_config: {
            speech_config: [{ voice }]
          }
        })
      });
    } catch {
      return json({ error: "Gemini TTS is temporarily unreachable" }, 502);
    }

    if (!upstream.ok) {
      const errorBody = await upstream.text();
      if (upstream.status === 429) {
        return json({
          error: "Free-tier quota or rate limit reached. No paid fallback was attempted."
        }, 429);
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return json({ error: "Gemini API key was rejected or lacks access to this model" }, 502);
      }
      return json({
        error: "Gemini TTS request failed",
        upstreamStatus: upstream.status,
        requestId: upstream.headers.get("x-request-id") ?? null,
        responseLength: errorBody.length
      }, 502);
    }

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      return json({ error: "Gemini returned an invalid response" }, 502);
    }

    const audioBase64 = extractAudio(payload);
    if (!audioBase64) {
      return json({ error: "Gemini response did not contain audio data" }, 502);
    }

    try {
      const audio = decodeBase64(audioBase64);
      const audioBuffer = new ArrayBuffer(audio.byteLength);
      new Uint8Array(audioBuffer).set(audio);
      return audioResponse(audioBuffer, voice);
    } catch {
      return json({ error: "Gemini returned audio in an unsupported encoding" }, 502);
    }
  }
};
