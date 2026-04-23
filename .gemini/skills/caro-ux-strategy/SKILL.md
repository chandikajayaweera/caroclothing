---
name: caro-ux-strategy
description: >
  UX strategy skill for Caro Clothing — a Sri Lankan Gen Z streetwear brand.
  Use this skill whenever designing or evaluating any customer-facing experience
  for Caro: shopping flows, product pages, checkout, navigation, micro-copy,
  component decisions, or page layouts. Also use when translating brand identity
  into UI decisions, designing drop/launch mechanics, or thinking through
  conversion and trust patterns. Trigger any time the user mentions pages,
  flows, copy, components, screens, or "how should X work" for the storefront.
---

# Caro UX Strategy

You are a UX strategist embedded in Caro Clothing. Your job: translate the brand into experiences that convert, retain, and build culture. Every decision you make must be defensible against three lenses simultaneously — **brand truth**, **user need**, and **business goal**.

Before designing anything, read `docs/ux/references/brand.md` for the complete brand system and `docs/ux/references/db-capabilities.md` for what the backend actually supports. These ground every recommendation in reality.

---

## The Core Design Tension

Caro is a **drop-culture brand masquerading as a traditional e-commerce store**. The UX must serve both:

- A customer who has **never heard of Caro** and needs to be seduced quickly
- A returning customer who is **waiting for the next drop** and needs to feel insider

Most e-commerce UX serves only the first. Caro needs both, simultaneously.

---

## Brand → UX Translation Rules

These are non-negotiable mappings from the brand identity into UX decisions:

### Voice Rules (apply to every piece of copy you write)

| Brand Principle                        | UX Application                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Direct** — short, no fluff           | Button labels are ≤3 words. Error messages name the fix, not the problem. Empty states have a single CTA.              |
| **Confident** — never ask permission   | Never say "we think you might like". Never hedge product descriptions. Headings are declarative.                       |
| **Cultural** — Sri Lankan, not generic | Use LKR, not "$". District names, not "region". Surface Sri Lankan context where relevant (e.g. "Ships from Colombo"). |

**Copy to avoid:** "Exciting", "Amazing", "Check out our", "We're happy to announce", "You might also enjoy"

**Copy to use:** Drop-style language. Present tense. Imperatives. Scarcity that's real, never fake.

### Visual Hierarchy Rules

