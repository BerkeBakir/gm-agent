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
