# Week 2 video: one source for the shot list (Markdown) and the subtitles (SRT).
import pathlib

# (start_s, end_s, what to show on screen [TR], subtitle [EN])
SHOTS = [
    # 1. Açılış
    (0, 4, "Canlı site, sayfanın en üstü (GM AGENT başlığı + bugünün bilmecesi). Fare hareketsiz.",
     "GM Agent v2 · Week 2 of #Agentmaxxing"),
    (4, 9, "Aynı ekran, yavaşça aşağı kaydırıp Treasury kutusunu göster.",
     "An AI game master that runs a daily puzzle game\nand manages its own USDC treasury."),
    (9, 15, "Karar loguna (Decision log) kaydır: 'Game reopened' ve 'Day 6 closed' satırları görünsün.",
     "Every day it writes a puzzle, collects 0.10 USDC entry fees via x402,\npays winners on-chain and logs why."),
    # 2. Deney → kural
    (15, 21, "GitHub'da docs/experiments.md → 'Week 2 (v2): hysteresis enforced in code' başlığı.",
     "Last week our simulations found a problem:"),
    (21, 27, "Aynı sayfada week-1 Gemini tablosundaki 'Difficulty switches' sütunu (23, 22, 19). Fareyle üzerinden geç.",
     "Gemini changed the puzzle difficulty almost every day,\neven when the prompt told it not to."),
    (27, 33, "src/gm/policy.ts → applyDifficultyHysteresis fonksiyonunun yorum bloğu.",
     "So we moved the rule into code,\nright next to the spending cap."),
    (33, 39, "Kodda 'FAR_FROM_BAND' ve 'persistent' satırları (fareyle işaretle).",
     "Difficulty may only change if the win rate is far off target,\nor off target two days in a row."),
    (39, 46, "experiments.md'deki week-2 tablosu: '23 → 9' satırları.",
     "Result: difficulty switches went from 23 to 9 in 30 days,\nand more days in the target win-rate band."),
    (46, 51, "Tablonun altındaki örnek log satırı: 'blocked (hysteresis): win rate 40% is inside the target band'.",
     "The LLM proposes. The code enforces.\nEvery blocked proposal is in the public log."),
    # 3. Yeni yetenek: MCP
    (51, 56, "Terminal: Claude Code açık. Önce /mcp yazıp 'gm-agent · connected' satırını göster.",
     "New in v2: other AI agents can play."),
    (56, 62, "Prompt'u yaz (aşağıda) ve Enter. Ekranda 'get_my_wallet' çağrısı görünsün.",
     "Claude connects to GM Agent through an MCP server\nand checks its own wallet."),
    (62, 69, "'get_puzzle' çağrısı ve dönen bilmece metni.",
     "It reads today's puzzle…"),
    (69, 76, "Claude'un cevabı düşündüğü/yazdığı kısım, ardından 'submit_answer' çağrısı.",
     "…solves it, and submits its answer."),
    (76, 84, "submit_answer sonucu: 'Paid 0.10 USDC entry fee: https://sepolia.basescan.org/tx/…' satırını işaretle.",
     "To submit, it pays the 0.10 USDC entry fee itself via x402:\na gasless signature from its own wallet."),
    (84, 91, "BaseScan linkine tıkla → işlem sayfası (Success, USDC transfer 0.1).",
     "Settled on-chain on Base Sepolia.\nNo human clicked “pay”: an agent just paid another agent."),
    # 4. Günü kapat
    (91, 97, "Canlı site → Operator paneli → token ile 'Close day' (run-day). Bekleme kısmını kesebilirsin.",
     "At the end of the day the GM closes the round:"),
    (97, 104, "Yeni karar logu satırı: Gemini'nin gerekçesi + 'Paid … USDC' + tx linki.",
     "Gemini decides the reward, the guardrails check it,\nand the winner is paid in USDC."),
    (104, 110, "Terminale dön, 'Did I win? Check the results.' yaz → get_results çıktısında '← you' satırı.",
     "And the player agent can check its own result."),
    # 5. Kapanış
    (110, 116, "README'nin 'What's new in v2' bölümü.",
     "Also new: the daily loop can't hang anymore:\ntimeouts, fallbacks and self-recovery."),
    (116, 122, "README'nin en üstü (logo) veya canlı site. Son kare 1-2 sn sabit kalsın.",
     "Next week: a smart-account treasury and an on-chain decision log.\ngithub.com/BerkeBakir/gm-agent · @GMAgentHQ"),
]

PROMPT = "Use the gm-agent tools: check my wallet, get today's GM Agent puzzle, solve it, and submit your answer."


def ts(sec: float) -> str:
    return f"00:{int(sec)//60:02d}:{int(sec)%60:02d},000"


def mmss(sec: int) -> str:
    return f"{sec//60}:{sec%60:02d}"


out = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week2-x")
srt = "\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{sub}\n" for i, (a, b, _, sub) in enumerate(SHOTS, 1))
(out / "week2-subtitles.srt").write_text(srt, encoding="utf8")

rows = "\n".join(f"| {mmss(a)}–{mmss(b)} | {b-a} sn | {shot} | {sub.replace(chr(10), ' ')} |" for a, b, shot, sub in SHOTS)
md = f"""# GM Agent v2 — Hafta 2 videosu (sessiz, altyazılı) · ~2:02

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
{PROMPT}
```

## Sahne sahne

| Zaman | Süre | Ekranda ne var (sen çekersin) | Altyazı (EN) |
|---|---|---|---|
{rows}

## İpuçları

- Bekleme anlarını (Claude düşünürken, işlem onaylanırken, gün kapanırken) kes ya da 2x hızlandır. Altyazı süresi yetmezse sahneyi uzatıp SRT'yi kaydır.
- Claude bilmeceyi yanlış cevaplarsa sorun değil: 104–110 sn'deki altyazıyı "The player agent can check its own result: no win today, but the fee is in the treasury." yap ve '← you' yerine sonucu göster.
- Kapanış kartı için masaüstündeki `post-w2-1-hysteresis.png` görselini son 2 saniyeye koyabilirsin.
- YouTube başlığı: **GM Agent v2 — AI agents that pay each other (Agentmaxxing Week 2)**
- Açıklama: "Week 2 of #Agentmaxxing by @riseinweb3. Difficulty hysteresis enforced in code (23 → 9 switches), and other AI agents can now play via MCP, paying the entry fee themselves with x402 on Base Sepolia. Live: https://gm-agent-lime.vercel.app · Code: https://github.com/BerkeBakir/gm-agent"
"""
(out / "week2-video-senaryo.md").write_text(md, encoding="utf8")
pathlib.Path(r"D:\Claude Code\gm-agent\docs\video-week2.md").write_text(md, encoding="utf8")
print("ok", len(SHOTS), "shots,", SHOTS[-1][1], "s")
