import type { Challenge, Difficulty, NewChallenge } from "../game/types";

/** Summary of a finished game day, taken from the decision log. */
export interface DaySummary {
  day: number;
  participants: number;
  winners: number;
  winRate: number | null;
  income: bigint;
  totalPaid: bigint;
  treasuryAfter: bigint;
  nextDifficulty: Difficulty;
}

/** Everything the GM sees when it makes the end-of-day decision. All money in USDC base units. */
export interface GameState {
  /** Day being closed (0 when the game hasn't started). */
  day: number;
  challenge: Challenge | null;
  treasury: bigint;
  /** Max total payout allowed today (hard limit, enforced in code). */
  dailyBudget: bigint;
  /** Max reward per single transfer (hard limit, enforced in code). */
  maxPerTx: bigint;
  entryFee: bigint;
  today: { participants: number; winners: number; winRate: number | null; income: bigint };
  /** Previous days, newest first. */
  history: DaySummary[];
  recentQuestions: string[];
  targetWinRate: { min: number; max: number };
}

export interface Decision {
  rewardPerWinner: bigint;
  nextDifficulty: Difficulty;
  reasoning: string;
}

/** Makes the economic call. Gemini in production; rule-based strategies in simulations. */
export interface DecisionMaker {
  readonly name: string;
  decide(state: GameState): Promise<Decision>;
}

/** Writes the next challenge. Gemini in production; a static bank in tests/simulations. */
export interface ChallengeAuthor {
  author(difficulty: Difficulty, avoid: string[]): Promise<NewChallenge>;
}
