/**
 * POST /api/submit { answer } — x402-protected answer submission.
 *
 * 1st request (no X-PAYMENT)  → 402 + x402 PaymentRequirements (entry fee in USDC)
 * 2nd request (X-PAYMENT)     → verify EIP-3009 signature → settle ON-CHAIN into the
 *                               agent's treasury → grade → store → 200 + X-PAYMENT-RESPONSE
 */
import { DuplicateSubmissionError, getGameStore, isCorrectAnswer } from "@/src/game";
import { getAgentWallet, getEntryFee } from "@/src/server/runtime";
import {
  buildPaymentRequirements,
  decodePaymentHeader,
  isNonceUsedOnChain,
  NETWORK,
  payerBalance,
  settlePayment,
  verifyPayment,
  X402_VERSION,
} from "@/src/x402/exact";

export const maxDuration = 60;

export async function POST(req: Request) {
  const store = getGameStore();
  const challenge = await store.getCurrentChallenge();
  if (!challenge) return Response.json({ error: "No challenge is open right now." }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { answer?: unknown };
  const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 200) : "";
  if (!answer) return Response.json({ error: "Send { answer: string }." }, { status: 400 });

  const wallet = getAgentWallet();
  const fee = getEntryFee();
  const requirements = buildPaymentRequirements({
    payTo: wallet.address,
    amount: fee,
    resource: new URL(req.url).toString(),
    description: `GM Agent entry fee for day ${challenge.day}`,
  });

  const header = req.headers.get("X-PAYMENT");
  if (!header) {
    return Response.json({ x402Version: X402_VERSION, error: "X-PAYMENT header is required", accepts: [requirements] }, { status: 402 });
  }

  let payment;
  try {
    payment = decodePaymentHeader(header);
  } catch {
    return Response.json({ x402Version: X402_VERSION, error: "Malformed X-PAYMENT header", accepts: [requirements] }, { status: 402 });
  }

  const verified = await verifyPayment(payment, requirements, { isNonceUsed: isNonceUsedOnChain });
  if (!verified.valid) {
    return Response.json({ x402Version: X402_VERSION, error: verified.reason, accepts: [requirements] }, { status: 402 });
  }
  const player = verified.payer;

  // Check everything that could make us reject the answer BEFORE taking the money.
  if (await store.hasSubmitted(challenge.id, player)) {
    return Response.json({ error: "This wallet already answered today's challenge." }, { status: 409 });
  }
  if ((await payerBalance(player)) < fee) {
    return Response.json({ x402Version: X402_VERSION, error: "Insufficient USDC balance", accepts: [requirements] }, { status: 402 });
  }

  // Reserve the (wallet, challenge) slot FIRST — the unique index makes concurrent
  // duplicates fail here, before anyone is charged. Roll back if settlement fails.
  let submission;
  try {
    submission = await store.addSubmission({
      challengeId: challenge.id,
      player,
      answer,
      correct: isCorrectAnswer(answer, challenge),
      fee,
    });
  } catch (err) {
    if (err instanceof DuplicateSubmissionError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }

  let txHash: string;
  try {
    txHash = await settlePayment(payment, wallet);
  } catch (err) {
    await store.removeSubmission(submission.id);
    return Response.json({ error: `Payment settlement failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
  await store.setFeeTx(submission.id, txHash);

  const paymentResponse = Buffer.from(JSON.stringify({ success: true, transaction: txHash, network: NETWORK, payer: player })).toString("base64");
  return Response.json(
    { submitted: true, day: challenge.day, player, feeTx: txHash, note: "Results and rewards are announced when the GM closes the day." },
    { headers: { "X-PAYMENT-RESPONSE": paymentResponse } },
  );
}
