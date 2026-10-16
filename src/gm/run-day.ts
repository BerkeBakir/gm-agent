import type { Hex } from "viem";
import { anchorCalldata, decisionHash } from "../chain/anchor";
import type { GameStore } from "../game/store";
import { type Challenge, type DecisionLog, validateNewChallenge } from "../game/types";
import { dailyBudget, SpendingGuard, type SpendingLimits } from "../wallet/spending-guard";
import type { Wallet } from "../wallet/types";
import { StaticChallengeAuthor } from "./authors";
import { applyGuardrails } from "./policy";
import { RuleBasedDecisionMaker } from "./strategies";
import type { ChallengeAuthor, Decision, DecisionMaker, GameState } from "./types";

export interface RunDayDeps {
  store: GameStore;
  wallet: Wallet;
  decider: DecisionMaker;
  author: ChallengeAuthor;
  limits: SpendingLimits;
  entryFee: bigint;
  targetWinRate?: { min: number; max: number };
  /** Enforce difficulty hysteresis in code (default true). */
  hysteresis?: boolean;
  /** Writes the decision hash and next commitment on-chain. Optional; failures never fail the day. */
  anchor?: (data: Hex) => Promise<string>;
  /**
   * Time budget per LLM step. The whole run must finish inside the 300 s serverless limit,
   * otherwise the day is claimed but never reopened. On timeout the rule-based decider /
   * puzzle bank takes over, exactly like on an error.
   */
  timeouts?: { decideMs?: number; authorMs?: number; anchorMs?: number };
}

/** Rejects if `promise` doesn't settle within `ms` (the promise itself keeps running). */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

export interface DayReport {
  log: DecisionLog;
  newChallenge: Challenge;
}

const DEFAULT_TARGET = { min: 0.3, max: 0.5 };
const DEFAULT_TIMEOUTS = { decideMs: 90_000, authorMs: 120_000, anchorMs: 30_000 };

/** Collects everything the GM needs to decide how to close the current day. */
export async function buildGameState(deps: RunDayDeps): Promise<GameState> {
  const { store, wallet, limits } = deps;
  const [challenge, treasury, decisions, recent] = await Promise.all([
    store.getCurrentChallenge(),
    wallet.getBalance(),
    store.listDecisions(7),
    store.listChallenges(14),
  ]);
  const submissions = challenge ? await store.getSubmissions(challenge.id) : [];
  const winners = submissions.filter((s) => s.correct).length;

  return {
    day: challenge?.day ?? 0,
    challenge,
    treasury,
    dailyBudget: await dailyBudget(wallet, treasury, limits),
    maxPerTx: limits.maxPerTx,
    entryFee: deps.entryFee,
    today: {
      participants: submissions.length,
      winners,
      winRate: submissions.length > 0 ? winners / submissions.length : null,
      income: submissions.reduce((sum, s) => sum + s.fee, 0n),
    },
    history: decisions
      .filter((d) => d.day > 0)
      .map((d) => ({
        day: d.day,
        participants: d.participants,
        winners: d.winners,
        winRate: d.winRate,
        income: d.income,
        totalPaid: d.totalPaid,
        treasuryAfter: d.treasuryAfter,
        nextDifficulty: d.nextDifficulty,
      })),
    recentQuestions: recent.map((c) => c.question),
    targetWinRate: deps.targetWinRate ?? DEFAULT_TARGET,
  };
}

/**
 * One tick of the game. Closes the current day and opens the next:
 *   1. read state (treasury on-chain, submissions, history)
 *   2. decider proposes reward + next difficulty (with reasoning)
 *   3. guardrails clamp the proposal to hard limits
 *   4. pay every winner through the SpendingGuard
 *   5. author and publish the next challenge
 *   6. write the decision log
 *   7. anchor the decision hash and next commitment on-chain (optional)
 * The cron job, the admin button and the simulator all call this same function.
 */
