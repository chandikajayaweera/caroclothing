# DB Capabilities for UX

This file maps what each schema enables at the UX layer — with notes on constraints, business rules, and gotchas that affect design decisions.

Read this before making any UX decision that touches real data. All fields described here reflect the current schema state.

---

## Drops

**Tables**: `drop`, `dropProduct`, `dropWaitlist`

**What UX can do:**

- Surface a drop in any status: `teaser` (countdown, no purchase), `live` (purchasable), `sold_out` (display only), `archived` (historical)
- Drive the countdown timer from `drop.launchAt` — null means date TBD, show "Coming Soon" not a broken timer
- Show a dedicated drop page with: `name`, `tagline`, `description`, `heroImageR2Key` (resolve via `mediaUrl(key)`)
- List all drop products in order via `dropProduct.sortOrder`; the `isHero` product's image anchors the drop hero
- Capture notify-me registrations into `dropWaitlist` — accepts phone (E.164) or email, with `contactType` routing to the right notification channel
- On drop launch, query `WHERE notified_at IS NULL` to batch-notify the waitlist
- On user login, merge guest waitlist entries by matching `contact` to the authenticated user's phone/email

**Status transitions** (enforced at app layer, not DB):

- `teaser` → `live`: set by admin when `launchAt` passes; triggers batch waitlist notification
- `live` → `sold_out`: set when all linked products are OOS (can be automated via inventory check)
- Any status → `archived`: manual admin action

**UX gotchas:**

- A product with `tier = 'drop'` should only be purchasable when its linked drop is `live` — enforce this at the app layer
- Multiple products can be in one drop, but only one should be `isHero = true` (enforced at app layer)
- `endAt` is optional — null means the drop has no hard close date, it closes on sell-out or manual archive
- The waitlist is a one-way commitment — no unsubscribe flow is in the schema; handle opt-out in the notification copy

---

## Products

**Tables**: `product`, `productVariant`, `productImage`, `category`, `tag`, `productTag`

**What UX can do:**

- Filter by `tier` (`'drop'` | `'core'`), `gender` (men / women / unisex), `fit` (oversized / regular / slim)
- Surface `isNewArrival` and `isFeatured` products — the two primary editorial flags
- Show `basePrice` (always LKR), struck-through `compareAtPrice` when set
- Display `material` and `careInstructions` (secondary info, below fold)
- Category hierarchy (parent/child) supports nested navigation if catalog grows
- Tags (many-to-many) for faceted browsing at scale

**Tier field — key UX rules:**

- `tier = 'drop'`: bold graphic product, linked to a `drop` record, hype ritual applies, never restock, no "always available" language
- `tier = 'core'`: wordmark/tonal product, always available, quiet restock, no countdown language
- The tier value drives copy, urgency signals, and which UX patterns apply — always check it

**Variants:**

- Each product has size × color variants: `size` enum (XS/S/M/L/XL/XXL/XXXL), `color` (display name) + `colorHex` (hex for swatches)
- `priceOverride` per variant — display variant price if set, else product `basePrice`
- `sku` is the unique identifier — display in Space Mono as a product code

**Images:**

- `variantId = null` → applies to all variants (lifestyle/editorial shots)
- `variantId = X` → specific to that color/size combo
- `isPrimary = true` → hero image (at most one per product, one per variant — enforced by partial index in migration SQL)
- Images are R2 keys — resolve via `mediaUrl(r2Key)` from `media/utils.ts`, never store raw URLs

**UX gotchas:**

- A product may have many variants but only some are `isActive = true` — always filter on this
- `isNewArrival` is manually managed (not time-based) — team sets it on launch, clears it on the next drop
- Slugs are unique and URL-safe — safe to use directly in routes
- A drop-tier product should not be browsable in the standard catalog while its drop is in `teaser` status — gate this at the app layer

---

## Inventory

**Tables**: `inventory`, `inventoryMovement`

**What UX can do:**

- Show real-time availability: `quantity - reservedQuantity` = available stock
- Trigger LOW STOCK badge when `available ≤ lowStockThreshold` (default: 5)
- Show OUT OF STOCK when `available = 0 AND allowBackorder = false`
- Show PRE-ORDER when `available = 0 AND allowBackorder = true`
- If `trackInventory = false`, treat as always available (used for made-to-order / teaser-state drops)

