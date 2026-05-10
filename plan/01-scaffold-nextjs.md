# Phase 1 — Scaffold Next.js, migrate the static UI

**Goal**: same UI as `web/index.html` (desktop + mobile bottom sheet), but living inside a Next.js 16 App Router project deployed on Vercel. Still using mock data — no real API calls yet.

**Depends on**: nothing.

## Tasks

### 1.1 Bootstrap

```bash
mkdir -p apps && cd apps
npx create-next-app@latest web --typescript --app --src-dir=false \
  --tailwind=false --eslint --import-alias="@/*"
cd web
```

- Next.js 16+ App Router, TS, no Tailwind (the design uses inline styles), no `src/`.
- Add `next.config.ts` and `tsconfig.json` defaults Next provides.

### 1.2 Fonts + global CSS

In `apps/web/app/layout.tsx`:

```tsx
import { Space_Grotesk, Bricolage_Grotesque } from 'next/font/google'

const sans = Space_Grotesk({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-sans' })
const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-display' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

`apps/web/app/globals.css`:

```css
html, body { margin: 0; padding: 0; background: #f5e8d2; height: 100%; overflow: hidden; }
body { font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; color: #1d2a30; }
*, *::before, *::after { box-sizing: border-box; }
@keyframes bouncedot { 0%,80%,100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
```

Drop `desktop.jsx`/`mobile.jsx` references to `'Space Grotesk'` and use `var(--font-sans)` instead so Next can self-host the fonts.

### 1.3 Port the components

| From (static `web/`) | To (Next.js) | Component type |
|---|---|---|
| `data.jsx` | `apps/web/lib/data.ts` | TS module, exports typed `MOCK_FORECAST` |
| `desktop.jsx` (`PartiuCoastal`) | `apps/web/components/Desktop.tsx` | client component (`'use client'`) |
| `mobile-shared.jsx` (`MS.*`) | `apps/web/components/mobile/Shared.tsx` | client |
| `mobile.jsx` (`MobileApp`) | `apps/web/components/Mobile.tsx` | client |
| `app.jsx` viewport switcher | drop — use CSS instead (see 1.4) | — |
| `index.html` | `apps/web/app/page.tsx` | server component |

Keep the markup byte-for-byte identical to the static version. Convert inline styles from JS objects (already React-style) — no change needed beyond TS types.

Define a `Forecast` type in `lib/data.ts`:

```ts
export type ForecastHour = {
  h: string; score: number; swH: number; swT: number; swDir: number;
  wKmh: number; wDir: number; gust: number; tideH: number;
  tide: 'subindo' | 'descendo' | 'alta' | 'baixa'; flag: string;
}
export type Forecast = { /* hours, spot, historic, suggestions, welcome, ... */ }
```

### 1.4 Responsive without flicker

In `app/page.tsx` (server component) render both layouts and let CSS pick:

```tsx
import { Desktop } from '@/components/Desktop'
import { Mobile } from '@/components/Mobile'
import { MOCK_FORECAST } from '@/lib/data'

export default function Page() {
  const data = MOCK_FORECAST  // phase 3 swaps this for getForecast()
  return (
    <>
      <div className="layout-desktop"><Desktop data={data} /></div>
      <div className="layout-mobile"><Mobile data={data} /></div>
    </>
  )
}
```

In `globals.css`:

```css
.layout-desktop { display: block; height: 100%; }
.layout-mobile  { display: none; height: 100%; }
@media (max-width: 768px) {
  .layout-desktop { display: none; }
  .layout-mobile  { display: block; }
}
```

This way SSR HTML is correct on first paint regardless of viewport.

### 1.5 Delete the static prototype

Once parity is verified in dev (`pnpm dev`) and prod build (`pnpm build && pnpm start`), delete the `web/` folder at the repo root.

### 1.6 Deploy to Vercel

```bash
# from repo root
npx vercel link            # link to a new Hobby project
npx vercel --prod          # first deploy
```

Or via the dashboard: import the repo, set root directory to `apps/web`, framework preset = Next.js. Should auto-detect.

## Tests

### Tooling

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
pnpm add -D playwright @playwright/test
```

`apps/web/vitest.config.ts` — jsdom environment, `@testing-library/jest-dom` setup.
`apps/web/playwright.config.ts` — `webServer: 'pnpm dev'`, baseURL `http://localhost:3000`.

### Unit tests (`*.test.ts(x)` colocated with code)

- `lib/data.test.ts`: `MOCK_FORECAST` matches the `Forecast` type. Hours are 13 entries, scores 0-10, all `tide` values are valid enum members.
- `components/Desktop.test.tsx`: renders without crashing, score wedge SVG path uses correct arc coordinates for score=8.9, hour table renders 13 rows, peak hour (`09h`) gets coral background.
- `components/Mobile.test.tsx`: peek → half → full state cycle, grabber click handler fires, dim overlay only present in `full` state.

### Integration tests

- `components/Mobile.integration.test.tsx`: simulate touch drag with `fireEvent.touchStart/Move/End` — release at 40% snaps to half, release at 80% snaps to full, release at 10% snaps to peek.
- `app/page.test.tsx`: render server component output, assert both `<Desktop>` and `<Mobile>` are in the DOM (CSS handles visibility).

### Smoke tests (Playwright, `tests/smoke/*.spec.ts`)

- **Desktop boot**: open `/` at 1440×900, assert `Itamambuca` h1 visible, no console errors, score `8.9` rendered.
- **Mobile boot**: open `/` at 390×844, assert summary card visible, bottom sheet at peek (height ≈ 18% of viewport).
- **Mobile sheet cycle**: at 390×844, click grabber → half snap; click again → full snap with conversation visible; click × → back to peek.
- **Chat input**: at desktop, click first suggestion pill → input field contains that text.
- **Visual regression** (optional but recommended): one Percy or Playwright `toHaveScreenshot()` per layout.

### Production smoke (post-deploy)

```bash
# Run after `vercel --prod`
curl -fsS https://partiu-surf.vercel.app/ | grep -q 'Itamambuca' || exit 1
```

Add this as a GitHub Action triggered on `deployment_status: success`.

## Acceptance criteria

- [ ] `apps/web/` builds with `pnpm build` (no TS errors).
- [ ] `pnpm dev` renders desktop layout at ≥769px viewport, mobile at ≤768px, both visually identical to `web/index.html`.
- [ ] Mobile sheet drag/tap interactions work (peek → half → full cycle, dim overlay collapses on full).
- [ ] Chat input accepts text, suggestion buttons fill it.
- [ ] Score wedge, swell rose, tide arc, hour table, historic comparison all render correctly.
- [ ] Deployed on Vercel at a `*.vercel.app` URL, accessible publicly.
- [ ] `web/` folder at repo root is deleted.

## Notes

- The static prototype uses inline styles exclusively. **Don't refactor to Tailwind or CSS Modules** as part of this phase — keep the diff minimal so visual regressions are easy to spot.
- The fonts switch from CDN to `next/font` for self-hosting + zero CLS. This is the only "structural" change vs the prototype.
- Don't add Server Actions, auth, or any abstractions in this phase. Just ship the same UI on a real stack.
