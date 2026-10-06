/**
 * Wires the game together from environment variables. Used by API routes and agent tools.
 */
import { getAgentPrivateKey } from "../../agent/wallet";
import { getGameStore } from "../game";
import { StaticChallengeAuthor } from "../gm/authors";
import { GeminiChallengeAuthor, GeminiDecisionMaker, type Persona, PERSONAS } from "../gm/gemini";
import type { RunDayDeps } from "../gm/run-day";
import { RuleBasedDecisionMaker } from "../gm/strategies";
import { BaseSepoliaWallet } from "../wallet/base-sepolia";
import type { SpendingLimits } from "../wallet/spending-guard";
import { parseUsdc } from "../wallet/usdc";

export function getAgentWallet(): BaseSepoliaWallet {
  const key = getAgentPrivateKey();
  if (!key) throw new Error("The agent has no wallet yet (set WALLET_PRIVATE_KEY or click Create wallet).");
  return new BaseSepoliaWallet(key);
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
  };
}

/** JSON.stringify replacer: bigint → string (all amounts are USDC base units). */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
