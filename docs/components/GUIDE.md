# Caro Clothing — SvelteKit Route & Component Guide (Validated)

# Stack: SvelteKit · Tailwind CSS v4 (@tailwindcss/vite) · TypeScript

# Last validated: April 2025

---

## ⚠️ CRITICAL — Tailwind v4 Configuration

This project uses `@tailwindcss/vite` (Tailwind v4). There is NO `tailwind.config.js`.
All theme tokens are defined in `src/routes/layout.css` using the `@theme {}` directive.
Do NOT generate a `tailwind.config.js` — it will be ignored and cause confusion.

### `src/routes/layout.css` — Full token setup

```css
@import 'tailwindcss';

/* ─── Google Fonts ────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap');

/* ─── Caro Design Tokens ─────────────────────────────────────── */
@theme {
	/* Colors */
	--color-void: #0a0a0a; /* bg-void     text-void     */
	--color-bone: #f8f5f0; /* bg-bone     text-bone     */
	--color-charcoal: #1c1c1c; /* bg-charcoal text-charcoal */
	--color-ash: #b4afa8; /* bg-ash      text-ash      */
	--color-volt: #c8ff00; /* bg-volt     text-volt     */

	/* Typography */
	--font-display: 'Bebas Neue', sans-serif; /* font-display */
	--font-mono: 'Space Mono', monospace; /* font-mono    */
	--font-sans: 'DM Sans', sans-serif; /* font-sans    */
}

/* ─── Base layer ─────────────────────────────────────────────── */
@layer base {
	html {
		background-color: var(--color-void);
		color: var(--color-bone);
		font-family: var(--font-sans);
		-webkit-font-smoothing: antialiased;
	}

	/* Volt focus ring — applied globally to interactive elements */
	:focus-visible {
		outline: 2px solid var(--color-volt);
		outline-offset: 2px;
	}
}
```

**How v4 class names are derived from token names:**

- `--color-void` → `bg-void`, `text-void`, `border-void`, `ring-void`
- `--color-volt` → `bg-volt`, `text-volt`, `border-volt`
- `--font-display` → `font-display`
- `--font-mono` → `font-mono`

---

## Existing vs. To-Create

### Already exists — do NOT recreate

```
src/routes/+layout.svelte                  ← update: import layout.css, add Nav + Footer
src/routes/+page.svelte                    ← update: homepage content
src/routes/(auth)/sign-in/+page.svelte     ← leave as-is (fully implemented)
src/routes/cart/+page.svelte               ← update: cart UI
src/routes/shop/+page.svelte               ← update: PLP UI
src/routes/shop/[slug]/+page.svelte        ← update: PDP UI
src/routes/app/+page.svelte                ← SKIP (likely admin panel — do not touch)
src/routes/media/[...key]/+server.ts       ← leave as-is (R2 media proxy)

src/lib/components/layout/Navbar.svelte    ← update: full responsive nav
src/lib/components/layout/Footer.svelte    ← update: full footer
src/lib/components/product/ProductCard.svelte  ← update: full card with all states
src/lib/components/ui/Button.svelte        ← update: brand-styled button variants
```

### Needs to be created — new files

```
src/routes/checkout/+layout.svelte
src/routes/checkout/+page.svelte
src/routes/checkout/confirmation/[orderId]/+page.svelte
src/routes/drops/[slug]/+page.svelte
src/routes/account/+layout.svelte
src/routes/account/+page.svelte
src/routes/account/orders/+page.svelte
src/routes/account/orders/[orderId]/+page.svelte
src/routes/account/addresses/+page.svelte
src/routes/account/wishlist/+page.svelte

src/lib/components/layout/MobileMenu.svelte
src/lib/components/cart/CartDrawer.svelte
src/lib/components/cart/CartItem.svelte
src/lib/components/product/PDPImageGallery.svelte
src/lib/components/product/PDPInfo.svelte
src/lib/components/product/ProductAccordion.svelte
src/lib/components/product/ColorSelector.svelte
src/lib/components/product/SizeSelector.svelte
src/lib/components/product/StockBadge.svelte
src/lib/components/product/PriceDisplay.svelte
src/lib/components/product/ShippingEstimate.svelte
src/lib/components/reviews/ReviewsSection.svelte
src/lib/components/reviews/ReviewCard.svelte
src/lib/components/checkout/CheckoutProgress.svelte
src/lib/components/checkout/CheckoutOrderSummary.svelte
src/lib/components/checkout/CheckoutContactStep.svelte
src/lib/components/checkout/CheckoutAddressStep.svelte
src/lib/components/checkout/CheckoutShippingStep.svelte
src/lib/components/checkout/CheckoutPaymentStep.svelte
src/lib/components/account/OrderStatusTimeline.svelte
src/lib/components/home/HeroSection.svelte
src/lib/components/home/NewInGrid.svelte
src/lib/components/home/EditorialBanner.svelte
src/lib/components/drops/CountdownTimer.svelte
src/lib/components/shared/AddressForm.svelte
src/lib/components/shared/Toast.svelte
src/lib/components/shared/StarRating.svelte
src/lib/components/filters/FilterBar.svelte
src/lib/components/filters/SortBottomSheet.svelte

src/lib/stores/cart.ts
src/lib/stores/toast.ts
src/lib/stores/ui.ts            ← mobile menu open/close, cart drawer open/close
```

### Available static assets (use these for mockup data)

```
/images/black_tee.png     ← product photo
/images/white_tee.png     ← product photo
/images/hero.png          ← hero section background
/images/editorial.png     ← editorial/banner section
/logo.png                 ← Caro logo (white version)

src/lib/assets/model_1.jpeg   ← import in Svelte: import model1 from '$lib/assets/model_1.jpeg'
src/lib/assets/model_2.jpeg
src/lib/assets/model_3.jpeg
```

---

## Breakpoint Convention

All responsive specs in this document use these three tiers:

| Tier    | Tailwind prefix   | Viewport       |
| ------- | ----------------- | -------------- |
| Mobile  | (base, no prefix) | < 768px        |
| Tablet  | `md:`             | 768px – 1023px |
| Desktop | `lg:`             | 1024px+        |

---

## Route: Root Layout

**File:** `src/routes/+layout.svelte`

```svelte
<script>
	import '../routes/layout.css';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import CartDrawer from '$lib/components/cart/CartDrawer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import MobileMenu from '$lib/components/layout/MobileMenu.svelte';

	// CartDrawer and MobileMenu visibility driven by ui store
</script>

<Navbar />
<MobileMenu />
<CartDrawer />
<Toast />

<main>
	<slot />
</main>

<Footer />
```

