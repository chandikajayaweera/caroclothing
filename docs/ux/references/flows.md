# Flow Design Reference

Detailed decision trees and flow diagrams for all major user journeys.

---

## Shopping Flow

```
Homepage
├── Hero (current drop / featured campaign)
│   └── [Shop the Drop] → PLP filtered to isNewArrival=true
├── New In grid → PLP (isNewArrival=true)
└── Nav → PLP (all / men / women)

PLP
├── Filters: Gender toggle | Fit chips
├── Sort: New / Featured / Price
├── Product card → PDP
│   ├── Hover: alternate image (back shot)
│   └── Quick-add (if single variant) [optional, advanced]
└── Load more / paginate (not infinite scroll — intentional)

PDP
├── Image gallery (swipeable mobile, grid desktop)
├── Product name (Bebas Neue, large)
├── Price (Space Mono, LKR)
│   └── compareAtPrice struck through if set
├── Color selector → swaps images to variant images
├── Size selector
│   ├── Available → selectable
│   ├── OOS (allowBackorder=false) → grayed, not selectable
│   └── Backorder (allowBackorder=true) → selectable, "Pre-Order" label
├── Stock signal (Volt badge)
│   ├── qty-reserved > lowStockThreshold → none
│   ├── 0 < qty-reserved ≤ lowStockThreshold → "LOW STOCK"
│   ├── qty-reserved = 1 or 2 → "ALMOST GONE"
│   └── qty-reserved = 0, allowBackorder=false → "SOLD OUT" (disable Add to Cart)
├── [Add to Cart] / [Pre-Order] / [Sold Out — disabled]
├── [Add to Wishlist] (heart icon, top right of images)
├── Product details accordion
│   ├── Description (DM Sans)
│   ├── Material & Care
│   └── Shipping (district-based estimate lookup)
└── Reviews section
    ├── Rating summary (stars + count)
    ├── Review cards (approved only)
    │   ├── Verified badge if isVerifiedPurchase
    │   ├── Photo/video strip if reviewMedia exists
    │   └── Rating + title + body
    └── [Write a Review] (auth required, purchased product preferred)
```

---

## Checkout Flow

### Entry Points

- Cart icon in nav → Cart drawer or Cart page
- "Add to Cart" on PDP → Cart drawer appears

### Cart (Drawer or Page)

```
Cart
├── Item list
│   ├── Image thumbnail
│   ├── Name + Size + Color (Space Mono for metadata)
│   ├── Price (locked unitPrice, LKR)
│   ├── Quantity stepper (min 1, max 10)
│   └── Remove
├── Promo code field (inline, validates on blur/Enter)
│   ├── Success: "CARO20 applied — LKR 500 off" (Volt text)
│   ├── Error: direct message (see error library)
│   └── Applied: show discount line, [Remove] link
├── Free shipping progress bar (if subtotal < threshold)
│   └── "Add LKR X more for free shipping"
├── Subtotal / Discount / Shipping (TBD) / Total
└── [Checkout] → Step 1
```

### Checkout Steps

```
Step 1: Contact
├── Guest: phone or email input
├── Auth: pre-filled, read-only with [Change] link
└── [Continue]

Step 2: Delivery Address
├── Auth user with saved addresses:
│   ├── Address cards (select default pre-selected)
│   ├── [+ Add new address]
│   └── [Continue]
├── Auth user, no saved address:
│   └── Address form (below)
└── Guest:
    └── Address form:
        ├── Recipient name
        ├── Phone (Sri Lankan format, +94 prefix displayed)
        ├── Address Line 1 (required)
        ├── Address Line 2 (optional)
        ├── City (free text)
        ├── District (dropdown, all 25 SL districts)
        ├── Postal Code (optional)
        └── [Continue]

Step 3: Shipping Method
├── Query shippingZone(methodId, district) for available methods
├── Radio cards:
│   ├── Method name + carrier
│   ├── Price (or "FREE" in Volt if threshold met)
│   └── "Delivered in X–Y business days"
└── [Continue]

Step 4: Payment
├── (Payment provider integration — scope TBD)
└── [Place Order] → Order confirmation

Order Confirmation
├── Order number (Space Mono, large)
├── "We'll text you when it ships." (if phone collected)
├── Order summary (items, address, shipping)
├── [Continue Shopping]
└── Guest: "Save your details for next time" prompt
    └── [Create Account] (frictionless — phone already captured)
```

