import { encodeAbiParameters, type Hex, keccak256 } from "viem";
import { normalizeAnswer } from "./answers";

/**
 * Browser-safe half of the answer commitment (no node:crypto), shared with the Anna app.
 * commitment = keccak256(abi.encode(bytes32 salt, string normalizedAnswer))
 */
export function commitAnswer(salt: Hex, answer: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [salt, normalizeAnswer(answer)]));
}

export function verifyCommitment(commitment: Hex, salt: Hex, answer: string): boolean {
  return commitAnswer(salt, answer).toLowerCase() === commitment.toLowerCase();
}
