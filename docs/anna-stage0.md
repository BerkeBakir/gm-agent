# Anna Edition — Aşama 0 sonuçları (24 Eki 2026, detaylı araştırmayla güncellendi)

## 1. Ödeme Türkiye'ye ulaşır mı? (detaylı araştırma, 24 Eki)

**Kısa cevap: Mümkün görünüyor ama hiçbir yerde yazılı garanti yok. Tek gerçekçi yol USD banka havalesi (SWIFT).**

| Kanal | Türkiye'de durum | Kaynak |
|---|---|---|
| Stripe | **Yok.** stripe.com/global listesinde değil; Ağustos 2026 tarihli rehberler de "yok" diyor (yalnız ABD LLC gibi yabancı şirketle). | stripe.com/global, startglobal.co, ceaksan.com |
| PayPal | **Yok.** 2016'dan beri lisanssız, TCMB listelerinde yok, 2026 için dönüş takvimi yok. | sirket.io, startupsole.com |
| Passionfroot Bank Transfer | **Muhtemelen var, garanti yok.** Stripe olmayan ülkeler için yedek yol; USD, SWIFT kabul eden banka şart; işlemi **Ebury** yapıyor (Ebury 160+ ülkeye, TRY dahil gönderiyor). Ama "seçili üreticilere açılıyor" diyor, ülke listesi yok. | help.passionfroot.me (Getting Paid, FAQs, Terms) |
| Anna'nın doğrudan banka havalesi | **Mümkün olabilir.** Anna'nın resmi duyurusu ödeme kanallarını "Bank Wire Transfer, PayPal, Stripe, or other agreed channels" diye sayıyor; Passionfroot'tan hiç bahsetmiyor. | forum.anna.partners/t/.../205 |

Ek bulgular:
- **Passionfroot "girişimci" şartı:** Şartlarında üretici "Alman Medeni Kanunu §14 anlamında girişimci" olmalı (ticari/serbest meslek faaliyeti). Şahıs olarak (şirketsiz) kabul edilip edilmediği belli değil.
- Havale yolunda fatura Passionfroot GmbH'ye (Berlin) kesilir; Türkiye'de bunun vergi beyanı (hizmet ihracatı) ayrıca düşünülmeli. Anna da "vergi beyanı geliştiricinin sorumluluğunda" diyor.
- Anna ödemeyi "kimlik doğrulama ve ödeme uyumu"na bağlıyor; yaptırım/kısıtlı ülke listesi yayımlamamış. Türkiye yaptırım listelerinde değil.
- Türkiye'den Passionfroot kullanan üretici örneği bulunamadı (ne olumlu ne olumsuz kanıt).
- Hibe ödemesi ayın ölçümünden sonra ~30 gün içinde, USD ya da yerel karşılığı. Gelir paylaşımı ayrı: bakiye 50 USD olunca çekilebiliyor.

**Karar:** Ödeme net değil → **geliştirmeyi beklet**, Eli'ye aşağıdaki soruları sor. Cevap "evet, Türk bankasına USD havale yapılır" ise Aşama 1.

Kaynaklar:
- https://help.passionfroot.me/en/articles/11552849-getting-paid-on-passionfroot
- https://help.passionfroot.me/en/articles/11552873-faqs
- https://help.passionfroot.me/en/articles/11552627-day-1-with-passionfroot
- https://help.passionfroot.me/en/articles/11570199-terms-conditions
- https://forum.anna.partners/t/turn-your-ai-agents-apps-into-recurring-monthly-grants-join-the-anna-ai-os-founding-builder-program-up-to-80k-month-pool/205
- https://stripe.com/global · https://startglobal.co/us/international/turkey/stripe/
- https://www.sirket.io/blog/paypal-turkiye · https://ebury.com/resources/currencies

### Eli'ye e-posta (Berke gönderir, eli@anna.partners)

> Subject: Payout to Türkiye: quick check before we build
>
> Hi Eli,
>
> Thanks again for the detailed answers. One last check before we commit time to our Anna app.
>
> I'm based in Türkiye, where neither Stripe nor PayPal is available. If the app qualifies for a grant (or revenue share):
>
> 1. Can Anna pay by direct bank wire (USD via SWIFT) to a Turkish bank account? Your program post lists "Bank Wire Transfer" as an option.
> 2. If the payout has to go through Passionfroot instead, is their USD bank transfer enabled for creators in Türkiye? Their terms say creators must be businesses. Can I join as an individual, or would I need a registered company?
> 3. Is there anything else we'd need for the identity and payment checks (documents, tax forms)?
>
> Thanks,
> Berke

## 2. Developer Forum sorusu (Berke kendi hesabından gönderir)

> **Title:** External read-only API in an app + linking to an outside crypto product: OK for review?
>
> Hi all,
>
> I'm planning an Anna app for GM Agent, an AI game master that posts a daily riddle (https://github.com/BerkeBakir/gm-agent). The Anna version would be free and wallet-free: you play yesterday's closed riddle, ask the GM for up to 3 hints, and track your personal streak. Two questions before I build it:
>
> 1. **External origin:** The app would fetch closed riddles (public, read-only, no user data sent) from our own backend, declared in `ui.bundle.external_origins`. If our API is unreachable, the app falls back to a riddle generated with `llm.complete`, so it never breaks. Is this acceptable in review, or should apps avoid external origins entirely?
> 2. **Link to an outside crypto product:** The original game outside Anna takes a small testnet USDC entry fee (x402 on Base Sepolia). The Anna app itself has no wallet, payment or token logic. Is it OK to include a plain "about the project" link to the GitHub repo or website, or is that against the policy?
>
> Thanks!