Note: Checkout route gets its own layout (no Navbar/Footer) — SvelteKit's `+layout.svelte`
inside `src/routes/checkout/` will override the root layout for checkout pages only.

---

## Component: `Navbar.svelte`

**File:** `src/lib/components/layout/Navbar.svelte` (update existing)

### Mockup data

```ts
const navLinks = [
  { label: 'Shop',    href: '/shop' },
  { label: 'New In',  href: '/shop?sort=new' },
  { label: 'Men',     href: '/shop?gender=men' },
  { label: 'Women',   href: '/shop?gender=women' },
  { label: 'About',   href: '/about' },
]
// cartCount and wishlistCount come from stores
```

### Mobile (base, < 768px) — height: 56px

- `fixed top-0 inset-x-0 z-50 bg-void border-b border-charcoal h-14`
- Grid: `grid grid-cols-3 items-center px-4`
  - **Left cell:** Hamburger button → opens MobileMenu store
    - 3 horizontal lines, each `w-5 h-[1.5px] bg-bone`, spaced `gap-1`
    - `aria-label="Open menu"`
  - **Center cell:** Logo — `<img src="/logo.png" class="h-7 mx-auto" alt="Caro">`
  - **Right cell:** Cart icon with item count badge — `flex justify-end`
    - Cart SVG icon, `w-5 h-5 stroke-bone`
    - Count badge: absolute `bg-volt text-void font-mono text-[9px] leading-none w-4 h-4 rounded-full flex items-center justify-center -top-1 -right-1`
    - Tapping navigates to `/cart` (no drawer on mobile)

### Tablet (md: 768px+)

- Same fixed bar, height: 60px (`md:h-15`)
- Layout: `flex items-center justify-between px-6`
  - **Left:** Logo `md:h-8`
  - **Center:** Nav links row
    - `flex gap-6`
    - Each link: `font-mono text-[10px] uppercase tracking-[0.15em] text-ash hover:text-bone transition-colors`
    - Active route: `text-volt border-b border-volt pb-px`
  - **Right:** Icon row `flex items-center gap-4`
    - Wishlist icon (heart, `w-5 h-5`) with count badge
    - Cart icon with count badge
    - Account icon → `/account` (or `/sign-in` if logged out)

### Desktop (lg: 1024px+)

- Height: 64px (`lg:h-16`)
- Padding: `lg:px-8`
- Nav links: `lg:gap-8`, `lg:text-xs`
- Add Search icon left of Wishlist
- On scroll > 20px: `backdrop-blur-md bg-void/90` (add/remove class via scroll listener)

### Scroll state (all breakpoints)

```svelte
<script>
  let scrolled = $state(false)
  // In onMount:
  window.addEventListener('scroll', () => { scrolled = window.scrollY > 20 })
</script>

<nav class="fixed top-0 inset-x-0 z-50 h-14 md:h-[60px] lg:h-16 border-b border-charcoal transition-colors
  {scrolled ? 'bg-void/90 backdrop-blur-md' : 'bg-void'}">
```

---

## Component: `MobileMenu.svelte`

**File:** `src/lib/components/layout/MobileMenu.svelte` (new)

### Mockup data

```ts
// Same navLinks as Navbar
// Driven by uiStore.mobileMenuOpen
```

### All breakpoints (mobile only — hidden md:hidden)

- Full-screen overlay: `fixed inset-0 z-[60] bg-void flex flex-col`
- Slide in from left: Svelte `fly` transition `{ x: -20, duration: 250 }`
- **Top row:** `flex justify-between items-start p-5`
  - Logo: `<img src="/logo.png" class="h-8">`
  - Close (×): `text-ash hover:text-bone text-2xl font-light` — calls `uiStore.closeMobileMenu()`
- **Nav links:** `flex flex-col gap-1 px-5 mt-10`
  - Each: `font-display text-5xl text-bone hover:text-volt transition-colors py-1`
  - Active: `text-volt`
- **Bottom bar:** `mt-auto p-5 border-t border-charcoal flex justify-between items-center`
  - Account link: `font-mono text-xs text-ash uppercase tracking-widest`
  - Social icons: Instagram + TikTok SVGs, `w-5 h-5 text-ash hover:text-volt`

---

## Component: `Footer.svelte`

**File:** `src/lib/components/layout/Footer.svelte` (update existing)

### Mockup data

```ts
const tagline = 'WEAR THE NEXT GENERATION'
const columns = [
  {
    heading: 'Shop',
    links: [
      { label: 'New In',   href: '/shop?sort=new' },
      { label: 'Men',      href: '/shop?gender=men' },
      { label: 'Women',    href: '/shop?gender=women' },
      { label: 'All',      href: '/shop' },
    ]
  },
  {
    heading: 'Info',
    links: [
      { label: 'About',    href: '/about' },
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns',  href: '/returns' },
      { label: 'Contact',  href: '/contact' },
    ]
  },
]
const social = [
  { label: 'Instagram', href: 'https://instagram.com/caroapparel',  icon: 'instagram' },
  { label: 'TikTok',    href: 'https://tiktok.com/@caroapparel',     icon: 'tiktok' },
]
const copyright = `© ${new Date().getFullYear()} Caro Clothing. Sri Lanka.`
```

### Mobile (stacked)

- `bg-charcoal pt-12 pb-8`
- Tagline first: `font-display text-4xl text-bone px-5 mb-8`
- Each column: collapsible accordion
  - Header: `font-mono text-[10px] uppercase tracking-[0.2em] text-ash py-4 px-5 flex justify-between border-b border-void/40 cursor-pointer`
  - `+` / `–` right side
  - Links: `font-mono text-xs text-ash hover:text-bone px-5 py-2 block`
- Social icons: `flex gap-4 px-5 mt-8` — each `w-5 h-5 text-ash hover:text-volt`
- Copyright: `font-mono text-[10px] text-ash/50 px-5 mt-8`

### Tablet/Desktop (grid)

- `bg-charcoal py-16 px-8 lg:px-12`
- `grid grid-cols-2 md:grid-cols-4 gap-8`
  - Col 1 (spans 2 on md): Logo + tagline + social
  - Col 2: Shop links
  - Col 3: Info links
  - Col 4: Legal (`Privacy`, `Terms`) + copyright at bottom
- No accordions — all links visible
- Link style: `font-mono text-[10px] uppercase tracking-[0.15em] text-ash hover:text-bone transition-colors block mb-2`

