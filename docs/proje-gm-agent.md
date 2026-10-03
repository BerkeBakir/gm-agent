# GM Agent: Kendi Hazinesini Yöneten AI Oyun Yöneticisi

> Çalışma adı. Agentmaxxing (Rise In, Ekim 2026) için proje dokümanı.

## 1. Tek Cümlelik Özet

Küçük bir oyunu insan müdahalesi olmadan yöneten bir AI agent'ı: her gün görev üretir, oyuncuları değerlendirir, zorluğu ayarlar ve Base Sepolia üzerindeki kendi cüzdanından ödül dağıtır. Bunu yaparken hazinesini tüketmeden oyunu yaşatmak zorundadır.

## 2. Problem ve Motivasyon

- Küçük oyunlar ve topluluk etkinlikleri sürekli bir insan operatöre ihtiyaç duyar: içerik üretmek, kazananı seçmek, ödül dağıtmak.
- Bir agent'ın sadece soru cevaplaması değil, **kısıtlı bir bütçeyle gerçek ekonomik kararlar alması** ilginç bir deney alanı.
- Kişisel motivasyon: uzun vadede bir oyun stüdyosu kurmak. Bu proje, oyun ekonomisi ve otonom oyun yönetimi üzerine somut bir deney.

## 3. Temel Fikir: Ekonomik Gerilim

Agent'ın iki çelişen hedefi var:

| Fazla cömert olursa | Fazla cimri olursa |
|---|---|
| Hazine hızla tükenir | Oyuncular ilgisini kaybeder |
| Oyun para bittiği için durur | Giriş ücreti gelirleri düşer |

Agent her gün bu dengeyi kurmak zorunda. Projeyi sıradan bir sohbet botundan ayıran şey bu karar döngüsü.

## 4. Oyun Tasarımı (Bilinçli Olarak Basit)

- **Tür:** Günlük bilmece/challenge. Örneğin bir bilmece, kelime tahmini, mantık sorusu veya küçük bir kodlama sorusu.
- **Akış:**
  1. Agent günün görevini üretir ve yayınlar. **Doğru cevap (cevap anahtarı) görevle birlikte veritabanına yazılır**, oyunculara gösterilmez.
  2. Oyuncular (isteğe bağlı olarak x402 ile küçük bir giriş ücreti ödeyip) cevap gönderir. **Her cüzdan bir görev için yalnızca bir cevap gönderebilir.**
  3. Süre dolunca cevaplar cevap anahtarıyla **deterministik olarak** karşılaştırılır (normalize edilmiş metin eşleşmesi) ve kazananlar seçilir. LLM yalnızca serbest metinli cevaplarda yardımcı değerlendirici olarak kullanılır.
  4. Agent ödül miktarına karar verir ve ödemeyi gönderir.
  5. Agent kararlarını gerekçeleriyle birlikte loglar.
- **Neden basit:** Puanın %30'u "çalışıyor mu" sorusundan geliyor. Oyun mekaniğine harcanan her saat agent'tan çalınmış bir saat demek.

## 5. Mimari

```
                ┌───────────────────────────────┐
                │           GM Agent            │
                │  (LLM + talimatlar + hafıza)  │
                └──────────────┬────────────────┘
                               │ araç çağrıları
   ┌───────────────┬───────────┼─────────────┬──────────────────┐
   ▼               ▼           ▼             ▼                  ▼
create_challenge read_submissions get_balance send_reward    log_decision
   │               │           │             │                  │
   ▼               ▼           ▼             ▼                  ▼
 Oyun DB /      Oyun DB /   Agent cüzdanı  Agent cüzdanı →    Karar logu
 web sayfası    web sayfası (Base Sepolia) oyuncu cüzdanı     (JSON/DB)
                                           (Base Sepolia)
                               ▲
                               │ x402 giriş ücreti
                         ┌─────┴─────┐
                         │ Oyuncular │
                         └───────────┘
```

### Bileşenler

