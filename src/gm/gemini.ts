import { GoogleGenAI } from "@google/genai";
import { DIFFICULTIES, type Difficulty, type NewChallenge } from "../game/types";
import type { ChallengeAuthor, Decision, DecisionMaker, GameState } from "./types";

export const PERSONAS = {
  balanced:
    "You are a balanced game master. You want the game to stay fun AND to keep running for a long time. " +
    "Reward winners well enough to keep players coming back, but never let the treasury trend toward zero.",
  treasurer:
    "You are a conservative treasurer. Your first priority is that the treasury survives as long as possible. " +
    "Only raise rewards when income clearly supports it.",
  entertainer:
    "You are a fun-first game master. Your first priority is player excitement and participation. " +
    "You are willing to spend more of the treasury to grow the player base, as long as the game doesn't go broke.",
} as const;
export type Persona = keyof typeof PERSONAS;

const usdc = (v: bigint) => Number(v) / 1e6;

function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const model = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

/** Serializes the game state for the prompt (bigint → USDC numbers). */
export function describeState(s: GameState) {
  return {
    closing_day: s.day,
    closing_challenge_difficulty: s.challenge?.difficulty ?? null,
    treasury_usdc: usdc(s.treasury),
    hard_limits: { daily_budget_usdc: usdc(s.dailyBudget), max_reward_per_winner_usdc: usdc(s.maxPerTx) },
    entry_fee_usdc: usdc(s.entryFee),
    today: {
      participants: s.today.participants,
      winners: s.today.winners,
      win_rate: s.today.winRate,
      entry_fee_income_usdc: usdc(s.today.income),
    },
    target_win_rate: s.targetWinRate,
    previous_days_newest_first: s.history.map((h) => ({
      day: h.day,
      participants: h.participants,
      winners: h.winners,
      win_rate: h.winRate,
      income_usdc: usdc(h.income),
      paid_usdc: usdc(h.totalPaid),
      treasury_after_usdc: usdc(h.treasuryAfter),
    })),
  };
}

/** The production decision maker: Gemini decides rewards and difficulty, with written reasoning. */
export class GeminiDecisionMaker implements DecisionMaker {
  readonly name: string;

  constructor(private readonly persona: Persona = "balanced") {
    this.name = `gemini:${persona}`;
  }

  async decide(state: GameState): Promise<Decision> {
    const prompt = [
      PERSONAS[this.persona],
      "You run a daily puzzle game. Players pay a small USDC entry fee (x402) to answer; correct answers split a reward from your treasury.",
      "It is the end of the game day. Decide (1) the reward each winner gets today and (2) the difficulty of tomorrow's puzzle.",
      "Economics: if you pay too much the treasury drains and the game dies; if you pay too little players stop coming and income falls.",
      `Aim for a win rate between ${state.targetWinRate.min} and ${state.targetWinRate.max}.`,
      "The hard limits are enforced in code after your decision; proposing more will simply be cut.",
      "Explain your reasoning in 1-3 short sentences, citing the numbers you used.",
      "",
      "GAME STATE (JSON):",
      JSON.stringify(describeState(state), null, 2),
    ].join("\n");

    const res = await client().models.generateContent({
      model: model(),
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            reward_per_winner_usdc: { type: "number", description: "USDC paid to EACH winner today. 0 if no winners." },
            next_difficulty: { type: "string", enum: [...DIFFICULTIES] },
            reasoning: { type: "string" },
          },
          required: ["reward_per_winner_usdc", "next_difficulty", "reasoning"],
        },
      },
    });

    const out = JSON.parse(res.text ?? "{}") as { reward_per_winner_usdc?: number; next_difficulty?: string; reasoning?: string };
    const reward = Number(out.reward_per_winner_usdc);
    if (!Number.isFinite(reward)) throw new Error(`Gemini returned an invalid reward: ${res.text}`);
    return {
      rewardPerWinner: BigInt(Math.round(Math.max(reward, 0) * 1e6)),
      nextDifficulty: (out.next_difficulty ?? "medium") as Difficulty,
      reasoning: out.reasoning?.trim() || "(no reasoning given)",
    };
  }
}

/** The production challenge author: Gemini writes a fresh puzzle with a private answer key. */
export class GeminiChallengeAuthor implements ChallengeAuthor {
  async author(difficulty: Difficulty, avoid: string[]): Promise<NewChallenge> {
    const prompt = [
      `Write one ORIGINAL ${difficulty} riddle or logic puzzle for a daily puzzle game.`,
      "Requirements: exactly one correct answer, 1-3 words or a number; solvable without special knowledge; in English;",
      "no trick wording that makes it ambiguous. Also list a few alternative wordings that should count as correct.",
      "Difficulty guide: easy = most adults solve it in a minute; medium = needs some thought; hard = a real logic/maths/lateral-thinking challenge.",
      avoid.length ? `Do NOT reuse or closely paraphrase these recent puzzles:\n- ${avoid.slice(0, 14).join("\n- ")}` : "",
    ].join("\n");

    const res = await client().models.generateContent({
      model: model(),
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
            accepted_answers: { type: "array", items: { type: "string" } },
          },
          required: ["question", "answer"],
        },
      },
    });
    const out = JSON.parse(res.text ?? "{}") as { question?: string; answer?: string; accepted_answers?: string[] };
    return {
      difficulty,
      question: out.question ?? "",
      answer: out.answer ?? "",
      ...(out.accepted_answers?.length && { acceptedAnswers: out.accepted_answers }),
    };
  }
}
