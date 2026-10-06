import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { DuplicateSubmissionError, type GameStore } from "./store";
import type {
  Challenge,
  DecisionLog,
  Difficulty,
  NewChallenge,
  NewDecisionLog,
  NewSubmission,
  Submission,
} from "./types";

type ChallengeRow = {
  id: string;
  day: number;
  difficulty: Difficulty;
  question: string;
  answer: string;
  accepted_answers: string[];
  status: "open" | "closed";
  created_at: Date | string;
};

type SubmissionRow = {
  id: string;
  challenge_id: string;
  player: `0x${string}`;
  answer: string;
  correct: boolean;
  fee: string;
  fee_tx: string | null;
  reward: string | null;
  reward_tx: string | null;
  created_at: Date | string;
};

type DecisionRow = {
  id: string;
  day: number;
  challenge_id: string | null;
  treasury_before: string;
  treasury_after: string;
  participants: number;
  winners: number;
  win_rate: number | null;
  income: string;
  reward_per_winner: string;
  total_paid: string;
  next_difficulty: Difficulty;
  decided_by: string;
  reasoning: string;
  adjustments: string[];
  payouts: { player: string; amount: string; txHash?: string; error?: string }[];
  created_at: Date | string;
};

const iso = (d: Date | string) => new Date(d).toISOString();

function toChallenge(r: ChallengeRow): Challenge {
  return {
    id: r.id,
    day: r.day,
    difficulty: r.difficulty,
    question: r.question,
    answer: r.answer,
    ...(r.accepted_answers.length > 0 && { acceptedAnswers: r.accepted_answers }),
    status: r.status,
    createdAt: iso(r.created_at),
  };
}

function toSubmission(r: SubmissionRow): Submission {
  return {
    id: r.id,
    challengeId: r.challenge_id,
    player: r.player,
    answer: r.answer,
    correct: r.correct,
    fee: BigInt(r.fee),
    ...(r.fee_tx && { feeTx: r.fee_tx }),
    ...(r.reward !== null && { reward: BigInt(r.reward) }),
    ...(r.reward_tx && { rewardTx: r.reward_tx }),
    createdAt: iso(r.created_at),
  };
}

function toDecision(r: DecisionRow): DecisionLog {
  return {
    id: r.id,
    day: r.day,
    challengeId: r.challenge_id,
    treasuryBefore: BigInt(r.treasury_before),
    treasuryAfter: BigInt(r.treasury_after),
    participants: r.participants,
    winners: r.winners,
    winRate: r.win_rate,
    income: BigInt(r.income),
    rewardPerWinner: BigInt(r.reward_per_winner),
    totalPaid: BigInt(r.total_paid),
    nextDifficulty: r.next_difficulty,
    decidedBy: r.decided_by,
    reasoning: r.reasoning,
    adjustments: r.adjustments,
    payouts: r.payouts.map((p) => ({ ...p, amount: BigInt(p.amount) })),
    createdAt: iso(r.created_at),
  };
}

/** Neon Postgres over HTTP — works in Vercel serverless functions. */
export class PostgresGameStore implements GameStore {
  private readonly sql: NeonQueryFunction<false, false>;
  private ready: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  /** Creates the schema on first use; no migration tool needed at this size. */
  private init(): Promise<void> {
    this.ready ??= (async () => {
      await this.sql`
        CREATE TABLE IF NOT EXISTS challenges (
          id               uuid PRIMARY KEY,
          day              integer NOT NULL UNIQUE,
          difficulty       text NOT NULL,
          question         text NOT NULL,
          answer           text NOT NULL,
          accepted_answers jsonb NOT NULL DEFAULT '[]',
          status           text NOT NULL,
          created_at       timestamptz NOT NULL DEFAULT now()
        )`;
      await this.sql`
        CREATE TABLE IF NOT EXISTS submissions (
          id           uuid PRIMARY KEY,
          challenge_id uuid NOT NULL REFERENCES challenges(id),
          player       text NOT NULL,
          answer       text NOT NULL,
          correct      boolean NOT NULL,
          fee          numeric(30,0) NOT NULL DEFAULT 0,
          fee_tx       text,
          reward       numeric(30,0),
          reward_tx    text,
          created_at   timestamptz NOT NULL DEFAULT now()
        )`;
      await this.sql`
        CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_per_wallet
        ON submissions (challenge_id, lower(player))`;
      await this.sql`
        CREATE TABLE IF NOT EXISTS decisions (
          id                uuid PRIMARY KEY,
          day               integer NOT NULL,
          challenge_id      uuid,
          treasury_before   numeric(30,0) NOT NULL,
          treasury_after    numeric(30,0) NOT NULL,
          participants      integer NOT NULL,
          winners           integer NOT NULL,
          win_rate          double precision,
          income            numeric(30,0) NOT NULL,
          reward_per_winner numeric(30,0) NOT NULL,
          total_paid        numeric(30,0) NOT NULL,
          next_difficulty   text NOT NULL,
          decided_by        text NOT NULL,
          reasoning         text NOT NULL,
          adjustments       jsonb NOT NULL DEFAULT '[]',
          payouts           jsonb NOT NULL DEFAULT '[]',
          created_at        timestamptz NOT NULL DEFAULT now()
        )`;
    })();
    return this.ready;
  }

