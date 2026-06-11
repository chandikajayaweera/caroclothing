# Flow Design Reference

Detailed decision trees for all major user journeys. These are described in terms of **user intent and data**, not specific routes — routes can change; intent and data contracts don't.

---

## Shopping Flow

### Discovery

```
Entry Points
├── Homepage hero → active drop page or campaign
├── "New In" (isNewArrival = true AND isActive = true) → catalog filtered
├── Gender-filtered catalog (men / women / unisex)
├── "Shop All" → full active catalog
└── Drops section → drop listing (all statuses except archived)

Catalog (Product Listing)
├── Filters: Gender toggle | Fit chips | (optional) Tier toggle (Drop / Core)
├── Sort: Newest → Featured → Price asc/desc (default: newest)
├── Product cards show:
│   ├── Primary image (hover: back/alt image)
│   ├── Name, price in LKR, struck-through compare price
│   ├── Color swatches (colorHex)
│   └── Stock badge (Volt): LOW STOCK / ALMOST GONE / SOLD OUT / PRE-ORDER
└── Tap/click → Product Detail Page
```

### Product Detail Page

```
Product Detail (tier-aware)
├── Product name (Bebas Neue, large)
├── Tier-specific header signal:
│   ├── tier = 'drop', drop.status = 'live' → "DROP [name] — LIVE NOW" + Volt dot
│   └── tier = 'core' → no drop signal; consistent availability implied
└── Color Swatch Cards (Grouped Variants):
    ├── Color Swatch Name & Hex Indicator
    ├── Color-card Price (Space Mono, LKR) — basePrice/compareAtPrice struck through if set
    │   └── Drop tier: show price only when drop.status = 'live' or 'sold_out'
    ├── Color-specific image gallery (swipeable mobile, grid desktop, thumbnails + modal preview)
    ├── Size selector pills (availability per size variant under that color):
    │   ├── Available → selectable
    │   ├── OOS (allowBackorder = false) → grayed, disabled
    │   └── Backorder (allowBackorder = true) → selectable, "Pre-Order" label
├── Stock signal (Volt badge):
│   ├── qty-reserved > lowStockThreshold → no badge
│   ├── 0 < qty-reserved ≤ lowStockThreshold → "LOW STOCK"
│   ├── qty-reserved ≤ 2 → "ALMOST GONE"
│   └── qty-reserved = 0, allowBackorder = false → "SOLD OUT" (disable Add to Bag)
├── CTA:
│   ├── In stock → [Add to Bag]
│   ├── Backorder → [Pre-Order]
│   └── Sold out → [Sold Out — disabled] (keep visible as cultural proof)
├── [Save to Wishlist] (heart icon, always visible on mobile)
├── Product detail accordion: Description | Material & Care | Fit & Sizing
├── Shipping estimate (district-based — show after user selects or based on geo)
└── Reviews section (only isApproved = true reviews displayed)
    ├── Rating summary (stars + count) — only show if count > 0
    ├── Review cards: rating + verified badge (if isVerifiedPurchase) + title + body + media
    └── [Write a Review] — auth required; ideally purchased the product
```

---

## Drop Launch Flow

This is the full ritual for a Drop Collection product. Core Essentials never follow this flow.

