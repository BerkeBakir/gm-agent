import type { Puzzle } from "./types";

/** Last-resort riddles bundled with the app (classic, public-domain style). */
export const BANK = [
  { question: "I have keys but open no locks. I have space but no room. You can enter, but you can't go inside. What am I?", answer: "Keyboard", acceptedAnswers: ["a keyboard", "computer keyboard"] },
  { question: "What has to be broken before you can use it?", answer: "Egg", acceptedAnswers: ["an egg"] },
  { question: "I'm tall when I'm young and short when I'm old. What am I?", answer: "Candle", acceptedAnswers: ["a candle"] },
  { question: "What has hands but can't clap?", answer: "Clock", acceptedAnswers: ["a clock", "watch", "a watch"] },
  { question: "What gets wetter the more it dries?", answer: "Towel", acceptedAnswers: ["a towel"] },
  { question: "What has a neck but no head?", answer: "Bottle", acceptedAnswers: ["a bottle"] },
  { question: "What can you catch but not throw?", answer: "Cold", acceptedAnswers: ["a cold"] },
] as const satisfies readonly { question: string; answer: string; acceptedAnswers: string[] }[];

export function bankPuzzle(date: string): Puzzle {
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const b = BANK[h % BANK.length];
  return { key: `bank-${date}`, source: "bank", question: b.question, answer: b.answer, acceptedAnswers: [...b.acceptedAnswers] };
}
