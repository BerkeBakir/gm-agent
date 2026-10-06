/**
 * x402 "exact" payment scheme on Base Sepolia, settled on-chain.
 *
 * Follows the x402 v1 wire format (https://x402.org): the server answers 402 with
 * PaymentRequirements; the client signs an EIP-3009 `TransferWithAuthorization`
 * for USDC and retries with an `X-PAYMENT` header (base64 JSON). Unlike the
 * starter kit's demo, the server then SETTLES it: the agent submits
 * `transferWithAuthorization` to the USDC contract, so the entry fee really moves
 * into the treasury. The player needs no ETH; the agent pays the gas.
 */
import { bytesToHex, getAddress, type Hex, parseAbi, parseSignature, verifyTypedData } from "viem";
import { BASE_SEPOLIA_USDC, createBaseSepoliaClient } from "../chain/base-sepolia";
import type { BaseSepoliaWallet } from "../wallet/base-sepolia";
import type { Address } from "../wallet/types";

export const X402_VERSION = 1;
export const NETWORK = "base-sepolia";
const CHAIN_ID = 84532;
const USDC_DOMAIN = { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: BASE_SEPOLIA_USDC } as const;

const AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface PaymentRequirements {
  scheme: "exact";
  network: typeof NETWORK;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra: { name: string; version: string };
}

export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: { signature: Hex; authorization: Authorization };
}

/** Anything that can sign EIP-712 typed data: a viem LocalAccount, or a wrapped browser wallet. */
export interface TypedDataSigner {
  address: Address;
  signTypedData(args: {
    domain: typeof USDC_DOMAIN;
    types: typeof AUTH_TYPES;
    primaryType: "TransferWithAuthorization";
    message: AuthMessage;
  }): Promise<Hex>;
}

type AuthMessage = { from: Address; to: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex };

export function buildPaymentRequirements(opts: {
  payTo: Address;
  amount: bigint;
  resource: string;
  description: string;
  maxTimeoutSeconds?: number;
}): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: opts.amount.toString(),
    resource: opts.resource,
    description: opts.description,
    mimeType: "application/json",
    payTo: getAddress(opts.payTo),
    maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 300,
    asset: BASE_SEPOLIA_USDC,
    extra: { name: USDC_DOMAIN.name, version: USDC_DOMAIN.version },
  };
}

/** Client side: sign the EIP-3009 authorization and encode the X-PAYMENT header. */
export async function createPaymentHeader(
  signer: TypedDataSigner,
  reqs: PaymentRequirements,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const authorization: Authorization = {
    from: getAddress(signer.address),
    to: getAddress(reqs.payTo),
    value: reqs.maxAmountRequired,
    validAfter: String(now - 60),
    validBefore: String(now + reqs.maxTimeoutSeconds),
    nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const signature = await signer.signTypedData({
    domain: USDC_DOMAIN,
    types: AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: toMessage(authorization),
  });
  const payload: PaymentPayload = { x402Version: X402_VERSION, scheme: "exact", network: NETWORK, payload: { signature, authorization } };
  return encodeBase64(JSON.stringify(payload));
}

export function decodePaymentHeader(header: string): PaymentPayload {
  const payload = JSON.parse(decodeBase64(header)) as PaymentPayload;
  if (!payload?.payload?.authorization || !payload.payload.signature) throw new Error("Malformed X-PAYMENT header");
  return payload;
}

export type VerifyResult = { valid: true; payer: Address } | { valid: false; reason: string };

/** Server side: check the signed authorization against what we asked for. */
export async function verifyPayment(
  p: PaymentPayload,
  reqs: PaymentRequirements,
  opts: { now?: number; isNonceUsed?: (from: Address, nonce: Hex) => Promise<boolean> } = {},
): Promise<VerifyResult> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const a = p.payload.authorization;
  if (p.x402Version !== X402_VERSION || p.scheme !== "exact" || p.network !== NETWORK) {
    return { valid: false, reason: "unsupported scheme or network" };
  }
  if (getAddress(a.to) !== getAddress(reqs.payTo)) return { valid: false, reason: "wrong payment recipient" };
  if (BigInt(a.value) < BigInt(reqs.maxAmountRequired)) return { valid: false, reason: "amount too low" };
  if (BigInt(a.validAfter) > BigInt(now)) return { valid: false, reason: "authorization not yet valid" };
  if (BigInt(a.validBefore) <= BigInt(now)) return { valid: false, reason: "authorization expired" };

  const ok = await verifyTypedData({
    address: a.from,
    domain: USDC_DOMAIN,
    types: AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: toMessage(a),
    signature: p.payload.signature,
  }).catch(() => false);
  if (!ok) return { valid: false, reason: "invalid signature" };

  if (opts.isNonceUsed && (await opts.isNonceUsed(a.from, a.nonce))) {
    return { valid: false, reason: "nonce already used" };
  }
  return { valid: true, payer: getAddress(a.from) };
}

const USDC_3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

/** On-chain check used in production verification. */
export async function isNonceUsedOnChain(from: Address, nonce: Hex): Promise<boolean> {
  return createBaseSepoliaClient().readContract({
    address: BASE_SEPOLIA_USDC,
    abi: USDC_3009_ABI,
    functionName: "authorizationState",
    args: [from, nonce],
  });
}

export async function payerBalance(from: Address): Promise<bigint> {
  return createBaseSepoliaClient().readContract({ address: BASE_SEPOLIA_USDC, abi: USDC_3009_ABI, functionName: "balanceOf", args: [from] });
}

/** Server side: submit the authorization on-chain. The agent's wallet pays the gas. */
export async function settlePayment(p: PaymentPayload, wallet: BaseSepoliaWallet): Promise<Hex> {
  const a = p.payload.authorization;
  const sig = parseSignature(p.payload.signature);
  const v = sig.v !== undefined ? Number(sig.v) : sig.yParity + 27;
  const hash = await wallet.walletClient.writeContract({
    address: BASE_SEPOLIA_USDC,
    abi: USDC_3009_ABI,
    functionName: "transferWithAuthorization",
    args: [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, v, sig.r, sig.s],
  });
  const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`x402 settlement reverted: ${hash}`);
  return hash;
}

function toMessage(a: Authorization): AuthMessage {
  return {
    from: a.from,
    to: a.to,
    value: BigInt(a.value),
    validAfter: BigInt(a.validAfter),
    validBefore: BigInt(a.validBefore),
    nonce: a.nonce,
  };
}

function encodeBase64(s: string) {
  return typeof Buffer !== "undefined" ? Buffer.from(s).toString("base64") : btoa(unescape(encodeURIComponent(s)));
}

function decodeBase64(s: string) {
  return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString() : decodeURIComponent(escape(atob(s)));
}