---

## Component: `CartDrawer.svelte`

**File:** `src/lib/components/cart/CartDrawer.svelte` (new)

Desktop/tablet only. Mobile cart = `/cart` page.

### Mockup data

```ts
const cartItems = [
  {
    id: '1',
    name: 'Void Oversized Tee',
    color: 'Void Black',
    size: 'L',
    unitPrice: 3200,
    quantity: 1,
    image: '/images/black_tee.png',
    sku: 'CARO-BLK-001-L'
  },
  {
    id: '2',
    name: 'Bone Staple Tee',
    color: 'Off White',
    size: 'M',
    unitPrice: 2900,
    quantity: 2,
    image: '/images/white_tee.png',
    sku: 'CARO-WHT-003-M'
  },
]
const subtotal = 9000
const freeShippingThreshold = 10000
const amountToFreeShipping = freeShippingThreshold - subtotal  // 1000
const freeShippingProgress = (subtotal / freeShippingThreshold) * 100  // 90%
```

### Desktop/Tablet (hidden on mobile: `hidden md:block`)

- Fixed right panel: `fixed top-0 right-0 h-full w-[420px] bg-void border-l border-charcoal z-[55] flex flex-col`
- Svelte `fly` transition: `{ x: 420, duration: 250 }`
- Backdrop: `fixed inset-0 bg-void/50 z-[54]` — click to close

**Header:**

```
YOUR BAG (2)                    ×
```

- `font-display text-3xl text-bone` + `font-mono text-xs text-ash`
- `px-6 py-5 border-b border-charcoal`

**Free shipping bar:**

- `px-6 py-3 bg-charcoal`
- Text: `"Add LKR 1,000 more for free shipping"` — `font-mono text-[10px] text-ash`
- Bar: `h-[2px] bg-ash/20 mt-1.5 rounded-full overflow-hidden`
- Fill: `h-full bg-volt transition-all duration-500` width = `{freeShippingProgress}%`
- When `subtotal >= threshold`: `"Free shipping unlocked"` text in `text-volt`

**Item list:** `flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4`
Each `CartItem.svelte`:

- `flex gap-4 items-start`
- Image: `w-16 h-20 object-cover flex-shrink-0` — use actual `/images/` paths
- Right side:
  - Name: `font-sans text-sm font-medium text-bone`
  - Variant: `font-mono text-[10px] text-ash uppercase` — `"L · VOID BLACK"`
  - SKU: `font-mono text-[9px] text-ash/50`
- Bottom row: quantity stepper left + price right
  - Stepper: `flex items-center gap-2` — `[−]` · count · `[+]` in `font-mono text-sm`
  - Price: `font-mono text-sm text-bone`
  - Remove (×): `font-mono text-xs text-ash/50 hover:text-volt ml-auto`

**Footer:** `px-6 py-5 border-t border-charcoal`

- Subtotal row: `flex justify-between font-mono text-sm` — `"SUBTOTAL"` left · `"LKR 9,000"` right
- `[Checkout]` button: `w-full bg-volt text-void font-mono text-xs uppercase tracking-[0.15em] py-4 mt-4 hover:bg-bone transition-colors`
- `[View Bag →]` link: `font-mono text-[10px] text-ash text-center block mt-3 hover:text-bone`

---

## Component: `ProductCard.svelte`

**File:** `src/lib/components/product/ProductCard.svelte` (update existing)

### Mockup data

```ts
const products = [
  {
    name: 'Void Oversized Tee',
    slug: 'void-oversized-tee',
    price: 3200,
    compareAtPrice: 4000,
    colorSwatches: [
      { name: 'Void Black', hex: '#0A0A0A' },
      { name: 'Ash Grey',   hex: '#B4AFA8' },
    ],
    primaryImage: '/images/black_tee.png',
    hoverImage:   '/images/black_tee.png',   // use same for now; swap when back-shot available
    badge: 'LOW STOCK',
  },
  {
    name: 'Bone Staple Tee',
    slug: 'bone-staple-tee',
    price: 2900,
    compareAtPrice: null,
    colorSwatches: [{ name: 'Off White', hex: '#F8F5F0' }],
    primaryImage: '/images/white_tee.png',
    hoverImage:   '/images/white_tee.png',
    badge: 'NEW',
  },
]
```

### Mobile (base)

- `group relative flex flex-col cursor-pointer`
- **Image container:** `relative aspect-[3/4] overflow-hidden bg-charcoal`
  - `<img class="w-full h-full object-cover object-top">`
  - No border radius — `rounded-none`
  - Badge (if set): `absolute top-2 left-2`
  - Wishlist heart: `absolute top-2 right-2 w-8 h-8 flex items-center justify-center`
    - Always visible on mobile: `opacity-100`
    - Heart SVG: `w-4 h-4` — `stroke-bone fill-transparent` → `fill-volt stroke-volt` when saved
- **Info below image:** `pt-2 flex flex-col gap-1`
  - Name: `font-sans text-sm font-medium text-bone leading-snug`
  - Price row: `flex items-baseline gap-2`
    - Price: `font-mono text-sm text-bone`
    - Compare: `font-mono text-xs text-ash line-through` (if set)
  - Color swatches: `flex gap-1.5 mt-1`
    - Each: `w-3 h-3 rounded-full border border-ash/20`

### Tablet (md:)

- 3-column grid context — same card, slightly larger image

### Desktop (lg:)

- 4-column grid context
- Hover image crossfade:
  ```svelte
  <img
  	class="absolute inset-0 h-full w-full object-cover object-top
    opacity-0 transition-opacity duration-300 group-hover:opacity-100"
  	src={hoverImage}
  	alt=""
  />
  ```
- Wishlist heart: `opacity-0 group-hover:opacity-100 transition-opacity duration-200`
- Name gets Volt underline: `group-hover:underline decoration-volt`

### Badge variants (`StockBadge.svelte` inline here or as separate component)

- `LOW STOCK` / `ALMOST GONE` / `NEW` / `PRE-ORDER`:
  `bg-volt text-void font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5`
- `SOLD OUT`:
  `bg-charcoal text-ash border border-ash/30 font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5`
- Image opacity when SOLD OUT: `opacity-50`

---

## Component: `ui/Button.svelte`

**File:** `src/lib/components/ui/Button.svelte` (update existing)

### Variants (all brand-compliant)

