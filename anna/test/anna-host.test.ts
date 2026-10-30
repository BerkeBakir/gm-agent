import { describe, expect, it, vi } from "vitest";
import { makeComplete, makeKV, unwrap } from "../src/anna-host";

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