  async createChallenge(input: NewChallenge): Promise<Challenge> {
    await this.init();
    const [, inserted] = await this.sql.transaction([
      this.sql`UPDATE challenges SET status = 'closed' WHERE status = 'open'`,
      this.sql`
        INSERT INTO challenges (id, day, difficulty, question, answer, accepted_answers, status)
        SELECT ${randomUUID()}, COALESCE(MAX(day), 0) + 1, ${input.difficulty}, ${input.question},
               ${input.answer}, ${JSON.stringify(input.acceptedAnswers ?? [])}::jsonb, 'open'
        FROM challenges
        RETURNING *`,
    ]);
    return toChallenge((inserted as ChallengeRow[])[0]!);
  }

  async getCurrentChallenge(): Promise<Challenge | null> {
    await this.init();
    const rows = (await this.sql`
      SELECT * FROM challenges WHERE status = 'open' ORDER BY day DESC LIMIT 1`) as ChallengeRow[];
    return rows[0] ? toChallenge(rows[0]) : null;
  }

  async getChallenge(id: string): Promise<Challenge | null> {
    await this.init();
    const rows = (await this.sql`SELECT * FROM challenges WHERE id = ${id}`) as ChallengeRow[];
    return rows[0] ? toChallenge(rows[0]) : null;
  }

  async listChallenges(limit: number): Promise<Challenge[]> {
    await this.init();
    const rows = (await this.sql`SELECT * FROM challenges ORDER BY day DESC LIMIT ${limit}`) as ChallengeRow[];
    return rows.map(toChallenge);
  }

  async addSubmission(input: NewSubmission): Promise<Submission> {
    await this.init();
    try {
      const rows = (await this.sql`
        INSERT INTO submissions (id, challenge_id, player, answer, correct, fee, fee_tx)
        VALUES (${randomUUID()}, ${input.challengeId}, ${input.player}, ${input.answer}, ${input.correct},
                ${input.fee.toString()}::numeric, ${input.feeTx ?? null})
        RETURNING *`) as SubmissionRow[];
      return toSubmission(rows[0]!);
    } catch (err) {
      if (err instanceof Error && /submissions_one_per_wallet|duplicate key/.test(err.message)) {
        throw new DuplicateSubmissionError();
      }
      throw err;
    }
  }

  async hasSubmitted(challengeId: string, player: string): Promise<boolean> {
    await this.init();
    const rows = await this.sql`
      SELECT 1 FROM submissions WHERE challenge_id = ${challengeId} AND lower(player) = lower(${player}) LIMIT 1`;
    return rows.length > 0;
  }

  async getSubmissions(challengeId: string): Promise<Submission[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT * FROM submissions WHERE challenge_id = ${challengeId} ORDER BY created_at`) as SubmissionRow[];
    return rows.map(toSubmission);
  }

  async recordReward(submissionId: string, amount: bigint, txHash?: string): Promise<void> {
    await this.init();
    await this.sql`
      UPDATE submissions SET reward = ${amount.toString()}::numeric, reward_tx = ${txHash ?? null}
      WHERE id = ${submissionId}`;
  }

  async addDecision(e: NewDecisionLog): Promise<DecisionLog> {
    await this.init();
    const payouts = e.payouts.map((p) => ({ ...p, amount: p.amount.toString() }));
    const rows = (await this.sql`
      INSERT INTO decisions (id, day, challenge_id, treasury_before, treasury_after, participants, winners,
        win_rate, income, reward_per_winner, total_paid, next_difficulty, decided_by, reasoning, adjustments, payouts)
      VALUES (${randomUUID()}, ${e.day}, ${e.challengeId}, ${e.treasuryBefore.toString()}::numeric,
        ${e.treasuryAfter.toString()}::numeric, ${e.participants}, ${e.winners}, ${e.winRate},
        ${e.income.toString()}::numeric, ${e.rewardPerWinner.toString()}::numeric, ${e.totalPaid.toString()}::numeric,
        ${e.nextDifficulty}, ${e.decidedBy}, ${e.reasoning}, ${JSON.stringify(e.adjustments)}::jsonb,
        ${JSON.stringify(payouts)}::jsonb)
      RETURNING *`) as DecisionRow[];
    return toDecision(rows[0]!);
  }

  async listDecisions(limit: number): Promise<DecisionLog[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT * FROM decisions ORDER BY created_at DESC LIMIT ${limit}`) as DecisionRow[];
    return rows.map(toDecision);
  }
}
