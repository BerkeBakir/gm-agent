import { DIFFICULTIES, type Difficulty } from "../game/types";
import type { Decision, GameState } from "./types";

const CENT = 10_000n; // 0.01 USDC

export interface GuardedDecision extends Decision {
  /** Human-readable notes for every change made to the decider's proposal. */
  adjustments: string[];
}

const usdc = (v: bigint) => `${Number(v) / 1e6} USDC`;

/**
 * Hard economic rules, enforced in code. The decider (LLM or strategy) proposes;
 * this decides what is actually allowed. Nothing it proposes can exceed these limits.
 */
export function applyGuardrails(proposal: Decision, state: GameState): GuardedDecision {
  const adjustments: string[] = [];
  let reward = proposal.rewardPerWinner;
  let nextDifficulty = proposal.nextDifficulty;

  if (!DIFFICULTIES.includes(nextDifficulty)) {
    adjustments.push(`invalid difficulty "${String(nextDifficulty)}" replaced with "medium"`);
    nextDifficulty = "medium";
  }

  const winners = BigInt(state.today.winners);
  if (winners === 0n) {
    return { ...proposal, rewardPerWinner: 0n, nextDifficulty, adjustments };
  }

  if (reward < 0n) {
    adjustments.push("negative reward set to 0");
    reward = 0n;
  }
  if (reward > state.maxPerTx) {
    adjustments.push(`reward ${usdc(reward)} capped at per-transaction limit ${usdc(state.maxPerTx)}`);
    reward = state.maxPerTx;
  }
  if (reward * winners > state.dailyBudget) {
    const capped = state.dailyBudget / winners;
    adjustments.push(
      `total ${usdc(reward * winners)} exceeds daily budget ${usdc(state.dailyBudget)}; reward lowered to ${usdc(capped)}`,
    );
    reward = capped;
  }
  reward = (reward / CENT) * CENT;

  return { ...proposal, rewardPerWinner: reward, nextDifficulty, adjustments };
}

/** Moves difficulty one step toward the target win-rate band. */
export function nextDifficultyForWinRate(
  current: Difficulty,
  winRate: number | null,
  target: { min: number; max: number },
): Difficulty {
  const i = DIFFICULTIES.indexOf(current);
  if (winRate === null) return current;
  if (winRate > target.max) return DIFFICULTIES[Math.min(i + 1, DIFFICULTIES.length - 1)]!;
  if (winRate < target.min) return DIFFICULTIES[Math.max(i - 1, 0)]!;
  return current;
}
