# Caro Business Context

## Brand Overview

- **Founded:** 2026, Sri Lanka
- **Product:** Graphic tees, streetwear (oversized fit, 220GSM combed cotton)
- **Target:** Gen Z, 16–30, Sri Lanka-based, culturally fluid, style-conscious
- **Price point:** LKR 850 (socks) → LKR 5,200 (hoodies). Core tees LKR 2,900–3,200.
- **Distribution model:** D2C online only (caroclothing.lk). Drop-based launches.
- **Origin:** Made in Sri Lanka. Colombo-based. Ships nationally.

## Business Model

- **Drop culture:** Limited quantity drops create urgency and repeat visits
- **Catalog size:** Intentionally small (~8–15 SKUs at any time)
- **Shipping:** Flat-rate LKR 450, free over LKR 10,000. Ships from Colombo.
- **Payment:** LKR only. Sri Lankan payment gateways (PayHere, WebXPay, CoD)

## Current Tech Stack

- **Frontend:** SvelteKit + Cloudflare Workers (deployed)
- **DB:** Turso/LibSQL (SQLite) via Drizzle ORM
- **Auth:** better-auth with phone OTP (primary) + Google OAuth
- **Media:** Cloudflare R2
- **Email:** Resend
- **SMS:** text.lk

## Schemas Built (ready to use)

- Products, variants, categories, tags ✅
- Inventory with reservation + backorder support ✅
- Cart (guest + auth + merge strategy documented) ✅
- Orders, order items, payments, status history ✅
- Reviews + review media ✅
- Promotions / promo codes ✅
- Wishlist ✅
- Addresses (all 25 SL districts) ✅
- Shipping methods + district-level zone pricing ✅

## Known Constraints

- No payment gateway integrated yet (checkout flow is mocked)
- Reviews are schema-ready but moderation pipeline not built
- Cart is client-side (localStorage) — not yet synced to DB
- Search is not implemented
- Drop teaser pages exist but notify-me list is not persisted to DB

## Key Business Goals (ordered)

1. **Conversion** — First-time buyer rate. Every screen should move toward purchase.
2. **Sell-through speed** — Drops should sell out fast. Urgency signals matter.
3. **Repeat purchase** — Build a customer base that comes back for every drop.
4. **Brand equity** — People should recognize Caro as a legitimate Sri Lankan brand, not a generic local store.

## Metrics That Matter (when instrumented)

- Add-to-cart rate (PDP → Cart)
- Cart abandonment rate (Cart → Checkout completion)
- Checkout conversion rate (Checkout start → Order placed)
- Free shipping attachment rate (% of orders over LKR 10,000)
- Repeat purchase rate (% of customers with 2+ orders)
- Drop sell-through time (hours from launch to sold out)

## Competitive Context

- Local competition: Generic local brands on Instagram with no e-commerce
- Regional competition: Zalora, FashionMia (volume plays, not brand plays)
- Aspirational competition: Represent, Madhappy, Any Memes (international drop brands)
- Caro's edge: Sri Lankan-made, drop-culture mechanics, Gen Z voice, legitimate quality
