import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "../src/game/store";
import type { Difficulty, NewChallenge } from "../src/game/types";
import { StaticChallengeAuthor } from "../src/gm/authors";
import { findRepeat, type RecentPuzzle } from "../src/gm/repeat-guard";
import { runDay } from "../src/gm/run-day";
import { RuleBasedDecisionMaker } from "../src/gm/strategies";
import type { ChallengeAuthor } from "../src/gm/types";
import { MockWallet } from "../src/wallet/mock";

const DARKNESS = { question: "The more of this there is, the less you see. What is it?", answer: "darkness", acceptedAnswers: ["dark", "the dark"] };
const STAMP = { question: "What can travel around the world while staying in a corner?", answer: "stamp", acceptedAnswers: ["a stamp"] };
const MAP = { question: "I have cities but no houses, forests but no trees, water but no fish. What am I?", answer: "map" };

describe("findRepeat", () => {
  it("is null for a fresh puzzle", () => {
    expect(findRepeat({ question: "What has a neck?", answer: "bottle" }, [DARKNESS, STAMP])).toBeNull();
  });

  it("catches the same question, ignoring case and punctuation", () => {
    const r = findRepeat({ question: "the more of this there is the less you see what is it", answer: "night" }, [{ ...DARKNESS, day: 24 }]);
    expect(r).toEqual({ index: 0, reason: "repeats the question of day 24" });
  });

  it("catches a reworded riddle with the same answer, including accepted answers and articles", () => {
    expect(findRepeat({ question: "Fill a room with me and you see nothing.", answer: "The dark" }, [STAMP, DARKNESS])?.index).toBe(1);
    expect(findRepeat({ question: "Stuck in a corner, it still sees the world.", answer: "a stamp" }, [STAMP])?.reason).toMatch(/answer "stamp"/);
  });

  it("returns the newest match", () => {
    expect(findRepeat(DARKNESS, [STAMP, { ...DARKNESS, day: 25 }, { ...DARKNESS, day: 15 }])?.reason).toMatch(/day 25/);
  });
});

describe("StaticChallengeAuthor", () => {
  it("does not fall back to the first bank puzzle once darkness, stamp and map were all used (the day 24/25/27 bug)", async () => {
    // Production state when day 24 was closed: medium bank puzzles on days 15, 17, 18 and the open day 24.
    const recent: RecentPuzzle[] = [{ ...DARKNESS, day: 24 }, { ...MAP, day: 18 }, { ...STAMP, day: 17 }, { ...DARKNESS, day: 15 }];
    const next = await new StaticChallengeAuthor().author("medium", recent);
    expect(findRepeat(next, recent)).toBeNull();
  });

  it("reuses the least recently used puzzle when the whole pool is recent, never yesterday's", async () => {
    const author = new StaticChallengeAuthor();
    const recent: RecentPuzzle[] = [];
    for (let i = 0; i < 10; i++) recent.unshift(await author.author("hard", recent));
    expect(new Set(recent.map((p) => p.answer)).size).toBe(10); // the whole hard pool, no repeats

    const next = await new StaticChallengeAuthor().author("hard", recent);
    expect(next.question).toBe(recent.at(-1)!.question); // the oldest one
  });

  it("has no answer collisions inside the bank, so every puzzle can be fresh", async () => {
    for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
      const author = new StaticChallengeAuthor();
      const recent: RecentPuzzle[] = [];
      for (let i = 0; i < 10; i++) {
        const next = await author.author(difficulty, recent);
        expect(findRepeat(next, recent), `${difficulty} #${i}`).toBeNull();
        recent.unshift(next);
      }
    }
  });
});

describe("runDay repeat guard", () => {
  function setup(author: ChallengeAuthor) {
    const store = new MemoryGameStore();
    const deps = {
      store,
      wallet: new MockWallet(100_000_000n),
      decider: new RuleBasedDecisionMaker("fixed"),
      author,
      limits: { maxPerTx: 2_000_000n, maxDailyFractionBps: 1_000 },
      entryFee: 100_000n,
    };
    return { store, deps };
  }

  it("rejects an author's puzzle that repeats a recent answer and publishes a fresh bank puzzle", async () => {
    let calls = 0;
    const parrot: ChallengeAuthor = {
      async author(difficulty: Difficulty): Promise<NewChallenge> {
        calls++;
        return { difficulty, question: `Riddle number ${calls}?`, answer: "darkness" };
      },
    };
    const { store, deps } = setup(parrot);
    await runDay(deps); // day 1: darkness
    const report = await runDay(deps); // day 2: the author repeats the answer

    expect(report.newChallenge.answer).not.toBe("darkness");
    const [log] = await store.listDecisions(1);
    expect(log?.adjustments.join(" ")).toMatch(/repeats the answer "darkness" of day 1.*used puzzle bank/);
  });

  it("never publishes the same puzzle twice in a row, even after a month of bank fallbacks", async () => {
    const broken: ChallengeAuthor = {
      async author() {
        throw new Error("challenge author timed out after 120s");
      },
    };
    const { store, deps } = setup(broken);
    for (let i = 0; i < 45; i++) await runDay(deps);

    const days = (await store.listChallenges(45)).reverse(); // oldest first
    expect(days).toHaveLength(45);
    for (let i = 1; i < days.length; i++) {
      const previous = days.slice(Math.max(0, i - 9), i); // the bank has 10 per difficulty
      expect(findRepeat(days[i]!, previous), `day ${days[i]!.day}`).toBeNull();
    }
  });
});