export async function runDay(deps: RunDayDeps): Promise<DayReport> {
  const { store, wallet } = deps;
  const state = await buildGameState(deps);
  const notes: string[] = [];
  const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };

  // Claim the day atomically, so a cron run and a manual run can never both pay the same winners.
  if (state.challenge && !(await store.closeChallenge(state.challenge.id))) {
    throw new Error(`Day ${state.day} is already being closed by another run.`);
  }

  let decidedBy = deps.decider.name;
  let proposal: Decision;
  if (!state.challenge && state.history.length > 0) {
    // A previous run claimed the day but died before opening the next one: reopen the game.
    decidedBy = "recovery";
    const last = state.history[0]!;
    proposal = {
      rewardPerWinner: 0n,
      nextDifficulty: last.nextDifficulty,
      reasoning: `No puzzle was open (the previous day-close did not finish). Reopening the game at ${last.nextDifficulty}, the difficulty decided on day ${last.day}.`,
    };
  } else if (!state.challenge) {
    decidedBy = "bootstrap";
    proposal = { rewardPerWinner: 0n, nextDifficulty: "easy", reasoning: "Game starts: opening day 1 with an easy puzzle to attract players." };
  } else {
    try {
      proposal = await withTimeout(deps.decider.decide(state), timeouts.decideMs, deps.decider.name);
    } catch (err) {
      const fallback = new RuleBasedDecisionMaker("adaptive");
      notes.push(`${deps.decider.name} failed (${err instanceof Error ? err.message : String(err)}); used ${fallback.name}`);
      decidedBy = fallback.name;
      proposal = await fallback.decide(state);
    }
  }

  const decision = applyGuardrails(proposal, state, { hysteresis: deps.hysteresis });

  // Pay winners. Every transfer goes through the SpendingGuard (per-tx + daily limits).
  const payouts: DecisionLog["payouts"] = [];
  if (state.challenge && decision.rewardPerWinner > 0n) {
    const guard = new SpendingGuard(wallet, deps.limits);
    await guard.startDay(state.day);
    const winners = (await store.getSubmissions(state.challenge.id)).filter((s) => s.correct);
    for (const w of winners) {
      try {
        const tx = await guard.send(w.player, decision.rewardPerWinner);
        await store.recordReward(w.id, decision.rewardPerWinner, tx.txHash);
        payouts.push({ player: w.player, amount: decision.rewardPerWinner, txHash: tx.txHash });
      } catch (err) {
        payouts.push({ player: w.player, amount: 0n, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // Publish the next challenge.
  let next;
  try {
    next = validateNewChallenge(
      await withTimeout(deps.author.author(decision.nextDifficulty, state.recentQuestions), timeouts.authorMs, "challenge author"),
    );
  } catch (err) {
    notes.push(`challenge author failed (${err instanceof Error ? err.message : String(err)}); used puzzle bank`);
    next = await new StaticChallengeAuthor().author(decision.nextDifficulty, state.recentQuestions);
  }
  const newChallenge = await store.createChallenge(next);

  const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0n);
  const log = await store.addDecision({
    day: state.day,
    challengeId: state.challenge?.id ?? null,
    treasuryBefore: state.treasury,
    treasuryAfter: await wallet.getBalance(),
    participants: state.today.participants,
    winners: state.today.winners,
    winRate: state.today.winRate,
    income: state.today.income,
    rewardPerWinner: decision.rewardPerWinner,
    totalPaid,
    nextDifficulty: decision.nextDifficulty,
    decidedBy,
    reasoning: decision.reasoning,
    adjustments: [...decision.adjustments, ...notes],
    payouts,
  });

  if (deps.anchor) {
    const hash = decisionHash(log);
    let txHash: string | null = null;
    try {
      txHash = await withTimeout(deps.anchor(anchorCalldata(hash, newChallenge.commitment)), timeouts.anchorMs, "anchor");
    } catch (err) {
      console.warn(`Decision anchor failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await store.setDecisionAnchor(log.id, hash, txHash);
    } catch (err) {
      console.warn(`Saving the decision anchor failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    log.anchorHash = hash;
    if (txHash) log.anchorTx = txHash;
  }

  return { log, newChallenge };
}
