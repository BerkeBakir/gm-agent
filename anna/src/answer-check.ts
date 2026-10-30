import { isCorrectAnswer } from "../../src/game/answers";
import { commitAnswer } from "../../src/game/commitment-core";
import type { Puzzle } from "./types";

/** Same normalization as the paid game (shared module, not a copy). */
export function isCorrect(puzzle: Puzzle, guess: string): boolean {
  return isCorrectAnswer(guess, puzzle);
}

/** True when a GM puzzle's revealed answer matches the commitment published before it opened. */
export function isVerified(puzzle: Puzzle): boolean {
  if (puzzle.source !== "gm" || !puzzle.commitment || !puzzle.salt) return false;
  return commitAnswer(puzzle.salt, puzzle.answer).toLowerCase() === puzzle.commitment.toLowerCase();
}
