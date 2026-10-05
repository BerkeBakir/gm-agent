import { randomUUID } from "node:crypto";
import type { Challenge, NewChallenge } from "./types";

/**
 * Persistence for the game. MemoryGameStore for tests/local dev,
 * PostgresGameStore for the deployed app (Vercel has no writable disk).
 */
export interface GameStore {
  /** Opens a new challenge as the next day; any open challenge is closed. */
  createChallenge(input: NewChallenge): Promise<Challenge>;
  getCurrentChallenge(): Promise<Challenge | null>;
  getChallenge(id: string): Promise<Challenge | null>;
}

export class MemoryGameStore implements GameStore {
  private challenges: Challenge[] = [];

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
}
