export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface NewChallenge {
  difficulty: Difficulty;
  question: string;
  /** The answer key. Stored server-side, never shown to players. */
  answer: string;
  /** Other spellings/forms that also count as correct. */
  acceptedAnswers?: string[];
}

export interface Challenge extends NewChallenge {
  id: string;
  /** Game day number. A "day" is a tick, not a wall-clock day. */
  day: number;
  status: "open" | "closed";
  createdAt: string;
}

export type PublicChallenge = Omit<Challenge, "answer" | "acceptedAnswers">;

/** All money amounts are USDC base units (6 decimals). */
export interface NewSubmission {
  challengeId: string;
  player: `0x${string}`;
  answer: string;
  correct: boolean;
  /** Entry fee paid via x402 (0n in free mode / simulations without fees). */
  fee: bigint;
  /** On-chain settlement tx of the entry fee, if any. */
  feeTx?: string;
}

export interface Submission extends NewSubmission {
  id: string;
  /** Reward paid to this player for this challenge, set by the GM at day end. */
  reward?: bigint;
  rewardTx?: string;
  createdAt: string;
}

/** One entry of the GM's decision log: what it saw, what it decided, and why. */
export interface DecisionLog {
  id: string;
  day: number;
  challengeId: string | null;
  treasuryBefore: bigint;
  treasuryAfter: bigint;
  participants: number;
  winners: number;
  winRate: number | null;
  income: bigint;
  rewardPerWinner: bigint;
  totalPaid: bigint;
  nextDifficulty: Difficulty;
  /** Who made the call: "gemini", or a rule-based strategy name in simulations. */
  decidedBy: string;
  reasoning: string;
  /** Guardrail adjustments applied on top of the LLM's proposal, if any. */
  adjustments: string[];
  payouts: { player: string; amount: bigint; txHash?: string; error?: string }[];
  createdAt: string;
}

export type NewDecisionLog = Omit<DecisionLog, "id" | "createdAt">;

export function toPublicChallenge({ answer: _a, acceptedAnswers: _b, ...pub }: Challenge): PublicChallenge {
  return pub;
}

/** Validates untrusted input (e.g. LLM tool arguments) into a NewChallenge. */
export function validateNewChallenge(input: {
  difficulty?: unknown;
  question?: unknown;
  answer?: unknown;
  acceptedAnswers?: unknown;
}): NewChallenge {
  const { difficulty, question, answer, acceptedAnswers } = input;
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) {
    throw new Error(`difficulty must be one of ${DIFFICULTIES.join(", ")}`);
  }
  if (typeof question !== "string" || !question.trim()) throw new Error("question must be a non-empty string");
  if (typeof answer !== "string" || !answer.trim()) throw new Error("answer must be a non-empty string");

  const accepted = Array.isArray(acceptedAnswers)
    ? acceptedAnswers.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim())
    : [];

  return {
    difficulty: difficulty as Difficulty,
    question: question.trim(),
    answer: answer.trim(),
    ...(accepted.length > 0 && { acceptedAnswers: accepted }),
  };
}
