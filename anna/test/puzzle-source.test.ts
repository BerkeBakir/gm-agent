import { describe, expect, it, vi } from "vitest";
import { BANK, bankPuzzle } from "../src/bank";
import {
  ARCHIVE_CACHE_KEY,
  ARCHIVE_URLS,
  FALLBACK_TIMEOUT_MS,
  fetchArchive,
  generateFallback,
  loadPuzzles,
  parseArchive,
  parseDecisions,
  parsePuzzleJson,
} from "../src/puzzle-source";
import { emptyProgress, type Progress } from "../src/progress";
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
  it("falls to the bank when the LLM hangs past the timeout", async () => {
    const hanging: Complete = () => new Promise<string>(() => {});
    expect(await generateFallback(hanging, "2026-10-29", { timeoutMs: 20 })).toEqual(bankPuzzle("2026-10-29"));
  });
  it("exports a 15 s default timeout", () => {
    expect(FALLBACK_TIMEOUT_MS).toBe(15000);
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

describe("loadPuzzles bonus puzzle for the streak", () => {
  const solvedGm20 = (lastStreakDate: string): Progress => ({
    ...emptyProgress(),
    streak: 1,
    lastStreakDate,
    history: { "gm-20": { hints: [], wrongGuesses: 0, solved: true, score: 100 } },
  });

  it("offers an Anna puzzle when the newest GM puzzle was solved on an earlier day", async () => {
    const complete = vi.fn<Complete>(async () => goodJson);
    const r = await loadPuzzles({
      fetchImpl: okFetch(archiveJson),
      complete,
      kv: memoryKV(),
      today: "2026-10-30",
      progress: solvedGm20("2026-10-29"),
    });
    expect(r).toMatchObject({ offline: false, bonus: true });
    expect(r.today.key).toBe("anna-2026-10-30");
    expect(r.archive.map((p) => p.key)).toEqual(["gm-20", "gm-19"]);
  });
  it("keeps the solved GM puzzle as today's when it was solved today", async () => {
    const complete = vi.fn<Complete>(async () => goodJson);
    const r = await loadPuzzles({
      fetchImpl: okFetch(archiveJson),
      complete,
      kv: memoryKV(),
      today: "2026-10-29",
      progress: solvedGm20("2026-10-29"),
    });
    expect(r).toMatchObject({ bonus: false });
    expect(r.today.key).toBe("gm-20");
    expect(complete).not.toHaveBeenCalled();
  });
  it("keeps the same bonus puzzle after it is solved and the app reopens", async () => {
    const kv = memoryKV();
    const complete = vi.fn<Complete>(async () => goodJson);
    const deps = { fetchImpl: okFetch(archiveJson), complete, kv, today: "2026-10-30" };
    const first = await loadPuzzles({ ...deps, progress: solvedGm20("2026-10-29") });
    // The bonus solve moves the streak to today; the bonus must stay "today".
    const afterSolve = solvedGm20("2026-10-30");
    afterSolve.history[first.today.key] = { hints: [], wrongGuesses: 0, solved: true, score: 100 };
    const second = await loadPuzzles({ ...deps, progress: afterSolve });
    expect(second.today).toEqual(first.today);
    expect(second.bonus).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("ignores an unsolved offline puzzle cached earlier today once the GM puzzle is solved today", async () => {
    const kv = memoryKV();
    const complete = vi.fn<Complete>(async () => goodJson);
    await loadPuzzles({ fetchImpl: downFetch, complete, kv, today: "2026-10-29" });
    const r = await loadPuzzles({ fetchImpl: okFetch(archiveJson), complete, kv, today: "2026-10-29", progress: solvedGm20("2026-10-29") });
    expect(r).toMatchObject({ bonus: false });
    expect(r.today.key).toBe("gm-20");
  });
  it("goes back to the GM puzzle once a new one is out", async () => {
    const next = { puzzles: [{ day: 21, question: "Q21?", answer: "Map", acceptedAnswers: [] }, ...archiveJson.puzzles] };
    const r = await loadPuzzles({
      fetchImpl: okFetch(next),
      complete: vi.fn(),
      kv: memoryKV(),
      today: "2026-10-30",
      progress: solvedGm20("2026-10-29"),
    });
    expect(r).toMatchObject({ bonus: false });
    expect(r.today.key).toBe("gm-21");
  });
});

describe("reaching the GM", () => {
  const decision = {
    day: 20,
    participants: 8,
    winners: 3,
    winRate: 0.375,
    rewardPerWinner: "0.45 USDC",
    totalPaid: "1.35 USDC",
    treasuryAfter: "9.50 USDC",
    nextDifficulty: "hard",
    decidedBy: "gemini",
    reasoning: "Win rate in band; keep rewards steady.",
    anchorTx: "0xabc123",
  };

  it("tries the custom domain first, then vercel.app", async () => {
    expect(ARCHIVE_URLS[0]).not.toContain("vercel.app");
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      if (url === "https://a.test/x") throw new TypeError("blocked");
      return new Response(JSON.stringify(archiveJson), { status: 200 });
    }) as unknown as typeof fetch;
    const list = await fetchArchive(fetchImpl, { urls: ["https://a.test/x", "https://b.test/x"] });
    expect(seen).toEqual(["https://a.test/x", "https://b.test/x"]);
    expect(list).toHaveLength(2);
  });

  it("parses decisions and drops malformed ones", () => {
    const out = parseDecisions({ decisions: [decision, { day: "x" }, { day: 3 }] });
    const { decidedBy: _unused, ...expected } = decision;
    expect(out).toEqual([expected]);
    expect(parseDecisions(null)).toEqual([]);
  });

  it("saves the live archive and shows it (stale) when the GM is unreachable later", async () => {
    const kv = memoryKV();
    const live = await loadPuzzles({ fetchImpl: okFetch({ ...archiveJson, decisions: [decision] }), complete: vi.fn(), kv, today: "2026-10-29" });
    expect(live).toMatchObject({ stale: false, offline: false });
    expect(live.decisions.map((d) => d.day)).toEqual([20]);
    expect(kv.data.has(ARCHIVE_CACHE_KEY)).toBe(true);

    const complete = vi.fn<Complete>();
    const later = await loadPuzzles({ fetchImpl: downFetch, complete, kv, today: "2026-10-30" });
    expect(later).toMatchObject({ stale: true, offline: false });
    expect(later.today.key).toBe("gm-20");
    expect(later.archive.map((p) => p.key)).toEqual(["gm-19"]);
    expect(later.decisions).toHaveLength(1);
    expect(complete).not.toHaveBeenCalled();
  });
});
