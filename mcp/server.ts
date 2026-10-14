// MCP server: lets any MCP-capable AI agent play GM Agent and pay the entry fee itself via x402.
//
//   PLAYER_PRIVATE_KEY=0x...  npx tsx mcp/server.ts
//
// Env:
//   PLAYER_PRIVATE_KEY   Base Sepolia TEST wallet holding a little USDC (no ETH needed: x402 is gasless).
//                        If unset, the key in .mcp-player.json is used (create it with `npm run mcp:setup`).
//                        Without either, the server is read-only (get_puzzle, get_results).
//   GM_AGENT_URL         default https://gm-agent-lime.vercel.app
//   MAX_ENTRY_FEE_USDC   refuse to pay more than this per answer (default 0.5)
//
// Speaks MCP over stdio, so nothing else may be written to stdout.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { createBaseSepoliaClient, getUsdcBalance } from "../src/chain/base-sepolia";
import { getMyWallet, getPuzzle, getResults, submitAnswer, TOOL_DESCRIPTIONS, type PlayerToolDeps, type ToolResult } from "../src/mcp/tools";
import { parseUsdc } from "../src/wallet/usdc";

const keyFile = fileURLToPath(new URL("../.mcp-player.json", import.meta.url));
const key = (process.env.PLAYER_PRIVATE_KEY ||
  (existsSync(keyFile) ? (JSON.parse(readFileSync(keyFile, "utf8")) as { privateKey: string }).privateKey : undefined)) as Hex | undefined;
const client = createBaseSepoliaClient();
const deps: PlayerToolDeps = {
  baseUrl: process.env.GM_AGENT_URL ?? "https://gm-agent-lime.vercel.app",
  signer: key ? privateKeyToAccount(key) : undefined,
  maxFee: parseUsdc(process.env.MAX_ENTRY_FEE_USDC ?? "0.5"),
  balanceOf: (address) => getUsdcBalance(client, address),
};

const server = new McpServer({ name: "gm-agent", version: "2.0.0" });
const reply = ({ text, isError }: ToolResult) => ({ content: [{ type: "text" as const, text }], isError });

server.registerTool("get_puzzle", { title: "Get today's puzzle", description: TOOL_DESCRIPTIONS.get_puzzle }, async () => reply(await getPuzzle(deps)));
server.registerTool(
  "submit_answer",
  {
    title: "Answer and pay the entry fee",
    description: TOOL_DESCRIPTIONS.submit_answer,
    inputSchema: { answer: z.string().min(1).max(200).describe("Your answer to today's riddle: a short word or phrase, e.g. \"piano\".") },
  },
  async ({ answer }) => reply(await submitAnswer(deps, answer)),
);
server.registerTool("get_results", { title: "Get results and leaderboard", description: TOOL_DESCRIPTIONS.get_results }, async () => reply(await getResults(deps)));
server.registerTool("get_my_wallet", { title: "Show my player wallet", description: TOOL_DESCRIPTIONS.get_my_wallet }, async () => reply(await getMyWallet(deps)));

await server.connect(new StdioServerTransport());
console.error(`gm-agent MCP server ready → ${deps.baseUrl} (${deps.signer ? `player ${deps.signer.address}` : "read-only"})`);
