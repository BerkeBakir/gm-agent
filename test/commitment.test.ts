import { describe, expect, it } from "vitest";
import { commitAnswer, makeCommitment, verifyCommitment } from "../src/game/commitment";

describe("answer commitments", () => {
  it("verifies the committed answer, normalized", () => {
    const { salt, commitment } = makeCommitment("An Egg!");
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifyCommitment(commitment, salt, "an egg")).toBe(true);
  });

  it("rejects a different answer or salt", () => {
    const { salt, commitment } = makeCommitment("egg");
    expect(verifyCommitment(commitment, salt, "chicken")).toBe(false);
    const other = makeCommitment("egg");
    expect(verifyCommitment(commitment, other.salt, "egg")).toBe(false);
  });

  it("is deterministic for a given salt", () => {
    const salt = `0x${"11".repeat(32)}` as const;
    expect(commitAnswer(salt, "Glove")).toBe(commitAnswer(salt, "  glove "));
  });
});