**Critical business rules:**

- `reservedQuantity` is incremented when an item is added to cart (only when stock physically exists)
- `reservedQuantity` is NEVER incremented for backorder items — do not design UX that implies stock is held for pre-orders
- Every stock change has an `inventoryMovement` audit row — supports admin reconciliation
- Movement types: restock, sale, return, adjustment, reserved, released, cancelled

**UX gotchas:**

- Stock can change while the user is on the product page — validate again at add-to-cart, not just page load
- "Only X left" signals must query live data, not rely on cached page values
- For drop products: when the drop goes `sold_out`, surface the sold-out state prominently — it's a cultural milestone, not a failure

---

## Cart

**Tables**: `cart`, `cartItem`

**What UX can do:**

- Guest carts: identified by `sessionToken` (httpOnly cookie) — no login needed
- Authenticated carts: identified by `userId` — persists indefinitely (no `expiresAt`)
- Guest carts expire after 7 days — show "Your cart has cleared" gracefully if a user returns after expiry
- `unitPrice` is locked at add-to-cart time — show a price-change warning if the product price has since changed; do not silently update
- Promo codes: `promoCodeId` + `discountAmount` on cart — one promo per cart at a time
- On login: merge guest cart into the authenticated cart (app logic, not DB)

**Cart item constraints:**

- Max quantity per item: 10 (Zod-enforced, not a DB CHECK)
- Unique per (cartId, variantId) — duplicate adds must INCREMENT quantity via upsert, not insert a second row

**UX gotchas:**

- Cart total = `SUM(unitPrice × quantity) - discountAmount` — compute from locked prices, not live catalog prices
- If price changed since add-to-cart, surface a warning ("Price updated") — never silently change what the customer expected to pay
- Guest cart cleanup is a cron job — handle expired sessions with graceful "cart cleared" messaging

---

## Orders

**Tables**: `order` (table name: `orders`), `orderItem`, `payment`, `orderStatusHistory`

**What UX can do:**

- Show order lifecycle: `pending → confirmed → processing → shipped → delivered → cancelled → refunded`
- Display `orderNumber` (format: CARO-YYYYMMDD-XXXXX) as the human-readable reference in Space Mono
- Surface tracking: `trackingNumber`, `trackingCarrier`, `trackingUrl` when available
- `shippingAddressSnapshot` (JSON) is the immutable source of truth for fulfilment — historical orders are never affected by address edits
- `promoCodeSnapshot` is likewise immutable — accurate price history even if the code is later deactivated
- `orderItem` stores denormalized product/variant data at purchase time — always use these fields for display, not live catalog data

**UX gotchas:**

- `productImageR2Key` on order items is a snapshot of the primary image at order time — resolve via `mediaUrl(key)`
- Order items reference both live FKs (for admin lookups) and denormalized snapshots — always show the snapshot data to customers

---

## Addresses

**Tables**: `address`

**What UX can do:**

- Authenticated users: save multiple addresses with labels ("Home", "Work", "Mum's")
- One default per user (`isDefault = true`) — pre-select at checkout
- Guest addresses: no `userId` — attached only to the order snapshot, not saved for future use
- All 25 Sri Lankan districts available for shipping zone lookup

**Constraints:**

- `isDefault = true` requires `userId` — guest addresses cannot be default
- Only one default per user (partial unique index in migration SQL)
- Phone: Sri Lankan mobile format (`+94 7X XXXXXXX` or `07X XXXXXXX`)
- Postal code is optional (not all SL addresses have them)

**UX gotchas:**

- District is the key field for shipping zone lookup — always collect it; never let it be ambiguous
- City is free text; district is an enum — do not conflate them in the UI
- Editing a saved address does not retroactively change historical orders (those use the snapshot)

---

## Shipping

**Tables**: `shippingMethod`, `shippingZone`

**What UX can do:**

- Show available methods per district — use zone override price if a `shippingZone` row exists for (methodId, district), else fall back to `shippingMethod.price`
- Show estimated delivery range: `estimatedDaysMin`–`estimatedDaysMax` business days
- Show free shipping when `subtotal ≥ freeShippingThreshold` (null = never free via this method)
- Show progress toward free shipping in cart

