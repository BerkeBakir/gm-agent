# Week 3 video: one source for the shot list (Markdown) and the subtitles (SRT).
import pathlib

# (start_s, end_s, what to show on screen [TR], subtitle [EN])
SHOTS = [
    # 1. Açılış
    (0, 4, "Canlı site, sayfanın en üstü (GM AGENT başlığı + bugünün bilmecesi). Fare hareketsiz.",
     "GM Agent v3 · Week 3 of #Agentmaxxing"),
    (4, 10, "Yavaşça aşağı kaydırıp 01 TREASURY kutusunu ortala.",
     "This week's theme: give your agent a wallet.\nWe gave it a wallet it can't empty."),
    # 2. Problem → çözüm
    (10, 17, "Treasury kutusunda 'SMART ACCOUNT 0xD020…' satırının üzerine fareyle gel.",
     "Until now the USDC sat on one private key in a server env var.\nThe spending caps existed only in our code."),
    (17, 24, "Aynı kutuda 'METAMASK DELEGATION' etiketi ve açıklama metni (fareyle altını çiz).",
     "In v3 the treasury is a MetaMask smart account.\nThe agent's key holds no money, it only pays gas."),
    (24, 31, "GitHub'da treasury/delegation.json dosyası: 'dailyLimit': '5000000' ve 'periodDuration': 86400 satırları.",
     "The owner signed one delegation for the agent:\nUSDC only, at most 5 USDC per 24 hours."),
    (31, 37, "Treasury kutusundaki ON-CHAIN LIMIT çubuğu ve 'x USDC left today' yazısı.",
     "That limit is enforced by a contract on Base Sepolia,\nnot by our code. The page reads it live."),
    # 3. Demo: limiti aşmaya çalış
    (37, 42, "PowerShell (büyük yazı): `npm run treasury:demo -- --send` yaz, Enter. İlk 3 satır görünsün.",
     "Let's try to break it."),
    (42, 49, "'✅ 0.01 USDC payout through the delegation' satırı ve altındaki 'Available now'.",
     "A normal payout goes through the delegation\nand today's allowance goes down."),
    (49, 55, "'Trying X USDC (1 USDC more than the delegation allows today)...' satırı.",
     "Now the agent tries to pay 1 USDC more\nthan the contract allows today…"),
    (55, 62, "'⛔ Refused on-chain: … ERC20PeriodTransferEnforcer:transfer-amount-exceeded' satırını fareyle işaretle.",
     "…and the chain refuses it:\nERC20PeriodTransferEnforcer: transfer-amount-exceeded."),
    (62, 70, "'Broadcast anyway → status: reverted' linkine tıkla → BaseScan'de kırmızı 'Fail' işlem sayfası.",
     "Even sent on purpose, the transaction reverts.\nA leaked key or a rogue LLM can't drain the treasury."),
    (70, 76, "Siteye dön: Treasury kutusundaki 'In code: max 2.00 USDC per winner, 10% per day' cümlesi.",
     "Two layers now: the code caps each winner,\nthe contract caps each day."),
    (76, 82, "BaseScan'de owner çekim işlemi (aşağıdaki link 3): 'Success' ve USDC transferi.",
     "And the human owner keeps control:\nfunds can always be pulled out, no bundler needed."),
    # 4. Doğrulanabilir oyun
    (82, 89, "Siteye dön, en üst: bilmecenin altındaki 'Answer committed: 0x… · salt revealed when the day closes'.",
     "New: every puzzle commits to its answer\nbefore anyone plays."),
    (89, 95, "Aşağıda 06 PAST PUZZLES: 'Commitment 0x… · verified ✓' satırı.",
     "When the day closes the salt is revealed,\nso anyone can check the GM never changed the answer."),
    (95, 101, "04 DECISION LOG: en üstteki kayıtta 'ANCHORED ON BASE · 0x…' linki (fareyle işaretle).",
     "And every day's decision is anchored on-chain…"),
    (101, 108, "Linke tıkla → BaseScan işlem sayfası → 'More details' → Input Data (0x474d5633… ile başlıyor).",
     "…a transaction whose data is the hash of the decision log\nand the next answer commitment. Tamper-evident accounting."),
    # 5. Kapanış
    (108, 114, "GitHub README: 'What's new in v3 (Week 3)' bölümü.",
     "Entry fees via x402 now land straight in the smart account.\nAll code and transactions are public."),
    (114, 120, "README'nin en üstü (logo). Son kare 1-2 sn sabit kalsın.",
     "GM Agent v3 · github.com/BerkeBakir/gm-agent · @GMAgentHQ"),
]

