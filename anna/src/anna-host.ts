import type { Complete, KV } from "./types";

/** The slice of AnnaAppRuntime this app uses (see Anna "App UI SDK" docs). */
export interface AnnaRuntimeLike {
  llm: { complete(args: unknown): Promise<unknown> };
  storage: {
    get(args: { key: string }): Promise<unknown>;
    set(args: { key: string; value: unknown }): Promise<unknown>;
  };
}

/** Anna RPCs resolve either to the bare result or to {ok,result}/{ok:false,error}; accept both. */
export function unwrap<T>(res: unknown): T {
  if (res && typeof res === "object" && "ok" in res) {
    const r = res as { ok: boolean; result?: unknown; error?: { code?: string; message?: string } };
    if (r.ok) return r.result as T;
    throw new Error(`${r.error?.code ?? "error"}: ${r.error?.message ?? "Anna RPC failed"}`);
  }
  return res as T;
}

export function makeComplete(anna: AnnaRuntimeLike): Complete {
  return async ({ system, user, maxTokens = 300, temperature = 0.7 }) => {
    const res = unwrap<{ content?: { text?: string } }>(
      await anna.llm.complete({ systemPrompt: system, messages: [{ role: "user", content: user }], maxTokens, temperature }),
    );
    const text = res?.content?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("empty LLM response");
    return text.trim();
  };
}

export function makeKV(anna: AnnaRuntimeLike): KV {
  return {
    async get(key) {
      const res = unwrap<{ value?: unknown; exists?: boolean } | null>(await anna.storage.get({ key }));
      if (!res || res.exists === false) return undefined;
      return res.value ?? undefined;
    },
    async set(key, value) {
      unwrap(await anna.storage.set({ key, value }));
    },
  };
}
