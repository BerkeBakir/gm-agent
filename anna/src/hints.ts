import { leaksAnswer } from "./leak-filter";
import { MAX_HINTS } from "./progress";
import type { Complete, Puzzle } from "./types";

export const GENERIC_HINTS = [
  "Read every line again: they all describe the same everyday thing.",
  "Take the strangest line literally; that's where the trick is.",
  "It's something you have probably seen or used today.",
] as const;

export const GENERIC_WHY_WRONG = "Close, but that doesn't fit every line of the riddle. Try another angle.";

export class GmBusyError extends Error {
  constructor() {
    super("The GM is busy, try again later.");
  }
}

const HINT_SYSTEM =
  "You are GM, the witty game master of a daily riddle game. Give exactly one short hint sentence. " +
  "Hints get more specific as the hint number grows. Never write the answer, any accepted form of it, " +
  "or an obvious synonym. Reply with the hint only.";

const WHY_WRONG_SYSTEM =
  "You are GM, the witty game master of a daily riddle game. A player guessed wrong. In one or two short " +
  "sentences, explain which part of the riddle their guess does not fit. Never write the answer, any accepted " +
  "form of it, or an obvious synonym. Reply with the explanation only.";

function oneLine(text: string, maxLen = 240): string {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, maxLen).trim();
}

export async function getHint(complete: Complete, puzzle: Puzzle, previous: string[]): Promise<string> {
  const n = Math.min(previous.length + 1, MAX_HINTS);
  let text: string;
  try {
    text = await complete({
      system: HINT_SYSTEM,
      user: [
        `Riddle: ${puzzle.question}`,
        `Secret answer (do not reveal): ${puzzle.answer}`,
        `Hint number: ${n} of ${MAX_HINTS}`,
        previous.length ? `Hints already given:\n- ${previous.join("\n- ")}` : "No hints given yet.",
      ].join("\n"),
      maxTokens: 120,
    });
  } catch {
    throw new GmBusyError();
  }
  const hint = oneLine(text);
  return !hint || leaksAnswer(hint, puzzle) ? GENERIC_HINTS[n - 1] : hint;
}

export async function whyWrong(complete: Complete, puzzle: Puzzle, guess: string): Promise<string> {
  let text: string;
  try {
    text = await complete({
      system: WHY_WRONG_SYSTEM,
      user: [`Riddle: ${puzzle.question}`, `Secret answer (do not reveal): ${puzzle.answer}`, `Player's guess: ${guess}`].join(
        "\n",
      ),
      maxTokens: 160,
    });
  } catch {
    throw new GmBusyError();
  }
  const comment = text.trim().slice(0, 400);
  return !comment || leaksAnswer(comment, puzzle) ? GENERIC_WHY_WRONG : comment;
}
