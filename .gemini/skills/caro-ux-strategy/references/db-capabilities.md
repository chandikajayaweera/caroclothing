# DB Capabilities for UX

This file maps what each schema enables at the UX layer — with notes on constraints, business rules, and gotchas that affect design decisions.

---

## Products

**What UX can do:**
- Filter by `gender` (men / women / unisex), `fit` (oversized / regular / slim)
- Surface `isNewArrival` and `isFeatured` products — the two primary editorial surfaces
- Show `basePrice` (always LKR), struck-through `compareAtPrice` when set
- Display `material` and `careInstructions` (secondary info, below fold)
- Category hierarchy (parent/child) — supports nested nav if catalog grows
- Tags (many-to-many) — faceted browsing at scale

**Variants:**
- Each product has size × color variants: `size` (XS/S/M/L/XL/XXL/XXXL), `color` + `colorHex`
- `priceOverride` per variant — display variant price if set, else product `basePrice`
- `sku` is the unique identifier shown in Space Mono as a product code

**Images:**
- `variantId = null` → applies to all variants (lifestyle/editorial shots)
- `variantId = X` → specific to that color/size combo
- `isPrimary` = hero image (max one per product, one per variant — enforced by partial index)
- Images are R2 keys, resolved at query time — never raw URLs in DB

**UX gotchas:**
- A product may have many variants but only some are `isActive = true` — always filter
- `isNewArrival` is manually managed (not time-based) — team sets this on launch, clears on next drop
- Slugs are unique — safe to use in URLs

---

## Inventory

**What UX can do:**
- Show real-time availability: `quantity - reservedQuantity` = available stock
- Trigger LOW STOCK badge when `available ≤ lowStockThreshold`
- Show OUT OF STOCK when `available = 0 AND allowBackorder = false`
- Show PRE-ORDER when `available = 0 AND allowBackorder = true`
- If `trackInventory = false`, treat as always available (made-to-order / drop model)

**Critical business rules:**
- `reservedQuantity` is incremented when item is added to cart (if stock exists)
- `reservedQuantity` is NEVER incremented for backorder items — don't design UX that implies stock is held for pre-orders
- Every stock change has an `inventoryMovement` audit log — supports admin reconciliation
- Movement types: restock, sale, return, adjustment, reserved, released, cancelled

**UX gotchas:**
- Stock can change while user is on PDP — validate at add-to-cart, not just page load
- "Only X left" signals should query live, not rely on cached page data
- `lowStockThreshold` defaults to 5 — Volt LOW STOCK badge fires at or below this

---

## Cart

**What UX can do:**
- Guest carts: identified by `sessionToken` (httpOnly cookie) — no login needed
- Auth carts: identified by `userId` — persists indefinitely (no `expiresAt`)
- Guest carts expire after 7 days — show "Your cart has expired" if user returns to an expired session
- `unitPrice` is locked at add-to-cart time — show price-change warning if product price has changed since
- Promo codes: `promoCodeId` + `discountAmount` on cart — one promo per cart
- On login: merge guest cart into user cart (app logic, not DB)

**Cart item constraints:**
- Max quantity per item: 10 (Zod enforced, not DB CHECK)
- Unique per (cartId, variantId) — duplicate adds should INCREMENT quantity, not add a row (upsert)

**UX gotchas:**
- Cart total must be computed as `SUM(unitPrice × quantity) - discountAmount`, not from live prices
- If product price changed since add-to-cart, surface a warning ("Price updated") — don't silently update
- Guest cart cleanup is a cron job — users with expired sessions need graceful "cart cleared" messaging

---

## Orders

*(Inferred from related schemas — orders.drizzle.ts was referenced by reviews and promotions)*

**What UX needs to know:**
- Orders have a status lifecycle (likely: pending → confirmed → shipped → delivered → cancelled)
- `shippingAddressSnapshot` is a JSON copy of the address at order time — historical orders are immutable
- `promoCodeUsage` references orderId — promo is consumed when order is confirmed
- `inventoryMovement` of type `sale` fires on confirmed order — stock is permanently decremented

---

## Addresses

**What UX can do:**
- Auth users: save multiple addresses with labels ("Home", "Work", "Mum's")
- One default per user (`isDefault = true`) — pre-select at checkout
- Guest addresses: no userId — attached only to order snapshot
- All 25 Sri Lanka districts available for shipping zone lookup

