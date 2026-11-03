# Reply to Anna review feedback (3 Nov 2026) — draft, not sent

Subject: Re: GM Daily Riddle App Review Feedback

Hi Anna Developer Team,

Thank you for the review and the screenshots. I've addressed both points in v0.1.1:

1. Listing description: the listing now has a full description of every feature (daily riddle, hints, "Why was I wrong?", verified answers, streaks with a bonus riddle, archive and the new GM's log), plus five updated screenshots uploaded to Anna directly.

2. Offline status: the app loads the GM's riddles from our server, which was hosted on a *.vercel.app address. That domain can't be reached from some networks, so the app fell back to a riddle from Anna and showed "The GM is offline". The app now uses a custom domain first, keeps the last loaded riddles so it still works if the network drops, and shows a clearer message with a Retry button.

   Agent features: I added a "GM's log" tab that shows what the agent does on GitHub every day: how many players solved the riddle, the reward it paid and its treasury on the Base Sepolia testnet, the difficulty it chose for the next day and its reasoning, with a link to each decision's on-chain record. I also removed the "Want real USDC prizes?" link so the app stays self-contained. The paid on-chain part (entry fees and USDC payouts) stays on the testnet version, since this edition is free and has no wallet.

I've tested the changes in the Anna dev harness and resubmitted. Please let me know if anything else needs work.

Best,
Berke
