import { randomBytes } from "node:crypto";
import { encodeAbiParameters, type Hex, keccak256, toHex } from "viem";
import { normalizeAnswer } from "./answers";

/**
 * Commit-reveal for the answer key: the commitment is published when a puzzle opens,
 * the salt when it closes, so anyone can check the GM never changed the answer.
 * commitment = keccak256(abi.encode(bytes32 salt, string normalizedAnswer))
 */
export function commitAnswer(salt: Hex, answer: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [salt, normalizeAnswer(answer)]));
}

export function makeCommitment(answer: string): { salt: Hex; commitment: Hex } {
  const salt = toHex(randomBytes(32));
  return { salt, commitment: commitAnswer(salt, answer) };
}

export function verifyCommitment(commitment: Hex, salt: Hex, answer: string): boolean {
  return commitAnswer(salt, answer).toLowerCase() === commitment.toLowerCase();
}
