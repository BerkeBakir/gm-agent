import { normalizeAnswer } from "../../src/game/answers";
import type { Puzzle } from "./types";

/** True if the text contains the answer (or an accepted form) as whole words, after normalization. */
export function leaksAnswer(text: string, puzzle: Pick<Puzzle, "answer" | "acceptedAnswers">): boolean {
  const haystack = ` ${normalizeAnswer(text)} `;
  return [puzzle.answer, ...puzzle.acceptedAnswers]
    .map(normalizeAnswer)
    .filter(Boolean)
    .some((a) => haystack.includes(` ${a} `));
}
