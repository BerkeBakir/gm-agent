import { randomBytes } from "node:crypto";
import { type Hex, toHex } from "viem";
import { commitAnswer } from "./commitment-core";

export { commitAnswer, verifyCommitment } from "./commitment-core";

/**
 * Commit-reveal for the answer key: the commitment is published when a puzzle opens,
 * the salt when it closes, so anyone can check the GM never changed the answer.
 */
export function makeCommitment(answer: string): { salt: Hex; commitment: Hex } {
  const salt = toHex(randomBytes(32));
  return { salt, commitment: commitAnswer(salt, answer) };
}
