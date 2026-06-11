# Caro Business Context

## Brand Overview

- **Founded**: 2026, Sri Lanka
- **Product**: Graphic tees and streetwear (oversized fit, 220GSM combed cotton)
- **Target**: Gen Z, 16–30, Sri Lanka-based, culturally fluid, style-conscious
- **Price point**: LKR 850 (socks) → LKR 5,200 (hoodies). Core tees LKR 2,900–3,200. Drop tees LKR 3,000–4,500.
- **Distribution**: D2C online only (caroclothing.lk). Drop-based limited releases + always-available Core Essentials.
- **Origin**: Made in Sri Lanka. Colombo-based. Ships nationally.

## Two-Tier Product Model

Caro operates two distinct product tiers. Every product decision, pricing decision, and UX decision must be filtered through this model.

### Drop Collection (`tier = 'drop'`)

- Limited units, bold graphic statements, never restocked
- Priced LKR 3,000–4,500
- Sold through a named drop event with a full ritual: teaser → countdown → drop night → sold-out story
- Products belong to a `drop` record and are linked via `dropProduct`
- When sold out, they remain visible as proof of cultural moment

### Core Essentials (`tier = 'core'`)

- Always available, wordmark / tonal designs, quietly restocked
- Priced LKR 2,500–3,000
- No countdown, no ceremony, no hype mechanic
- Entry point for new customers; repeat purchase vehicle between drops
- Do not launch Core before Drop 1 sells out — establish scarcity first

**The relationship**: Core builds the audience; drops give that audience something to compete for.

**The discipline**: No discounts, no sales on either tier in year one. Discounting kills perceived value permanently.

## Business Model

- **Hybrid model**: Limited drops for culture and desire + Core Essentials for revenue stability
- **Catalog size**: Intentionally small (~8–15 SKUs at any time)
- **Shipping**: Flat-rate LKR 450, free over LKR 10,000. Ships from Colombo.
- **Payment**: LKR only. Sri Lankan payment gateways (PayHere, WebXPay, CoD) — not yet integrated (checkout flow is currently mocked)

## Current Tech Stack

- **Framework**: SvelteKit + Cloudflare Workers (deployed)
- **DB**: Turso/LibSQL (SQLite-compatible) via Drizzle ORM
- **Auth**: better-auth with phone OTP (primary) + Google OAuth
- **Media**: Cloudflare R2
- **Email**: Resend
- **SMS**: text.lk

## Schemas Built (ready to use)

- Products, variants, categories, tags — with `tier` field (`'drop' | 'core'`) ✅
- Drops — `drop`, `dropProduct`, `dropWaitlist` tables for the full launch ritual ✅
- Inventory with reservation + backorder support ✅
- Bag (guest + auth + merge strategy documented) ✅
- Orders, order items, payments, status history ✅
- Reviews + review media ✅
- Promotions / promo codes ✅
- Wishlist ✅
- Addresses (all 25 SL districts) ✅
- Shipping methods + district-level zone pricing ✅

## Known Gaps / Current Constraints

- Payment gateway not yet integrated — checkout flow is mocked end-to-end
- Reviews moderation pipeline not built (schema ready, admin UI needed)
- Bag is client-side (localStorage) — not yet synced to DB
- Search not implemented
- Drop waitlist captures exist in UI but are not yet persisted to the `dropWaitlist` DB table
- Drop status transitions (teaser → live → sold_out) are manual — no automated cron job yet

## Key Business Goals (ordered by priority)

1. **Conversion** — First-time buyer rate. Every screen should move toward purchase.
2. **Sell-through speed** — Drops should sell out fast. Urgency signals matter.
3. **Repeat purchase** — Build a customer base that comes back for every drop.
4. **Brand equity** — Caro should be recognized as the legitimate Sri Lankan Gen Z streetwear brand, not a generic local store.

## Metrics That Matter (when instrumented)

- Add-to-bag rate (product page → bag)
- Bag abandonment rate (bag → checkout completion)
- Checkout conversion (checkout start → order placed)
- Free shipping attachment rate (% of orders over LKR 10,000)
- Drop sell-through time (hours from launch to sold out)
- Repeat purchase rate (% of customers with 2+ orders)

## Competitive Context

- Local: Generic local brands on Instagram with no real e-commerce
- Regional: Zalora, FashionMia (volume plays, not brand plays)
- Aspirational: Represent, Madhappy, Corteiz (international drop brands)
- Caro's edge: Sri Lankan-made, drop-culture mechanics, Gen Z voice, legitimate quality
