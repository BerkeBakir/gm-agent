import type { Difficulty, NewChallenge } from "../game/types";
import type { ChallengeAuthor } from "./types";

const BANK: Record<Difficulty, NewChallenge[]> = {
  easy: [
    { difficulty: "easy", question: "What has keys but can't open locks?", answer: "piano", acceptedAnswers: ["a piano", "keyboard"] },
    { difficulty: "easy", question: "What gets wetter the more it dries?", answer: "towel", acceptedAnswers: ["a towel"] },
    { difficulty: "easy", question: "What has hands but cannot clap?", answer: "clock", acceptedAnswers: ["a clock", "watch"] },
  ],
  medium: [
    { difficulty: "medium", question: "The more of this there is, the less you see. What is it?", answer: "darkness", acceptedAnswers: ["dark", "the dark"] },
    { difficulty: "medium", question: "What can travel around the world while staying in a corner?", answer: "stamp", acceptedAnswers: ["a stamp", "postage stamp"] },
    { difficulty: "medium", question: "I have cities but no houses, forests but no trees, water but no fish. What am I?", answer: "map", acceptedAnswers: ["a map"] },
  ],
  hard: [
    { difficulty: "hard", question: "What number comes next: 1, 11, 21, 1211, 111221, ?", answer: "312211" },
    { difficulty: "hard", question: "I am an odd number. Take away one letter and I become even. What number am I?", answer: "seven", acceptedAnswers: ["7"] },
    { difficulty: "hard", question: "What is the smallest positive integer that is divisible by every number from 1 to 10?", answer: "2520" },
  ],
};

/** Deterministic puzzle bank for tests, simulations and as a fallback when the LLM is unavailable. */
export class StaticChallengeAuthor implements ChallengeAuthor {
  private used = 0;

  async author(difficulty: Difficulty, avoid: string[]): Promise<NewChallenge> {
    const pool = BANK[difficulty];
    const fresh = pool.filter((c) => !avoid.includes(c.question));
    const pick = (fresh.length > 0 ? fresh : pool)[this.used++ % (fresh.length || pool.length)]!;
    return { ...pick, ...(pick.acceptedAnswers && { acceptedAnswers: [...pick.acceptedAnswers] }) };
  }
}
