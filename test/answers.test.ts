import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer } from "../src/game/answers";

describe("normalizeAnswer", () => {
  it("ignores case, accents, punctuation and extra whitespace", () => {
    expect(normalizeAnswer("  The   Moon! ")).toBe("the moon");
    expect(normalizeAnswer("Café")).toBe("cafe");
    expect(normalizeAnswer("İstanbul")).toBe("istanbul");
    expect(normalizeAnswer("rock-n-roll")).toBe("rock n roll");
  });

  it("keeps digits", () => {
    expect(normalizeAnswer("42.")).toBe("42");
  });
});

describe("isCorrectAnswer", () => {
  const challenge = { answer: "Echo", acceptedAnswers: ["an echo"] };

  it("matches the answer key after normalization", () => {
    expect(isCorrectAnswer("echo", challenge)).toBe(true);
    expect(isCorrectAnswer(" ECHO!! ", challenge)).toBe(true);
  });

  it("matches accepted alternatives", () => {
    expect(isCorrectAnswer("An echo.", challenge)).toBe(true);
  });

  it("rejects wrong or empty answers", () => {
    expect(isCorrectAnswer("shadow", challenge)).toBe(false);
    expect(isCorrectAnswer("   ", challenge)).toBe(false);
  });
});