```svelte
<!-- Primary — Volt CTA -->
<Button variant="primary">Add to Cart</Button>
<!-- bg-volt text-void font-mono text-xs uppercase tracking-[0.15em] px-5 py-3.5 hover:bg-bone transition-colors -->

<!-- Secondary — outlined -->
<Button variant="secondary">Save to Wishlist</Button>
<!-- border border-ash text-ash font-mono text-xs uppercase tracking-[0.15em] px-5 py-3.5 hover:border-volt hover:text-volt transition-colors -->

<!-- Ghost — text only -->
<Button variant="ghost">View All →</Button>
<!-- font-mono text-xs text-ash uppercase tracking-[0.15em] hover:text-volt transition-colors -->

<!-- Disabled — any variant -->
<!-- opacity-40 cursor-not-allowed pointer-events-none -->
```

NO border radius on any button variant — `rounded-none` is the default for all.

---

## Route: `/` — Homepage

**File:** `src/routes/+page.svelte` (update)

### Layout structure

```svelte
<HeroSection />
<NewInGrid />
<EditorialBanner />
```

---

## Component: `HeroSection.svelte`

**File:** `src/lib/components/home/HeroSection.svelte` (new)

### Mockup data

```ts
const hero = {
  tag: 'Drop 001 — Live Now',
  headline: ['WEAR THE', 'NEXT', 'GENERATION'],   // array for line-by-line control
  subline: 'New arrivals. Limited stock.',
  cta: { label: 'Shop the Drop', href: '/shop?sort=new' },
  image: '/images/hero.png',                        // use actual static asset
}
```

### Mobile (base)

- `relative min-h-screen flex flex-col justify-end`
- Background: `<img src="/images/hero.png" class="absolute inset-0 w-full h-full object-cover object-top">`
- Gradient overlay: `absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent`
- Content: `relative z-10 px-5 pb-12`
  - Tag: `font-mono text-[10px] text-volt uppercase tracking-[0.2em] mb-4`
  - Headline: each line in `font-display text-[80px] leading-[0.88] text-bone`
    - Line 2 ("NEXT") or line 3 could be `text-volt` for accent
  - Subline: `font-mono text-xs text-ash mt-4`
  - CTA: `inline-block bg-volt text-void font-mono text-[10px] uppercase tracking-[0.2em] px-6 py-3.5 mt-6 hover:bg-bone transition-colors`

### Tablet (md:)

- Content padding: `md:px-10 md:pb-16`
- Headline: `md:text-[110px]`

### Desktop (lg:)

- `lg:min-h-screen` — maintain full viewport
- Headline: `lg:text-[160px] lg:leading-[0.85]`
- Content: `lg:px-16 lg:pb-20`
- Optional: subtle scroll-driven parallax on hero image (CSS only: `style="transform: translateY({scrollY * 0.15}px)"`)

---

## Component: `NewInGrid.svelte`

**File:** `src/lib/components/home/NewInGrid.svelte` (new)

### Mockup data

Uses product mockup array from `ProductCard.svelte` above (4 items).

### Mobile

- `py-12 px-4`
- Heading row: `flex items-baseline justify-between mb-6`
  - `font-display text-5xl text-bone`
  - `[View All]` link: `font-mono text-[10px] text-ash hover:text-volt uppercase tracking-widest`
- `grid grid-cols-2 gap-2`

### Tablet (md:)

- `md:px-6`
- `md:grid-cols-3 md:gap-3`
- Heading: `md:text-6xl`

### Desktop (lg:)

- `lg:py-20 lg:px-8`
- `lg:grid-cols-4 lg:gap-4`
- Heading: `lg:text-8xl`

---

## Component: `EditorialBanner.svelte`

**File:** `src/lib/components/home/EditorialBanner.svelte` (new)

### Mockup data

```ts
const lines = ['FROM COLOMBO', 'TO EVERYWHERE.']
const footnote = 'Sri Lankan-made. Global vision. Est. 2024.'
```

### All breakpoints (responsive text size only)

- `bg-charcoal py-16 md:py-24 lg:py-32 px-5 md:px-8 lg:px-12`
- Line 1: `font-display text-[60px] md:text-[90px] lg:text-[130px] leading-[0.9] text-bone`
- Line 2: same size but `text-volt` — contrast moment
- Footnote: `font-mono text-xs text-ash mt-6`

Use `/images/editorial.png` as an optional background with `opacity-10` overlay if you want texture.

---

## Route: `/shop` — PLP

**File:** `src/routes/shop/+page.svelte` (update)

### Components: `PLPHeader`, `FilterBar`, `ProductGrid`

### PLPHeader mockup

```ts
const heading = 'SHOP ALL'   // or 'MEN', 'WOMEN', 'NEW IN' based on active filter
const count = 8              // total visible results
```

**Mobile:** `pt-20 pb-4 px-4` (pt-20 clears fixed nav)

- `font-display text-5xl text-bone`
- `font-mono text-[10px] text-ash mt-1` — `"8 styles"`

**Desktop:** `pt-24 pb-8 px-8 flex items-baseline justify-between`

- Heading `lg:text-7xl`
- Sort dropdown right-aligned

---

## Component: `FilterBar.svelte`

### Mockup data

```ts
const genderOptions = ['All', 'Men', 'Women', 'Unisex']
const fitOptions    = ['All Fits', 'Oversized', 'Regular', 'Slim']
// Sort is separate on mobile (SortBottomSheet), inline select on desktop
```

### Mobile

- `overflow-x-auto flex gap-2 px-4 py-3 border-b border-charcoal no-scrollbar`
- All filters in one scrollable chip row (gender + fit together)
- Sort: funnel icon button, fixed right of row → opens `SortBottomSheet.svelte`
- Chip: `font-mono text-[9px] uppercase tracking-[0.15em] px-3 py-1.5 border whitespace-nowrap`
  - Inactive: `border-ash/30 text-ash`
  - Active: `border-volt bg-volt text-void`

### Desktop (lg:)

- Full bar: `flex items-center gap-3 px-8 py-4 border-b border-charcoal`
- Gender pills left, fit pills center, sort select right
- Sort: `<select class="bg-transparent border border-ash/30 text-ash font-mono text-[10px] uppercase tracking-widest px-3 py-1.5">`

---

## Component: `SortBottomSheet.svelte`

**Mobile only.** Slides up from bottom when sort icon tapped.

### Mockup data

```ts
const sortOptions = [
  { label: 'Newest',         value: 'new' },
  { label: 'Featured',       value: 'featured' },
  { label: 'Price: Low–High', value: 'price-asc' },
  { label: 'Price: High–Low', value: 'price-desc' },
]
```