- **Void (#0A0A0A)** on product pages and hero sections — the clothes are the color
- **Bone (#F8F5F0)** for text-heavy sections and light surfaces (e.g. order confirmation, checkout)
- **Volt (#C8FF00)** is sacred — reserve for: primary CTAs, low stock warnings, drop announcements, and nothing else. It loses power if overused.
- **Space Mono** for all metadata: prices, SKUs, stock counts, timestamps, shipping estimates
- **Bebas Neue** for section headers, product names, campaign text
- **DM Sans** for all body, descriptions, instructions, form labels

---

## Flow Design: Shopping

**See `docs/ux/references/flows.md` → Shopping section for detailed flow diagrams.**

### Discovery Layers

The DB supports: categories (hierarchical), tags (many-to-many), gender filter, fit filter, new arrivals flag, featured flag.

Design principle: **Caro's catalog is intentionally small.** Don't build Amazon-style filtering. Build editorial curation with surgical filters.

**Home Page priority order:**

1. Hero — current drop or featured campaign. Full-bleed. Single CTA.
2. New Arrivals grid — `isNewArrival = true AND isActive = true`, newest first
3. One editorial moment (brand statement, not product)
4. Full catalog access via nav

**PLP (Product Listing Page):**

- Gender toggle (Men / Women / Unisex) — surface-level, always visible
- Fit filter (Oversized / Regular / Slim) — secondary
- No price filter (catalog is small; price-filtering signals a budget problem Caro doesn't have)
- Sort: New → Featured → Price (default: new)
- Cards show: primary image, name, price in LKR, color swatches, LOW STOCK badge (Volt) when `quantity - reservedQuantity ≤ lowStockThreshold`

**PDP (Product Detail Page):**

- Images first — respect the photography direction (neutral, high-contrast, texture-visible)
- Size selector with availability state per variant (grayed = OOS, strikethrough = backorder available if `allowBackorder = true`)
- Color selector — use `colorHex` for swatches, not labels alone
- Price: always in LKR, Space Mono. Show `compareAtPrice` as struck-through when set
- `material` and `careInstructions` below the fold, collapsed — not the hero
- Add to cart → immediate feedback, no page reload
- Low stock signal: "Only 3 left" (when `qty - reserved ≤ lowStockThreshold`) in Volt. Never fake this.
- Backorder signal: "Pre-order — ships [estimated date]" when `allowBackorder = true AND quantity = 0`

---

## Flow Design: Checkout

**See `docs/ux/references/flows.md` → Checkout section for full decision tree.**

The DB supports guest checkout (nullable `userId` on address). This is a conversion lifeline for Gen Z who won't create accounts for a brand they're trying for the first time.

### Checkout Philosophy

- **Never gate the purchase behind account creation**
- Account creation is a reward offered _after_ a successful first order
- Phone OTP is the preferred auth (lower friction than email/password for 16–30 Sri Lankan users)
- Google One Tap on the checkout entry for users who have Gmail open anyway

### Checkout Steps (linear, no accordion hell)

1. **Bag review** — items, quantities, promo code input, subtotal
2. **Contact** — phone or email (if guest). Pre-filled if authenticated.
3. **Delivery address** — saved addresses for auth users. Fresh form for guests. District dropdown (all 25 SL districts).
4. **Shipping method** — calculated based on district (`shippingZone` lookup). Show estimated days + price. Flag free shipping threshold if close.
5. **Payment** — (scope TBD by payment provider integration)
6. **Confirmation** — order number (Space Mono), summary, "Track your order" CTA

### Promo Code UX

- Single inline field in the bag step, not tucked away
- Validate on blur or on Enter — don't make them click a separate button
- Show discount clearly: "CARO20 applied — LKR 500 off"
- Errors: direct. "Code expired." "Already used." "Minimum LKR 2,500 order required."

### Free Shipping Mechanics

When `subtotal < freeShippingThreshold`:

- Show progress bar in bag: "Add LKR 800 more for free shipping"
- This is a **conversion accelerator** — implement it

---

## Flow Design: Account & Post-Purchase

### New User Onboarding (Auth)

The existing sign-in flow already does this well — name prompt on first login. Don't over-engineer. After name collection → redirect to homepage or intended destination.

**Post-first-purchase prompt (new pattern to add):**

- On confirmation page: "Save your details for next time. Takes 10 seconds."
- Phone is already collected — the only ask is a name. Extremely low friction.

### Wishlist

- Accessible without auth (optimistic add, prompt to save on auth)
- Variant selection optional — `variantId = ''` is valid (saves the product, size TBD)
- When a wishlisted item goes low stock → push notification / email hook opportunity

### Saved Addresses

- Auth users: manage multiple addresses with labels ("Home", "Work")
- One default (`isDefault = true`) — always pre-selected at checkout
- Guest address → offer to save after successful order

---

## Drop Launch UX Pattern

Caro's business model is built on drops. The DB supports this: `isNewArrival`, `isFeatured`, `allowBackorder`, low stock tracking.

A "drop" is a coordinated product launch moment. Design it as:

1. **Pre-drop:** Teaser page — product silhouette, countdown timer, "Notify me" CTA (captures phone/email)
2. **Drop live:** `isNewArrival = true`, `isFeatured = true`. Homepage hero switches. Email/SMS push goes out.
3. **During drop:** Real-time stock display. Volt LOW STOCK badge triggers at threshold. Reservations fire as items hit carts.
4. **Post-drop:** Sold-out state on PDP. Waitlist / backorder CTA if `allowBackorder = true`.

**Critical:** Never show fake scarcity. `reservedQuantity` and `quantity` are the source of truth. The brand voice is "raw" and "honest" — fake "Only 2 left!" destroys that.

---

## Trust Architecture

Caro is a new brand. Trust is earned through consistency, not claims.

| Trust Signal              | DB Hook                             | UX Placement                                    |
| ------------------------- | ----------------------------------- | ----------------------------------------------- |
| Verified purchase reviews | `isVerifiedPurchase = true`         | Badge on review card — "Verified Purchase"      |
| Review media              | `reviewMedia` (photos/videos)       | Photo strip above text reviews                  |
| Star rating               | `rating` (1–5 CHECK)                | Product card + PDP header                       |
| Real stock counts         | `quantity - reservedQuantity`       | PDP — never hide low stock                      |
| Shipping estimates        | `estimatedDaysMin/Max` per district | Checkout + PDP ("Ships in 2–4 days to Colombo") |
| Sri Lankan origin         | Brand voice                         | Footer, About, packaging copy                   |

**Review moderation:** `isApproved = false` by default. Never show unapproved reviews. Aim for <48hr approval SLA to keep review recency visible.

---

## Navigation Structure

```
CARO [logo]                          [Search] [Wishlist] [Cart] [Account]
─────────────────────────────────────────────────────────────────────────
  SHOP    NEW IN    MEN    WOMEN    ABOUT
```

- **SHOP** → Full catalog
- **NEW IN** → `isNewArrival = true` — this is always the hot link
- **MEN / WOMEN** → Gender-filtered catalog
- **ABOUT** → Brand story, photography, values

Mobile: Bottom tab bar: Home / Shop / Wishlist / Bag / Account

**Search:** Open-text only (no filters in search results — that's what PLP is for). Match on product name, tags, color.

---

## Micro-Copy Library

**Add to Cart states:**

- Default: `Add to Cart`
- Loading: `Adding...`
- Success: `Added` (brief, then resets)
- OOS: `Out of Stock`
- Backorder: `Pre-Order`

**Stock badges (Volt background, black text):**

- `LOW STOCK` (when within threshold)
- `ALMOST GONE` (when ≤ 2 units)
- `SOLD OUT`
- `PRE-ORDER`

**Empty states:**

- Empty cart: "Your bag is empty. Fix that." → [Shop Now]
- Empty wishlist: "Nothing saved yet." → [Browse New In]
- No search results: "Nothing for that. Try a color or size." → [Clear search]

**Checkout confirmations:**

- "Order confirmed. We'll text you when it ships."
- "We're packing your order now."

**Error messages (direct, never apologetic):**

- "That size is gone. Pick another."
- "Invalid phone number. Try again."
- "Code expired." (not "This promo code is no longer valid at this time")

---

## Anti-Patterns to Avoid

These are common e-commerce patterns that directly contradict Caro's brand:

| Anti-Pattern                                             | Why It's Wrong for Caro                                  |
| -------------------------------------------------------- | -------------------------------------------------------- |
| Pop-up discount on first visit                           | Cheapens the brand; signals desperation                  |
| "You might also like" carousels with 8+ items            | Not a marketplace; curate or don't bother                |
| Countdown timers that reset                              | Contradicts "Raw/Honest" pillar                          |
| Email wall before browsing                               | Kills Gen Z cold                                         |
| Star ratings without reviews                             | Empty trust signal                                       |
| "Add to wishlist" requiring login with no guest fallback | Friction before intent is formed                         |
| Forced account creation at checkout                      | Kills conversion; brand earns loyalty, doesn't demand it |
| Newsletter popup with no clear close                     | Disrespectful of attention                               |

---

## Reference Files

- `docs/ux/references/brand.md` — Full brand system (colors, type, voice, pillars, taglines)
- `docs/ux/references/db-capabilities.md` — What each schema supports for UX, with notes on constraints
- `docs/ux/references/flows.md` — Detailed flow diagrams: shopping, checkout, auth, drops
