import { randomUUID } from "node:crypto";
import type { Challenge, DecisionLog, NewChallenge, NewDecisionLog, NewSubmission, Submission } from "./types";

export class DuplicateSubmissionError extends Error {
  constructor() {
    super("This wallet already submitted an answer for this challenge.");
    this.name = "DuplicateSubmissionError";
  }
}

/**
 * Persistence for the game. MemoryGameStore for tests/local dev/simulations,
 * PostgresGameStore for the deployed app (Vercel has no writable disk).
 */
export interface GameStore {
  /** Opens a new challenge as the next day; any open challenge is closed. */
  createChallenge(input: NewChallenge): Promise<Challenge>;
  getCurrentChallenge(): Promise<Challenge | null>;
  getChallenge(id: string): Promise<Challenge | null>;
  listChallenges(limit: number): Promise<Challenge[]>;

  /** One submission per wallet per challenge; throws DuplicateSubmissionError otherwise. */
  addSubmission(input: NewSubmission): Promise<Submission>;
  hasSubmitted(challengeId: string, player: string): Promise<boolean>;
  getSubmissions(challengeId: string): Promise<Submission[]>;
  recordReward(submissionId: string, amount: bigint, txHash?: string): Promise<void>;

  addDecision(entry: NewDecisionLog): Promise<DecisionLog>;
  /** Newest first. */
  listDecisions(limit: number): Promise<DecisionLog[]>;
}

export class MemoryGameStore implements GameStore {
  private challenges: Challenge[] = [];
  private submissions: Submission[] = [];
  private decisions: DecisionLog[] = [];

  async createChallenge(input: NewChallenge): Promise<Challenge> {
    for (const c of this.challenges) if (c.status === "open") c.status = "closed";
    const challenge: Challenge = {
      ...input,
      id: randomUUID(),
      day: this.challenges.length + 1,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.challenges.push(challenge);
    return { ...challenge };
  }

  async getCurrentChallenge(): Promise<Challenge | null> {
    const open = this.challenges.findLast((c) => c.status === "open");
    return open ? { ...open } : null;
  }

  async getChallenge(id: string): Promise<Challenge | null> {
    const found = this.challenges.find((c) => c.id === id);
    return found ? { ...found } : null;
  }

  async listChallenges(limit: number): Promise<Challenge[]> {
    return this.challenges.slice(-limit).reverse().map((c) => ({ ...c }));
  }

  async addSubmission(input: NewSubmission): Promise<Submission> {
    if (await this.hasSubmitted(input.challengeId, input.player)) throw new DuplicateSubmissionError();
    const submission: Submission = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.submissions.push(submission);
    return { ...submission };
  }

  async hasSubmitted(challengeId: string, player: string): Promise<boolean> {
    const p = player.toLowerCase();
    return this.submissions.some((s) => s.challengeId === challengeId && s.player.toLowerCase() === p);
  }

  async getSubmissions(challengeId: string): Promise<Submission[]> {
    return this.submissions.filter((s) => s.challengeId === challengeId).map((s) => ({ ...s }));
  }

  async recordReward(submissionId: string, amount: bigint, txHash?: string): Promise<void> {
    const s = this.submissions.find((x) => x.id === submissionId);
    if (!s) throw new Error(`Unknown submission ${submissionId}`);
    s.reward = amount;
    if (txHash) s.rewardTx = txHash;
  }

  async addDecision(entry: NewDecisionLog): Promise<DecisionLog> {
    const log: DecisionLog = { ...entry, id: randomUUID(), createdAt: new Date().toISOString() };
    this.decisions.push(log);
    return structuredClone(log);
  }

  async listDecisions(limit: number): Promise<DecisionLog[]> {
    return this.decisions.slice(-limit).reverse().map((d) => structuredClone(d));
  }
}
