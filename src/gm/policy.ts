import { DIFFICULTIES, type Difficulty } from "../game/types";
import type { Decision, GameState } from "./types";

const CENT = 10_000n; // 0.01 USDC

export interface GuardedDecision extends Decision {
  /** Human-readable notes for every change made to the decider's proposal. */
  adjustments: string[];
}

const usdc = (v: bigint) => `${Number(v) / 1e6} USDC`;

/** How far outside the target band one day must be to justify a change on its own. */
export const FAR_FROM_BAND = 0.15;

type Side = "below" | "in" | "above";
const sideOf = (wr: number, band: { min: number; max: number }): Side =>
  wr > band.max ? "above" : wr < band.min ? "below" : "in";

/**
 * Difficulty hysteresis, enforced in code. Experiments showed Gemini flips difficulty almost
 * every day even when told not to, so the decider may only move difficulty when the evidence
 * supports it:
 *   - today's win rate is more than FAR_FROM_BAND outside the target band, or
 *   - it was outside the band on the same side two days in a row;
 * and then only one step, in the direction that pulls the win rate back toward the band.
 * Otherwise the current difficulty is kept and the reason is returned as a note.
 */
export function applyDifficultyHysteresis(
  proposed: Difficulty,
  state: GameState,
): { difficulty: Difficulty; note?: string } {
  const current = state.challenge?.difficulty;
  if (!current || proposed === current) return { difficulty: proposed };

  const keep = (why: string) => ({
    difficulty: current,
    note: `difficulty change ${current}→${proposed} blocked (hysteresis): ${why}`,
  });
  const band = state.targetWinRate;
  const wr = state.today.winRate;
  if (wr === null) return keep("no players today, no evidence");

  const side = sideOf(wr, band);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const bandText = `${pct(band.min)}-${pct(band.max)}`;
  if (side === "in") return keep(`win rate ${pct(wr)} is inside the target band ${bandText}`);

  const distance = side === "above" ? wr - band.max : band.min - wr;
  const prev = state.history[0]?.winRate ?? null;
  const persistent = prev !== null && sideOf(prev, band) === side;
  if (distance <= FAR_FROM_BAND && !persistent) {
    return keep(`win rate ${pct(wr)} is only slightly ${side} ${bandText} and yesterday was not, wait for a second day`);
  }

  const i = DIFFICULTIES.indexOf(current);
  const step = side === "above" ? 1 : -1; // too many winners → harder; too few → easier
  const j = DIFFICULTIES.indexOf(proposed);
  if (Math.sign(j - i) !== step) {
    return keep(`win rate ${pct(wr)} is ${side} the band, so difficulty may only go ${step > 0 ? "up" : "down"}`);
  }
  const allowed = DIFFICULTIES[i + step]!;
  if (allowed !== proposed) {
    return { difficulty: allowed, note: `difficulty change ${current}→${proposed} limited to one step: ${allowed} (hysteresis)` };
  }
  return { difficulty: proposed };
}

export interface GuardrailOptions {
  /** Enforce difficulty hysteresis (default true). Disabled only to reproduce pre-v2 experiments. */
  hysteresis?: boolean;
}

/**
 * Hard economic rules, enforced in code. The decider (LLM or strategy) proposes;
 * this decides what is actually allowed. Nothing it proposes can exceed these limits.
 */
export function applyGuardrails(proposal: Decision, state: GameState, opts: GuardrailOptions = {}): GuardedDecision {
  const adjustments: string[] = [];
  let reward = proposal.rewardPerWinner;
  let nextDifficulty = proposal.nextDifficulty;

  if (!DIFFICULTIES.includes(nextDifficulty)) {
    adjustments.push(`invalid difficulty "${String(nextDifficulty)}" replaced with "medium"`);
    nextDifficulty = "medium";
  }

  if (opts.hysteresis ?? true) {
    const h = applyDifficultyHysteresis(nextDifficulty, state);
    nextDifficulty = h.difficulty;
    if (h.note) adjustments.push(h.note);
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
