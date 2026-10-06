import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "../src/game/store";
import { runDay } from "../src/gm/run-day";
import { StaticChallengeAuthor } from "../src/gm/authors";
import { RuleBasedDecisionMaker } from "../src/gm/strategies";
import type { DecisionMaker } from "../src/gm/types";
import { MockWallet } from "../src/wallet/mock";

const W1 = "0x0000000000000000000000000000000000000001";
const W2 = "0x0000000000000000000000000000000000000002";
const L1 = "0x0000000000000000000000000000000000000003";

function setup(decider: DecisionMaker = new RuleBasedDecisionMaker("fixed")) {
  const store = new MemoryGameStore();
  const wallet = new MockWallet(100_000_000n); // 100 USDC
  const deps = {
    store,
    wallet,
    decider,
    author: new StaticChallengeAuthor(),
    limits: { maxPerTx: 2_000_000n, maxDailyFractionBps: 1_000 },
    entryFee: 100_000n,
  };
  return { store, wallet, deps };
}

describe("runDay", () => {
  it("bootstraps day 1 when no challenge exists", async () => {
    const { store, deps } = setup();
    const report = await runDay(deps);
    expect(report.newChallenge.day).toBe(1);
    expect((await store.getCurrentChallenge())?.day).toBe(1);
    const [log] = await store.listDecisions(1);
    expect(log?.participants).toBe(0);
    expect(log?.totalPaid).toBe(0n);
  });

  it("pays winners, logs the decision and opens the next day", async () => {
    const { store, wallet, deps } = setup();
    await runDay(deps); // day 1 open
    const day1 = (await store.getCurrentChallenge())!;
    await store.addSubmission({ challengeId: day1.id, player: W1, answer: day1.answer, correct: true, fee: 100_000n });
    await store.addSubmission({ challengeId: day1.id, player: W2, answer: day1.answer, correct: true, fee: 100_000n });
    await store.addSubmission({ challengeId: day1.id, player: L1, answer: "nope", correct: false, fee: 100_000n });

    const report = await runDay(deps);

    expect(report.newChallenge.day).toBe(2);
    const [log] = await store.listDecisions(1);
    expect(log?.day).toBe(1);
    expect(log?.participants).toBe(3);
    expect(log?.winners).toBe(2);
    expect(log?.winRate).toBeCloseTo(2 / 3);
    expect(log?.income).toBe(300_000n);
    expect(log?.payouts.map((p) => p.player)).toEqual([W1, W2]);
    expect(log?.totalPaid).toBe(log!.rewardPerWinner * 2n);
    expect(log?.reasoning).toBeTruthy();
    expect(await wallet.getBalance()).toBe(100_000_000n - log!.totalPaid);

    const subs = await store.getSubmissions(day1.id);
    expect(subs.filter((s) => s.reward !== undefined).length).toBe(2);
  });

  it("never pays more than the guardrails allow, even if the decider asks", async () => {
    const greedy: DecisionMaker = {
      name: "greedy",
      decide: async () => ({ rewardPerWinner: 50_000_000n, nextDifficulty: "easy", reasoning: "pay everything" }),
    };
    const { store, wallet, deps } = setup(greedy);
    await runDay(deps);
    const day1 = (await store.getCurrentChallenge())!;
    await store.addSubmission({ challengeId: day1.id, player: W1, answer: "x", correct: true, fee: 0n });
    await runDay(deps);
    const [log] = await store.listDecisions(1);
    expect(log?.rewardPerWinner).toBe(2_000_000n);
    expect(log?.adjustments.length).toBeGreaterThan(0);
    expect(await wallet.getBalance()).toBe(98_000_000n);
  });

  it("records a failed payout instead of crashing the day", async () => {
    const { store, deps } = setup();
    const broke = new MockWallet(0n);
    await runDay({ ...deps, wallet: broke });
    const day1 = (await store.getCurrentChallenge())!;
    await store.addSubmission({ challengeId: day1.id, player: W1, answer: "x", correct: true, fee: 0n });
    const report = await runDay({ ...deps, wallet: broke });
    expect(report.newChallenge.day).toBe(2);
    const [log] = await store.listDecisions(1);
    expect(log?.totalPaid).toBe(0n);
  });
});
