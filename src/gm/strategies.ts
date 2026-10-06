import { nextDifficultyForWinRate } from "./policy";
import type { Decision, DecisionMaker, GameState } from "./types";

export const STRATEGIES = ["fixed", "generous", "stingy", "adaptive"] as const;
export type StrategyName = (typeof STRATEGIES)[number];

const usdc = (v: bigint) => `${(Number(v) / 1e6).toFixed(2)} USDC`;

/**
 * Baseline strategies used in simulations to compare against the LLM:
 * - fixed:    always 0.50 USDC, always medium
 * - generous: hands out the whole daily budget, keeps puzzles easy
 * - stingy:   0.05 USDC, keeps puzzles hard
 * - adaptive: steers win rate into the target band and pays out about
 *             today's income plus 2% of the treasury (sustainable by design)
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
    }
  }
}
