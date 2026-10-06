import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  buildPaymentRequirements,
  createPaymentHeader,
  decodePaymentHeader,
  verifyPayment,
} from "../src/x402/exact";

const PAY_TO = "0x5cb007cB053ce248529D84651ce53750666A799D";
const player = privateKeyToAccount(generatePrivateKey());
const reqs = buildPaymentRequirements({
  payTo: PAY_TO,
  amount: 100_000n,
  resource: "https://example.com/api/submit",
  description: "Entry fee",
});
const NOW = 1_800_000_000;

describe("x402 exact scheme (EIP-3009 USDC)", () => {
  it("builds spec-shaped payment requirements", () => {
    expect(reqs).toMatchObject({
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "100000",
      payTo: PAY_TO,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      extra: { name: "USDC", version: "2" },
    });
  });

  it("round-trips a signed payment header and verifies it", async () => {
    const header = await createPaymentHeader(player, reqs, NOW);
    const payload = decodePaymentHeader(header);
    expect(payload.x402Version).toBe(1);
    expect(payload.payload.authorization.from).toBe(player.address);
    const result = await verifyPayment(payload, reqs, { now: NOW });
    expect(result).toEqual({ valid: true, payer: player.address });
  });

  it("rejects a tampered amount", async () => {
    const payload = decodePaymentHeader(await createPaymentHeader(player, reqs, NOW));
    payload.payload.authorization.value = "1";
    const result = await verifyPayment(payload, reqs, { now: NOW });
    expect(result.valid).toBe(false);
  });

  it("rejects a payment to someone else", async () => {
    const other = buildPaymentRequirements({ ...reqs, payTo: "0x000000000000000000000000000000000000dEaD", amount: 100_000n, resource: reqs.resource, description: "" });
    const payload = decodePaymentHeader(await createPaymentHeader(player, other, NOW));
    const result = await verifyPayment(payload, reqs, { now: NOW });
    expect(result).toMatchObject({ valid: false, reason: expect.stringMatching(/recipient/) });
  });

  it("rejects an expired authorization", async () => {
    const payload = decodePaymentHeader(await createPaymentHeader(player, reqs, NOW));
    const result = await verifyPayment(payload, reqs, { now: NOW + 3600 });
    expect(result).toMatchObject({ valid: false, reason: expect.stringMatching(/expired/) });
  });

  it("rejects an already-used nonce", async () => {
    const payload = decodePaymentHeader(await createPaymentHeader(player, reqs, NOW));
    const result = await verifyPayment(payload, reqs, { now: NOW, isNonceUsed: async () => true });
    expect(result).toMatchObject({ valid: false, reason: expect.stringMatching(/nonce/) });
  });

  it("rejects garbage headers", () => {
    expect(() => decodePaymentHeader("not-base64-json")).toThrow();
  });
});
