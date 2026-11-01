import type { Difficulty, NewChallenge } from "../game/types";
import { findRepeat, type RecentPuzzle } from "./repeat-guard";
import type { ChallengeAuthor } from "./types";

const BANK: Record<Difficulty, NewChallenge[]> = {
  easy: [
    { difficulty: "easy", question: "What has keys but can't open locks?", answer: "piano", acceptedAnswers: ["a piano", "keyboard"] },
    { difficulty: "easy", question: "What gets wetter the more it dries?", answer: "towel", acceptedAnswers: ["a towel"] },
    { difficulty: "easy", question: "What has hands but cannot clap?", answer: "clock", acceptedAnswers: ["a clock", "watch"] },
    { difficulty: "easy", question: "What has to be broken before you can use it?", answer: "egg", acceptedAnswers: ["an egg"] },
    { difficulty: "easy", question: "What has one eye but cannot see?", answer: "needle", acceptedAnswers: ["a needle"] },
    { difficulty: "easy", question: "What has many teeth but cannot bite?", answer: "comb", acceptedAnswers: ["a comb"] },
    { difficulty: "easy", question: "What has a head and a tail but no body?", answer: "coin", acceptedAnswers: ["a coin"] },
    { difficulty: "easy", question: "What runs but never walks, and has a bed but never sleeps?", answer: "river", acceptedAnswers: ["a river"] },
    { difficulty: "easy", question: "What is full of holes but still holds water?", answer: "sponge", acceptedAnswers: ["a sponge"] },
    { difficulty: "easy", question: "How many months of the year have 28 days?", answer: "12", acceptedAnswers: ["twelve", "all", "all of them"] },
  ],
  medium: [
    { difficulty: "medium", question: "The more of this there is, the less you see. What is it?", answer: "darkness", acceptedAnswers: ["dark", "the dark"] },
    { difficulty: "medium", question: "What can travel around the world while staying in a corner?", answer: "stamp", acceptedAnswers: ["a stamp", "postage stamp"] },
    { difficulty: "medium", question: "I have cities but no houses, forests but no trees, water but no fish. What am I?", answer: "map", acceptedAnswers: ["a map"] },
    { difficulty: "medium", question: "What five-letter word becomes shorter when you add two letters to it?", answer: "short" },
    { difficulty: "medium", question: "If you have me, you want to share me. If you share me, you no longer have me. What am I?", answer: "secret", acceptedAnswers: ["a secret"] },
    { difficulty: "medium", question: "Forward I am heavy, backward I am not. What am I?", answer: "ton", acceptedAnswers: ["a ton"] },
    { difficulty: "medium", question: "What belongs to you, but other people use it more than you do?", answer: "name", acceptedAnswers: ["your name", "my name"] },
    { difficulty: "medium", question: "What comes once in a minute, twice in a moment, but never in a thousand years?", answer: "m", acceptedAnswers: ["the letter m", "letter m"] },
    { difficulty: "medium", question: "The maker sells it, the buyer never uses it, and the user never knows they are using it. What is it?", answer: "coffin", acceptedAnswers: ["a coffin", "casket"] },
    { difficulty: "medium", question: "What word's first two letters mean a man, first three a woman, first four a great man, and the whole word a great woman?", answer: "heroine" },
  ],
  hard: [
    { difficulty: "hard", question: "What number comes next: 1, 11, 21, 1211, 111221, ?", answer: "312211" },
    { difficulty: "hard", question: "I am an odd number. Take away one letter and I become even. What number am I?", answer: "seven", acceptedAnswers: ["7"] },
    { difficulty: "hard", question: "What is the smallest positive integer that is divisible by every number from 1 to 10?", answer: "2520" },
    { difficulty: "hard", question: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How many cents does the ball cost?", answer: "5", acceptedAnswers: ["five", "5 cents", "five cents", "0.05", "$0.05"] },
    { difficulty: "hard", question: "A patch of lily pads doubles in size every day and covers the whole lake on day 48. On which day did it cover half the lake?", answer: "47", acceptedAnswers: ["day 47", "47th", "the 47th day"] },
    { difficulty: "hard", question: "What number comes next: 2, 3, 5, 7, 11, 13, ?", answer: "17", acceptedAnswers: ["seventeen"] },
    { difficulty: "hard", question: "How many times does the digit 1 appear when you write every whole number from 1 to 100?", answer: "21", acceptedAnswers: ["twenty-one", "twenty one"] },
    { difficulty: "hard", question: "What is the sum of all the whole numbers from 1 to 100?", answer: "5050" },
    { difficulty: "hard", question: "A clock shows 3:15. What is the smaller angle between the hour and minute hands, in degrees?", answer: "7.5", acceptedAnswers: ["7.5 degrees", "7.5°"] },
    { difficulty: "hard", question: "What number comes next: 2, 6, 12, 20, 30, ?", answer: "42", acceptedAnswers: ["forty-two", "forty two"] },
  ],
};

/**
 * Deterministic puzzle bank for tests, simulations and as a fallback when the LLM is unavailable.
 * Never picks a puzzle that repeats a recent question or answer while a fresh one is left; once the
 * whole pool is recent, it reuses the least recently used puzzle (never yesterday's).
 */
export class StaticChallengeAuthor implements ChallengeAuthor {
  private used = 0;

  async author(difficulty: Difficulty, recent: RecentPuzzle[]): Promise<NewChallenge> {
    const pool = BANK[difficulty];
    const fresh = pool.filter((c) => !findRepeat(c, recent));
    const pick =
      fresh.length > 0
        ? fresh[this.used++ % fresh.length]!
        : pool.reduce((oldest, c) => (findRepeat(c, recent)!.index > findRepeat(oldest, recent)!.index ? c : oldest));
    return { ...pick, ...(pick.acceptedAnswers && { acceptedAnswers: [...pick.acceptedAnswers] }) };
  }
}
