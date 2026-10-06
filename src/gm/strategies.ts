import { nextDifficultyForWinRate } from "./policy";
import type { Decision, DecisionMaker, GameState } from "./types";

export const STRATEGIES = ["fixed", "generous", "stingy", "adaptive", "adaptive-v2"] as const;
export type StrategyName = (typeof STRATEGIES)[number];

const usdc = (v: bigint) => `${(Number(v) / 1e6).toFixed(2)} USDC`;

/**
 * Baseline strategies used in simulations to compare against the LLM:
 * - fixed:    always 0.50 USDC, always medium
 * - generous: hands out the whole daily budget, keeps puzzles easy
 * - stingy:   0.05 USDC, keeps puzzles hard
 * - adaptive: steers win rate into the target band and pays out about
 *             today's income plus 2% of the treasury (sustainable by design)
 * - adaptive-v2: same payout, but difficulty only moves when the win rate is far
 *             outside the band, or outside it two days in a row (hysteresis).
 *             Added after simulations showed v1 oscillating medium↔hard every day.
 */
export class RuleBasedDecisionMaker implements DecisionMaker {
  readonly name: string;

  constructor(private readonly strategy: StrategyName) {
    this.name = `rule:${strategy}`;
  }

  async decide(state: GameState): Promise<Decision> {
    const winners = BigInt(Math.max(state.today.winners, 1));
    const current = state.challenge?.difficulty ?? "easy";

    switch (this.strategy) {
      case "fixed":
        return { rewardPerWinner: 500_000n, nextDifficulty: "medium", reasoning: "Fixed strategy: 0.50 USDC, medium." };
      case "generous":
        return {
          rewardPerWinner: state.dailyBudget / winners,
          nextDifficulty: "easy",
          reasoning: "Generous strategy: spend the full daily budget, keep it easy.",
        };
      case "stingy":
        return { rewardPerWinner: 50_000n, nextDifficulty: "hard", reasoning: "Stingy strategy: 0.05 USDC, hard." };
      case "adaptive": {
        const pool = state.today.income + state.treasury / 50n;
        const next = nextDifficultyForWinRate(current, state.today.winRate, state.targetWinRate);
        return {
          rewardPerWinner: pool / winners,
          nextDifficulty: next,
          reasoning:
            `Adaptive: pool = income ${usdc(state.today.income)} + 2% of treasury → ${usdc(pool)} split across ` +
            `${winners} winner(s); win rate ${state.today.winRate ?? "n/a"} → ${next}.`,
        };
      }
      case "adaptive-v2": {
        const pool = state.today.income + state.treasury / 50n;
        const { min, max } = state.targetWinRate;
        const wr = state.today.winRate;
        const prev = state.history[0]?.winRate ?? null;
        const out = (x: number | null) => x !== null && (x < min || x > max);
        const far = wr !== null && (wr < min - 0.15 || wr > max + 0.15);
        const sameSide = wr !== null && prev !== null && (wr > max) === (prev > max);
        const move = far || (out(wr) && out(prev) && sameSide);
        const next = move ? nextDifficultyForWinRate(current, wr, state.targetWinRate) : current;
        return {
          rewardPerWinner: pool / winners,
          nextDifficulty: next,
          reasoning:
            `Adaptive v2: pool ${usdc(pool)} across ${winners} winner(s); win rate ${wr ?? "n/a"} ` +
            (move ? `is ${far ? "far" : "persistently"} outside ${min}-${max} → ${next}.` : `→ keep ${current} (hysteresis).`),
        };
      }
    }
  }
}