- `fixed inset-x-0 bottom-0 z-50 bg-charcoal rounded-t-none`
- Svelte `fly` transition: `{ y: 300, duration: 250 }`
- Backdrop: `fixed inset-0 bg-void/60 z-40`
- Header: `"SORT BY"` in `font-mono text-[10px] text-ash uppercase tracking-widest px-5 py-4 border-b border-void`
- Radio options: `font-sans text-sm text-bone py-4 px-5 border-b border-void/40 flex items-center justify-between`
- Active: Volt dot right side

---

## Route: `/shop/[slug]` — PDP

**File:** `src/routes/shop/[slug]/+page.svelte` (update)

### Mockup data

```ts
const product = {
  name: 'Void Oversized Tee',
  sku: 'CARO-BLK-001',
  price: 3200,
  compareAtPrice: 4000,
  shortDescription: 'The tee you reach for every time.',
  description: 'Heavyweight 220GSM combed cotton. Dropped shoulders. Oversized fit. Graphic front print — original artwork, not a stock image. Made in Sri Lanka.',
  material: '100% Combed Cotton 220GSM',
  careInstructions: 'Machine wash cold inside out. No tumble dry. Iron reverse.',
  fit: 'oversized',
  images: [
    { url: '/images/black_tee.png', alt: 'Front view', isPrimary: true },
    { url: '/images/editorial.png', alt: 'Styled shot', isPrimary: false },
  ],
  colors: [
    { name: 'Void Black', hex: '#0A0A0A' },
    { name: 'Ash Grey',   hex: '#B4AFA8' },
  ],
  sizes: [
    { size: 'XS',  available: true },
    { size: 'S',   available: true },
    { size: 'M',   available: true },
    { size: 'L',   available: false },
    { size: 'XL',  available: true, backorder: true },
    { size: 'XXL', available: false },
  ],
  stockStatus: 'low-stock',
  availableCount: 4,
  reviewSummary: { average: 4.7, count: 23 },
}
```

### Page layout

**Mobile:** Single column — `pt-14` (clears nav)

1. `PDPImageGallery` (full width)
2. `PDPInfo` (`px-4 py-6`)
3. `ProductAccordion` (`px-4`)
4. `ShippingEstimate` (`px-4 pb-8`)
5. `ReviewsSection` (`px-4 pb-16`)

**Desktop:** Two-column split — `lg:pt-16 lg:grid lg:grid-cols-[55%_45%] lg:gap-0`

- Left col: `PDPImageGallery` (sticky `lg:sticky lg:top-16`)
- Right col: `PDPInfo` + `ProductAccordion` + `ShippingEstimate` (`lg:px-10 lg:py-8`)
- `ReviewsSection` below, full width

---

## Component: `PDPImageGallery.svelte`

### Mobile

- Swipeable image carousel, full width, `aspect-[4/5]`
- Images from `product.images`
- Dot indicators: `flex gap-1.5 justify-center mt-3`
  - Active: `w-4 h-[3px] bg-volt rounded-full`
  - Inactive: `w-[3px] h-[3px] bg-ash/40 rounded-full`
- Native swipe via `touchstart` / `touchend` delta detection

### Desktop (lg:)

- `flex gap-2`
- **Thumbnail strip left:** `flex flex-col gap-2 w-[80px]`
  - Each: `aspect-square w-full object-cover cursor-pointer border-2`
  - Inactive: `border-transparent`
  - Active: `border-volt`
- **Main image right:** `flex-1 aspect-[4/5]`
  - `<img class="w-full h-full object-cover">` — image changes on thumbnail click
  - Slight zoom on hover: `hover:scale-[1.02] transition-transform duration-500`

---

## Component: `PDPInfo.svelte`

### All breakpoints

- SKU: `font-mono text-[9px] text-ash/60 uppercase tracking-[0.2em] mb-1`
- Name: `font-display text-5xl md:text-6xl text-bone leading-none mb-2`
- Price row: `flex items-baseline gap-3 mb-6`
  - Price: `font-mono text-2xl text-bone`
  - Compare: `font-mono text-sm text-ash line-through`
- Stock signal (when `stockStatus` is set):
  - `"Only 4 left"` beside `StockBadge` in `font-mono text-[10px] text-ash`
- `ColorSelector` with label above: `"COLOR: VOID BLACK"` — `font-mono text-[9px] text-ash uppercase tracking-widest`
- `SizeSelector` with size guide link below
- CTA area: `mt-6 flex flex-col gap-3`
  - Primary: `bg-volt text-void font-mono text-xs uppercase tracking-[0.15em] w-full py-4`
  - Wishlist: `border border-ash/30 text-ash font-mono text-xs uppercase tracking-[0.15em] w-full py-3.5 hover:border-volt hover:text-volt transition-colors`

---

## Component: `SizeSelector.svelte`

### Mockup — same as product above

### All breakpoints

- Label: `font-mono text-[9px] text-ash uppercase tracking-widest mb-2`
- Pill row: `flex flex-wrap gap-2`
- Each pill: `w-12 h-10 font-mono text-xs flex items-center justify-center border transition-colors`
  - Available unselected: `border-ash/40 text-bone hover:border-volt`
  - Selected: `border-volt bg-volt text-void`
  - OOS (no backorder): `border-ash/20 text-ash/30 line-through cursor-not-allowed`
  - Backorder: `border-ash/40 text-ash/60 italic cursor-pointer` + `"Pre-order"` tooltip
- Size guide: `font-mono text-[9px] text-ash underline mt-2 cursor-pointer`

---

## Component: `ProductAccordion.svelte`

### Mockup panels

```ts
const panels = [
  { id: 'details',  title: 'Details',          content: product.description },
  { id: 'care',     title: 'Material & Care',   content: `${product.material}\n\n${product.careInstructions}` },
  { id: 'fit',      title: 'Fit & Sizing',      content: 'Oversized fit. True to size. Model is 6\'1" wearing size L.' },
]
```

### All breakpoints

- Container: `border-t border-charcoal`
- Each panel: `border-b border-charcoal`
- Header button: `w-full flex items-center justify-between py-4 font-mono text-[10px] text-ash uppercase tracking-[0.15em] hover:text-bone transition-colors`
- `+` when closed, `−` when open — no animation on icon
- Body: `font-sans text-sm text-bone/80 leading-relaxed pb-5`
- Height transition: use Svelte `slide` transition action or `grid-rows-[0fr]` → `grid-rows-[1fr]`