```
Phase 1: TEASER (drop.status = 'teaser')
├── Drop page shows:
│   ├── drop.name + drop.tagline
│   ├── Hero image: silhouette or campaign visual (not full product reveal)
│   ├── Countdown timer from drop.launchAt
│   │   └── launchAt = null → show "Coming Soon" not a timer
│   └── [Notify Me] CTA → dropWaitlist entry
│       ├── Accepts phone (E.164) or email → contactType set accordingly
│       ├── Guest: stores contact only (userId = null)
│       └── Authenticated: stores contact + userId
├── Homepage hero: switches to drop teaser visual
├── Drop products NOT purchasable in this phase
│   └── Product pages for drop-tier items in teaser drops show preview only
└── Admin can update drop.heroImageR2Key and drop.tagline at any time

Phase 2: LIVE (drop.status = 'live')
├── Admin (or cron job at launchAt) transitions status: teaser → live
├── Batch notification job fires:
│   ├── Query: dropWaitlist WHERE drop_id = X AND notified_at IS NULL
│   ├── Phone contacts → SMS via text.lk
│   ├── Email contacts → Resend
│   └── Set notified_at = NOW for each sent
├── Homepage hero: switches to full product hero (uses isHero product's primary image)
├── Drop products become purchasable
│   ├── isNewArrival = true, isFeatured = true set on linked products
│   └── Full PDP live with live stock signals
└── Bag additions do not reserve stock; reservation starts only when checkout begins

Phase 3: During Drop (still 'live')
├── Live stock signals on PDP and catalog cards:
│   ├── Volt LOW STOCK badge at threshold
│   ├── "Only X left" count when ≤ threshold
│   └── ALMOST GONE when ≤ 2 units
├── Sold-out variants → grayed out in size selector
└── If all variants OOS:
    ├── allowBackorder = true → show [Pre-Order] CTA
    └── allowBackorder = false → show [Sold Out] + waitlist capture for next drop

Phase 4: SOLD OUT (drop.status = 'sold_out')
├── Admin (or automated check) transitions: live → sold_out
├── Drop page: "Sold Out" heading + date + thank you line
├── All linked product PDPs: SOLD OUT state (products remain visible)
│   └── This is a cultural milestone — "DROP 001 SOLD OUT IN 4 HOURS"
├── Homepage hero: transitions to next drop teaser (or editorial fallback)
└── Document and post the sold-out story within 48 hours

Phase 5: ARCHIVED (drop.status = 'archived')
├── Manual admin action
├── Drop page still accessible and indexed (historical proof)
└── Products remain in catalog with SOLD OUT badge
```

---

## Checkout Flow

### Entry Points

- Bag icon → Bag drawer (desktop) or Bag page
- "Add to Bag" on product page → Bag drawer opens

### Bag

```
Bag (Drawer or Full Page)
├── Item list:
│   ├── Thumbnail, name, size, color (Space Mono for metadata)
│   ├── Locked unit price in LKR
│   │   └── If live price ≠ unitPrice → show "Price updated" warning (don't block)
│   ├── Quantity stepper (min 1, max 10) — upsert on change, never duplicate rows
│   └── Remove item
├── Promo code field (inline, validates on blur or Enter)
│   ├── Success: "CARO20 applied — LKR 500 off" (Volt text)
│   └── Error: direct message (see micro-copy library in SKILL.md)
├── Free shipping progress bar
│   ├── subtotal < threshold → "Add LKR X more for free shipping"
│   └── subtotal ≥ threshold → "Free shipping unlocked" (Volt)
├── Subtotal / Discount / Shipping (TBD at checkout) / Total
└── [Checkout] → reserve stock for 10 minutes → Step 1: Contact
```

During checkout, show remaining reservation time. On expiry, return to bag, release
reserved stock, and keep every bag item.

### Checkout Steps (linear — no accordion)

```
Step 1: Contact
├── Authenticated: pre-filled phone + email, read-only, [Change] link
├── Guest:
│   ├── Phone number input (+94 prefix, SL format)
│   ├── Optional email
│   └── Google One Tap overlay (if FedCM supported)
└── [Continue] → Step 2

Step 2: Delivery Address
├── Authenticated with saved addresses:
│   ├── Address cards (default pre-selected)
│   ├── [+ Add new address]
│   └── [Continue]
├── Authenticated with no saved addresses → address form (below)
└── Guest → address form:
    ├── Recipient name (required)
    ├── Phone in SL format (required)
    ├── Address Line 1 (required)
    ├── Address Line 2 (optional)
    ├── City (free text, required)
    ├── District (enum, all 25 SL districts — required for shipping zone lookup)
    ├── Postal Code (optional)
    └── [Continue] → Step 3

Step 3: Shipping Method
├── Query shippingZone(methodId, district) for available methods
├── Radio cards per method:
│   ├── Name + carrier
│   ├── Price (or "FREE" in Volt if subtotal ≥ freeShippingThreshold)
│   └── "Delivered in X–Y business days"
└── [Continue] → Step 4

Step 4: Payment
├── (Payment gateway integration — scope pending)
└── [Place Order] → Order Confirmation

Order Confirmation
├── Order number in Space Mono (large, prominent)
├── "We'll text you when it ships." (if phone was captured)
├── Order summary: items (from snapshot, not live prices), address, shipping method
├── [Continue Shopping]
└── Account creation prompt (guests only):
    "Save your details for next time. Takes 10 seconds."
    [Create Account] — phone already captured; only name needed
```

