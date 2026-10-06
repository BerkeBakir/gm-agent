import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

/** Primary model first, then fallbacks for when Gemini answers 503 "high demand" / 429. */
export function modelChain(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-flash-lite-latest")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

const retryable = (err: unknown) =>
  /\b(503|429|500|502|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|fetch failed|ECONNRESET|ETIMEDOUT|socket|network/i.test(
    `${(err as Error)?.message ?? err} ${String((err as { cause?: unknown })?.cause ?? "")}`,
  );
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * generateContent with retries and model fallback. Each model gets 2 attempts with a short
 * backoff before moving to the next one. Non-retryable errors (bad request, auth) throw at once.
 */
export async function generateWithFallback(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse & { modelUsed: string }> {
  let lastErr: unknown;
  for (const model of modelChain()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({ ...params, model });
        return Object.assign(res, { modelUsed: model });
      } catch (err) {
        lastErr = err;
        if (!retryable(err)) throw err;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}
