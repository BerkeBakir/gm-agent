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
