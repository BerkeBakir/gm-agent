import { describe, expect, it } from "vitest";
import { leaksAnswer } from "../src/leak-filter";

const p = { answer: "Ice cream", acceptedAnswers: ["icecream"] };

describe("leaksAnswer", () => {
  it("catches the answer in any case or punctuation", () => {
    expect(leaksAnswer("It's ICE-CREAM, obviously!", p)).toBe(true);
    expect(leaksAnswer("maybe icecream?", p)).toBe(true);
  });
  it("matches whole words only", () => {
    expect(leaksAnswer("Think of something nice and creamy", p)).toBe(false);
    expect(leaksAnswer("A slice of ice", { answer: "ice", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("Some device", { answer: "ice", acceptedAnswers: [] })).toBe(false);
  });
  it("catches simple plurals and singulars", () => {
    expect(leaksAnswer("Clocks have hands", { answer: "Clock", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("Boxes are square", { answer: "Box", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("It is one of the stars", { answer: "Stars", acceptedAnswers: [] }) ).toBe(true);
    expect(leaksAnswer("Look at that star", { answer: "Stars", acceptedAnswers: [] })).toBe(true);
  });
  it("catches joined and split forms", () => {
    expect(leaksAnswer("I scream for icecream", { answer: "Ice cream", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("I like ice cream", { answer: "icecream", acceptedAnswers: [] })).toBe(true);
  });
  it("ignores leading articles on answers", () => {
    expect(leaksAnswer("it is a clock", { answer: "A clock", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("the clock ticks", { answer: "the clock", acceptedAnswers: [] })).toBe(true);
    expect(leaksAnswer("another one", { answer: "an other", acceptedAnswers: [] })).toBe(false);
  });
  it("catches an accepted answer even when the main answer is absent", () => {
    expect(leaksAnswer("People call it a deck", { answer: "Cards", acceptedAnswers: ["deck"] })).toBe(true);
  });
  it("does not flag unrelated text", () => {
    expect(leaksAnswer("Think of time passing by", { answer: "Clock", acceptedAnswers: ["a clock"] })).toBe(false);
    expect(leaksAnswer("A cold dessert", p)).toBe(false);
  });
});