LINKS = [
    ("Canlı site", "https://gm-agent-lime.vercel.app"),
    ("delegation.json", "https://github.com/BerkeBakir/gm-agent/blob/main/treasury/delegation.json"),
    ("Owner çekim işlemi", "https://sepolia.basescan.org/tx/0xf56971883dfb83a2beb7c077f80b0d3ad2ddce93a6f7e7535db22e028561caf6"),
    ("README", "https://github.com/BerkeBakir/gm-agent#readme"),
]


def ts(sec: float) -> str:
    return f"00:{int(sec)//60:02d}:{int(sec)%60:02d},000"


def mmss(sec: int) -> str:
    return f"{sec//60}:{sec%60:02d}"


out = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week3-x")
out.mkdir(parents=True, exist_ok=True)
srt = "\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{sub}\n" for i, (a, b, _, sub) in enumerate(SHOTS, 1))
(out / "week3-subtitles.srt").write_text(srt, encoding="utf8")

rows = "\n".join(f"| {mmss(a)}–{mmss(b)} | {b-a} sn | {shot} | {sub.replace(chr(10), ' ')} |" for a, b, shot, sub in SHOTS)
links = "\n".join(f"{i}. {name}: {url}" for i, (name, url) in enumerate(LINKS, 1))
md = f"""# GM Agent v3 — Hafta 3 videosu (sessiz, altyazılı) · ~2:00

Altyazılar İngilizce; kesip altyazıyı ben gömeceğim. Sen sadece sahneleri **sırayla ve her birini biraz uzun** çek (sahne başına +2-3 sn fazlası iyi, kırparım). Konuşma gerekmez.

## Çekimden önce (5 dk)

1. **Gün:** **18 Ekim Pazar, TR 15:00'ten sonra** çek (günlük kapanış 12:00 UTC = TR 15:00). İlk taahhütlü bilmece 17 Ekim'de açılıyor ve salt'ı ancak 18 Ekim kapanışında açılıyor; "verified ✓" ilk kez o zaman görünür. O saatte bilmecede "Answer committed", geçmiş bilmecelerde "verified ✓" ve karar logunda "Anchored on Base" hepsi görünür. Önce sayfayı yenile ve üçünü kontrol et; eksik varsa bana yaz.
2. **Terminal:** PowerShell'i `D:\\Claude Code\\gm-agent` klasöründe aç (Masaüstü'ndeki kopyada owner/delegation dosyaları yok). Yazıyı büyüt (Ctrl + fare tekerleği). Komutu çekimden önce DENEME, her çalıştırma gerçek işlem gönderir; çekimde bir kez çalıştır (birkaç sn sürer, bekleme kısmını keserim).
   Komut: `npm run treasury:demo -- --send`
3. **Tarayıcı sekmeleri** (bu sırayla):
{links}
4. Ekran kaydı: NVIDIA ile tam ekran, 1080p yeterli. Bildirimleri kapat.

## Sahne listesi

| Zaman | Süre | Ekranda ne var | Altyazı (EN) |
|---|---|---|---|
{rows}

## Sonra

Kaydı `C:\\Users\\Monster\\Videos\\NVIDIA\\Desktop` klasörüne düşer; bana "çektim" yaz. Ben keserim, altyazıyı gömerim ve `gm-agent-week3.mp4` olarak Masaüstü'ndeki `gm-agent-week3-x` klasörüne koyarım. Sen YouTube'a (liste dışı/herkese açık) yükleyip linki atarsın. README, X gönderileri ve teslim metnini ben hazırlarım.
"""
(out / "week3-video-senaryo.md").write_text(md, encoding="utf8")
print(out)
