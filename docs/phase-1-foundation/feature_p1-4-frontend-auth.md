# Phase 1 · Part 4 – Frontend login, routing and layouts (FE-LOGIN-01, 04, 05, 07..16)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order unless a task says otherwise. Every task is drafted in `Source/frontend/artifact_FE/` and approved by the owner before it touches main files (root `CLAUDE.md`, "Review before changing main files"). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | On the main files: FE-LOGIN-02 packages and FE-LOGIN-03 proxy (part 0), part 2 (the API exists), part 3 (form pieces) |
| Unblocks | FE-LOGIN-17 and P1-QA-04 in part 5 |
| Draft folder | `Source/frontend/artifact_FE/<YYYY-MM-DD>-FE-LOGIN-04-16/` |
| How | Pipeline |
| Part done when | FE-LOGIN-16 on the main files, and the 3 seeded accounts can log in against the running API |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/frontend/CLAUDE.md`
2. `docs/spec/00-overview.md` – roles, global rules (G-03 Vietnamese UI, money/date format)
3. `docs/spec/01-architecture.md` – API-02/03 envelope and error format, AUTH-T1/T2 tokens
4. `docs/spec/10-auth.md` – AUTH-01..10 (this part)
5. `docs/spec/30-frontend.md` – layouts, route guard, pages `/dang-nhap`, `/quen-mat-khau`, `/doi-mat-khau`, `/thue/tai-khoan`, `/ql/tai-khoan`, rules UI-01..10
6. `docs/spec/31-ui-kit.md` and `src/components/README.md` – the official UI kit you must build with (KIT-01..08), including the pieces part 3 added
7. Visual reference, once its `REVIEW.md` says `ĐÃ DUYỆT` (the spec wins where they differ): `Artifacts/layout_rooms/2026-10-26-stitch-mockups/2026-10-28-auth-layouts/ref/`

## Where things go

- Shared, reusable UI → the official kit in `src/components/`. Reuse `RoomsButton`, `RoomsHeader`, `RoomsFooter`, `SectionHeading`, `StatusBadge`; add missing pieces there (KIT-07). No other component folder.
- Login-specific code (API calls, hooks, page parts) → `src/features/auth/`
- Pages → `src/pages/public/`, `src/pages/tenant/`, `src/pages/staff/`
- Layouts → `src/layouts/`; router + providers + guards → `src/app/`
- API client, formatters, status labels → `src/shared/`
- Images/icons used by the app → `src/assets/` (imported) or `public/` (by URL). Raw source assets live in the repo-root `assets/` folder and are copied in only when needed.

## Scope

In: AUTH-01, 02, 04 (show 429 message), 05, 06, 07, 09, 10; route guard; 3 layout shells; the shared pieces those need.
Out: page content of Tổng quan / Việc hôm nay (placeholders only), every other page.

## 0 · Clean start

- [x] **FE-LOGIN-01** Remove the resort template: `src/App.tsx`, `src/App.css`, `src/index.css`, `src/assets/*`, `public/fonts/`; `index.html` becomes the Trọ Thông Minh shell (`lang="vi"`); `src/main.tsx` renders a placeholder. Keep `public/images/` (the UI kit uses `rooms-*.webp`) and the kit preview.
  Done when: `npm run build` passes; `grep -ri "zilal" src index.html` returns nothing.
  Done 25/10/2026 during the repo cleanup requested by the owner. Package rename to `"frontend"` was not approved in that cleanup; leave `"name": "frontent"` until the owner asks.
- [ ] **FE-LOGIN-04** Create the folders from "Where things go" (only the ones this feature uses).

## 1 · Shared pieces

- [ ] **FE-LOGIN-05** `src/shared/api.ts`: `fetch` wrapper with `credentials: 'include'`, `Authorization: Bearer <accessToken>` from memory (never localStorage), unwraps `{ data }`, throws `ApiError { code, message, fields, status }` from `{ error }` (API-03). On 401 calls `POST /auth/refresh` once, retries, then signs out.
- [ ] **FE-LOGIN-07** Form helper: map `ApiError.fields` onto react-hook-form fields and `ApiError.message` to a form-level `FormError` (UI-05).

## 2 · Auth state and routing

- [ ] **FE-LOGIN-08** `AuthProvider` (`src/app/`): holds `user` + access token in memory; on app load calls `POST /auth/refresh` then `GET /auth/me`; exposes `login`, `logout`, `refreshMe`.
- [ ] **FE-LOGIN-09** Router with 3 layouts (`PublicLayout`, `TenantLayout`, `StaffLayout`) and guards: not logged in → `/dang-nhap?next=...`; wrong role → own home; `mustChangePassword` → `/doi-mat-khau` (AUTH-05, AUTH-06). `/dang-nhap` while logged in → own home.
  Done when: manual check with the 3 seeded accounts (see backend `seed.ts`).
- [ ] **FE-LOGIN-10** Layouts use the kit: wrap in `.rooms-theme`, `RoomsHeader` / `RoomsFooter`, Taviraj + Manrope font link in `index.html` (KIT-01, KIT-02). `PublicLayout` top menu: "Đăng nhập", or "Trang của tôi" when logged in (links to `/thue` or `/ql`); footer placeholder. `TenantLayout` and `StaffLayout`: nav placeholders + "Đăng xuất" button (calls logout, goes to `/`). `StaffLayout` shows the user's buildings from `/auth/me`.
- [ ] **FE-LOGIN-11** Placeholder home pages `/thue` ("Tổng quan") and `/ql` ("Việc hôm nay") that only greet the user by name.

## 3 · Pages

- [ ] **FE-LOGIN-12** `/dang-nhap` (`src/pages/public/LoginPage.tsx`): "Số điện thoại" (10 digits, starts with 0), "Mật khẩu", "Ghi nhớ đăng nhập", button "Đăng nhập", link "Quên mật khẩu?". Below: "Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng", Boss contact from `GET /public/contact` (phone shown as selectable text, Zalo and Facebook as links) and a link "Xem phòng trống" → `/phong` (AUTH-10). Errors: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `TOO_MANY_REQUESTS` show the API message. Redirect to `next` or role home after success.
- [ ] **FE-LOGIN-13** `/doi-mat-khau`: "Mật khẩu hiện tại", "Mật khẩu mới" (≥ 8), "Nhập lại mật khẩu mới" (must match, checked client-side). After success refresh `me` and go to role home. Shown automatically when `mustChangePassword` (AUTH-05).
- [ ] **FE-LOGIN-14** `/quen-mat-khau`: phone field; after submit always show the same message "Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý." plus the Boss contact (AUTH-07). The same page opened from the email link `/quen-mat-khau?token=...` shows "Mật khẩu mới" + "Nhập lại mật khẩu mới" → `POST /auth/reset-password` → go to `/dang-nhap` with a success note.
- [ ] **FE-LOGIN-15** `/thue/tai-khoan`: change password + email (AUTH-09). `/ql/tai-khoan`: change password + email + "Số điện thoại liên hệ", "Zalo", "Facebook", with a small preview "Khách sẽ thấy:" (AUTH-09).

## 4 · Verification

- [ ] **FE-LOGIN-16** `npm run lint` and `npm run build` pass.

The manual end-to-end check (FE-LOGIN-17) is in part 5.

## Questions for the owner

- None yet. Add here (and mark the task `[!]`) if the spec does not answer something.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed. -->
