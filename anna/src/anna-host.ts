import type { Complete, KV } from "./types";

/** The slice of AnnaAppRuntime this app uses (see Anna "App UI SDK" docs). */
export interface AnnaRuntimeLike {
  llm: { complete(args: unknown): Promise<unknown> };
  storage: {
    get(args: { key: string }): Promise<unknown>;
    set(args: { key: string; value: unknown }): Promise<unknown>;
  };
  /** Host-side web access; needs `ui.host_api.web` and the user's web grant. */
  web?: { fetch(args: unknown, opts?: { timeoutMs?: number }): Promise<unknown> };
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

/** One item of `anna.web.fetch`'s `pages` (same order as the requested urls). */
interface WebFetchPage {
  url?: string;
  ok?: boolean;
  content?: string;
  truncated?: boolean;
  error?: unknown;
}

export const WEB_FETCH_TIMEOUT_MS = 15000;

/** The archive URL that serves the same JSON as text/plain (see /api/anna/archive). */
export function asTextUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}as=text`;
}

/** The JSON body of a page fetched by Anna's server, which may wrap it in markdown. */
export function jsonFromPage(content: string): unknown {
  const text = content.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("web.fetch: no JSON in page");
    return JSON.parse(text.slice(start, end + 1));
  }
}

function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  const o = e as { code?: string; message?: string } | null;
  return o?.code ?? o?.message ?? "failed";
}

/**
 * fetch() that asks Anna's server to fetch the URL (`anna.web.fetch`) when the direct request
 * fails. Some networks block *.vercel.app but Anna's server can still reach it. Only a
 * fallback: web.fetch needs the user's web grant and uses their Anna quota. It also rejects
 * application/json, so `webUrl` maps the URL to one that serves the same body as text.
 */
export function makeFetchWithWebFallback(
  anna: AnnaRuntimeLike,
  direct: typeof fetch,
  webUrl: (url: string) => string = (url) => url,
): typeof fetch {
  return async (input, init) => {
    try {
      return await direct(input, init);
    } catch (directErr) {
      if (!anna.web) throw directErr;
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const res = unwrap<{ pages?: WebFetchPage[] } | null>(
        await anna.web.fetch({ urls: [webUrl(url)], timeout_ms: WEB_FETCH_TIMEOUT_MS }, { timeoutMs: WEB_FETCH_TIMEOUT_MS + 5000 }),
      );
      const page = res?.pages?.[0];
      if (!page?.ok || typeof page.content !== "string") throw new Error(`web.fetch: ${errorText(page?.error)}`);
      if (page.truncated) throw new Error("web.fetch: page truncated");
      return new Response(JSON.stringify(jsonFromPage(page.content)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