---

## Authentication Flow

```
Sign-in Page
├── View: idle
│   ├── [Continue with Google] → Google OAuth → afterSignIn()
│   └── [Phone Number] → View: phone
│
├── View: phone
│   ├── +94 prefix + 9-digit local number input
│   ├── [Send Code] → OTP dispatched → View: otp
│   └── [Back] → View: idle
│
├── View: otp
│   ├── 6-digit code input (auto-submits on 6 digits)
│   ├── [Verify] → afterSignIn()
│   ├── [Wrong number] → View: phone
│   └── [Resend] (disabled during 30s cooldown enforced by KV)
│
└── afterSignIn()
    ├── New user (created < 5 min ago) → View: name-prompt
    └── Returning user → redirect to intended destination

View: name-prompt
├── Optional name input
├── [Continue] → save name → redirect
└── [Skip] → redirect without saving name
```

### Auth During Checkout

```
Checkout entry (guest path)
├── Google One Tap overlay (if FedCM supported)
│   ├── Accepted → merge guest bag → continue as authenticated user
│   └── Dismissed → continue as guest
├── "Sign in for faster checkout" — subtle link, never blocking
└── Continue as guest → collect contact inline in Step 1
```

---

## Account Flow

```
Account Dashboard
├── Profile
│   ├── Name (editable)
│   ├── Phone (with Verified badge if phoneNumberVerified = true)
│   ├── Email (editable if set)
│   └── Member since date
│
├── Order History
│   ├── List: order number, date, status, item count, total
│   └── Order Detail:
│       ├── Status + timeline (OrderStatusTimeline component)
│       ├── Tracking info (trackingNumber, trackingCarrier, trackingUrl) when available
│       ├── Items (from orderItem snapshot — name, sku, size, color, price at purchase)
│       ├── Shipping address (from shippingAddressSnapshot)
│       ├── Pricing breakdown (subtotal, discount, shipping, total)
│       └── [Write a Review] per item (if order status = 'delivered')
│
├── Saved Addresses
│   ├── Address cards with labels
│   ├── Default badge (isDefault = true)
│   ├── [Edit] / [Delete] / [Set as Default]
│   └── [+ Add Address]
│
└── Wishlist
    ├── Product cards with live stock status
    ├── variantId = '' → "Choose your size" nudge
    ├── [Move to Bag] (requires variant selected + in stock)
    └── [Remove]
```

---

## Error States

| Scenario                                      | UX Response                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Bag item OOS at checkout start                | "X is sold out. Remove it to continue." — block checkout until resolved                        |
| Price changed since add-to-bag                | Warning banner: "Price updated for [item]." — don't block, but make it visible                 |
| Promo code expired                            | Inline: "Code expired." — clear discount, don't block                                          |
| Guest bag expired                             | Toast on return: "Your bag cleared. Start fresh." — not framed as an error                     |
| Account banned                                | Page: "Account suspended. Contact support." — block all actions                                |
| Drop accessed during teaser (before launchAt) | Show teaser state — countdown + notify-me. Never show purchasable product early.               |
| All drop products OOS, no backorder           | "Sold Out" product state. Waitlist capture for next drop. Never hide — this is cultural proof. |
| Network error on add-to-bag                   | Toast: "Didn't add. Try again." — preserve bag state                                           |
| OTP rate limited                              | Show remaining cooldown in the resend button. "Resend (28s)" — never show a generic error      |
