# 31 · UI kit (official frontend design)

Decided by the owner on 25/10/2026: the component kit in `Source/frontend/src/components/` is the **official UI of the frontend**. Every page in [30-frontend.md](30-frontend.md) is built from it. Props, examples and the file map: `Source/frontend/src/components/README.md`.

## Visual direction

Adapted from the An Lâm resort template (reference project outside the repo: `D:\TP015-an-lam-resort`; only its look and motion are reused, none of its booking rules). Sand / deep teal / gold palette, Taviraj (headings) + Manrope (text), editorial spacing, magnetic buttons, staggered reveals, expanding room cards, image-following feature list, interactive floor plan, depth-based WebGL image journey.

## Rules

- **KIT-01** Import components from `src/components` (`index.ts` also loads `rooms.css`). Wrap every page in an element with class `rooms-theme`; all kit styles are scoped to it.
- **KIT-02** Pages using the kit load Taviraj and Manrope from Google Fonts in their HTML entry (same `<link>` as `components.html`); system fonts are the fallback.
- **KIT-03** Components hold no business logic or server state. Data, totals and money values come in through props; money is displayed with `formatMoney` from `src/shared/formatters.ts` (integer đồng, invalid input shows "—") (G-01, UI-06).
- **KIT-04** All copy is Vietnamese (G-03). Gallery data (room names, prices, quotes, floor plan) is illustrative only; never ship it as real data.
- **KIT-05** Accessibility and motion: keyboard and touch work without hover; reduced-motion shows still images and turns off smooth scroll; WebGL failure keeps the still photo; no horizontal overflow at 360 px (UI-07, UI-08).
- **KIT-06** `StatusBadge` tones map to room status ([11-buildings-rooms.md](11-buildings-rooms.md#room-status)): `available` "Trống", `reserved` "Đã cọc", `occupied` "Đang thuê", `maintenance` "Bảo trì". Other statuses (invoice, request, contract) reuse `StatusBadge` with the labels in their module spec.
- **KIT-07** A new shared component goes directly in `src/components/`, uses the tokens in `rooms.css`, is exported from `index.ts`, gets a sample in the preview page and, if it has logic, a test in `tests/`. A component used by one feature only stays in `src/features/<module>/`.
- **KIT-08** `ImageJourney` needs a depth map per image (grayscale, near = brighter). Without one, use a still image.
- **KIT-09** Colors and text weight (owner, 26/10/2026). Page `--rooms-sand` `#f8f2e6`, cards `--rooms-paper` `#fcf8ee`, lines `--rooms-line` `#ddd5c0`, cream blocks `#efe8d4`. Text uses `--rooms-text` `#0f2b26`, `--rooms-muted` `#2f3530`, `--rooms-accent-text` `#43301b` and `--rooms-gold-text` `#775830`; `--rooms-ink` and `--rooms-gold` are for backgrounds, borders and accents only. Small (≤ 13 px) and secondary text use weight 500. Text on light backgrounds keeps WCAG contrast ≥ 4.5.
- **KIT-10** Logo: `RoomsHeader` and `Preloader` take `logoSrc="/images/rooms-logo.webp"` and show only its arched window + key. The crop in `rooms.css` is tied to that file. On the dark preloader the mark is shown with lightness inverted and hue kept.

## Preview and tests

- Preview gallery: `/components.html` (entry `src/component-preview.tsx`, page `src/pages/ComponentPreview.tsx`, styles `src/component-preview.css`). Built together with `index.html` (`vite.config.ts`).
- `npm run test:components`: 14 Node tests (journey frames, money format, WebGL lifecycle, reduced motion, interaction). Must stay green.

## Known limits

- Three.js loads as a separate ~530 kB chunk (≈133 kB gzip); Vite prints a size warning. GPU memory and real-phone performance not yet measured.
- Gallery photos include Đà Nẵng and Sài Gòn rooms as demo images; the product is Hà Nội only.
- The logo mark is cropped from a 113 kB raster logo: slightly soft at header size, and on a first load the preloader may show before it arrives. A dedicated small SVG mark would fix both.
- Review history: `Artifacts/reviews/2026-10-25-rooms-components-review.md`, `Artifacts/reviews/2026-10-25-rooms-emil-polish.md`, `Source/frontend/artifact_FE/approved/2026-10-26-header-logo-warm/REVIEW.md`.