**Lookup logic** (apply in order):

1. Get customer's district
2. Find `shippingZone` for (methodId, district) — if exists, use `priceOverride` + zone days
3. If no zone: use `shippingMethod.price` + method days
4. If `subtotal ≥ freeShippingThreshold`: method is free (display "FREE" in Volt)

**UX gotchas:**

- Some districts (Mannar, Mullaitivu, Vavuniya, Kilinochchi) may have higher prices — surface this honestly, never hide it
- Multiple shipping methods may be available — show as radio options sorted by `sortOrder`
- Estimated days are business days — clarify this in copy ("3–5 business days", not "3–5 days")

---

## Promotions

**Tables**: `promoCode`, `promoCodeUsage`

**What UX can do:**

- Single promo code per cart
- Two types: `percentage` (0–100%) or `fixed` (LKR amount off)
- `maxDiscountAmount` caps percentage discounts — show the capped amount if it's reached
- `minOrderAmount` threshold — validate before applying, display the requirement clearly if not met
- `perUserLimit` — typically 1; fail gracefully if exceeded

**Validation sequence** (apply in order — fail fast):

1. Code exists and `isActive = true`
2. `startsAt ≤ now ≤ expiresAt` (if set)
3. `usedCount < usageLimit` (if set)
4. User's prior usage count < `perUserLimit`
5. `subtotal ≥ minOrderAmount` (if set)

**Error messages** (brand voice — direct):

- "Code expired."
- "Already used."
- "Limit reached."
- "Minimum LKR [X] required."
- "Invalid code."

---

## Reviews

**Tables**: `review`, `reviewMedia`

**What UX can do:**

- Display rating (1–5 stars), title, body, and media (photos/videos)
- Badge verified purchases (`isVerifiedPurchase = true`) — "Verified Purchase" in Volt
- Only show `isApproved = true` reviews publicly — all reviews require admin approval before display
- Sort options: most recent, highest rated, verified first
- One review per user per product (unique index — app should handle this gracefully, not throw a DB error)

**UX gotchas:**

- Review media supports both images and videos (mp4, webm) — design the media strip to handle both
- `adminNote` is internal only — never surface to customers
- All reviews start as `isApproved = false` — build an admin moderation view before enabling public reviews
- `orderId` on a review links to the purchase for verification — validate at app layer that the product is in that order

---

## Wishlist

**Tables**: `wishlistItem`

**What UX can do:**

- Save a product with or without a specific variant (`variantId = ''` means no size chosen yet)
- Show "Choose your size" nudge on the wishlist page when `variantId = ''`
- One entry per (user, product, variantId) — duplicates are prevented by unique index
- When a wishlisted product goes OOS, show "Sold Out" badge — the item stays in the wishlist

**UX gotchas:**

- Wishlist is auth-only in the DB — but UX can hold items optimistically in localStorage for guests and migrate on login
- `variantId = ''` is a sentinel, not a real FK — app must validate non-empty values reference a real variant
- No guest wishlist in DB — prompt guests to sign in to save permanently; don't block the wishlist UI

---

## Auth

**Tables**: `user`, `session`, `account`, `verification` (BetterAuth managed — do not modify)

**What UX needs to know:**

- Phone (SL format, OTP via text.lk) or Google OAuth are the two sign-in methods
- Anonymous users (`isAnonymous = true`) exist — not all users have a name or email
- `role` field supports admin / customer distinction — admin users see additional UI
- `banned` + `banReason` — show "Account suspended. Contact support." and block all further actions
- `phoneNumberVerified` — show a "Verified" badge next to the phone number in account settings

**Current sign-in flow:**

1. Unified sign-in/sign-up page
2. Google One Tap on load (if FedCM supported by browser)
3. Phone → OTP (30s resend cooldown enforced via KV) → name prompt if new user
4. Post-auth redirect to intended destination

**UX gotchas:**

- `isAnonymous` users may exist — don't assume all users have a name or phone number in UI
- Session has `impersonatedBy` — handle admin impersonation state gracefully (show a banner, don't treat as the real user)
- `banExpires = null` means permanent ban; non-null means temporary — surface the distinction in the suspension message
- OTP rate limiting is enforced at the app layer (Cloudflare KV) — design the resend UI to respect the cooldown counter