---

## Component: `ShippingEstimate.svelte`

### Mockup data

```ts
const info = {
  origin: 'Colombo, Sri Lanka',
  colombo: '1–2 business days',
  other: '3–5 business days',
  freeThreshold: 10000,
  freeThresholdFormatted: 'LKR 10,000',
}
```

### All breakpoints

- `bg-charcoal px-4 py-4 mt-2`
- `"SHIPS FROM COLOMBO"` — `font-mono text-[9px] text-volt uppercase tracking-[0.15em] mb-2`
- `"Colombo: 1–2 days · Other districts: 3–5 days"` — `font-sans text-xs text-bone/70`
- `"Free shipping over LKR 10,000"` — `font-mono text-[9px] text-ash mt-1`

---

## Component: `ReviewsSection.svelte`

### Mockup data

```ts
const summary = {
  average: 4.7,
  count: 23,
  distribution: [0, 2, 1, 5, 15],   // index 0 = 1 star, index 4 = 5 stars
}
const reviews = [
  {
    id: 'r1',
    user: 'Kasun M.',
    rating: 5,
    title: 'Best tee I own.',
    body: 'Wore this to a show in Colombo. Got stopped three times. The fit is exactly as described — properly oversized without looking sloppy.',
    isVerifiedPurchase: true,
    media: [],
    date: 'March 2025',
  },
  {
    id: 'r2',
    user: 'Dilini S.',
    rating: 4,
    title: 'Quality is real.',
    body: "Fabric is thick. Graphic doesn't fade after washing. Would've given 5 but delivery took a week.",
    isVerifiedPurchase: true,
    media: [],
    date: 'April 2025',
  },
]
```

### Mobile

- `py-12 px-4`
- Section heading: `font-display text-4xl text-bone mb-8`
- Rating summary: large `4.7` in `font-display text-6xl text-volt` + star row + count
- Distribution bars: 5-row table, each row = star label + thin bar + count
  - Bar fill: `bg-volt h-1`
- Review cards stacked, `gap-4`

### Desktop (lg:)

- `lg:grid lg:grid-cols-[280px_1fr] lg:gap-10`
- Rating summary sticky left col
- Review cards in right col — `lg:grid lg:grid-cols-2 lg:gap-4` for 2-column card grid

### Review card

- `bg-charcoal p-5`
- Name `font-sans text-sm font-medium text-bone` + date `font-mono text-[9px] text-ash`
- Star row (5 stars, filled up to rating, `text-volt`)
- `"✓ Verified Purchase"` — `font-mono text-[9px] text-volt` if `isVerifiedPurchase`
- Title: `font-sans text-sm font-semibold text-bone mt-3`
- Body: `font-sans text-sm text-bone/75 leading-relaxed mt-1`

---

## Route: `/cart` — Cart Page (mobile)

**File:** `src/routes/cart/+page.svelte` (update)

### Mockup data — same CartItems as CartDrawer above

### Mobile layout

- `min-h-screen bg-void pt-20 pb-32`
- Heading: `font-display text-5xl text-bone px-4 mb-6`
- Item list: `flex flex-col gap-4 px-4` — same `CartItem` component as drawer
- Free shipping bar: `mx-4 my-4 p-3 bg-charcoal`
- Promo code section: `px-4 mt-4`
  - Input + `[Apply]` in a `flex` row
  - Input: `flex-1 bg-transparent border-b border-ash/40 py-2 font-mono text-xs text-bone placeholder:text-ash/40 outline-none`
  - Button: `font-mono text-[10px] text-volt uppercase tracking-widest ml-3`
- Summary: `px-4 mt-6 space-y-2 font-mono text-sm`
  - `"SUBTOTAL"` / `"SHIPPING"` / `"TOTAL"` rows
- Sticky checkout bar: `fixed bottom-0 inset-x-0 p-4 bg-void border-t border-charcoal`
  - `[Checkout]` full-width Volt button

### Desktop fallback (lg:)

- `lg:max-w-5xl lg:mx-auto lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:pt-24`
- Left: item list
- Right: `bg-charcoal p-6 h-fit sticky top-24` — summary + promo + checkout

### Empty state

```
YOUR BAG IS EMPTY.
Fix that.
[Shop New In →]   ← volt colored link
```

`font-display text-4xl text-bone` + `font-mono text-xs text-ash` + Volt link

---

## Route: `/checkout` — Checkout

### Layout: `src/routes/checkout/+layout.svelte`

```svelte
<!-- No Navbar, no Footer — isolated checkout experience -->
<div class="min-h-screen bg-bone text-void">
	<!-- Bone/light theme for checkout — safe, transactional feel -->
	<header class="flex justify-center border-b border-void/10 py-6">
		<img src="/logo.png" alt="Caro" class="h-8 invert" />
		<!-- invert makes white logo dark on bone background -->
	</header>
	<slot />
</div>
```

Note: Checkout uses `bg-bone text-void` — inverted from the site. This is intentional: creates a distinct "payment mode" feel.

### `CheckoutProgress.svelte`

### Mockup

```ts
const steps = ['Contact', 'Address', 'Shipping', 'Payment']
let currentStep = $state(1)
```

**Mobile:** `flex justify-center gap-2 py-4` — 4 dots only

- Done: `w-2 h-2 rounded-full bg-void`
- Active: `w-4 h-2 rounded-full bg-void`
- Upcoming: `w-2 h-2 rounded-full bg-void/20`

**Desktop:** `flex items-center justify-center gap-0 py-6`

- Each step: dot + label + connecting line to next
- Done dot: `bg-void` · Active: `ring-2 ring-void` · Upcoming: `bg-void/20`
- Label: `font-mono text-[9px] uppercase tracking-widest text-void/60`

### Main checkout page: `src/routes/checkout/+page.svelte`

```
Mobile:  full-width, stacked
         1. CheckoutProgress
         2. Collapsed order summary accordion (tap to expand)
         3. Active step component
         4. [Continue] button (sticky bottom on mobile)

Desktop: lg:grid lg:grid-cols-[1fr_380px] lg:gap-0 lg:max-w-5xl lg:mx-auto lg:pt-12
         Left:  CheckoutProgress + active step
         Right: CheckoutOrderSummary (sticky)
```

### Step: Contact

- `"CONTACT"` section label `font-mono text-[9px] text-void/40 uppercase tracking-widest`
- Phone input (same style as sign-in, but on bone background)
- `border-b border-void/30 bg-transparent text-void`
- If authenticated: show name + number read-only in `bg-void/5 p-3`

