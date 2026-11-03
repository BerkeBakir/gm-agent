import { describe, expect, it, vi } from "vitest";
import { asTextUrl, jsonFromPage, makeComplete, makeFetchWithWebFallback, makeKV, unwrap } from "../src/anna-host";

describe("unwrap", () => {
  it("passes bare results through and opens {ok,result}", () => {
    expect(unwrap({ a: 1 })).toEqual({ a: 1 });
    expect(unwrap({ ok: true, result: { a: 2 } })).toEqual({ a: 2 });
  });
  it("throws on {ok:false}", () => {
    expect(() => unwrap({ ok: false, error: { code: "permission_denied", message: "nope" } })).toThrow(
      "permission_denied: nope",
    );
  });
});

describe("makeComplete", () => {
  it("sends systemPrompt + a user message and returns the text", async () => {
    const complete = vi.fn(async () => ({ role: "assistant", content: { type: "text", text: "  Hello  " } }));
    const llm = makeComplete({ llm: { complete }, storage: { get: vi.fn(), set: vi.fn() } });
    expect(await llm({ system: "S", user: "U", maxTokens: 50 })).toBe("Hello");
    expect(complete).toHaveBeenCalledWith({
      systemPrompt: "S",
      messages: [{ role: "user", content: "U" }],
      maxTokens: 50,
      temperature: 0.7,
    });
  });
  it("works with the wrapped shape and rejects empty text", async () => {
    const wrapped = makeComplete({
      llm: { complete: async () => ({ ok: true, result: { content: { type: "text", text: "Hi" } } }) },
      storage: { get: vi.fn(), set: vi.fn() },
    });
    expect(await wrapped({ system: "S", user: "U" })).toBe("Hi");
    const empty = makeComplete({
      llm: { complete: async () => ({ content: { type: "text", text: " " } }) },
      storage: { get: vi.fn(), set: vi.fn() },
    });
    await expect(empty({ system: "S", user: "U" })).rejects.toThrow("empty");
  });
});

describe("makeKV", () => {
  it("returns the value on a hit and undefined on a miss", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ value: { n: 1 }, exists: true })
      .mockResolvedValueOnce({ value: null, exists: false })
      .mockResolvedValueOnce({ ok: true, result: { value: 7, exists: true } });
    const set = vi.fn(async () => ({ etag: "x" }));
    const kv = makeKV({ llm: { complete: vi.fn() }, storage: { get, set } });
    expect(await kv.get("a")).toEqual({ n: 1 });
    expect(await kv.get("b")).toBeUndefined();
    expect(await kv.get("c")).toBe(7);
    await kv.set("k", { v: 1 });
    expect(set).toHaveBeenCalledWith({ key: "k", value: { v: 1 } });
  });
  it("propagates storage errors", async () => {
    const kv = makeKV({
      llm: { complete: vi.fn() },
      storage: { get: async () => ({ ok: false, error: { code: "rate_limited", message: "slow down" } }), set: vi.fn() },
    });
    await expect(kv.get("a")).rejects.toThrow("rate_limited");
  });
});

describe("makeFetchWithWebFallback", () => {
  const URL_ = "https://gm.example/api/anna/archive";
  const body = { puzzles: [{ day: 3, question: "Q?", answer: "A" }] };
  const base = { llm: { complete: vi.fn() }, storage: { get: vi.fn(), set: vi.fn() } };
  const blocked = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;

  it("uses the direct response and never calls web.fetch when it works", async () => {
    const web = { fetch: vi.fn() };
    const direct = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const res = await makeFetchWithWebFallback({ ...base, web }, direct)(URL_);
    expect(res.status).toBe(200);
    expect(web.fetch).not.toHaveBeenCalled();
  });
  it("does not fall back on HTTP errors (the GM answered)", async () => {
    const web = { fetch: vi.fn() };
    const direct = vi.fn(async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    expect((await makeFetchWithWebFallback({ ...base, web }, direct)(URL_)).status).toBe(503);
    expect(web.fetch).not.toHaveBeenCalled();
  });
  it("asks Anna's server when the direct request fails", async () => {
    const web = { fetch: vi.fn(async () => ({ pages: [{ url: URL_, ok: true, content: JSON.stringify(body) }], quota_consumed: 1 })) };
    const res = await makeFetchWithWebFallback({ ...base, web }, blocked, asTextUrl)(URL_);
    expect(await res.json()).toEqual(body);
    expect(web.fetch).toHaveBeenCalledWith(expect.objectContaining({ urls: [`${URL_}?as=text`] }), expect.anything());
  });
  it("accepts the {ok,result} shape and a markdown-wrapped body", async () => {
    const content = ["```json", JSON.stringify(body), "```"].join("\n");
    const web = { fetch: async () => ({ ok: true, result: { pages: [{ ok: true, content }] } }) };
    expect(await (await makeFetchWithWebFallback({ ...base, web }, blocked)(URL_)).json()).toEqual(body);
  });
  it("throws on a failed or truncated page, a missing grant, or no web API", async () => {
    const failed = { fetch: async () => ({ pages: [{ ok: false, error: { code: "TIMEOUT" } }] }) };
    await expect(makeFetchWithWebFallback({ ...base, web: failed }, blocked)(URL_)).rejects.toThrow("TIMEOUT");
    const cut = { fetch: async () => ({ pages: [{ ok: true, content: "{", truncated: true }] }) };
    await expect(makeFetchWithWebFallback({ ...base, web: cut }, blocked)(URL_)).rejects.toThrow("truncated");
    const denied = { fetch: async () => ({ ok: false, error: { code: "APP_NOT_GRANTED", message: "web" } }) };
    await expect(makeFetchWithWebFallback({ ...base, web: denied }, blocked)(URL_)).rejects.toThrow("APP_NOT_GRANTED");
    await expect(makeFetchWithWebFallback(base, blocked)(URL_)).rejects.toThrow("Failed to fetch");
  });
});

describe("asTextUrl", () => {
  it("adds as=text with ? or &", () => {
    expect(asTextUrl("https://x/a")).toBe("https://x/a?as=text");
    expect(asTextUrl("https://x/a?b=1")).toBe("https://x/a?b=1&as=text");
  });
});

describe("jsonFromPage", () => {
  it("parses raw JSON or the object inside surrounding text", () => {
    expect(jsonFromPage(' {"a":1} ')).toEqual({ a: 1 });
    expect(jsonFromPage(["Title", "", '{"a":{"b":2}}', ""].join("\n"))).toEqual({ a: { b: 2 } });
    expect(() => jsonFromPage("no json here")).toThrow("no JSON");
  });
});