**Constraints:**
- `isDefault = true` requires `userId` (guest addresses cannot be default)
- Only one default per user (partial unique index in DB)
- Phone: Sri Lankan mobile format (+94 7X XXXXXXX or 07X XXXXXXX)
- Postal code is optional (not all SL addresses have postcodes)

**UX gotchas:**
- District is the key field for shipping zone lookup — it must always be collected
- City is free-text, district is an enum — don't conflate them
- Historical orders snapshot the address — editing a saved address won't retroactively change past orders

---

## Shipping

**What UX can do:**
- Show available methods per district (method default price, or zone override if exists)
- Show estimated delivery range: `estimatedDaysMin`–`estimatedDaysMax` days
- Show free shipping when `subtotal ≥ freeShippingThreshold`
- Show progress toward free shipping in cart

**Lookup logic:**
1. Get customer's district
2. Find `shippingZone` for (methodId, district) — if exists, use `priceOverride` and zone days
3. If no zone: use `shippingMethod.price` and method days
4. If `subtotal ≥ freeShippingThreshold`: method is free

**UX gotchas:**
- Some districts (Mannar, Mullaitivu, Vavuniya, Kilinochchi) may have higher prices — surface this honestly
- Multiple shipping methods may be available — show as radio options sorted by `sortOrder`
- Estimated days are business days (clarify this in UX copy)

---

## Promotions

**What UX can do:**
- Single promo code per cart
- Two types: `percentage` (0–100%) or `fixed` (LKR amount off)
- `maxDiscountAmount` caps percentage discounts — show capped amount if reached
- `minOrderAmount` threshold — validate before applying, show clearly if not met
- `perUserLimit` — typically 1 (one use per customer)
- `usageLimit` — total redemption cap; fail gracefully if exhausted

**Validation sequence (apply in order):**
1. Code exists and `isActive = true`
2. `startsAt ≤ now ≤ expiresAt` (if set)
3. `usedCount < usageLimit` (if set)
4. User's prior usage < `perUserLimit`
5. `subtotal ≥ minOrderAmount` (if set)

**Error messages (brand voice — direct):**
- "Code expired."
- "Already used."
- "Limit reached."
- "Minimum LKR [X] required."
- "Invalid code."

---

## Reviews

**What UX can do:**
- Display rating (1–5 stars), title, body, media (photos/videos)
- Badge verified purchases (`isVerifiedPurchase = true`)
- Only show `isApproved = true` reviews publicly
- Sort by: most recent, highest rated, verified first
- One review per user per product (unique index)

**Moderation:**
- All reviews need admin approval before display — design admin queue for this
- `adminNote` is internal only — never surface to customers

**UX gotchas:**
- `orderId` links review to purchase for verification — verify product is in that order at app layer
- Review media supports both images and videos (mp4, webm)
- Rating CHECK constraint at DB level — but validate 1–5 in Zod before submitting

---

## Wishlist

**What UX can do:**
- Save product with or without variant (`variantId = ''` means "any size")
- One entry per (user, product, variantId) — including the sentinel ''
- When `variantId = ''`, show "Choose your size" nudge on wishlist page
- When `variantId ≠ ''`, validate it's a real variant at app layer

**UX gotchas:**
- Wishlist is auth-only (no guest wishlist in DB) — but UX can hold items in localStorage and migrate on login
- `variantId` has no FK when `= ''` — app layer must validate non-empty values
- When a wishlisted product goes OOS, the item stays in wishlist — surface "Sold Out" badge

---

## Auth

**What UX can do:**
- Phone (SL format, OTP) or Google OAuth
- Anonymous users (`isAnonymous = true`) — potential guest path
- `role` field — supports admin/customer distinction
- `banned` + `banReason` — graceful handling needed ("Account suspended. Contact support.")
- `phoneNumberVerified` — show verified badge on account page

**Current sign-in flow:**
- Unified sign-in/sign-up page
- Google One Tap on load (if FedCM supported)
- Phone → OTP → name prompt (if new user)
- Post-auth redirect to intended destination

**UX gotchas:**
- `isAnonymous` users may exist — don't assume all users have name/phone
- Session has `impersonatedBy` — handle admin impersonation state gracefully in UI
- `banExpires` = null means permanent ban; non-null = temporary