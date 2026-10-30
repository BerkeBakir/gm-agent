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
});
