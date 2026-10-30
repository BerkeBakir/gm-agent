import { describe, expect, it, vi } from "vitest";
import { BANK, bankPuzzle } from "../src/bank";
import { fetchArchive, generateFallback, loadPuzzles, parseArchive, parsePuzzleJson } from "../src/puzzle-source";
import type { Complete, KV } from "../src/types";

const archiveJson = {
  puzzles: [
    { day: 20, difficulty: "medium", question: "Q20?", answer: "Eraser", acceptedAnswers: [], commitment: "0xaa", salt: "0xbb" },
    { day: 19, difficulty: "medium", question: "Q19?", answer: "Cards", acceptedAnswers: ["deck"], commitment: null, salt: null },
    { day: "x", question: 5 },
  ],
};

function okFetch(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}
const downFetch = vi.fn(async () => {
  throw new TypeError("network down");
}) as unknown as typeof fetch;
function memoryKV(): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, v) };
}
const goodJson = JSON.stringify({ question: "What runs but never walks?", answer: "River", acceptedAnswers: ["a river"] });

describe("parseArchive / fetchArchive", () => {
  it("maps rows to GM puzzles and drops invalid ones", () => {
    const list = parseArchive(archiveJson);
    expect(list.map((p) => p.key)).toEqual(["gm-20", "gm-19"]);
    expect(list[1]).toMatchObject({ source: "gm", day: 19, answer: "Cards", acceptedAnswers: ["deck"], salt: null });
  });
  it("throws on HTTP errors", async () => {
    const bad = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchArchive(bad)).rejects.toThrow("500");
  });
  it("aborts after the timeout", async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    ) as unknown as typeof fetch;
    await expect(fetchArchive(hang, { timeoutMs: 20 })).rejects.toThrow();
  });
});

describe("parsePuzzleJson", () => {
  it("reads plain or fenced JSON", () => {
    expect(parsePuzzleJson(goodJson)).toEqual({ question: "What runs but never walks?", answer: "River", acceptedAnswers: ["a river"] });
    expect(parsePuzzleJson("```json\n" + goodJson + "\n```")?.answer).toBe("River");
  });
  it("rejects malformed output", () => {
    expect(parsePuzzleJson("Here's a riddle!")).toBeNull();
    expect(parsePuzzleJson(JSON.stringify({ question: "Q" }))).toBeNull();
  });
});

describe("generateFallback", () => {
  it("retries once on bad JSON, then succeeds", async () => {
    const complete = vi.fn<Complete>().mockResolvedValueOnce("oops").mockResolvedValueOnce(goodJson);
    const p = await generateFallback(complete, "2026-10-29");
    expect(p).toMatchObject({ key: "anna-2026-10-29", source: "anna", answer: "River" });
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("uses the bank after two failures or when the LLM throws", async () => {
    const bad = vi.fn<Complete>(async () => "nope");
    expect((await generateFallback(bad, "2026-10-29")).source).toBe("bank");
    const throwing: Complete = async () => {
      throw new Error("quota");
    };
    expect(await generateFallback(throwing, "2026-10-29")).toEqual(bankPuzzle("2026-10-29"));
  });
});

describe("bankPuzzle", () => {
  it("is deterministic per date and keyed by date", () => {
    expect(bankPuzzle("2026-10-29")).toEqual(bankPuzzle("2026-10-29"));
    expect(bankPuzzle("2026-10-29").key).toBe("bank-2026-10-29");
    expect(BANK.length).toBeGreaterThanOrEqual(7);
  });
});

describe("loadPuzzles", () => {
  it("uses the newest closed GM puzzle as today's and the rest as archive", async () => {
    const r = await loadPuzzles({ fetchImpl: okFetch(archiveJson), complete: vi.fn(), kv: memoryKV(), today: "2026-10-29" });
    expect(r.offline).toBe(false);
    expect(r.today.key).toBe("gm-20");
    expect(r.archive.map((p) => p.key)).toEqual(["gm-19"]);
  });
  it("falls back to an Anna puzzle when the API is down, and caches it for the day", async () => {
    const kv = memoryKV();
    const complete = vi.fn<Complete>(async () => goodJson);
    const first = await loadPuzzles({ fetchImpl: downFetch, complete, kv, today: "2026-10-29" });
    expect(first).toMatchObject({ offline: true, archive: [] });
    expect(first.today.source).toBe("anna");
    const second = await loadPuzzles({ fetchImpl: downFetch, complete, kv, today: "2026-10-29" });
    expect(second.today).toEqual(first.today);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("treats an empty archive like an outage", async () => {
    const r = await loadPuzzles({
      fetchImpl: okFetch({ puzzles: [] }),
      complete: async () => goodJson,
      kv: memoryKV(),
      today: "2026-10-29",
    });
    expect(r.offline).toBe(true);
  });
  it("still returns a puzzle when storage is down too", async () => {
    const broken: KV = {
      get: async () => {
        throw new Error("x");
      },
      set: async () => {
        throw new Error("x");
      },
    };
    const r = await loadPuzzles({ fetchImpl: downFetch, complete: async () => goodJson, kv: broken, today: "2026-10-29" });
    expect(r.today.answer).toBe("River");
  });
});
