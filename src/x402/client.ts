/**
 * x402 client: answer today's puzzle and pay the entry fee in one call.
 * Used by the demo bot script and by the MCP server that lets other AI agents play.
 *
 *   POST /api/submit            → 402 + PaymentRequirements
 *   sign EIP-3009 authorization → POST /api/submit with X-PAYMENT → settled on-chain
 *
 * Before signing it checks what it is asked to pay: only USDC on Base Sepolia (testnet),
 * and never more than `maxFee`. A server can't talk the client into paying more.
 */
import { getAddress } from "viem";
import { BASE_SEPOLIA_USDC } from "../chain/base-sepolia";
import { createPaymentHeader, NETWORK, type PaymentRequirements, type TypedDataSigner } from "./exact";

export interface SubmitOutcome {
  ok: boolean;
  /** HTTP status of the final request. */
  status: number;
  /** Fee settlement transaction (only when ok). */
  feeTx?: string;
  /** Amount paid in USDC base units (only when ok). */
  paid?: bigint;
  /** Human-readable reason when not ok. */
  error?: string;
  body: unknown;
}

export interface PayAndSubmitOptions {
  /** Refuse to sign for more than this (USDC base units). */
  maxFee: bigint;
  fetch?: typeof fetch;
}

export async function payAndSubmit(
  baseUrl: string,
  signer: TypedDataSigner,
  answer: string,
  opts: PayAndSubmitOptions,
): Promise<SubmitOutcome> {
  const doFetch = opts.fetch ?? fetch;
  const url = new URL("/api/submit", baseUrl).toString();
  const post = (headers: Record<string, string> = {}) =>
    doFetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ answer }) });

  const first = await post();
  const firstBody = await readJson(first);
  if (first.status !== 402) {
    return { ok: false, status: first.status, error: errorText(firstBody) ?? `expected 402 Payment Required, got ${first.status}`, body: firstBody };
  }

  const reqs = (firstBody as { accepts?: PaymentRequirements[] })?.accepts?.[0];
  const problem = checkRequirements(reqs, opts.maxFee);
  if (problem) return { ok: false, status: 402, error: problem, body: firstBody };

  const header = await createPaymentHeader(signer, reqs!);
  const paid = await post({ "X-PAYMENT": header });
  const body = await readJson(paid);
  if (!paid.ok) return { ok: false, status: paid.status, error: errorText(body) ?? `submit failed with ${paid.status}`, body };
  return { ok: true, status: paid.status, feeTx: (body as { feeTx?: string }).feeTx, paid: BigInt(reqs!.maxAmountRequired), body };
}

/** Returns why the client refuses to pay, or null if the requirements are acceptable. */
export function checkRequirements(reqs: PaymentRequirements | undefined, maxFee: bigint): string | null {
  if (!reqs) return "server did not send x402 payment requirements";
  if (reqs.scheme !== "exact" || reqs.network !== NETWORK) return `refusing to pay: unsupported scheme/network ${reqs.scheme}/${reqs.network} (testnet only)`;
  if (getAddress(reqs.asset) !== getAddress(BASE_SEPOLIA_USDC)) return `refusing to pay: asset ${reqs.asset} is not Base Sepolia USDC`;
  const amount = BigInt(reqs.maxAmountRequired);
  if (amount > maxFee) return `refusing to pay: fee ${Number(amount) / 1e6} USDC is above the limit of ${Number(maxFee) / 1e6} USDC`;
  return null;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorText(body: unknown): string | undefined {
  return typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : undefined;
}
