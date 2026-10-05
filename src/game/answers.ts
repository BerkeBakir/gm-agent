/**
 * Deterministic answer checking. The answer key is stored with the challenge,
 * so the agent can never "misremember" its own riddle when grading.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip accents (é → e, İ → I)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ") // punctuation/hyphens → space
    .trim()
    .replace(/\s+/g, " ");
}

export function isCorrectAnswer(
  submission: string,
  challenge: { answer: string; acceptedAnswers?: string[] },
): boolean {
  const given = normalizeAnswer(submission);
  if (!given) return false;
  return [challenge.answer, ...(challenge.acceptedAnswers ?? [])].some((a) => normalizeAnswer(a) === given);
}
