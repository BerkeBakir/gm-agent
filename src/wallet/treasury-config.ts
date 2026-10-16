import fs from "node:fs";
import path from "node:path";
import type { Delegation } from "@metamask/smart-accounts-kit";
import type { Address } from "./types";

/**
 * Public description of the delegated treasury, written by `npm run treasury:setup`
 * and committed to the repo. Safe to publish: only the agent key can redeem the delegation.
 */
export interface TreasuryConfig {
  chainId: number;
  /** MetaMask smart account that holds the USDC. */
  smartAccount: Address;
  /** Owner key of the smart account (kept off the server). */
  owner: Address;
  /** Agent EOA allowed to spend through the delegation. */
  agent: Address;
  token: Address;
  /** On-chain cap per period, USDC base units. */
  dailyLimit: bigint;
  periodDuration: number;
  startDate: number;
  delegation: Delegation;
}

export const DEFAULT_TREASURY_CONFIG = "treasury/delegation.json";

const PERIOD_START_UTC_HOUR = 11;
const PERIOD_START_UTC_MINUTE = 30;

/**
 * Start of the delegation period: the most recent 11:30 UTC at or before `now` (unix seconds).
 * The cron closes the day at 12:00 UTC, so the payout is the first spend of a fresh period.
 */
export function periodStart(now: Date): number {
  let ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), PERIOD_START_UTC_HOUR, PERIOD_START_UTC_MINUTE);
  if (ms > now.getTime()) ms -= 86_400_000;
  return Math.floor(ms / 1000);
}

export function serializeTreasuryConfig(c: TreasuryConfig): string {
  return `${JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`;
}

export function parseTreasuryConfig(json: string): TreasuryConfig {
  const raw = JSON.parse(json) as Record<string, unknown> & { delegation?: { signature?: string } };
  for (const k of ["chainId", "smartAccount", "owner", "agent", "token", "dailyLimit", "periodDuration", "startDate", "delegation"]) {
    if (raw[k] === undefined || raw[k] === null) throw new Error(`Treasury config: missing "${k}"`);
  }
  if (!raw.delegation?.signature || raw.delegation.signature === "0x") throw new Error("Treasury config: delegation is not signed");
  if (raw.chainId !== 84532) throw new Error(`Treasury config: chainId must be 84532 (Base Sepolia), got ${String(raw.chainId)}`);
  return { ...(raw as unknown as TreasuryConfig), dailyLimit: BigInt(raw.dailyLimit as string) };
}

/**
 * Reads the config; null if there is none. An explicit `file` wins, then TREASURY_CONFIG, then
 * treasury/delegation.json (built from literals so the bundler doesn't trace the whole project).
 */
export function loadTreasuryConfig(file?: string): TreasuryConfig | null {
  const full = file
    ? path.resolve(file)
    : process.env.TREASURY_CONFIG
      ? path.resolve(process.env.TREASURY_CONFIG)
      : path.join(process.cwd(), "treasury", "delegation.json");
  if (!fs.existsSync(full)) return null;
  return parseTreasuryConfig(fs.readFileSync(full, "utf8"));
}