| Bileşen | Görev |
|---|---|
| **Agent çekirdeği** | LLM, sistem talimatları, kısa hafıza (son günlerin özeti, hazine trendi) |
| **Araçlar (tools)** | Agent'ın dünyayla etkileşimi; aşağıdaki tabloya bakın |
| **Oyun backend'i** | Görevleri ve cevapları tutan basit bir API ve veritabanı (SQLite yeterli) |
| **Web sayfası** | Günün görevi, cevap formu, liderlik tablosu, hazine bakiyesi, karar logu |
| **Cüzdan** | Agent'a ait Base Sepolia cüzdanı (Coinbase AgentKit veya benzeri). Kod `Wallet` arayüzüne bağlıdır: `MockWallet` (simülasyon/test) ve `BaseSepoliaWallet` (gerçek zincir) aynı arayüzü uygular |
| **Harcama koruması** | Tüm ödemeler `SpendingGuard`'dan geçer: işlem başına üst limit ve günlük "hazinenin en fazla %10'u" kuralı kodda katı sınırdır; LLM yalnızca bu sınırların içinde karar verir |
| **x402 katmanı** | Cevap gönderme endpoint'ini ücretli hale getirir; ödeme hazineye gider |
| **Zamanlayıcı** | Agent döngüsünü günde bir kez (demo için daha sık) tetikler |

### Agent Araçları

| Araç | Açıklama |
|---|---|
| `create_challenge(difficulty)` | Belirtilen zorlukta yeni görev üretir; soru ve cevap anahtarını birlikte kaydeder, soruyu yayınlar |
| `read_submissions(challenge_id)` | Gelen cevapları ve oyuncu adreslerini okur |
| `evaluate_answers(challenge_id)` | Cevapları cevap anahtarıyla deterministik karşılaştırır (gerekirse LLM yardımcı olur) |
| `get_treasury_balance()` | Cüzdan USDC bakiyesini on-chain olarak okur |
| `get_stats()` | Katılımcı sayısı, kazanma oranı, günlük gelir (giriş ücretleri) ve gider (ödüller), net akış trendi |
| `send_reward(address, amount)` | Kazanana testnet USDC gönderir (`SpendingGuard` limitlerine tabidir) |
| `log_decision(reason, data)` | Kararı ve gerekçesini kaydeder |

## 6. Agent Karar Döngüsü

```
1. Durumu oku     → bakiye, dünkü katılım, kazanma oranı, gelir/gider
2. Değerlendir    → dünkü görevin cevaplarını puanla
3. Ödül kararı    → hazine sağlığına göre ödül miktarını belirle
4. Öde            → kazananlara send_reward
5. Zorluk kararı  → kazanma oranı çok yüksekse zorlaştır, çok düşükse kolaylaştır
6. Yeni görev     → create_challenge
7. Logla          → tüm kararları gerekçeleriyle kaydet
```

### Örnek Karar Logu

```json
{
  "day": 6,
  "treasury_before": "42.00 USDC",
  "income_today": "0.90 USDC",
  "participants": 9,
  "win_rate": 0.78,
  "decisions": {
    "reward_per_winner": "0.50 USDC",
    "next_difficulty": "hard"
  },
  "reasoning": "Kazanma oranı %78 ile hedefin (%30-50) çok üstünde; görev fazla kolaydı. Hazine son 3 günde %20 azaldı, bu yüzden ödülü düşürüp zorluğu artırıyorum."
}
```

Bu log hem Experimentation kriteri hem de demo için projenin en güçlü kanıtı.

## 7. Kripto Entegrasyonu