### Step: Address

- `AddressForm.svelte` on bone background
- Input borders: `border-void/30 focus:border-void`
- Labels: `text-void/60`
- If auth + saved addresses: show address selection cards first

### Step: Shipping

```ts
const methods = [
  { id: 'm1', name: 'Standard',  carrier: 'PickMe Flash', price: 450,  days: '3–5 business days' },
  { id: 'm2', name: 'Express',   carrier: 'DHL',           price: 950,  days: '1–2 business days' },
]
```

- Radio cards: `border-2 border-void/20 p-4 cursor-pointer`
- Selected: `border-void`
- Name: `font-sans text-sm font-medium text-void`
- Days: `font-mono text-[10px] text-void/60`
- Price: `font-mono text-sm text-void ml-auto`

### `CheckoutOrderSummary.svelte`

**Mobile:** Accordion at top of page — `bg-void/5 px-4 py-3`

- Header shows total only: `"Order Summary — LKR 9,450"`
- Expanded: shows items + subtotal + shipping + total

**Desktop:** `bg-void/5 p-6 sticky top-6`

- Item list (thumbnail + name + price)
- Promo code input
- Line items: subtotal, discount, shipping, total
- All text: `font-mono text-sm text-void`
- Total: `font-mono text-base font-bold`

---

## Route: `/checkout/confirmation/[orderId]`

**File:** `src/routes/checkout/confirmation/[orderId]/+page.svelte`

### Mockup data

```ts
const order = {
  id: 'ORD-ABC123',
  items: [
    { name: 'Void Oversized Tee', size: 'L', color: 'Void Black', price: 3200, qty: 1, image: '/images/black_tee.png' },
  ],
  subtotal: 3200,
  shipping: 450,
  total: 3650,
  address: { recipientName: 'Kasun Mendis', city: 'Colombo 03', district: 'Colombo' },
  estimatedDelivery: '3–5 business days',
}
```

### Layout (bone background, inherits checkout layout)

- `max-w-lg mx-auto px-4 pt-12 pb-20 text-center`
- `"Order Confirmed."` — `font-display text-6xl md:text-8xl text-void`
- Order number: `font-mono text-sm text-void/50 mt-2` — `"#ORD-ABC123"`
- `"We'll text you when it ships."` — `font-mono text-xs text-void/40 mt-1`
- Divider: `border-t border-void/10 my-8`
- Order summary card: left-aligned, `bg-void/5 p-5`
- `[Continue Shopping]` — `bg-void text-bone font-mono text-xs uppercase tracking-widest px-8 py-4 mt-8 inline-block hover:bg-volt hover:text-void transition-colors`
- Guest block (if unauthenticated): `mt-8 border border-void/20 p-5`
  - `"Save your details for next time."` — `font-sans text-sm text-void`
  - `[Create Account]` — Volt background button

---

## Route: `/drops/[slug]`

**File:** `src/routes/drops/[slug]/+page.svelte` (new)

### Mockup data

```ts
const drop = {
  name: 'DROP 002',
  tagline: 'Something new.\nSame energy.',
  launchDate: new Date('2025-06-01T10:00:00+0530'),
  isLive: false,
  image: '/images/hero.png',
}
```

### All breakpoints

- `min-h-screen relative flex flex-col items-center justify-center bg-void`
- Background: full-bleed image, `opacity-30`
- Gradient: `absolute inset-0 bg-gradient-to-b from-void/80 via-transparent to-void/80`
- Content: `relative z-10 text-center px-5`
  - Drop name: `font-mono text-[10px] text-volt uppercase tracking-[0.3em] mb-6`
  - Tagline: `font-display text-[80px] md:text-[120px] lg:text-[160px] leading-[0.88] text-bone`
  - Countdown: `CountdownTimer.svelte` — `font-mono text-4xl md:text-6xl text-volt tracking-[0.1em] mt-8`
    - Format: `00d 00h 00m 00s`
  - Notify form: `mt-10 flex flex-col sm:flex-row gap-2 max-w-sm mx-auto`
    - Input: `flex-1 bg-transparent border border-ash/40 px-4 py-3 font-mono text-sm text-bone placeholder:text-ash/40 outline-none focus:border-volt`
    - Button: `bg-volt text-void font-mono text-[10px] uppercase tracking-widest px-5 py-3`

### `CountdownTimer.svelte`

```svelte
<script>
	// Props: targetDate: Date
	// Updates every second via setInterval
	// Format: DD : HH : MM : SS
	// When targetDate passed: show "Live Now" + redirect to /shop?sort=new
</script>
```

---

## Route: `/account` — Account Section

### Layout: `src/routes/account/+layout.svelte`

**Mobile:** No sidebar — child pages fill full width.

- Tab navigation pinned below fixed navbar: `pt-14`
- `"MY ACCOUNT"` heading + user name: `px-4 pt-6 pb-4`
- Tab bar: `flex border-b border-charcoal`
  - `Orders` · `Addresses` · `Wishlist`
  - Each tab: `flex-1 py-3 font-mono text-[10px] uppercase tracking-widest text-center`
  - Active: `text-volt border-b-2 border-volt`
  - Inactive: `text-ash`

**Desktop:** `lg:grid lg:grid-cols-[240px_1fr] lg:min-h-screen lg:pt-16`

- Sidebar `lg:bg-charcoal lg:px-6 lg:py-10 lg:border-r lg:border-void`
  - User name: `font-display text-3xl text-bone mb-8`
  - Nav links: `flex flex-col gap-1`
    - Each: `font-mono text-[10px] uppercase tracking-widest text-ash hover:text-volt py-2.5 transition-colors`
    - Active: `text-volt border-l-2 border-volt pl-4`
  - Sign out: `font-mono text-[10px] text-ash/50 hover:text-ash mt-auto`
- Content: `lg:px-10 lg:py-10`

### `/account/+page.svelte` — Profile

```ts
const user = {
  name: 'Kasun Mendis',
  phone: '+94 77 123 4567',
  email: null,
  joinedAt: 'November 2024',
}
```

- Name edit inline
- Phone: read-only (auth tied to phone)
- Stat cards: `"5 orders"`, `"2 wishlist items"` in `bg-charcoal p-4 font-mono text-xs`

### `/account/orders/+page.svelte`

```ts
const orders = [
  { id: 'ORD-ABC123', date: 'April 20, 2025', status: 'Delivered', total: 3650, itemCount: 1, image: '/images/black_tee.png' },
  { id: 'ORD-DEF456', date: 'March 10, 2025', status: 'Shipped',   total: 9200, itemCount: 3, image: '/images/white_tee.png' },
]
```

