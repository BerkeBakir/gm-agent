# GM Daily Riddle — Anna Edition

A free, wallet-free version of GM Agent for the [Anna](https://anna.partners) app store. It plays the GM's most recently **closed** riddle (never the live paid one), adds up to 3 AI hints and a "Why was I wrong?" comment through Anna's `llm.complete`, and keeps a personal streak in Anna `storage`.

## Layout
- `src/`: TypeScript modules. Rules live in tested modules: `progress`, `hints`, `puzzle-source`, `answer-check`, `anna-host`. `ui.ts` / `main.ts` are DOM glue.
- `bundle/`: static files Anna serves. `app.js` is built from `src/main.ts` (git-ignored).
- `manifest.json` / `app.json`: Anna manifest and listing basics.
- Server side: `GET /api/anna/archive` in the main app (closed puzzles only).

## Commands (from the repo root)
```bash
npm run anna:build      # bundle src → bundle/app.js
npm run anna:validate   # build + anna-app validate --strict
npm run anna:dev        # build + local Anna harness (LLM disabled)
npx vitest run anna/test
```

## Publish (Berke)
```bash
npm run anna:validate   # from the repo root; builds app.js
cd anna
npx -y @anna-ai/cli@latest login --host https://anna.partners
npx -y @anna-ai/cli@latest apps push --bundle-dir bundle
```
Then submit the version for review in the Developer Console. Review takes 3–5 business days.
