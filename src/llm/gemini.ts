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

/** Max time for one Gemini request. A hung call must not eat the whole serverless time budget. */
const CALL_TIMEOUT_MS = Number(process.env.GEMINI_CALL_TIMEOUT_MS ?? 40_000);

const isTimeout = (err: unknown) => /abort|timed? ?out/i.test(`${(err as Error)?.name ?? ""} ${(err as Error)?.message ?? err}`);

const retryable = (err: unknown) =>
  /\b(503|429|500|502|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|fetch failed|ECONNRESET|ETIMEDOUT|socket|network/i.test(
    `${(err as Error)?.message ?? err} ${String((err as { cause?: unknown })?.cause ?? "")}`,
  );
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * generateContent with retries and model fallback. Each model gets 2 attempts with a short
 * backoff before moving to the next one; a call that takes longer than CALL_TIMEOUT_MS is aborted and
 * the next model is tried. Non-retryable errors (bad request, auth) throw at once.
 */
export async function generateWithFallback(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse & { modelUsed: string }> {
  let lastErr: unknown;
  for (const model of modelChain()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          ...params,
          model,
          config: { ...params.config, abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
        });
        return Object.assign(res, { modelUsed: model });
      } catch (err) {
        lastErr = err;
        if (isTimeout(err)) break; // a slow model won't get faster on retry: try the next one
        if (!retryable(err)) throw err;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}