Order row (mobile card / desktop table row):

- Thumbnail `w-12 h-14 object-cover`
- Order number `font-mono text-xs text-ash`
- Date `font-mono text-[10px] text-ash/60`
- Status: `Delivered` = `text-volt` · `Shipped` = `text-ash` · `Cancelled` = `text-red-400`
- Total: `font-mono text-sm text-bone`
- `[View →]` link

### `/account/orders/[orderId]/+page.svelte`

Status timeline component below order details:

```ts
const steps = [
  { label: 'Order Placed',  done: true,  date: 'Apr 20, 2:32pm' },
  { label: 'Confirmed',     done: true,  date: 'Apr 20, 3:15pm' },
  { label: 'Packed',        done: true,  date: 'Apr 21, 10:00am' },
  { label: 'Shipped',       done: false, date: null },
  { label: 'Delivered',     done: false, date: null },
]
```

- Vertical stepper: `flex flex-col gap-0`
- Each step: `flex gap-4 items-start`
  - Dot: `w-3 h-3 rounded-full mt-0.5 flex-shrink-0`
    - Done: `bg-volt`
    - Current: `bg-volt ring-4 ring-volt/20 animate-pulse`
    - Upcoming: `bg-ash/20`
  - Connecting line: `w-[1px] h-8 bg-charcoal ml-[5px]`
  - Label + date: `font-mono text-xs text-bone` + `text-ash/60`

### `/account/addresses/+page.svelte`

```ts
const addresses = [
  { id: 'a1', label: 'Home', recipientName: 'Kasun Mendis', addressLine1: '12 Galle Road', city: 'Colombo 03', district: 'Colombo', isDefault: true },
]
```

- `grid grid-cols-1 md:grid-cols-2 gap-3`
- Address card: `bg-charcoal p-4`
  - Label: `font-mono text-[9px] text-volt uppercase tracking-widest mb-2`
  - `DEFAULT` badge: `border border-volt text-volt font-mono text-[8px] px-1.5 py-0.5`
  - Address lines: `font-sans text-sm text-bone`
  - Action links: `flex gap-4 mt-3 font-mono text-[9px] text-ash`
    - `[Edit]` · `[Set Default]` · `[Delete]`
- Add new card: `border border-dashed border-ash/30 p-4 flex items-center justify-center cursor-pointer hover:border-volt transition-colors`
  - `+ Add New Address` in `font-mono text-xs text-ash`

### `/account/wishlist/+page.svelte`

- Same `ProductGrid` as PLP, but cards have:
  - `[Move to Cart]` button replacing wishlist heart
  - `"Choose size"` chip if `variantId = ''`
  - `SOLD OUT` overlay if out of stock

---

## Svelte Stores

### `src/lib/stores/ui.ts`

```ts
import { writable } from 'svelte/store'

export const uiStore = writable({
  mobileMenuOpen: false,
  cartDrawerOpen: false,
})

// Helpers (optional readable wrappers or just use .update())
```

### `src/lib/stores/cart.ts`

```ts
import { writable } from 'svelte/store'

export type CartItem = {
  id: string
  variantId: string
  productId: string
  name: string
  color: string
  size: string
  sku: string
  unitPrice: number
  quantity: number
  image: string
}

export const cartStore = writable<{
  items: CartItem[]
  promoCode: string | null
  discountAmount: number
}>({
  items: [],
  promoCode: null,
  discountAmount: 0,
})

// Derived: cartCount, subtotal
```

### `src/lib/stores/toast.ts`

```ts
import { writable } from 'svelte/store'

export type Toast = {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export const toasts = writable<Toast[]>([])

export function addToast(message: string, type: Toast['type'] = 'success', duration = 3000) {
  const id = crypto.randomUUID()
  toasts.update(t => [...t, { id, message, type }])
  setTimeout(() => {
    toasts.update(t => t.filter(toast => toast.id !== id))
  }, duration)
}
```

---

## Global Rules for the AI Agent

1. **Tailwind v4 — no `tailwind.config.js`.** All tokens in `src/routes/layout.css` under `@theme {}`. If you need a new design token, add it there as a CSS variable. Classes are auto-derived from variable names.

2. **File that holds all CSS:** `src/routes/layout.css` — this is where `@import "tailwindcss"` lives. Do not create `app.css` or `src/app.css`.

3. **Existing component names:**
   - `Navbar.svelte` (not `Nav.svelte`)
   - `Footer.svelte`
   - `ProductCard.svelte`
   - `Button.svelte`

4. **Static images available immediately (use these, not placeholder URLs):**
   - `/images/black_tee.png` — black product
   - `/images/white_tee.png` — white product
   - `/images/hero.png` — hero background
   - `/images/editorial.png` — editorial/banner
   - `/logo.png` — white logo
   - Models: import from `$lib/assets/model_1.jpeg`, `model_2.jpeg`, `model_3.jpeg`

5. **No `rounded` on product images, primary CTAs, or any core brand elements.** Square edges only. Small `rounded` (4px) only on form chips, filter pills, and dot indicators.

6. **Volt is never decorative.** Only use `bg-volt` or `text-volt` for: primary CTAs, stock urgency badges, active filter states, drop announcements, Volt accent lines, active nav underlines.

7. **`font-mono` for ALL numbers.** Prices, counts, SKUs, dates, order numbers, percentages — always `font-mono`. Never `font-sans` for data.

8. **Checkout uses `bg-bone text-void` (inverted theme).** The bone background signals payment safety. Logo needs `invert` class to appear dark on bone.

9. **SvelteKit specifics:**
   - Auth guard on account routes: `+page.server.ts` with session check → redirect to `/sign-in?redirectTo=/account/...`
   - Cart drawer open state: `uiStore` — not component-local state
   - Svelte transitions: `import { fly, fade, slide } from 'svelte/transition'`
   - Drawers: `fly({ x: 420, duration: 250 })` for CartDrawer, `fly({ x: -20, duration: 250 })` for MobileMenu, `fly({ y: 300, duration: 250 })` for SortBottomSheet

10. **Mobile nav height offsets:**
    - Fixed nav is `h-14` (56px) on mobile, `h-[60px]` on tablet, `h-16` on desktop
    - First content block on any page needs `pt-14 md:pt-[60px] lg:pt-16` to clear the nav
    - Exception: HeroSection is full-screen and sits under the nav intentionally
