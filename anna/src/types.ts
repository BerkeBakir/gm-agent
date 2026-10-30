/** A playable riddle. GM puzzles come from /api/anna/archive; "anna"/"bank" are fallbacks. */
export interface Puzzle {
  /** Stable id used for progress: "gm-<day>", "anna-<YYYY-MM-DD>" or "bank-<YYYY-MM-DD>". */
  key: string;
  source: "gm" | "anna" | "bank";
  question: string;
  answer: string;
  acceptedAnswers: string[];
  difficulty?: string;
  day?: number;
  commitment?: `0x${string}` | null;
  salt?: `0x${string}` | null;
}

/** One stateless LLM call: returns the reply text or throws. */
export type Complete = (req: { system: string; user: string; maxTokens?: number; temperature?: number }) => Promise<string>;

/** Minimal per-user key-value store (Anna storage.*). get() returns undefined when missing. */
export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
