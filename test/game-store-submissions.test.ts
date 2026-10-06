import { describe, expect, it } from "vitest";
import { DuplicateSubmissionError, MemoryGameStore } from "../src/game/store";
import type { NewDecisionLog } from "../src/game/types";

const P1 = "0x0000000000000000000000000000000000000001";
const P2 = "0x0000000000000000000000000000000000000002";

async function withChallenge() {
  const store = new MemoryGameStore();
  const challenge = await store.createChallenge({ difficulty: "easy", question: "Q?", answer: "a" });
  return { store, challenge };
}

describe("submissions", () => {
  it("stores and lists submissions per challenge", async () => {
    const { store, challenge } = await withChallenge();
    await store.addSubmission({ challengeId: challenge.id, player: P1, answer: "a", correct: true, fee: 100_000n });
    await store.addSubmission({ challengeId: challenge.id, player: P2, answer: "b", correct: false, fee: 100_000n });
    const subs = await store.getSubmissions(challenge.id);
    expect(subs.map((s) => [s.player, s.correct])).toEqual([
      [P1, true],
      [P2, false],
    ]);
  });

  it("allows only one submission per wallet per challenge (case-insensitive)", async () => {
    const { store, challenge } = await withChallenge();
    await store.addSubmission({ challengeId: challenge.id, player: P1, answer: "a", correct: true, fee: 0n });
    await expect(
      store.addSubmission({ challengeId: challenge.id, player: P1.toUpperCase().replace("0X", "0x") as `0x${string}`, answer: "x", correct: false, fee: 0n }),
    ).rejects.toBeInstanceOf(DuplicateSubmissionError);
    expect(await store.hasSubmitted(challenge.id, P1)).toBe(true);
    expect(await store.hasSubmitted(challenge.id, P2)).toBe(false);
  });

  it("records rewards on a submission", async () => {
    const { store, challenge } = await withChallenge();
    const s = await store.addSubmission({ challengeId: challenge.id, player: P1, answer: "a", correct: true, fee: 0n });
    await store.recordReward(s.id, 500_000n, "0xabc");
    const [after] = await store.getSubmissions(challenge.id);
    expect(after?.reward).toBe(500_000n);
    expect(after?.rewardTx).toBe("0xabc");
  });
});

describe("decision log", () => {
  const entry = (day: number): NewDecisionLog => ({
    day,
    challengeId: null,
    treasuryBefore: 10n,
    treasuryAfter: 9n,
    participants: 2,
    winners: 1,
    winRate: 0.5,
    income: 0n,
    rewardPerWinner: 1n,
    totalPaid: 1n,
    nextDifficulty: "medium",
    decidedBy: "test",
    reasoning: "because",
    adjustments: [],
    payouts: [{ player: P1, amount: 1n }],
  });

  it("lists decisions newest first", async () => {
    const store = new MemoryGameStore();
    await store.addDecision(entry(1));
    await store.addDecision(entry(2));
    const list = await store.listDecisions(10);
    expect(list.map((d) => d.day)).toEqual([2, 1]);
    expect(list[0]?.payouts[0]?.amount).toBe(1n);
  });
});

describe("listChallenges", () => {
  it("returns challenges newest first", async () => {
    const store = new MemoryGameStore();
    await store.createChallenge({ difficulty: "easy", question: "1?", answer: "a" });
    await store.createChallenge({ difficulty: "hard", question: "2?", answer: "b" });
    expect((await store.listChallenges(5)).map((c) => c.day)).toEqual([2, 1]);
  });
});
