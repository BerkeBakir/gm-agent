import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "../src/game/store";
import { StaticChallengeAuthor } from "../src/gm/authors";
import { runDay } from "../src/gm/run-day";
import { RuleBasedDecisionMaker } from "../src/gm/strategies";
import { MockWallet } from "../src/wallet/mock";

const W1 = "0x0000000000000000000000000000000000000001";

describe("closeChallenge", () => {
  it("only the first caller closes an open challenge", async () => {
    const store = new MemoryGameStore();
    const c = await store.createChallenge({ difficulty: "easy", question: "Q?", answer: "a" });
    expect(await store.closeChallenge(c.id)).toBe(true);
    expect(await store.closeChallenge(c.id)).toBe(false);
    expect(await store.getCurrentChallenge()).toBeNull();
  });
});

describe("removeSubmission", () => {
  it("lets the same wallet submit again after a failed payment is rolled back", async () => {
    const store = new MemoryGameStore();
    const c = await store.createChallenge({ difficulty: "easy", question: "Q?", answer: "a" });
    const s = await store.addSubmission({ challengeId: c.id, player: W1, answer: "a", correct: true, fee: 1n });
    await store.removeSubmission(s.id);
    expect(await store.hasSubmitted(c.id, W1)).toBe(false);
  });
});

describe("runDay concurrency", () => {
  it("two simultaneous runs never pay the same winners twice", async () => {
    const store = new MemoryGameStore();
    const wallet = new MockWallet(100_000_000n);
    const deps = {
      store,
      wallet,
      decider: new RuleBasedDecisionMaker("fixed"),
      author: new StaticChallengeAuthor(),
      limits: { maxPerTx: 2_000_000n, maxDailyFractionBps: 1_000 },
      entryFee: 0n,
    };
    await runDay(deps);
    const day1 = (await store.getCurrentChallenge())!;
    await store.addSubmission({ challengeId: day1.id, player: W1, answer: "a", correct: true, fee: 0n });

    const results = await Promise.allSettled([runDay(deps), runDay(deps)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await wallet.getBalance()).toBe(100_000_000n - 500_000n);
  });
});