---

## Authentication Flow

### Sign-In Page (Current Implementation)

```
View: idle
├── [Continue with Google] → Google OAuth → afterSignIn()
└── [Continue with Phone] → View: phone

View: phone
├── +94 prefix + 9-digit input
├── [Send Code] → OTP sent → View: otp
└── [Back to main] → View: idle

View: otp
├── 6-digit code input (auto-submits on 6 digits)
├── [Verify Account] → afterSignIn()
├── [Wrong number] → View: phone
└── [Resend code] (30s cooldown)

afterSignIn():
├── New user (created < 60s ago) → View: name-prompt
└── Returning user → redirect to destination

View: name-prompt
├── Name input (optional)
├── [Continue] → save name → redirect
└── [Skip for now] → redirect
```

### Auth during Checkout

```
Checkout entry (guest)
├── Google One Tap overlay (if FedCM supported)
│   ├── Accepted → merge cart → continue as auth
│   └── Dismissed → continue as guest
├── "Sign in for faster checkout" link (subtle, not blocking)
└── Continue as guest → collect contact inline
```

---

## Drop Launch Flow

```
Pre-Drop (T-7 days to T-0)
├── Homepage hero: product silhouette / campaign visual
├── Countdown timer (honest — fixed date, never resets)
├── [Notify Me] CTA
│   ├── Guest: phone/email capture
│   └── Auth: one-tap notify (phone already on file)
└── Teaser PDP: name, campaign copy, "Coming [Day]"

Drop Live (T-0)
├── Push notification / SMS / email to notify list
├── Homepage hero: switches to product hero
├── isNewArrival=true, isFeatured=true set on products
├── Full PDP live with live stock display
└── Cart reservations begin (reservedQuantity increments)

During Drop
├── Live stock signals (LOW STOCK, ALMOST GONE)
├── Sold-out variants → greyed out in size selector
├── If all variants OOS:
│   ├── allowBackorder=true → [Pre-Order] CTA
│   └── allowBackorder=false → [Sold Out] + waitlist capture

Post-Drop
├── Sold-out products remain visible (social proof)
├── "Sold Out" badge on product cards
└── "Next drop" teaser in homepage hero slot
```

---

## Account Flow

```
Account Dashboard
├── Profile (name, phone, email, avatar)
├── Orders
│   ├── Order list (most recent first)
│   └── Order detail
│       ├── Status + tracking
│       ├── Items (snapshot price, not live)
│       ├── Shipping address (snapshot)
│       └── [Write a Review] per item (if delivered)
├── Addresses
│   ├── Saved address cards (with labels)
│   ├── Default badge
│   ├── [Edit] / [Delete] / [Set as Default]
│   └── [+ Add Address]
└── Wishlist
    ├── Product cards with current stock status
    ├── [Move to Cart] (if variant selected + in stock)
    └── [Remove]
```

---

## Error States

| Scenario                           | UX Response                                                               |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Cart item OOS at checkout          | Alert: "X is sold out. Remove it to continue." — block checkout           |
| Price changed since add-to-cart    | Warning banner: "Price updated for [item]. [New price]." — don't block    |
| Promo code expired                 | Inline: "Code expired." — clear discount, don't block                     |
| Guest cart expired                 | Toast on return: "Your cart cleared. Start fresh." — not an error         |
| Account banned                     | Page: "Account suspended. [Contact support]."                             |
| Shipping not available to district | Show in shipping step: "We don't ship to [District] yet." (if applicable) |
| Network error on add-to-cart       | Toast: "Didn't add. Try again." — keep item state                         |
