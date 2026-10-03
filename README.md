# GM Agent

An autonomous AI game master with its own wallet. It runs a small daily puzzle game, evaluates players, rebalances difficulty and pays rewards from its own treasury on Base Sepolia — without draining it.

Built for **Agentmaxxing** (Rise In, October 2026). Work in progress.

## Status

- [x] Week 0: wallet abstraction (`Wallet`, `MockWallet`), `SpendingGuard`, USDC helpers
- [ ] Week 1: agent skeleton, `create_challenge`
- [ ] Week 2: game loop, evaluation, difficulty tuning, decision log, simulations
- [ ] Week 3: `BaseSepoliaWallet`, on-chain rewards, x402 entry fee
- [ ] Week 4: polish, docs, demo video

## Development

```bash
npm install
npm test
npm run typecheck
```

Copy `.env.example` to `.env`. **Testnet only. Never commit `.env`.**

## Design

See [docs/proje-gm-agent.md](docs/proje-gm-agent.md) (Turkish).

Key ideas:
- All money is testnet **USDC** in 6-decimal `bigint` base units — income (x402) and expenses (rewards) share one unit.
- Every payment passes through `SpendingGuard`: hard per-tx and daily (10% of treasury) limits enforced in code; the LLM decides only within them.
- Simulations run off-chain on `MockWallet`; the same code switches to the real wallet in week 3.
