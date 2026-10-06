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
import { getEntryFee, getLimits } from "@/src/server/runtime";
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
      "Only works when no challenge is open yet (the very first day); after that, new days are opened by the " +
      "GM's daily loop, not from chat.",
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
      const store = getGameStore();
      const open = await store.getCurrentChallenge();
      if (open) {
        return { published: false, reason: `Day ${open.day} is already open. The daily loop opens the next day.`, open: toPublicChallenge(open) };
      }
      const challenge = await store.createChallenge(validateNewChallenge(args));
      return { published: toPublicChallenge(challenge) };
    },
  },

  {
    name: "get_decision_log",
    description:
      "Read the GM's own decision log: for each closed day, participants, win rate, entry-fee income, reward per " +
      "winner, total paid, treasury before/after, next difficulty and the written reasoning. Use it to explain past decisions.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "How many days to return, newest first. Default 5." } },
    },
    run: async ({ limit = 5 }) => {
      const logs = await getGameStore().listDecisions(Math.min(Math.max(Number(limit) || 5, 1), 20));
      return {
        days: logs.map((d) => ({
          day: d.day,
          participants: d.participants,
          winners: d.winners,
          winRate: d.winRate,
          income: formatUsdc(d.income),
          rewardPerWinner: formatUsdc(d.rewardPerWinner),
          totalPaid: formatUsdc(d.totalPaid),
          treasuryBefore: formatUsdc(d.treasuryBefore),
          treasuryAfter: formatUsdc(d.treasuryAfter),
          nextDifficulty: d.nextDifficulty,
          decidedBy: d.decidedBy,
          reasoning: d.reasoning,
          adjustments: d.adjustments,
        })),
      };
    },
  },

  {
    name: "get_game_rules",
    description: "Get the game rules and economic limits: entry fee, max reward per winner, daily payout budget, how to play.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const limits = getLimits();
      return {
        howToPlay:
          "Each game day has one puzzle. Connect a Base Sepolia wallet on the page and submit one answer per day; " +
          "the entry fee is paid in USDC via x402 (gasless for the player). When the day closes, correct answers split a reward from the treasury.",
        entryFee: formatUsdc(getEntryFee()),
        maxRewardPerWinner: formatUsdc(limits.maxPerTx),
        dailyPayoutBudget: `${limits.maxDailyFractionBps / 100}% of the treasury`,
        answersPerWalletPerDay: 1,
      };
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
