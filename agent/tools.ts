/**
 * GM AGENT TOOLS
 *
 * A tool is just a function the agent is allowed to call.
 * Gemini reads the `description` to decide WHEN to use it,
 * and `parameters` to know WHAT to pass in.
 */
import { formatEther } from "viem";
import { createBaseSepoliaClient, EXPLORER_URL, getEthBalance, getUsdcBalance } from "@/src/chain/base-sepolia";
import { getGameStore, toPublicChallenge, validateNewChallenge } from "@/src/game";
import { formatUsdc } from "@/src/wallet/usdc";
import { getWalletAddress } from "./wallet";

export type Tool = {
  name: string;
  description: string;
  /** JSON Schema describing the inputs. */
  parameters: object;
  /** The code that runs when the agent calls this tool. */
  run: (args: any, ctx: { baseUrl: string }) => Promise<unknown>;
};

export const tools: Tool[] = [
  {
    name: "create_challenge",
    description:
      "Publish a new daily challenge (a riddle or logic puzzle) for the players. Write an ORIGINAL puzzle with one " +
      "short, unambiguous answer. The answer key is stored privately for grading and never shown to players. " +
      "Publishing a new challenge closes the previous one and starts the next game day.",
    parameters: {
      type: "object",
      properties: {
        difficulty: { type: "string", enum: ["easy", "medium", "hard"], description: "How hard the puzzle is." },
        question: { type: "string", description: "The puzzle text shown to players." },
        answer: { type: "string", description: "The correct answer, as short as possible (ideally 1-3 words)." },
        acceptedAnswers: {
          type: "array",
          items: { type: "string" },
          description: "Other wordings that should also count as correct, e.g. with or without an article.",
        },
      },
      required: ["difficulty", "question", "answer"],
    },
    run: async (args) => {
      const challenge = await getGameStore().createChallenge(validateNewChallenge(args));
      return { published: toPublicChallenge(challenge) };
    },
  },

  {
    name: "get_today_challenge",
    description: "Get the challenge that is currently open for players (without the answer key).",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const challenge = await getGameStore().getCurrentChallenge();
      return challenge ? { challenge: toPublicChallenge(challenge) } : { challenge: null, note: "No challenge is open yet." };
    },
  },

  {
    name: "get_treasury_balance",
    description:
      "Read the game treasury on-chain: the agent wallet's USDC balance (used for player rewards) and ETH balance " +
      "(used only for gas) on Base Sepolia testnet.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const address = getWalletAddress();
      if (!address) throw new Error("The agent has no wallet yet.");
      const client = createBaseSepoliaClient();
      const [usdc, eth] = await Promise.all([getUsdcBalance(client, address), getEthBalance(client, address)]);
      return {
        address,
        usdc: formatUsdc(usdc),
        eth: `${formatEther(eth)} ETH`,
        network: "Base Sepolia (testnet)",
        explorer: `${EXPLORER_URL}/address/${address}`,
      };
    },
  },
];
