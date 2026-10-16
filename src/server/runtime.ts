/**
 * Wires the game together from environment variables. Used by API routes and agent tools.
 */
import { getAgentPrivateKey } from "../../agent/wallet";
import { makeAnchorSender } from "../chain/anchor";
import { getGameStore } from "../game";
import { StaticChallengeAuthor } from "../gm/authors";
import { GeminiChallengeAuthor, GeminiDecisionMaker, type Persona, PERSONAS } from "../gm/gemini";
import type { RunDayDeps } from "../gm/run-day";
import { RuleBasedDecisionMaker } from "../gm/strategies";
import { BaseSepoliaWallet } from "../wallet/base-sepolia";
import { DelegatedWallet } from "../wallet/delegated";
import type { SpendingLimits } from "../wallet/spending-guard";
import { loadTreasuryConfig } from "../wallet/treasury-config";
import { parseUsdc } from "../wallet/usdc";

/** The agent's EOA: signs and pays gas for every tx (payouts, x402 settlement, anchors). */
export function getTxSender(): BaseSepoliaWallet {
  const key = getAgentPrivateKey();
  if (!key) throw new Error("The agent has no wallet yet (set WALLET_PRIVATE_KEY or click Create wallet).");
  return new BaseSepoliaWallet(key);
}

/**
 * The treasury. With treasury/delegation.json present it is the MetaMask smart account,
 * spendable only through the owner's delegation; otherwise (or TREASURY_MODE=eoa) the agent EOA.
 */
export function getAgentWallet(): BaseSepoliaWallet | DelegatedWallet {
  const sender = getTxSender();
  const mode = process.env.TREASURY_MODE;
  if (mode === "eoa") return sender;
  const config = loadTreasuryConfig();
  if (!config) {
    if (mode === "delegated") throw new Error("TREASURY_MODE=delegated but treasury/delegation.json is missing (run npm run treasury:setup).");
    return sender;
  }
  return new DelegatedWallet(config, sender);
}

export function getTreasuryMode(wallet: BaseSepoliaWallet | DelegatedWallet): "delegated" | "eoa" {
  return wallet instanceof DelegatedWallet ? "delegated" : "eoa";
}

export function getLimits(): SpendingLimits {
  const fraction = Number(process.env.MAX_DAILY_TREASURY_FRACTION ?? "0.10");
  return {
    maxPerTx: parseUsdc(process.env.MAX_REWARD_PER_TX || "2.00"),
    maxDailyFractionBps: Math.round((Number.isFinite(fraction) ? fraction : 0.1) * 10_000),
  };
}

export function getEntryFee(): bigint {
  return parseUsdc(process.env.ENTRY_FEE_USDC || "0.10");
}

export function getPersona(): Persona {
  const p = process.env.GM_PERSONA as Persona | undefined;
  return p && p in PERSONAS ? p : "balanced";
}

export function getRunDayDeps(): RunDayDeps {
  const hasLlm = Boolean(process.env.GEMINI_API_KEY);
  return {
    store: getGameStore(),
    wallet: getAgentWallet(),
    decider: hasLlm ? new GeminiDecisionMaker(getPersona()) : new RuleBasedDecisionMaker("adaptive"),
    author: hasLlm ? new GeminiChallengeAuthor() : new StaticChallengeAuthor(),
    limits: getLimits(),
    entryFee: getEntryFee(),
    anchor: process.env.ANCHOR_DECISIONS === "off" ? undefined : makeAnchorSender(getTxSender()),
  };
}

/** JSON.stringify replacer: bigint → string (all amounts are USDC base units). */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
