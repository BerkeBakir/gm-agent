import { normalizeAnswer } from "../game/answers";
import type { NewChallenge } from "../game/types";

/** How many of the latest puzzles a new one must differ from (question AND answer). */
export const REPEAT_WINDOW = 30;

export type RecentPuzzle = Pick<NewChallenge, "question" | "answer" | "acceptedAnswers"> & { day?: number };

export interface Repeat {
  /** Position in `recent` (0 = newest). */
  index: number;
  reason: string;
}

const answerKey = (s: string) => normalizeAnswer(s).replace(/^(a|an|the) /, "");

function answerKeys(p: Pick<NewChallenge, "answer" | "acceptedAnswers">): Set<string> {
  return new Set([p.answer, ...(p.acceptedAnswers ?? [])].map(answerKey).filter(Boolean));
}

/**
 * Returns the newest puzzle in `recent` (newest first) that `candidate` repeats: same question
 * (ignoring case/punctuation) or an overlapping answer ("the dark" ~ "darkness"'s "dark"). Null if fresh.
 */
export function findRepeat(candidate: Pick<NewChallenge, "question" | "answer" | "acceptedAnswers">, recent: RecentPuzzle[]): Repeat | null {
  const question = normalizeAnswer(candidate.question);
  const answers = answerKeys(candidate);
  for (const [index, r] of recent.entries()) {
    const where = r.day !== undefined ? `day ${r.day}` : "a recent puzzle";
    if (normalizeAnswer(r.question) === question) return { index, reason: `repeats the question of ${where}` };
    const shared = [...answerKeys(r)].find((a) => answers.has(a));
    if (shared) return { index, reason: `repeats the answer "${shared}" of ${where}` };
  }
  return null;
}