- **Ağ:** Base Sepolia (programın ortak testnet'i)
- **Cüzdan:** Agent'a ait, araçlarla kontrol edilen bir cüzdan. Program 3. haftada önerilen araçları gösterecek; muhtemel aday Coinbase AgentKit.
- **Para birimi: tek birim, testnet USDC.** x402 Base Sepolia'da USDC ile çalışır; ödüller de USDC olunca gelir ve gider aynı birimde olur, gaz ücreti (ETH) hazine hesabına karışmaz. ETH yalnızca gaz için tutulur.
- **Ödüller:** Testnet USDC ile on-chain transferler. Her ödemenin işlem hash'i loglanır ve web sayfasında BaseScan linkiyle gösterilir.
- **x402 giriş ücreti:** Cevap gönderme endpoint'i bir HTTP 402 ödeme duvarının arkasında olur. Oyuncu küçük bir ücret öder ve ücret agent'ın hazinesine gider. Böylece hazinenin gelir tarafı oluşur.
- **Neden "meaningful":** Kripto sonradan eklenmiş bir özellik değil. Cüzdan olmadan agent'ın yöneteceği bir ekonomi olmaz.

> Not: Kesin kütüphaneler ve SDK sürümleri 3. haftadaki program içeriğine göre seçilecek.

## 8. Teknoloji Yığını (Öneri)

| Katman | Seçenek |
|---|---|
| Dil | **TypeScript (Node 24)**: x402 ve AgentKit örneklerinin çoğu TS'de |
| LLM | Program 1. haftada hangisini önerirse (araç çağırma desteği olan herhangi bir model) |
| Backend | Express (veya Hono) |
| Veritabanı | SQLite |
| Test | Vitest |
| Arayüz | Tek sayfalık basit HTML/JS |
| Cüzdan | Coinbase AgentKit veya program tarafından önerilen SDK |
| Zamanlayıcı | cron / basit bir döngü; demo için manuel tetikleme butonu |

## 9. Haftalık Yol Haritası

| Hafta | Program Teması | Proje Hedefi | Teslim |
|---|---|---|---|
| **0** (3-4 Ekim) | Hazırlık | Repo iskeleti, `Wallet` arayüzü, `MockWallet`, `SpendingGuard` | Testleri geçen iskelet |
| **1** (5-9 Ekim) | Get Agentic | Agent iskeleti: `create_challenge` aracıyla görev üreten ve yayınlayan agent. **Faucet'lerden test USDC ve ETH biriktirmeye başla** (günlük limitli) | Görev üreten agent |
| **2** (12-16 Ekim) | Build & Ship | Oyun döngüsü: cevap sayfası, değerlendirme, zorluk ayarı, karar logu. Ödüller `MockWallet` üzerinden; simülasyon koşucusu | Çalışan oyun (gerçek para yok) |
| **3** (19-23 Ekim) | Give It a Wallet | `BaseSepoliaWallet` (`MockWallet` yerine geçer), `get_treasury_balance`, `send_reward`; sonra x402 giriş ücreti | Kendi bütçesini yöneten agent |
| **4** (24-25 Ekim) | Maxx It Out | Yeni özellik yok: test, README, demo videosu, tweet | Final teslimi |

### Öncelik Sırası (zaman daralırsa)

1. **Olmazsa olmaz:** Görev üretimi → değerlendirme → on-chain ödül → karar logu
2. **Önemli:** Dinamik zorluk ayarı, hazine sağlığına göre ödül miktarı
3. **Olsa iyi olur:** x402 giriş ücreti, liderlik tablosu, şık arayüz

## 10. Deney Planı (Experimentation %25)

Bu deneyler çalıştırılacak ve sonuçlar README'de raporlanacak:

| Deney | Soru |
|---|---|
| **Ödül stratejileri** | Sabit, cömert, cimri ve dinamik stratejilerde hazine kaç günde biter? |
| **Simüle oyuncular** | Gerçek oyuncu azsa, farklı beceri seviyelerinde bot oyuncularla 30 günlük simülasyon |
| **Zorluk ayarı** | Agent kazanma oranını hedef aralıkta tutabiliyor mu? |
| **Prompt varyasyonları** | "Muhafazakâr hazinedar" ve "eğlence odaklı GM" kişilikleri nasıl farklı davranıyor? |
| **Başarısızlıklar** | Agent nerede saçma kararlar verdi ve nasıl düzeltildi? |

Simüle oyuncular sayesinde gerçek kullanıcı bulmadan da anlamlı veri ve grafik elde edilebilir.

**Simülasyon zincir dışında çalışır.** Strateji deneyleri `MockWallet` ile yapılır: 30 günlük bir koşu dakikalar sürer ve ücretsizdir. On-chain kanıt için birkaç gerçek "gün" `BaseSepoliaWallet` ile çalıştırılır.

**"Gün" bir tick'tir, saat değil.** Zamanlayıcı, manuel tetikleme butonu ve simülasyon koşucusu aynı `runDay()` fonksiyonunu çağırır.

## 11. Değerlendirme Kriterleriyle Eşleşme

| Kriter | Bu proje nasıl karşılıyor |
|---|---|
| Build (%30) | Uçtan uca çalışan döngü: görev → cevap → değerlendirme → ödeme → log |
| Experimentation (%25) | Çoklu araç kullanımı, strateji deneyleri, simülasyonlar, karar logları |
| Crypto (%25) | Agent'ın kendi cüzdanı, on-chain ödüller, x402 ile gelir; kripto fikrin merkezinde |
| Idea (%10) | Kendi ekonomisini yöneten AI oyun yöneticisi |
| Documentation (%10) | README, mimari şema, deney sonuçları, demo videosu |

## 12. Riskler ve Önlemler

| Risk | Önlem |
|---|---|
| Oyunun büyümesi | Sadece metin tabanlı günlük görev; grafik yok |
| x402 entegrasyonunda takılma | Olmazsa olmazlar listesinde değil; ödül gönderimi tek başına yeterli |
| Akıllı kontratla boğuşma | Kontrat yazılmayacak, hazır SDK kullanılacak |
| Gerçek oyuncu bulamama | Simüle bot oyuncular ve birkaç arkadaşla test |
| LLM'in tutarsız kararları | Kurallarla sınırla (örneğin bir günde hazinenin en fazla %10'u dağıtılabilir); her kararı logla |
| Agent'ın kendi sorusunu yanlış puanlaması | Cevap anahtarı görevle birlikte kaydedilir; değerlendirme deterministik |
| Sybil / tekrar gönderim | Cüzdan başına görev başına tek cevap; x402 ücreti çoklu cüzdanı pahalı hale getirir |
| Faucet limitleri | Test USDC/ETH 1. haftadan itibaren biriktirilir |
| Son haftanın kısalığı (2 gün) | Asıl iş 23 Ekim'de bitmiş olmalı |

