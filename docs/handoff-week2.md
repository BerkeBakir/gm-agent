# Devir: Agentmaxxing 2. hafta (GM Agent v2)

Tarih: 14 Ekim 2026 · **Teslim: 16 Ekim** · Önceki devir: [handoff-week1.md](handoff-week1.md)

## Durum

Kod tamam: PR [#5](https://github.com/BerkeBakir/gm-agent/pull/5) (`week2-gmagent-v2` dalı). Typecheck, 79 test ve build geçiyor. **Main'e birleştirme kullanıcı onayı bekliyor**; Vercel main'e push edilince otomatik yayınlar.

| İş | Durum |
|---|---|
| A. Zorluk histerezisi kodda (`applyDifficultyHysteresis`, `src/gm/policy.ts`) | ✅ 10 test; Gemini simülasyonu: değişim 19-23 → 9, bantta gün 8-11 → 10-12, 0 fallback (`docs/experiments.md` "Week 2") |
| B. MCP sunucusu (`mcp/server.ts`, `src/mcp/tools.ts`) + ortak x402 istemcisi (`src/x402/client.ts`) | ✅ 4 araç: get_puzzle, submit_answer, get_results, get_my_wallet. Yerelde uçtan uca zincirde denendi (aşağıda) |
| Ekstra: canlıdaki kilitlenme | ✅ Kod düzeltildi; birleştirmeden sonra günü yeniden açmak gerekiyor (aşağıda) |
| C. README v2 | ✅ What's new, Agent canvas, Let other agents play, Week 2 sonuçları. `Week 2 (gmagent.v2): _video coming_` satırına video linki eklenecek |
| D. Video | ⏳ Kullanıcı çekecek (iskelet aşağıda) |
| E. 3 X gönderisi | ⏳ Taslaklar aşağıda |

## Canlıda bulunan hata (13-14 Ekim)

`/api/gm/run-day` Vercel'in 300 sn sınırına takıldı ("Task timed out after 300 seconds"). Fonksiyon 7. günü `closed` yaptıktan sonra Gemini çağrılarında (yazar 3 taslak + kör çözücü, zaman aşımı yok) öldü. Karar logu yazılmadı, 8. gün açılmadı ve o günden beri açık bilmece yok.

Düzeltme:
- her Gemini çağrısına 40 sn sınır (zaman aşımında sıradaki model),
- runDay'de karar için 90 sn, bilmece için 120 sn bütçe (aşılırsa kural tabanlı karar / bilmece bankası),
- açık bilmece yok ama geçmiş var ise "recovery": oyun son kararlaştırılan zorlukla yeniden açılır (arayüzde "Game reopened").

**Birleştirmeden sonra:** Vercel yayını bitince günü bir kez elle aç. Operator paneli veya:
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://gm-agent-lime.vercel.app/api/gm/run-day`

## Uçtan uca MCP denemesi (yerel, gerçek Base Sepolia)

MCP oyuncu cüzdanı `0xC4FDa997b90417c8A293cBCfced9954fD86F6D25`: anahtar `.mcp-player.json` (gitignore'lu), kasadan 0.5 USDC yüklendi.
get_puzzle → "sponge" cevabı → submit_answer ile 0.10 USDC x402 ödemesi ([tx](https://sepolia.basescan.org/tx/0xcb907bb54e5f1f49a26f4a7ba710736a1915458e8e79d9114078bdb35614eebe)) → ikinci deneme para alınmadan 409 → gün kapandı, kazanana 0.10 USDC ([tx](https://sepolia.basescan.org/tx/0x0efe773f6a7a4348c6155aec82b855188c2708d3bf2a259bd9eb990c5e097825)) → get_results'ta "← you".

Claude Code'a bağlamak için:
```
claude mcp add gm-agent -- npx tsx "D:/Claude Code/gm-agent/mcp/server.ts"
```
(Yerel sunucuya karşı denemek için başına `-e GM_AGENT_URL=http://localhost:3005` ekle.)

## D. Video iskeleti (~2 dk, İngilizce)

1. **Açılış (10 sn):** "GM Agent v2: what changed this week." Canlı sayfa.
2. **Deney → kural (35 sn):** experiments.md'deki tablo. "In week 1 Gemini flipped difficulty almost every day, even when the prompt said not to. So we moved the rule into code, next to the spending cap. Switches went from 23 to 9." Ardından karar logunda bir "blocked (hysteresis)" satırı.
3. **Yeni yetenek (50 sn):** Claude Code'da MCP bağlı. Komut: *"Get today's GM Agent puzzle, solve it, and submit your answer."* Ekranda get_puzzle → submit_answer → BaseScan linki. "Another AI agent just paid our agent, with its own wallet, via x402."
4. **Close day (15 sn):** Operator panelinden günü kapat → kazanan ödemesi, `get_results`'ta "← you".
5. **Kapanış (10 sn):** "LLM proposes, code enforces. Next week: smart-account treasury and an on-chain decision log."

Videodaki terimlerle eşleme (Rise In 2. hafta eğitimi): Agent Canvas (README tablosu), iyi araç açıklamaları (MCP araçları), "try/catch → return error text" (araçlar hata metni döner), "5 prompts, score it" (simülasyon), "testnet only / no uncapped wallet" (client fee limiti + SpendingGuard).

## E. X gönderi taslakları (@riseinweb3 etiketli, ≤280)

1. Week 2 of #Agentmaxxing: GM Agent v2 is live 🎲 Our sims showed Gemini flipped puzzle difficulty almost every day, even when the prompt said not to. Fix: the LLM proposes, code enforces a hysteresis rule. 23 switches → 9 in 30 days. @riseinweb3 https://gm-agent-lime.vercel.app
2. New in GM Agent v2: other AI agents can play 🤖💸 An MCP server gives Claude get_puzzle + submit_answer. It solved the riddle, paid the 0.10 USDC entry fee itself via x402 (gasless EIP-3009) on Base Sepolia, and our GM paid it back on-chain. @riseinweb3
3. What we learned this week: LLMs are good at judgment (how generous to be, explained in words) and bad at stateful rules. Anything that must always hold belongs in code: our spending cap, and now difficulty hysteresis. Experiments 👇 @riseinweb3 https://github.com/BerkeBakir/gm-agent

## Teslim adımları (kullanıcı)

1. PR #5'i birleştir → yayın bitince günü bir kez aç (yukarıdaki curl).
2. Videoyu çek, YouTube'a yükle → README'de `Week 2 (gmagent.v2)` satırına linki ekle.
3. 3 gönderiyi at (@GMAgentHQ) → bir gönderi linkini teslime ekle.
4. Rise In'e teslim: video + GitHub + gönderi linki, 16 Ekim'e kadar.
5. Eğitimdeki ek adım: Rise In'in Google formuna cüzdan adresini yaz (faucet için).

## Kapsam dışı (3. hafta)

ZK cevap taahhüdü, sponsorlu ödül havuzu, karar logunu zincire sabitleme, smart-account / delegation ile harcama limiti.
