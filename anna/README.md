# GM Daily Riddle — Anna Edition

A free, wallet-free version of GM Agent for the [Anna](https://anna.partners) app store. It plays the GM's most recently **closed** riddle (never the live paid one), adds up to 3 AI hints and a "Why was I wrong?" comment through Anna's `llm.complete`, and keeps a personal streak in Anna `storage`.

## Layout
- `src/`: TypeScript modules. Rules live in tested modules: `progress`, `hints`, `puzzle-source`, `answer-check`, `anna-host`. `ui.ts` / `main.ts` are DOM glue.
- `bundle/`: static files Anna serves. `app.js` is built from `src/main.ts` (git-ignored).
- `manifest.json` / `app.json`: Anna manifest and listing basics.
- Server side: `GET /api/anna/archive` in the main app (closed puzzles only). `?as=text` sends the same JSON as `text/plain` for Anna's `web.fetch`.

## Networks that block `*.vercel.app`
The app first fetches the archive directly. If that request fails (some networks block `*.vercel.app`), it asks Anna's server to fetch `…/api/anna/archive?as=text` with `anna.web.fetch` (Anna's server can still reach the host). This needs `ui.host_api.web: ["fetch"]` in the manifest and the user's web grant: the first call returns `APP_NOT_GRANTED` and Anna shows a consent card; after the user allows it, Retry loads the puzzles. Each `web.fetch` uses 1 CU of the user's Anna quota, so it only runs when the direct request fails. If both fail, the app uses the last saved archive, then an Anna/bank puzzle.

## Commands (from the repo root)
```bash
npm run anna:build      # bundle src → bundle/app.js
npm run anna:validate   # build + anna-app validate --strict
npm run anna:dev        # build + local Anna harness (LLM disabled)
npm run anna:dev:llm    # same, with Anna's real LLM (needs `login`)
npm run anna:dev:web    # same, plus Anna's real web.fetch (1 CU per call)
npx vitest run anna/test
```

## Publish (Berke)
```bash
npm run anna:validate   # from the repo root; builds app.js
cd anna
npx -y @anna-ai/cli@latest login --host https://anna.partners
npx -y @anna-ai/cli@latest apps push --bundle-dir bundle
npx -y @anna-ai/cli@latest apps sync-meta   # description + screenshots from app.json
npx -y @anna-ai/cli@latest apps cut <version>   # e.g. 0.1.3; freezes the pushed draft
npx -y @anna-ai/cli@latest apps submit-review gm-daily-riddle
```
Review takes 3–5 business days; approval publishes right away. Don't cut a new version while one is in review unless you mean to replace it (`submit-review` re-pins the review to the newest version).

## Changelog
- **Unreleased** — If the direct request fails, the app loads the archive through Anna's `web.fetch` (manifest declares `ui.host_api.web: ["fetch"]`); the offline note tells users to allow web access and tap Retry. Ship after 0.1.2's review.
- **0.1.2** — Uses only the project's own host (`gm-agent-lime.vercel.app`); the `gm.notvia.app` mirror from 0.1.1 was attached to an unrelated project by mistake and is removed.
- **0.1.1** — Review fixes: the app tries `gm.notvia.app` (removed in 0.1.2) before `*.vercel.app`, keeps the last archive for offline use, and shows a softer note with Retry. New "GM's log" tab with the GM's daily decisions and reasoning; the "real USDC prizes" footer is gone. Longer listing description and screenshots uploaded from `listing/`. Also: if the newest GM puzzle was solved on an earlier day, today's streak puzzle is a bonus from Anna (the GM puzzle moves to the archive). Manifest declares `permissions` (llm.complete, storage.read/write). The Archive tab, not Today, is highlighted while an archive puzzle is open.
- **0.1.0** — First release.
