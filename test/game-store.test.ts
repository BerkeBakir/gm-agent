import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "../src/game/store";
import { toPublicChallenge, validateNewChallenge } from "../src/game/types";

const input = { difficulty: "easy" as const, question: "What has to be broken before you can use it?", answer: "An egg" };

describe("MemoryGameStore", () => {
  it("has no current challenge initially", async () => {
    expect(await new MemoryGameStore().getCurrentChallenge()).toBeNull();
  });

  it("creates day 1 as the open current challenge", async () => {
    const store = new MemoryGameStore();
    const c = await store.createChallenge(input);
    expect(c.day).toBe(1);
    expect(c.status).toBe("open");
    expect(c.answer).toBe("An egg");
    expect(await store.getCurrentChallenge()).toEqual(c);
  });

  it("a new challenge closes the previous one and advances the day", async () => {
    const store = new MemoryGameStore();
    const first = await store.createChallenge(input);
    const second = await store.createChallenge({ ...input, question: "Second riddle?" });
    expect(second.day).toBe(2);
    expect((await store.getChallenge(first.id))?.status).toBe("closed");
    expect((await store.getCurrentChallenge())?.id).toBe(second.id);
  });
});

describe("validateNewChallenge", () => {
  it("accepts a valid challenge and trims fields", () => {
    expect(validateNewChallenge({ ...input, question: "  Q?  ", acceptedAnswers: [" egg ", ""] })).toEqual({
      difficulty: "easy",
      question: "Q?",
      answer: "An egg",
      acceptedAnswers: ["egg"],
    });
  });

  it("rejects unknown difficulty, empty question or empty answer", () => {
    expect(() => validateNewChallenge({ ...input, difficulty: "insane" })).toThrow(/difficulty/);
    expect(() => validateNewChallenge({ ...input, question: " " })).toThrow(/question/);
    expect(() => validateNewChallenge({ ...input, answer: "" })).toThrow(/answer/);
  });
});

describe("toPublicChallenge", () => {
  it("never exposes the answer key", async () => {
    const c = await new MemoryGameStore().createChallenge({ ...input, acceptedAnswers: ["egg"] });
    const pub = toPublicChallenge(c);
    expect(pub).not.toHaveProperty("answer");
    expect(pub).not.toHaveProperty("acceptedAnswers");
    expect(JSON.stringify(pub)).not.toContain("egg");
  });
});
