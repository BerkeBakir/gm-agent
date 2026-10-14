/**
 * Tools that let any MCP-capable AI agent (Claude Desktop, Claude Code, ...) play GM Agent
 * with its own wallet. Kept free of MCP plumbing so they can be unit-tested; mcp/server.ts
 * registers them. Every tool returns text and never throws: errors come back as readable
 * messages the calling agent can act on.
 */
import { EXPLORER_URL } from "../chain/base-sepolia";
import { formatUsdc } from "../wallet/usdc";
import { payAndSubmit } from "../x402/client";
import type { TypedDataSigner } from "../x402/exact";

export interface PlayerToolDeps {
  /** GM Agent site, e.g. https://gm-agent-lime.vercel.app */
  baseUrl: string;
  /** The player's wallet. Missing → read-only mode (get_puzzle / get_results still work). */
  signer?: TypedDataSigner;
  /** Never pay more than this per answer (USDC base units). */
  maxFee: bigint;
  balanceOf?: (address: `0x${string}`) => Promise<bigint>;
  fetch?: typeof fetch;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

interface StateResponse {
  challenge: { day: number; difficulty: string; question: string; participants: number } | null;
  pastChallenges: { day: number; difficulty: string; question: string; answer: string }[];
  rules: { entryFee: string; maxPerTx: string; maxDailyFractionBps: number };
  decisions: {
    day: number;
    participants: number;
    winners: number;
    rewardPerWinner: string;
    nextDifficulty: string;
    reasoning: string;
    adjustments: string[];
    payouts: { player: string; amount: string; txHash?: string; error?: string }[];
  }[];
  leaderboard: { player: string; wins: number; earned: string }[];
}

export const TOOL_DESCRIPTIONS = {
  get_puzzle:
    "Get today's GM Agent puzzle: the riddle text, its difficulty, the day number, how many players answered so far, and the entry fee in USDC. " +
    "Does not reveal the answer. Call this before submit_answer.",
  submit_answer:
    "Submit ONE answer to today's GM Agent puzzle and pay the entry fee from your wallet (USDC on Base Sepolia testnet, via x402: a gasless EIP-3009 signature, settled on-chain). " +
    "Each wallet can answer once per day and answers are final, so solve the riddle first. Returns the BaseScan link of the fee payment. " +
    "Whether you won is decided when the GM closes the day; check with get_results.",
  get_results:
    "Get the GM's latest end-of-day decisions: winners, the reward paid per winner with BaseScan links, the GM's reasoning and guardrail adjustments, " +
    "the answers of past puzzles, and the leaderboard. Use it to see if your answer won.",
  get_my_wallet: "Show the player wallet this agent pays from: its address and USDC balance on Base Sepolia. Check it before submit_answer.",
} as const;

const tx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
const fail = (text: string): ToolResult => ({ text, isError: true });

async function getState(deps: PlayerToolDeps): Promise<StateResponse> {
  const res = await (deps.fetch ?? fetch)(new URL("/api/state", deps.baseUrl));
  if (!res.ok) throw new Error(`GM Agent /api/state returned ${res.status}`);
  return (await res.json()) as StateResponse;
}

export async function getPuzzle(deps: PlayerToolDeps): Promise<ToolResult> {
  try {
    const s = await getState(deps);
    if (!s.challenge) return fail("No puzzle is open right now. The GM opens a new one when it closes the day; try again later.");
    const c = s.challenge;
    return {
      text: [
        `Day ${c.day} puzzle (${c.difficulty}): ${c.question}`,
        `Entry fee: ${formatUsdc(BigInt(s.rules.entryFee))} (paid via x402 on Base Sepolia testnet)`,
        `Players so far: ${c.participants}`,
        "Rules: one answer per wallet per day, answers are final. Reply with a short word or phrase. " +
          `Correct answers share a reward (max ${formatUsdc(BigInt(s.rules.maxPerTx))} each) when the GM closes the day.`,
      ].join("\n"),
    };
  } catch (err) {
    return fail(`Could not load the puzzle: ${message(err)}`);
  }
}

export async function submitAnswer(deps: PlayerToolDeps, answer: string): Promise<ToolResult> {
  if (!deps.signer) return fail("No player wallet configured. Set PLAYER_PRIVATE_KEY (a Base Sepolia test wallet with USDC) in the MCP server's env.");
  const trimmed = answer.trim();
  if (!trimmed) return fail("The answer is empty. Send a short word or phrase.");
  try {
    const r = await payAndSubmit(deps.baseUrl, deps.signer, trimmed, { maxFee: deps.maxFee, fetch: deps.fetch });
    if (!r.ok) return fail(`Answer not submitted (${r.status}): ${r.error}`);
    return {
      text:
        `Answer "${trimmed}" submitted from ${deps.signer.address}. ` +
        `Paid ${formatUsdc(r.paid ?? 0n)} entry fee: ${r.feeTx ? tx(r.feeTx) : "(no tx hash)"}. ` +
        "The result is announced when the GM closes the day; check get_results.",
    };
  } catch (err) {
    return fail(`Payment or submission failed: ${message(err)}`);
  }
}

export async function getResults(deps: PlayerToolDeps): Promise<ToolResult> {
  try {
    const s = await getState(deps);
    const me = deps.signer?.address.toLowerCase();
    const lines: string[] = [];
    for (const d of s.decisions.filter((x) => x.day > 0).slice(0, 3)) {
      const answer = s.pastChallenges.find((c) => c.day === d.day)?.answer;
      lines.push(
        `Day ${d.day}: ${d.winners}/${d.participants} correct${answer ? ` (answer: "${answer}")` : ""}, ` +
          `${formatUsdc(BigInt(d.rewardPerWinner))} per winner, next difficulty ${d.nextDifficulty}.`,
      );
      lines.push(`  GM reasoning: ${d.reasoning}`);
      for (const a of d.adjustments) lines.push(`  Guardrail: ${a}`);
      for (const p of d.payouts) {
        const mine = me && p.player.toLowerCase() === me ? " ← you" : "";
        lines.push(`  Paid ${formatUsdc(BigInt(p.amount))} to ${p.player}${mine}${p.txHash ? ` ${tx(p.txHash)}` : p.error ? ` (failed: ${p.error})` : ""}`);
      }
    }
    if (lines.length === 0) lines.push("No days have been closed yet.");
    if (s.leaderboard.length) {
      lines.push("Leaderboard:");
      s.leaderboard.slice(0, 5).forEach((l, i) => lines.push(`  ${i + 1}. ${l.player} — ${l.wins} win(s), ${formatUsdc(BigInt(l.earned))}`));
    }
    return { text: lines.join("\n") };
  } catch (err) {
    return fail(`Could not load results: ${message(err)}`);
  }
}

export async function getMyWallet(deps: PlayerToolDeps): Promise<ToolResult> {
  if (!deps.signer) return fail("No player wallet configured (PLAYER_PRIVATE_KEY is not set). Read-only mode.");
  const lines = [`Player wallet: ${deps.signer.address} (Base Sepolia testnet)`, `Max entry fee this agent will pay: ${formatUsdc(deps.maxFee)}`];
  if (deps.balanceOf) {
    try {
      lines.push(`USDC balance: ${formatUsdc(await deps.balanceOf(deps.signer.address))}`);
    } catch (err) {
      lines.push(`USDC balance: unavailable (${message(err)})`);
    }
  }
  lines.push(`Explorer: ${EXPLORER_URL}/address/${deps.signer.address}`);
  return { text: lines.join("\n") };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
