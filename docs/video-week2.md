# GM Agent v2 — Hafta 2 videosu (sessiz, altyazılı) · ~2:02

Altyazılar İngilizce (Rise In değerlendirmesi İngilizce). Hazır SRT: `week2-subtitles.srt`; editörde (CapCut, Clipchamp vb.) "altyazı içe aktar" ile ekle. Sahne sürelerini değiştirirsen SRT'deki zamanları da kaydır.

## Çekimden önce (5 dk)

1. **MCP'yi bağla** (bir kez, terminalde):
   `claude mcp add -s user gm-agent -- node "D:/Claude Code/gm-agent/node_modules/tsx/dist/cli.mjs" "D:/Claude Code/gm-agent/mcp/server.ts"`
   `claude mcp list` → **✓ Connected**. Çekimde Claude Code'u `D:\Claude Code\gm-agent` içinde aç.
2. **Canlı bilmeceyi videodan önce CEVAPLAMA.** Her cüzdan günde bir kez cevap verebilir; MCP oyuncu cüzdanı bugün canlıda henüz oynamadı. Bakiye 0.50 USDC (her oyun 0.10).
3. Tarayıcıda sekmeleri hazırla: canlı site · GitHub `docs/experiments.md` · GitHub `src/gm/policy.ts` · README.
4. Operator paneli için `CRON_SECRET` token'ını hazır tut (.env'de).
5. Ekran kaydı 1080p, tarayıcı yakınlaştırması %110-125 (yazılar okunsun). Terminal yazı boyutunu büyüt.

**Claude Code'a yazılacak prompt:**
```
Use the gm-agent tools: check my wallet, get today's GM Agent puzzle, solve it, and submit your answer.
```

## Sahne sahne

| Zaman | Süre | Ekranda ne var (sen çekersin) | Altyazı (EN) |
|---|---|---|---|
| 0:00–0:04 | 4 sn | Canlı site, sayfanın en üstü (GM AGENT başlığı + bugünün bilmecesi). Fare hareketsiz. | GM Agent v2 · Week 2 of #Agentmaxxing |
| 0:04–0:09 | 5 sn | Aynı ekran, yavaşça aşağı kaydırıp Treasury kutusunu göster. | An AI game master that runs a daily puzzle game and manages its own USDC treasury. |
| 0:09–0:15 | 6 sn | Karar loguna (Decision log) kaydır: 'Game reopened' ve 'Day 6 closed' satırları görünsün. | Every day it writes a puzzle, collects 0.10 USDC entry fees via x402, pays winners on-chain and logs why. |
| 0:15–0:21 | 6 sn | GitHub'da docs/experiments.md → 'Week 2 (v2): hysteresis enforced in code' başlığı. | Last week our simulations found a problem: |
| 0:21–0:27 | 6 sn | Aynı sayfada week-1 Gemini tablosundaki 'Difficulty switches' sütunu (23, 22, 19). Fareyle üzerinden geç. | Gemini changed the puzzle difficulty almost every day, even when the prompt told it not to. |
| 0:27–0:33 | 6 sn | src/gm/policy.ts → applyDifficultyHysteresis fonksiyonunun yorum bloğu. | So we moved the rule into code, right next to the spending cap. |
| 0:33–0:39 | 6 sn | Kodda 'FAR_FROM_BAND' ve 'persistent' satırları (fareyle işaretle). | Difficulty may only change if the win rate is far off target, or off target two days in a row. |
| 0:39–0:46 | 7 sn | experiments.md'deki week-2 tablosu: '23 → 9' satırları. | Result: difficulty switches went from 23 to 9 in 30 days, and more days in the target win-rate band. |
| 0:46–0:51 | 5 sn | Tablonun altındaki örnek log satırı: 'blocked (hysteresis): win rate 40% is inside the target band'. | The LLM proposes. The code enforces. Every blocked proposal is in the public log. |
| 0:51–0:56 | 5 sn | Terminal: Claude Code açık. Önce /mcp yazıp 'gm-agent · connected' satırını göster. | New in v2: other AI agents can play. |
| 0:56–1:02 | 6 sn | Prompt'u yaz (aşağıda) ve Enter. Ekranda 'get_my_wallet' çağrısı görünsün. | Claude connects to GM Agent through an MCP server and checks its own wallet. |
| 1:02–1:09 | 7 sn | 'get_puzzle' çağrısı ve dönen bilmece metni. | It reads today's puzzle… |
| 1:09–1:16 | 7 sn | Claude'un cevabı düşündüğü/yazdığı kısım, ardından 'submit_answer' çağrısı. | …solves it, and submits its answer. |
| 1:16–1:24 | 8 sn | submit_answer sonucu: 'Paid 0.10 USDC entry fee: https://sepolia.basescan.org/tx/…' satırını işaretle. | To submit, it pays the 0.10 USDC entry fee itself via x402: a gasless signature from its own wallet. |
| 1:24–1:31 | 7 sn | BaseScan linkine tıkla → işlem sayfası (Success, USDC transfer 0.1). | Settled on-chain on Base Sepolia. No human clicked “pay”: an agent just paid another agent. |
| 1:31–1:37 | 6 sn | Canlı site → Operator paneli → token ile 'Close day' (run-day). Bekleme kısmını kesebilirsin. | At the end of the day the GM closes the round: |
| 1:37–1:44 | 7 sn | Yeni karar logu satırı: Gemini'nin gerekçesi + 'Paid … USDC' + tx linki. | Gemini decides the reward, the guardrails check it, and the winner is paid in USDC. |
| 1:44–1:50 | 6 sn | Terminale dön, 'Did I win? Check the results.' yaz → get_results çıktısında '← you' satırı. | And the player agent can check its own result. |
| 1:50–1:56 | 6 sn | README'nin 'What's new in v2' bölümü. | Also new: the daily loop can't hang anymore: timeouts, fallbacks and self-recovery. |
| 1:56–2:02 | 6 sn | README'nin en üstü (logo) veya canlı site. Son kare 1-2 sn sabit kalsın. | Next week: a smart-account treasury and an on-chain decision log. github.com/BerkeBakir/gm-agent · @GMAgentHQ |

## İpuçları

- Bekleme anlarını (Claude düşünürken, işlem onaylanırken, gün kapanırken) kes ya da 2x hızlandır. Altyazı süresi yetmezse sahneyi uzatıp SRT'yi kaydır.
- Claude bilmeceyi yanlış cevaplarsa sorun değil: 104–110 sn'deki altyazıyı "The player agent can check its own result: no win today, but the fee is in the treasury." yap ve '← you' yerine sonucu göster.
- Kapanış kartı için masaüstündeki `post-w2-1-hysteresis.png` görselini son 2 saniyeye koyabilirsin.
- YouTube başlığı: **GM Agent v2 — AI agents that pay each other (Agentmaxxing Week 2)**
- Açıklama: "Week 2 of #Agentmaxxing by @riseinweb3. Difficulty hysteresis enforced in code (23 → 9 switches), and other AI agents can now play via MCP, paying the entry fee themselves with x402 on Base Sepolia. Live: https://gm-agent-lime.vercel.app · Code: https://github.com/BerkeBakir/gm-agent"
