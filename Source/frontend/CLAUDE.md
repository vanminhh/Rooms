# Frontend (React 19 + Vite + TypeScript)

Spec: `docs/spec/30-frontend.md` (all 31 pages, routes, UI rules), `docs/spec/31-ui-kit.md` (official UI kit rules) plus the module spec of the page you build.

The official UI is the kit in `src/components/` (An Lâm style; props and file map in `src/components/README.md`, live preview at `/components.html`). Build every page from it. `src/main.tsx` is a placeholder until the login feature adds the router. Đà Nẵng / Sài Gòn photos in `public/images/` are gallery demo images only; the product is Hà Nội only.

## Layout

```
src/
  app/        router (3 layouts + guards), QueryClient provider, auth context
  layouts/    PublicLayout, TenantLayout, StaffLayout
  pages/      public/, tenant/, staff/   – one file per page in 30-frontend.md
  features/   auth/, rooms/, contracts/, ... – API calls, hooks, page-specific components, feature_<feature>.md (task list)
  components/ official UI kit: RoomsButton, RoomsHeader/Footer, StatusBadge, ... + rooms.css, index.ts (KIT-01..08)
  shared/     api client (adds Bearer, refreshes on 401), formatters (money, date), status labels
  assets/     images/icons imported by code (create when first needed)
component-preview.tsx, pages/ComponentPreview.tsx, ../components.html   preview gallery of the kit
tests/        Node tests of the kit (npm run test:components)
artifact_FE/  staging area: every new/changed frontend file is drafted here and approved first (root CLAUDE.md)
```

Raw source assets (logos, fonts, mockups) live in the repo-root `assets/` folder; copy into `src/assets/` or `public/` only what the app uses.

Before working on a feature, open its `feature_<feature>.md` (e.g. `src/features/auth/feature_login.md`), read its "Before you start" list, and follow the task workflow in the root `CLAUDE.md`. A component used by more than one feature goes in `src/components/` following KIT-07 (kit tokens, export from `index.ts`, sample in the preview, test if it has logic); otherwise keep it in the feature folder. Do not create any other component folder.

## Rules

- UI text Vietnamese; use the shared status-label map and money/date formatters (`UI-01`, `UI-02`).
- No business math in the FE (`UI-06`); show what the API returns, including `dryRun` previews.
- Server state with TanStack Query; invalidate affected queries after mutations. Forms with react-hook-form + zod.
- Show `error.message` from the API; map `error.fields` to inputs (`UI-05`).
- Mobile-first for the tenant app, "Chốt chỉ số" and manual payment (`UI-07`).
- Styling comes from the kit (`rooms.css` tokens inside `.rooms-theme`); do not introduce another palette, font set or CSS framework.
- `npm run lint`, `npm run build` and `npm run test:components` must pass.