## 13. Güvenlik Notları

- Yalnızca testnet kullanılacak, gerçek para yok.
- Özel anahtar (private key) ve API anahtarları `.env` dosyasında tutulacak ve **asla** GitHub'a yüklenmeyecek (`.gitignore`).
- Agent'ın harcama yetkisi kodda sınırlanacak: işlem başına ve günlük üst limitler.

## 14. Teslim ve Paylaşım Planı

- **GitHub reposu:** github.com/BerkeBakir/... (README, mimari, kurulum, deney sonuçları)
- **Haftalık paylaşımlar:** Her teslimden sonra X ya da LinkedIn'de kısa bir güncelleme
- **Final tweet'i:** 30-60 saniyelik demo videosu. Sırasıyla agent görev yayınlıyor → kazananı seçiyor → Base Sepolia'da ödeme gidiyor → hazine güncelleniyor → karar logu gösteriliyor. Tweet linki portala teslim edilecek.

## 15. Program Sonrası Olası Genişletmeler

- Birden fazla oyun türü
- Agent'ın kendi hazinesini getirili araçlarda değerlendirmesi
- Oyuncuların agent'ın kararlarına oy verdiği yönetişim mekanizması
- Oyun stüdyosu hedefine yönelik daha büyük bir oyunda "AI ekonomi yöneticisi" modülü olarak kullanım
