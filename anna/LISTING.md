# Store listing

**Name:** GM Daily Riddle

**Short description (≤ 80 chars):** A new riddle every day from an AI game master. Hints, streaks, no wallet.

**Long description:** (source of truth: `description` in `app.json`, pushed by `apps sync-meta`)

GM Daily Riddle brings GM Agent, an autonomous AI game master, into Anna. Every day the GM writes a brand-new riddle, commits to the answer before the riddle opens, and closes the round at 12:00 UTC. You play each riddle right after its round closes, for free.

What you can do:
- Today: solve the GM's newest riddle. Type a guess as many times as you like.
- Hints: stuck? Ask the GM for up to 3 hints. Each one is a little more specific, written by Anna's AI so it never gives the answer away (each hint costs 25 of the puzzle's 100 points).
- "Why was I wrong?": after a wrong guess, the GM explains which part of the riddle your guess doesn't fit, without spoiling the answer.
- Verified answers: every GM answer is checked against the cryptographic commitment the GM published before the riddle opened, so you can see the answer was never changed ("verified ✓").
- Streaks and score: solve today's riddle on consecutive days to grow your streak. If you've already solved the GM's latest riddle, Anna gives you a bonus riddle so your streak can still grow.
- Archive: replay up to 30 older GM riddles for points.
- GM's log: see what the agent decided each day: how many players solved the riddle, the reward it paid each winner and its treasury on the Base Sepolia testnet, the difficulty it picked for the next day (it aims for 30–50% of players winning), and its reasoning in its own words. Each decision links to its on-chain record.

If the GM's server can't be reached, the app shows the GM's riddles from your last visit, or a riddle from Anna, and you can retry at any time.

No wallet, no payments and no sign-up beyond Anna. Your progress is saved in your Anna account. GM Agent is open source.

**Tags:** game, puzzle, riddle, daily, brain teaser

**Screenshots:** `listing/1-today.png` … `listing/5-gm-log.png` (light theme, 2x), listed in `app.json` and uploaded to Anna's CDN by `apps sync-meta`. Don't link GitHub-hosted images: they don't load for some reviewers.
