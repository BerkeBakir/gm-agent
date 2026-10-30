import { normalizeAnswer } from "../../src/game/answers";
import type { Puzzle } from "./types";

const stripArticle = (a: string) => a.replace(/^(a|an|the) /, "");

/** Whole-word forms of an answer: itself, simple plural, and singular. */
function wordForms(a: string): string[] {
  const forms = [a, `${a}s`, `${a}es`];
  if (a.endsWith("s") && a.length > 3) forms.push(a.slice(0, -1));
  return forms;
}

/**
 * True if the text contains the answer (or an accepted form) after normalization:
 * as whole words (also simple plurals, ignoring a leading a/an/the), or joined/split
 * ("icecream" vs "Ice cream"). The space-stripped check only applies to multi-word
 * answers or answers of 6+ letters, so short words don't match inside other words.
 */
export function leaksAnswer(text: string, puzzle: Pick<Puzzle, "answer" | "acceptedAnswers">): boolean {
  const norm = normalizeAnswer(text);
  const haystack = ` ${norm} `;
  const squashed = norm.replace(/ /g, "");
  return [puzzle.answer, ...puzzle.acceptedAnswers]
    .map((a) => stripArticle(normalizeAnswer(a)))
    .filter(Boolean)
    .some((a) => {
      if (wordForms(a).some((f) => haystack.includes(` ${f} `))) return true;
      const joined = a.replace(/ /g, "");
      return joined.length >= 3 && (a.includes(" ") || joined.length >= 6) && squashed.includes(joined);
    });
}
