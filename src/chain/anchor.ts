import { concat, type Hex, keccak256, size, slice, stringToHex } from "viem";
import type { DecisionLog } from "../game/types";
import type { BaseSepoliaWallet } from "../wallet/base-sepolia";

/** "GMV3": marks GM Agent anchor transactions in calldata. */
export const ANCHOR_PREFIX: Hex = stringToHex("GMV3");
const ZERO32: Hex = `0x${"0".repeat(64)}`;

/** Sorted keys, bigints as strings, undefined dropped: the same log always hashes the same. */
function canonical(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, canonical(o[k])]),
    );
  }
  return v;
}

export function decisionHash(log: DecisionLog): Hex {
  const { id: _id, createdAt: _c, anchorHash: _h, anchorTx: _t, ...rest } = log;
  return keccak256(stringToHex(JSON.stringify(canonical(rest))));
}

/** prefix (4 bytes) ‖ decision hash (32) ‖ next puzzle's answer commitment (32, zero if none). */
export function anchorCalldata(hash: Hex, nextCommitment?: Hex): Hex {
  return concat([ANCHOR_PREFIX, hash, nextCommitment ?? ZERO32]);
}

export function parseAnchorCalldata(data: Hex): { decisionHash: Hex; commitment: Hex } | null {
  if (size(data) !== 68 || slice(data, 0, 4) !== ANCHOR_PREFIX) return null;
  return { decisionHash: slice(data, 4, 36), commitment: slice(data, 36, 68) };
}

/** Sends a 0-ETH transaction from the agent to itself carrying the anchor calldata. */
export function makeAnchorSender(sender: BaseSepoliaWallet): (data: Hex) => Promise<string> {
  return async (data) => {
    const hash = await sender.walletClient.sendTransaction({ to: sender.address, value: 0n, data });
    const receipt = await sender.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Anchor tx reverted: ${hash}`);
    return hash;
  };
}
