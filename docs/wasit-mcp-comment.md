## Follow-up: same checks through the MCP server (`@wasit-dev/server`)

**Recording:** https://youtu.be/ehdTSoRqbj0 (52 s, subtitled; personal details blurred)

### What I did
Windows 11, PowerShell 5.1, Claude Code 2.1.183, Node 24. Same target as before: GM Agent running locally (in-memory store, no on-chain writes), a puzzle open, `POST /api/submit`.

```
claude mcp add --transport stdio wasit '--' cmd /c npx -y @wasit-dev/server
```

No env vars, no keys, no wallet. Then I asked Claude Code: *"Run wasit_x402_test against http://localhost:3000/api/submit with method POST, body {"answer":"test"}, network eip155:84532. Read-only checks only, do not pay anything."*

### Result
X402-01, 03, 04 PASS; X402-02, 05 FAIL. That is identical to the CLI run, so the claim that "an agent's run and a CLI run can never disagree" held for me. Claude called the tool with `readOnly: true`, finished in about 11 s, and turned the Fix lines into a short "what to change for v2" summary. Nothing was paid.

### What went wrong or was confusing (Windows)
1. **The documented `claude mcp add … -- npx -y @wasit-dev/server` fails in PowerShell 5.1** with `error: unknown option '-y'`. PowerShell swallows the bare `--`, so `-y` reaches `claude` instead of `npx`. Quoting it (`'--'`) fixes this.
2. **On native Windows, Claude Code needs `cmd /c` in front of `npx`** for stdio servers. The guide has no Windows snippet. A one-line note with `'--' cmd /c npx -y @wasit-dev/server` would have saved me both mistakes.
3. **Running `npx -y @wasit-dev/server` by hand gives no output.** I ran it once to pre-download the package before recording. It waits silently on stdin, and the commands I typed next went into the server instead of the shell. A single stderr line such as "wasit MCP server ready on stdio (Ctrl+C to exit)" would make this obvious.
4. **Which checks the tool covers is described differently in two places.** The README tools table says `wasit_x402_test` runs X402-01–07. The tool description Claude showed me in the permission prompt says X402-01..10.
5. **`readOnly` is not documented.** The README lists the optional `method`, `body`, `headers` and `rpcUrl` parameters. Claude found and used `readOnly` from the schema, but a human reading the docs wouldn't know it exists. Since this is the safe way to try Wasit without keys, I'd put it first.
6. **Why the payment checks were skipped isn't stated.** The summary said "Payment checks (X402-06-10) were skipped as requested". In my case they would also have been skipped because the challenge is v1. Stating the actual reason (read-only, no payer key, or v1) would help.

### What worked well
- The permission prompt showed the full tool description: what settles real payments, the testnet-only warning, and the X402-10 wait time. I knew exactly what I was approving.
- Read-only mode worked with zero configuration, as you said.
- The structured result meant Claude summarised the two FAILs correctly, without me pasting any output.

### Would I use it again?
Yes. For an agent-built project like GM Agent, asking the coding agent to "check my x402 endpoint" is more natural than leaving it for the CLI. With a Windows snippet in the guide, the setup would take under a minute.
