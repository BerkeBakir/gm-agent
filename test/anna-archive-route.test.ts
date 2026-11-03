import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/anna/archive", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { gameStore?: unknown }).gameStore; // store is cached on globalThis
    process.env.GAME_STORE = "memory";
  });

  async function seed(n: number) {
    const { getGameStore } = await import("../src/game");
    const store = getGameStore();
    for (let i = 1; i <= n; i++) {
      await store.createChallenge({
        difficulty: "medium",
        question: `Q${i}?`,
        answer: `A${i}`,
        ...(i === 1 && { acceptedAnswers: ["Alpha one"] }),
      });
    }
    return store;
  }

  it("returns closed puzzles only, newest first, with answer, salt and accepted answers", async () => {
    await seed(3); // days 1, 2 closed; day 3 open
    const { GET } = await import("../app/api/anna/archive/route");
    const res = await GET();
    const body = await res.json();

    expect(body.puzzles.map((p: { day: number }) => p.day)).toEqual([2, 1]);
    expect(body.puzzles[1]).toMatchObject({
      day: 1,
      difficulty: "medium",
      question: "Q1?",
      answer: "A1",
      acceptedAnswers: ["Alpha one"],
    });
    expect(body.puzzles[0].acceptedAnswers).toEqual([]);
    expect(body.puzzles[0].commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.puzzles[0].salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("Q3?");
  });

  it("never exposes the open puzzle even when it is the only one", async () => {
    await seed(1);
    const { GET } = await import("../app/api/anna/archive/route");
    const body = await (await GET()).json();
    expect(body.puzzles).toEqual([]);
  });

  it("caps the list at 30", async () => {
    await seed(35);
    const { GET } = await import("../app/api/anna/archive/route");
    const body = await (await GET()).json();
    expect(body.puzzles).toHaveLength(30);
    expect(body.puzzles[0].day).toBe(34);
  });

  it("sends open CORS and cache headers, and answers preflight", async () => {
    await seed(2);
    const { GET, OPTIONS } = await import("../app/api/anna/archive/route");
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
    const pre = OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("includes the GM's latest decisions, newest first, without player addresses", async () => {
    const store = await seed(2);
    for (const day of [1, 2]) {
      await store.addDecision({
        day,
        challengeId: null,
        treasuryBefore: 10_000_000n,
        treasuryAfter: 9_500_000n,
        participants: 4,
        winners: 2,
        winRate: 0.5,
        income: 400_000n,
        rewardPerWinner: 450_000n,
        totalPaid: 900_000n,
        nextDifficulty: "hard",
        decidedBy: "gemini",
        reasoning: `Day ${day}: win rate at the top of the band, so harder next.`,
        adjustments: [],
        payouts: [{ player: "0x1111111111111111111111111111111111111111", amount: 450_000n, txHash: "0xabc" }],
      });
    }
    const { GET } = await import("../app/api/anna/archive/route");
    const body = await (await GET()).json();
    expect(body.decisions.map((d: { day: number }) => d.day)).toEqual([2, 1]);
    expect(body.decisions[0]).toMatchObject({
      day: 2,
      participants: 4,
      winners: 2,
      winRate: 0.5,
      rewardPerWinner: "0.45 USDC",
      totalPaid: "0.90 USDC",
      treasuryAfter: "9.50 USDC",
      nextDifficulty: "hard",
      decidedBy: "gemini",
      reasoning: "Day 2: win rate at the top of the band, so harder next.",
      anchorTx: null,
    });
    expect(JSON.stringify(body)).not.toContain("0x1111");
  });

  it("still returns puzzles when the decision log fails", async () => {
    const store = await seed(2);
    store.listDecisions = async () => {
      throw new Error("log down");
    };
    const { GET } = await import("../app/api/anna/archive/route");
    const body = await (await GET()).json();
    expect(body.puzzles).toHaveLength(1);
    expect(body.decisions).toEqual([]);
  });

  it("returns 503 with CORS and no-store when the store fails", async () => {
    vi.doMock("@/src/game", () => ({
      getGameStore: () => ({
        listChallenges: async () => {
          throw new Error("db down");
        },
      }),
    }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { GET } = await import("../app/api/anna/archive/route");
      const res = await GET();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "unavailable" });
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
      vi.doUnmock("@/src/game");
    }
  });
});
