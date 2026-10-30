import { describe, expect, it, vi } from "vitest";
import { GENERIC_HINTS, GENERIC_WHY_WRONG, getHint, GmBusyError, whyWrong } from "../src/hints";
import type { Complete, Puzzle } from "../src/types";

const puzzle: Puzzle = {
  key: "gm-7",
  source: "gm",
  question: "What has hands but can't clap?",
  answer: "Clock",
  acceptedAnswers: ["a clock"],
};

describe("getHint", () => {
  it("asks for the next hint level with the answer and previous hints, returns one line", async () => {
    const complete = vi.fn<Complete>(async () => "\"It ticks all day.\"\nExtra line");
    const hint = await getHint(complete, puzzle, ["It lives on a wall."]);
    expect(hint).toBe("It ticks all day.");
    const req = complete.mock.calls[0][0];
    expect(req.user).toContain("Hint number: 2 of 3");
    expect(req.user).toContain("Clock");
    expect(req.user).toContain("It lives on a wall.");
    expect(req.system).toMatch(/never/i);
  });
  it("replaces a leaking hint with the generic hint for that level", async () => {
    const hint = await getHint(async () => "It's a CLOCK!", puzzle, []);
    expect(hint).toBe(GENERIC_HINTS[0]);
  });
  it("throws GmBusyError when the LLM fails", async () => {
    await expect(
      getHint(async () => {
        throw new Error("quota");
      }, puzzle, []),
    ).rejects.toBeInstanceOf(GmBusyError);
  });
});

describe("whyWrong", () => {
  it("comments on the guess without leaking", async () => {
    const complete = vi.fn<Complete>(async () => "A glove has hands of a sort, but it never keeps time.");
    expect(await whyWrong(complete, puzzle, "glove")).toBe("A glove has hands of a sort, but it never keeps time.");
    expect(complete.mock.calls[0][0].user).toContain("glove");
  });
  it("falls back to a generic comment if the answer leaks", async () => {
    expect(await whyWrong(async () => "Wrong, the answer is a clock.", puzzle, "glove")).toBe(GENERIC_WHY_WRONG);
  });
  it("throws GmBusyError when the LLM fails", async () => {
    await expect(
      whyWrong(async () => {
        throw new Error("down");
      }, puzzle, "glove"),
    ).rejects.toBeInstanceOf(GmBusyError);
  });
});
