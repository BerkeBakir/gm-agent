import { describe, expect, it } from "vitest";
import { commitAnswer } from "../../src/game/commitment-core";
import { isCorrect, isVerified } from "../src/answer-check";
import type { Puzzle } from "../src/types";

const SALT = `0x${"11".repeat(32)}` as const;

function gm(over: Partial<Puzzle> = {}): Puzzle {
  return {
    key: "gm-18",
    source: "gm",
    question: "I have cities but no houses. What am I?",
    answer: "Map",
    acceptedAnswers: ["a map"],
    day: 18,
    commitment: commitAnswer(SALT, "Map"),
    salt: SALT,
    ...over,
  };
}

describe("isCorrect (shared normalizer)", () => {
  it("ignores case, accents and punctuation", () => {
    expect(isCorrect(gm(), "  MAP!! ")).toBe(true);
    expect(isCorrect(gm({ answer: "Café" }), "cafe")).toBe(true);
  });
  it("accepts listed alternatives", () => {
    expect(isCorrect(gm(), "A map")).toBe(true);
  });
  it("rejects wrong and empty guesses", () => {
    expect(isCorrect(gm(), "globe")).toBe(false);
    expect(isCorrect(gm(), "   ")).toBe(false);
  });
});

describe("isVerified (commit-reveal)", () => {
  it("is true when keccak(salt, normalized answer) matches the commitment", () => {
    expect(isVerified(gm())).toBe(true);
  });
  it("is false when the answer was changed after committing", () => {
    expect(isVerified(gm({ answer: "Globe" }))).toBe(false);
  });
  it("is false for non-GM puzzles or missing salt", () => {
    expect(isVerified(gm({ source: "anna" }))).toBe(false);
    expect(isVerified(gm({ salt: null }))).toBe(false);
  });
});
