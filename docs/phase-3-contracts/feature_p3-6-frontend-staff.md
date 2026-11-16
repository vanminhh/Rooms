# Phase 3 · Part 6 – Frontend staff: contracts, wizard, vehicles, "Chốt", print (FE-P3-01..09)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-3 committed. FE-P3-07 also needs P3-4 and P3-5 committed |
| Unblocks | P3-7 (after FE-P3-01), P3-8 |
| How | planner writes `plans/P3-6/PLAN.md` (screens, components, API contract from the P3-2..P3-5 code) → main session builds |
| Part done when | FE-P3-09 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/14-contracts.md` (all), `docs/spec/16-billing.md` – BIL-10, BIL-11; `docs/spec/13-viewings.md` – VIEW-05, VIEW-06
3. `docs/spec/30-frontend.md` – rows `/ql`, `/ql/hop-dong`, `/ql/xe`, `/ql/lich-hen`; UI-02..UI-07, UI-09; `docs/spec/31-ui-kit.md` – KIT-01, KIT-03, KIT-06, KIT-07
4. `docs/spec/00-overview.md` – D-35..D-39, D-41 (end date shown on the form), A-18, Q-15, G-01, G-03
5. Code: `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx`, `src/layouts/TenantLayout.tsx`, `src/components/index.ts` (`ConfirmDialog`, `ImageUploader`, `StatusBadge`, `TextField`, `ElevatedCard`), `src/features/rooms/upload.ts`, `src/features/viewings/ViewingCard.tsx` (the disabled "Chốt"), `src/pages/staff/StaffHomePage.tsx`, `src/features/dashboard/api.ts`, `src/shared/` (`api.ts`, `formatters.ts`, `status-labels.ts`, `form-errors.ts`), `package.json` (`test:components`), `tests/p2/public-dom.mjs`

## Scope

In: every staff screen of Phase 3, the route and menu skeleton of the whole phase (so P3-7 does not edit `routes.tsx`), the shared print page, the two dashboard cards, the "Chốt" button.
Out: tenant pages (P3-7), renew and the move-out settlement (later phases), any backend change.

## Tasks

- [ ] **FE-P3-01** ⏸ Skeleton for the whole phase: routes `/ql/hop-dong`, `/ql/hop-dong/moi`, `/ql/hop-dong/:id`, `/ql/hop-dong/:id/in`, `/ql/xe`, `/thue/hop-dong`, `/thue/hop-dong/:id`, `/thue/hop-dong/:id/in` (placeholders where P3-7 fills in); menu items "Hợp đồng" and "Tra cứu xe" in `StaffLayout`, "Hợp đồng" in `TenantLayout` (dictionary key); contract and invoice status labels (UI-02, from spec 14 and 16); `tests/p3/*.test.mjs` added to `test:components`.
  Done when: route and menu tests; the existing guard tests still pass; stop so P3-7 can start in parallel.
- [ ] **FE-P3-02** API client for the P3-2..P3-5 routes; `upload.ts` takes a purpose (`ROOM_IMAGE`, `CONTRACT_SCAN` with PDF allowed, `ID_PHOTO`) without changing the room image flow.
  Done when: API tests for each route used; the room image tests still pass.
- [ ] **FE-P3-03** `/ql/hop-dong` list (building selector, status, search by name, phone, room code; four list states UI-03) and the "Chốt" button on a CONFIRMED or DONE viewing card, opening `/ql/hop-dong/moi` prefilled from the viewing (VIEW-05).
  Done when: page tests; the viewing card test checks the button is enabled only for CONFIRMED and DONE.
- [ ] **FE-P3-04** ⏸ Create form `/ql/hop-dong/moi` (CON-01, CON-07, A-18): room, signer (name, phone, email, birth date, CCCD), start date, term ≥ 3 months with the end date shown as the API computes it (D-41), deposit (default room price, shown with `formatMoney`), services of the building; when the API answers that the phone belongs to a guest account, show its name and email and ask the staff member to confirm with the signer before sending again; other API errors on their fields (UI-05).
  Done when: page tests for each CON-07 branch the API can answer; manual check at desktop. Stop and report FE-P3-01..04.
- [ ] **FE-P3-05** Print page `/ql/hop-dong/:id/in` (CON-22, D-36): renders the print data with `@media print` styles from the kit tokens, a "In / Lưu PDF" button (`window.print()`), and the "BẢN NHÁP – chưa dùng để ký" banner while the template is the draft (Q-15). Built so P3-7 reuses it for the tenant.
  Done when: page test for the draft banner and the filled values; manual print preview checked.
- [ ] **FE-P3-06** Sign and deposit steps on `/ql/hop-dong/:id`: upload the signed scan, sign, show the temporary password once (copy button, warning it will not be shown again, gone after leaving the page), the deposit invoice with VietQR image and content `TT{id}`, "Ghi thu tiền cọc" with method and a confirm dialog stating the amount (UI-04), sending an `Idempotency-Key`.
  Done when: page tests: the password is shown once and not after a reload; double click records one payment; `INVOICE_NOT_UNPAID` shows the API message.
- [ ] **FE-P3-07** ⏸ Rest of the detail page (needs P3-4, P3-5): move-in readings without photos (CON-10, CON-11, D-38; note field appears when the date is more than 3 days from the start), cancel (CON-12; deposit kept and the refund shown before confirming), reset password (temporary password shown once), occupants (CCCD photos opened through the signed view), vehicles, services, view of the signed scan.
  Done when: page tests for move-in errors (`DEPOSIT_NOT_PAID`, `METER_VALUE_DECREASED`), cancel amounts, and that a CCCD photo is fetched only on click. Stop and report FE-P3-05..07.
- [ ] **FE-P3-08** `/ql/xe` plate lookup (CON-14) and two "Việc hôm nay" cards: unpaid deposits, and guests to call after a deposit cancelled their viewing, each with "Đã gọi" (NOTI-06, VIEW-06, D-39).
  Done when: page tests; `fe12-dashboard.test.mjs` updated and green.
- [ ] **FE-P3-09** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk on the dev server with the dev seed: viewing "Chốt" → create → print → upload scan → sign (password shown once) → record deposit → move-in; and a second contract → sign → record deposit → cancel. Desktop and 360 px for the deposit and move-in steps (UI-07).

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
