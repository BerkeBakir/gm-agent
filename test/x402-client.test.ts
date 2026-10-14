import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { payAndSubmit } from "../src/x402/client";
import { buildPaymentRequirements, decodePaymentHeader, verifyPayment, type PaymentRequirements } from "../src/x402/exact";

const PAY_TO = "0x5cb007cB053ce248529D84651ce53750666A799D";
const player = privateKeyToAccount(generatePrivateKey());
const reqs = buildPaymentRequirements({ payTo: PAY_TO, amount: 100_000n, resource: "https://gm.test/api/submit", description: "Entry fee" });

/** A fake /api/submit that speaks x402 and verifies the signature like the real route. */
function fakeServer(requirements: PaymentRequirements = reqs) {
  const calls: { payment: string | null; answer: string }[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const payment = headers.get("X-PAYMENT");
    calls.push({ payment, answer: JSON.parse(String(init.body)).answer });
    if (!payment) return Response.json({ x402Version: 1, error: "X-PAYMENT header is required", accepts: [requirements] }, { status: 402 });
    const verified = await verifyPayment(decodePaymentHeader(payment), requirements);
    if (!verified.valid) return Response.json({ error: verified.reason }, { status: 402 });
    return Response.json({ submitted: true, player: verified.payer, feeTx: "0xfee" });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe("payAndSubmit (x402 client)", () => {
  it("handles 402, signs EIP-3009 and retries with X-PAYMENT", async () => {
    const server = fakeServer();
    const r = await payAndSubmit("https://gm.test", player, "piano", { maxFee: 500_000n, fetch: server.fetchFn });
    expect(r).toMatchObject({ ok: true, status: 200, feeTx: "0xfee", paid: 100_000n });
    expect(server.calls).toHaveLength(2);
    expect(server.calls[0]!.payment).toBeNull();
    expect(decodePaymentHeader(server.calls[1]!.payment!).payload.authorization.from).toBe(player.address);
    expect(server.calls[1]!.answer).toBe("piano");
  });

  it("refuses to sign when the fee is above the limit", async () => {
    const server = fakeServer();
    const r = await payAndSubmit("https://gm.test", player, "piano", { maxFee: 50_000n, fetch: server.fetchFn });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/above the limit/);
    expect(server.calls).toHaveLength(1); // never sent a payment
  });

  it("refuses to pay on any network other than Base Sepolia", async () => {
    const server = fakeServer({ ...reqs, network: "base" as never });
    const r = await payAndSubmit("https://gm.test", player, "piano", { maxFee: 500_000n, fetch: server.fetchFn });
    expect(r.error).toMatch(/testnet only/);
    expect(server.calls).toHaveLength(1);
  });

  it("returns the server's error instead of throwing", async () => {
    const fetchFn = (async () => Response.json({ error: "No challenge is open right now." }, { status: 409 })) as unknown as typeof fetch;
    const r = await payAndSubmit("https://gm.test", player, "piano", { maxFee: 500_000n, fetch: fetchFn });
    expect(r).toMatchObject({ ok: false, status: 409, error: "No challenge is open right now." });
  });
});
