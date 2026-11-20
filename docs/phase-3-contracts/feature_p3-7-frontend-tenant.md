# Phase 3 · Part 7 – Frontend tenant: overview, my contracts, print (FE-P3-10..14)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every migration, deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-3 committed and FE-P3-01 (routes, menu) committed. The contract detail needs P3-5 for occupants and vehicles |
| Unblocks | P3-8 |
| How | planner writes `plans/P3-7/PLAN.md` → main session builds |
| Part done when | FE-P3-14 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `Source/frontend/CLAUDE.md`, `docs/LESSONS.md`
2. `docs/spec/14-contracts.md` – CON-09, CON-16, CON-22, API table (`/me/*`); `docs/spec/16-billing.md` – BIL-10
3. `docs/spec/30-frontend.md` – the tenant layout row, rows `/thue`, `/thue/hop-dong`; UI-01, UI-03, UI-07, UI-12; `docs/spec/01-architecture.md` – LOC-01..06
4. `docs/spec/00-overview.md` – D-26, D-35..D-37, D-40 (monthly invoices come in Phase 4), A-16, G-01, G-03
5. Code: `src/pages/tenant/` (`TenantHomePage.tsx` is a stub today), `src/layouts/TenantLayout.tsx`, `src/shared/i18n/` (`vi.ts`, `en.ts`, `core.ts`), `src/shared/api.ts` (`/me` errors come back in the chosen language), the print page and API client of P3-6, `tests/ex/` (how the guest pages are tested in two languages)

## Scope

In: `/thue` overview, `/thue/hop-dong`, `/thue/hop-dong/:id`, direct addition of roommates to the tenant's own contract (owner 20/11/2026, CON-13/15), the tenant print page, all in Vietnamese and English.
Out: other request buttons ("Báo trả phòng", "Xin gia hạn", other occupant changes, "Cập nhật xe", Phase 5), monthly invoices and charts (Phase 4–5), any backend change, staff pages. Adding a roommate no longer requires the Phase 5 approval-request flow.

## Tasks

- [ ] **FE-P3-10** Dictionary keys (vi and en) for every tenant text of this part, contract and invoice status labels for the tenant area, and the `/me` API client.
  Done when: the "every vi key has en" test passes; no Vietnamese literal in the new tenant files (the EX-3 scan test covers them).
- [ ] **FE-P3-11** `/thue` overview (D-35, BIL-10): before move-in, the deposit invoice with VietQR image, amount, content `TT{id}` with a copy button, due date and the move-in date; after move-in, the contract summary; a room switcher when the tenant has several contracts; a tenant with only ended contracts sees them as past (A-16).
  Done when: page tests for before move-in, after move-in, two contracts, no contract; money and dates the same in both languages (LOC-05).
- [ ] **FE-P3-12** ⏸ `/thue/hop-dong` and `/thue/hop-dong/:id` (CON-13/15/16, CON-22): current and past contracts, term progress, deposit, occupants with only the signer's CCCD last 4 digits, vehicles read only, "Xem bản hợp đồng đã ký" through the signed view, link to the print page. Include a form to add a roommate directly through POST `/me/contracts/:id/occupants`, without request approval; roommate CCCD/photos are optional and do not expose stored private values. Show backend validation and lifecycle rules after Q-P3-16/17 are settled. Other request buttons remain Phase 5; monthly fee calculation remains Phase 4.
  Done when: page tests; another tenant's id shows the not-found state; nothing on the page shows a full CCCD number or a photo. Stop and report FE-P3-10..12.
- [ ] **FE-P3-13** Tenant print page `/thue/hop-dong/:id/in`, reusing the P3-6 print component with the tenant routes.
  Done when: page test; manual print preview in both languages (the contract text itself stays Vietnamese, LOC-01).
- [ ] **FE-P3-14** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  Done when: all pass with real output quoted; manual walk with the tenant account created in the P3-6 walk: first login forces the password change, then overview with the deposit VietQR, then after the staff records the deposit and move-in, the contract pages; at 360 px and desktop, Vietnamese and English.

## Questions for the owner

<!-- none yet -->

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
