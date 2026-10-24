# Anna Edition — Aşama 0 sonuçları (24 Eki 2026)

## 1. Passionfroot Türkiye'ye ödeme yapıyor mu?

**Kısa cevap: Belirsiz, büyük ihtimalle tek yol USD banka havalesi.**

- Passionfroot üreticilere ödemeyi **Stripe Connect** ile yapıyor. **Stripe Türkiye'de yok** (stripe.com/global listesinde değil; komşulardan Bulgaristan, Yunanistan, Kıbrıs var).
- Stripe olmayan ülkeler için **"Passionfroot Bank Transfer (USD)"** var: SWIFT ile, sadece USD, fatura Passionfroot GmbH (Berlin) adına kesilir. Hesap ayarı: Account Settings → Payments → Manage payout methods → Bank transfer.
- Ama yardım sayfası bunu "seçili üreticilere açılıyor" diye anlatıyor; ülke listesi yok. Ara banka ücreti ve kur farkı alıcıya kalıyor.
- Türk bankası tarafı: USD SWIFT alımı çoğu bankada mümkün; Almanya'dan gelen hizmet geliri için vergi/fatura durumu ayrıca kontrol edilmeli.

**Karar (plana göre):** Ödeme net değil → **beklet**. Eli'ye tek soru gönder (aşağıda). Cevap "evet, USD banka havalesiyle ödenir" ise Aşama 1'e geç.

Kaynaklar: https://help.passionfroot.me/en/articles/11552849-getting-paid-on-passionfroot · https://stripe.com/global

### Eli'ye e-posta (Berke gönderir, eli@anna.partners)

> Subject: Payout question before we start building
>
> Hi Eli,
>
> Thanks again for the detailed answers. One last check before we start building our Anna app: I'm based in Türkiye, where Stripe isn't available. If our app qualifies for the Founding Builder reward, can the payout go through Passionfroot Bank Transfer (USD via SWIFT) to a Turkish bank account? If there's another route, that works too, I just want to be sure the payout can reach me before we commit the time.
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
