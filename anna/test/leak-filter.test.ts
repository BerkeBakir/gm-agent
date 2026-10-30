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
});
