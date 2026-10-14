import { describe, expect, it } from "vitest";
import { applyGuardrails, nextDifficultyForWinRate } from "../src/gm/policy";
import type { GameState } from "../src/gm/types";

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 3,
    challenge: null,
    treasury: 100_000_000n, // 100 USDC
    dailyBudget: 10_000_000n, // 10 USDC
    maxPerTx: 2_000_000n, // 2 USDC
    entryFee: 100_000n,
    today: { participants: 10, winners: 4, winRate: 0.4, income: 1_000_000n },
    history: [],
    recentQuestions: [],
    targetWinRate: { min: 0.3, max: 0.5 },
    ...overrides,
  };
}

describe("applyGuardrails", () => {
  it("passes a reasonable proposal through unchanged (rounded to cents)", () => {
    const r = applyGuardrails({ rewardPerWinner: 1_500_000n, nextDifficulty: "medium", reasoning: "ok" }, state());
    expect(r.rewardPerWinner).toBe(1_500_000n);
    expect(r.adjustments).toEqual([]);
  });

  it("caps at maxPerTx", () => {
    const r = applyGuardrails({ rewardPerWinner: 9_000_000n, nextDifficulty: "medium", reasoning: "" }, state());
    expect(r.rewardPerWinner).toBe(2_000_000n);
    expect(r.adjustments.join()).toMatch(/per-transaction/);
  });

  it("caps total payout at the daily budget", () => {
    const s = state({ today: { participants: 20, winners: 10, winRate: 0.5, income: 0n } });
    const r = applyGuardrails({ rewardPerWinner: 2_000_000n, nextDifficulty: "hard", reasoning: "" }, s);
    expect(r.rewardPerWinner).toBe(1_000_000n); // 10 USDC / 10 winners
    expect(r.adjustments.join()).toMatch(/daily budget/);
  });

  it("pays nothing when there are no winners", () => {
    const s = state({ today: { participants: 5, winners: 0, winRate: 0, income: 0n } });
    const r = applyGuardrails({ rewardPerWinner: 1_000_000n, nextDifficulty: "easy", reasoning: "" }, s);
    expect(r.rewardPerWinner).toBe(0n);
  });

  it("rejects negative rewards and invalid difficulty", () => {
    const r = applyGuardrails({ rewardPerWinner: -5n, nextDifficulty: "insane" as never, reasoning: "" }, state());
    expect(r.rewardPerWinner).toBe(0n);
    expect(r.nextDifficulty).toBe("medium");
  });

  it("rounds down to whole cents", () => {
    const r = applyGuardrails({ rewardPerWinner: 1_234_567n, nextDifficulty: "medium", reasoning: "" }, state());
    expect(r.rewardPerWinner).toBe(1_230_000n);
  });
});

describe("difficulty hysteresis", () => {
  const challenge = (difficulty: "easy" | "medium" | "hard") =>
    ({ id: "c1", day: 3, difficulty, question: "q", answer: "a", hint: null, createdAt: new Date(), closedAt: null }) as never;
  const today = (winRate: number | null) => ({ participants: 10, winners: Math.round((winRate ?? 0) * 10), winRate, income: 1_000_000n });
  const yesterday = (winRate: number | null) => [
    { day: 2, participants: 10, winners: 0, winRate, income: 0n, totalPaid: 0n, treasuryAfter: 0n, nextDifficulty: "medium" as const },
  ];
  const decide = (proposed: "easy" | "medium" | "hard", s: Partial<GameState>) =>
    applyGuardrails({ rewardPerWinner: 100_000n, nextDifficulty: proposed, reasoning: "" }, state(s));

  it("blocks a change when today's win rate is inside the band", () => {
    const r = decide("hard", { challenge: challenge("medium"), today: today(0.45) });
    expect(r.nextDifficulty).toBe("medium");
    expect(r.adjustments.join()).toMatch(/hysteresis.*inside the target band/);
  });

  it("blocks a change on one slightly-out day", () => {
    const r = decide("hard", { challenge: challenge("medium"), today: today(0.6), history: yesterday(0.4) });
    expect(r.nextDifficulty).toBe("medium");
    expect(r.adjustments.join()).toMatch(/second day/);
  });

  it("allows a change when far outside the band", () => {
    const r = decide("hard", { challenge: challenge("medium"), today: today(0.8), history: yesterday(0.4) });
    expect(r.nextDifficulty).toBe("hard");
    expect(r.adjustments).toEqual([]);
  });

  it("allows a change when outside on the same side two days in a row", () => {
    const r = decide("easy", { challenge: challenge("medium"), today: today(0.25), history: yesterday(0.2) });
    expect(r.nextDifficulty).toBe("easy");
  });

  it("does not count yesterday on the other side as persistent", () => {
    const r = decide("hard", { challenge: challenge("medium"), today: today(0.6), history: yesterday(0.2) });
    expect(r.nextDifficulty).toBe("medium");
  });

  it("blocks a move in the wrong direction", () => {
    const r = decide("easy", { challenge: challenge("medium"), today: today(0.9) });
    expect(r.nextDifficulty).toBe("medium");
    expect(r.adjustments.join()).toMatch(/only go up/);
  });

  it("limits a jump to one step", () => {
    const r = decide("hard", { challenge: challenge("easy"), today: today(0.95) });
    expect(r.nextDifficulty).toBe("medium");
    expect(r.adjustments.join()).toMatch(/one step/);
  });

  it("keeps difficulty when nobody played", () => {
    const r = decide("easy", { challenge: challenge("hard"), today: { participants: 0, winners: 0, winRate: null, income: 0n } });
    expect(r.nextDifficulty).toBe("hard");
  });

  it("leaves unchanged proposals and the opening day alone", () => {
    expect(decide("medium", { challenge: challenge("medium"), today: today(0.9) }).adjustments).toEqual([]);
    expect(decide("easy", { challenge: null }).nextDifficulty).toBe("easy");
  });

  it("can be switched off to reproduce pre-v2 experiments", () => {
    const r = applyGuardrails(
      { rewardPerWinner: 100_000n, nextDifficulty: "hard", reasoning: "" },
      state({ challenge: challenge("medium"), today: today(0.45) }),
      { hysteresis: false },
    );
    expect(r.nextDifficulty).toBe("hard");
  });
});

describe("nextDifficultyForWinRate", () => {
  const target = { min: 0.3, max: 0.5 };
  it("makes it harder when too many win", () => {
    expect(nextDifficultyForWinRate("easy", 0.8, target)).toBe("medium");
    expect(nextDifficultyForWinRate("hard", 0.9, target)).toBe("hard");
  });
  it("makes it easier when too few win", () => {
    expect(nextDifficultyForWinRate("hard", 0.1, target)).toBe("medium");
    expect(nextDifficultyForWinRate("easy", 0, target)).toBe("easy");
  });
  it("keeps difficulty inside the target band or without data", () => {
    expect(nextDifficultyForWinRate("medium", 0.4, target)).toBe("medium");
    expect(nextDifficultyForWinRate("medium", null, target)).toBe("medium");
  });
});
