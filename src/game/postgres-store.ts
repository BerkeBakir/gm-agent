import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { GameStore } from "./store";
import type { Challenge, Difficulty, NewChallenge } from "./types";

type Row = {
  id: string;
  day: number;
  difficulty: Difficulty;
  question: string;
  answer: string;
  accepted_answers: string[];
  status: "open" | "closed";
  created_at: Date | string;
};

function toChallenge(r: Row): Challenge {
  return {
    id: r.id,
    day: r.day,
    difficulty: r.difficulty,
    question: r.question,
    answer: r.answer,
    ...(r.accepted_answers.length > 0 && { acceptedAnswers: r.accepted_answers }),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
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
    this.ready ??= this.sql`
      CREATE TABLE IF NOT EXISTS challenges (
        id               uuid PRIMARY KEY,
        day              integer NOT NULL UNIQUE,
        difficulty       text NOT NULL,
        question         text NOT NULL,
        answer           text NOT NULL,
        accepted_answers jsonb NOT NULL DEFAULT '[]',
        status           text NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now()
      )`.then(() => undefined);
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
    return toChallenge((inserted as Row[])[0]!);
  }

  async getCurrentChallenge(): Promise<Challenge | null> {
    await this.init();
    const rows = (await this.sql`
      SELECT * FROM challenges WHERE status = 'open' ORDER BY day DESC LIMIT 1`) as Row[];
    return rows[0] ? toChallenge(rows[0]) : null;
  }

  async getChallenge(id: string): Promise<Challenge | null> {
    await this.init();
    const rows = (await this.sql`SELECT * FROM challenges WHERE id = ${id}`) as Row[];
    return rows[0] ? toChallenge(rows[0]) : null;
  }
}
