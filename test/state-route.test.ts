import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/state", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GAME_STORE = "memory";
    process.env.WALLET_PRIVATE_KEY = `0x${"ef".repeat(32)}`;
    process.env.TREASURY_MODE = "eoa";
    process.env.BASE_SEPOLIA_RPC_URL = "http://127.0.0.1:9"; // unreachable → balances null
  });

  it("shows the open commitment, hides its salt, and verifies closed ones", async () => {
    const { getGameStore } = await import("../src/game");
    const store = getGameStore();
    await store.createChallenge({ difficulty: "easy", question: "Q1?", answer: "Egg" });
    await store.createChallenge({ difficulty: "easy", question: "Q2?", answer: "Glove" });
    const { GET } = await import("../app/api/state/route");
    const body = await (await GET()).json();

    expect(body.challenge.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.challenge.salt).toBeUndefined();
    expect(body.pastChallenges[0]).toMatchObject({ day: 1, answer: "Egg", commitmentValid: true });
    expect(body.pastChallenges[0].salt).toMatch(/^0x/);
    expect(body.treasury.mode).toBe("eoa");
    expect(body.treasury.onchainLimit).toBeNull();
  }, 20_000);
});
