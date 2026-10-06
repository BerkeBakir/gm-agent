/**
 * Off-chain economy simulator. Runs the REAL runDay() loop against a MockWallet and
 * an in-memory store, with a population of bot players, so 30-day experiments take
 * seconds and cost nothing.
 *
 * Player model (intentionally simple, documented in docs/experiments.md):
 * - each bot has a skill (0..1) and an interest (probability of playing today)
 * - P(correct) = skill shifted by difficulty: easy +0.30, medium 0, hard -0.35
 * - after each day, interest moves toward how worthwhile the game felt:
 *   expected value of playing (win rate × reward − fee), plus a penalty when the
 *   puzzle was boring (win rate > 85%) or hopeless (win rate < 10%)
 */
import type { Difficulty } from "../game/types";
import { MemoryGameStore } from "../game/store";
import { StaticChallengeAuthor } from "../gm/authors";
import { runDay } from "../gm/run-day";
import type { ChallengeAuthor, DecisionMaker } from "../gm/types";
import { MockWallet } from "../wallet/mock";

export interface SimConfig {
  days: number;
  players: number;
  startTreasury: bigint;
  entryFee: bigint;
  maxPerTx: bigint;
  maxDailyFractionBps: number;
  seed: number;
}

export const DEFAULT_SIM: SimConfig = {
  days: 30,
  players: 40,
  startTreasury: 50_000_000n, // 50 USDC
  entryFee: 100_000n, // 0.10 USDC
  maxPerTx: 2_000_000n, // 2 USDC
  maxDailyFractionBps: 1_000, // 10%
  seed: 1,
};

export interface DayMetrics {
  day: number;
  difficulty: Difficulty;
  participants: number;
  winners: number;
  winRate: number | null;
  income: number;
  paid: number;
  rewardPerWinner: number;
  treasury: number;
  avgInterest: number;
  reasoning: string;
  adjustments: string[];
}

export interface SimResult {
  strategy: string;
  days: DayMetrics[];
  summary: {
    finalTreasury: number;
    minTreasury: number;
    bankruptDay: number | null;
    avgParticipants: number;
    lastWeekParticipants: number;
    totalPaid: number;
    totalIncome: number;
    daysInTargetBand: number;
    guardrailInterventions: number;
    difficultySwitches: number;
  };
}

/** Deterministic PRNG (mulberry32) so every strategy faces the same players. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHIFT: Record<Difficulty, number> = { easy: 0.3, medium: 0, hard: -0.35 };
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const usd = (v: bigint) => Number(v) / 1e6;

export async function simulate(
  decider: DecisionMaker,
  cfg: SimConfig = DEFAULT_SIM,
  author: ChallengeAuthor = new StaticChallengeAuthor(),
): Promise<SimResult> {
  const random = rng(cfg.seed);
  const store = new MemoryGameStore();
  const wallet = new MockWallet(cfg.startTreasury);
  const deps = {
    store,
    wallet,
    decider,
    author,
    limits: { maxPerTx: cfg.maxPerTx, maxDailyFractionBps: cfg.maxDailyFractionBps },
    entryFee: cfg.entryFee,
  };

  const bots = Array.from({ length: cfg.players }, (_, i) => ({
    address: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
    skill: 0.2 + random() * 0.7,
    interest: 0.5,
  }));

  await runDay(deps); // open day 1
  const days: DayMetrics[] = [];
  let bankruptDay: number | null = null;

  for (let d = 1; d <= cfg.days; d++) {
    const challenge = (await store.getCurrentChallenge())!;
    const balance = await wallet.getBalance();
    // The game can't run if it can't afford anything; players notice.
    for (const bot of bots) {
      if (random() > bot.interest) continue;
      const correct = random() < clamp(bot.skill + SHIFT[challenge.difficulty], 0.02, 0.98);
      await store.addSubmission({
        challengeId: challenge.id,
        player: bot.address,
        answer: correct ? challenge.answer : "wrong",
        correct,
        fee: cfg.entryFee,
      });
      wallet.deposit(cfg.entryFee);
    }

    const { log } = await runDay(deps);
    const treasury = await wallet.getBalance();
    if (bankruptDay === null && treasury < cfg.entryFee * 10n && balance > 0n) bankruptDay = d;

    // Players react to how the day went.
    const winRate = log.winRate ?? 0;
    const ev = winRate * usd(log.rewardPerWinner) - usd(cfg.entryFee);
    const appeal = 1 / (1 + Math.exp(-ev / usd(cfg.entryFee))); // 0..1
    const mood = log.participants > 0 && (winRate > 0.85 || winRate < 0.1) ? -0.08 : 0;
    for (const bot of bots) {
      bot.interest = clamp(0.75 * bot.interest + 0.25 * appeal + mood + (random() - 0.5) * 0.04, 0.02, 0.95);
    }

    days.push({
      day: d,
      difficulty: challenge.difficulty,
      participants: log.participants,
      winners: log.winners,
      winRate: log.winRate,
      income: usd(log.income),
      paid: usd(log.totalPaid),
      rewardPerWinner: usd(log.rewardPerWinner),
      treasury: usd(treasury),
      avgInterest: bots.reduce((s, b) => s + b.interest, 0) / bots.length,
      reasoning: log.reasoning,
      adjustments: log.adjustments,
    });
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    strategy: decider.name,
    days,
    summary: {
      finalTreasury: days.at(-1)?.treasury ?? usd(cfg.startTreasury),
      minTreasury: Math.min(...days.map((x) => x.treasury)),
      bankruptDay,
      avgParticipants: avg(days.map((x) => x.participants)),
      lastWeekParticipants: avg(days.slice(-7).map((x) => x.participants)),
      totalPaid: days.reduce((s, x) => s + x.paid, 0),
      totalIncome: days.reduce((s, x) => s + x.income, 0),
      daysInTargetBand: days.filter((x) => x.winRate !== null && x.winRate >= 0.3 && x.winRate <= 0.5).length,
      guardrailInterventions: days.filter((x) => x.adjustments.length > 0).length,
      difficultySwitches: days.filter((x, i) => i > 0 && x.difficulty !== days[i - 1]!.difficulty).length,
    },
  };
}
