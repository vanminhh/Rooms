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

Owner direction 20/11/2026: complete all remaining Phase3 work in one continuous pass. Intermediate task/commit pauses are waived for this pass; retain internal checks/reviews and report the combined result. The authorized scope includes small backend integration fixes needed by the specified UI, without new business rules/schema/dependencies; existing full-run/DB/browser limits remain factual verification gaps.

In: every staff screen of Phase 3, the route and menu skeleton of the whole phase (so P3-7 does not edit `routes.tsx`), the shared print page, the two dashboard cards, the "Chốt" button.
Out: tenant pages (P3-7), renew and the move-out settlement (later phases), any backend change.

## Tasks

- [x] **FE-P3-01** ⏸ Skeleton for the whole phase: routes `/ql/hop-dong`, `/ql/hop-dong/moi`, `/ql/hop-dong/:id`, `/ql/hop-dong/:id/in`, `/ql/xe`, `/thue/hop-dong`, `/thue/hop-dong/:id`, `/thue/hop-dong/:id/in` (placeholders where P3-7 fills in); menu items "Hợp đồng" and "Tra cứu xe" in `StaffLayout`, "Hợp đồng" in `TenantLayout` (dictionary key); contract and invoice status labels (UI-02, from spec 14 and 16); `tests/p3/*.test.mjs` added to `test:components`.
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip đạt; route/menu/guards đã được xác minh. Các đoạn blocked/chờ full bên dưới là lịch sử trước khi owner cho chạy lại. Visual360/desktop vẫn thuộc QA trực tiếp.
  FOLLOW-UP 20/11/2026: owner full suite **879 tests / 877 pass / 2 fail**,109193.1049ms. Both failures were stale exact-menu expectations in `tests/auth-login-flow.test.mjs`: tenant lacked Contracts; manager/Boss lacked Contracts and Vehicle lookup. Corrected the expected arrays/test names to tenant4/manager8/Boss10, preserving strict menu equality and every existing session/theme/logo/footer/building assertion. Scoped rerun **2/2**,4528.1554ms,exit0; lint exit0; reviewer DUYỆT this fix. No product source change. Await a fresh owner full-suite summary; do not combine877+2 into a full879/879 result.
  CODE READY / FULL VERIFICATION BLOCKED 20/11/2026: eight routes and dedicated placeholders, menus VI/EN, typed status labels/kit tones, derived overdue label and regression loaders implemented. Staff-only desktop wrapping added for the ten-link Boss menu. Final focused **84/84** (including 15 new P3 tests), **3062.4857ms**, exit0; lint exit0 and build exit0 (7.51s) after the responsive edit. Independent reviewer DUYỆT source and responsive addendum. Full `npm run test:components` was rejected by automatic approval review for outbound Visual Studio telemetry; no verified full result, no retry/bypass. Browser control is unavailable, so owner visual checks at360/1121/1200px remain pending. Owner command, scope and full review: [checkpoint FE-P3-01](plans/P3-6/CHECKPOINT-FE-P3-01.md).
  20/11/2026: owner accepted BE-P3-27 and requested continuation with its known uncommitted changes. Planner completed [PLAN.md](plans/P3-6/PLAN.md), no business question blocks FE-P3-01. Work only on the route/menu/status skeleton before this checkpoint; subsequent page workflows remain FE-P3-02..09.
  Done when: route and menu tests; the existing guard tests still pass; stop so P3-7 can start in parallel.
- [x] **FE-P3-02** API client for the P3-2..P3-5 routes; `upload.ts` takes a purpose (`ROOM_IMAGE`, `CONTRACT_SCAN` with PDF allowed, `ID_PHOTO`) without changing the room image flow.
  20/11/2026: implemented typed contract client/read models, DTO field projections including nested assets/replacements, cancel/payment idempotency keys, literal paginated lookup and markViewingCalled. Upload retains signUpload(roomId); private purposes use contractId and authenticated/public_id/overwrite=false, PDF only for scan. Final **107/107** (40 new +67 auth/room-upload regressions),**4443.6495ms**,exit0; lint exit0,build exit0(Vite5.92s),reviewer DUYỆT. No new business assumption or backend/schema/dependency/env change; real Cloudinary/dev E2E and full suite are not inferred. [Checkpoint FE-P3-02](plans/P3-6/CHECKPOINT-FE-P3-02.md).
  20/11/2026: owner explicitly directed implementation of FE-P3-02. Use actual existing backend routes/serializers; preserve existing room upload calls and prove private authenticated form fields plus metadata-only payloads in focused tests. Preview/tenant-signature integration remains with the subsequent screen tasks.
  Done when: API tests for each route used; the room image tests still pass.
- [x] **FE-P3-03** `/ql/hop-dong` list (building selector, status, search by name, phone, room code; four list states UI-03) and the "Chốt" button on a CONFIRMED or DONE viewing card, opening `/ql/hop-dong/moi` prefilled from the viewing (VIEW-05).
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: page tests; the viewing card test checks the button is enabled only for CONFIRMED and DONE.
- [x] **FE-P3-04** ⏸ Create form `/ql/hop-dong/moi` (CON-01, CON-07, A-18): room, signer (name, phone, email, birth date, CCCD), start date, term ≥ 3 months with the end date shown as the API computes it (D-41), deposit (default room price, shown with `formatMoney`), services of the building; when the API answers that the phone belongs to a guest account, show its name and email and ask the staff member to confirm with the signer before sending again; other API errors on their fields (UI-05).
  22/11/2026: chủ dự án báo đã kiểm tay xong và đạt ("tui kiểm tay rồi ok"); không có chi tiết từng dòng.
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: page tests for each CON-07 branch the API can answer; manual check at desktop. Stop and report FE-P3-01..04.
- [x] **FE-P3-05** Print page `/ql/hop-dong/:id/in` (CON-22, D-36): renders the print data with `@media print` styles from the kit tokens, a "In / Lưu PDF" button (`window.print()`), and the "BẢN NHÁP – chưa dùng để ký" banner while the template is the draft (Q-15). Built so P3-7 reuses it for the tenant.
  22/11/2026: chủ dự án báo đã kiểm tay xong và đạt ("tui kiểm tay rồi ok"); không có chi tiết từng dòng.
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: page test for the draft banner and the filled values; manual print preview checked.
- [x] **FE-P3-06** Sign and deposit steps on `/ql/hop-dong/:id`: upload the signed scan, sign, show the temporary password once (copy button, warning it will not be shown again, gone after leaving the page), the deposit invoice with VietQR image and content `TT{id}`, "Ghi thu tiền cọc" with method and a confirm dialog stating the amount (UI-04), sending an `Idempotency-Key`.
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: page tests: the password is shown once and not after a reload; double click records one payment; `INVOICE_NOT_UNPAID` shows the API message.
- [x] **FE-P3-07** ⏸ Rest of the detail page (needs P3-4, P3-5): move-in readings without photos (CON-10, CON-11, D-38; note field appears when the date is more than 3 days from the start), cancel (CON-12; deposit kept and the refund shown before confirming), reset password (temporary password shown once), occupants (CCCD photos opened through the signed view), vehicles, services, view of the signed scan.
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: page tests for move-in errors (`DEPOSIT_NOT_PAID`, `METER_VALUE_DECREASED`), cancel amounts, and that a CCCD photo is fetched only on click. Stop and report FE-P3-05..07.
- [x] **FE-P3-08** `/ql/xe` plate lookup (CON-14) and two "Việc hôm nay" cards: unpaid deposits, and guests to call after a deposit cancelled their viewing, each with "Đã gọi" (NOTI-06, VIEW-06, D-39).
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: page tests; `fe12-dashboard.test.mjs` updated and green.
- [x] **FE-P3-09** ⏸ `npm run lint`, `npm run build`, `npm run test:components`.
  22/11/2026: chủ dự án báo đã kiểm tay xong và đạt ("tui kiểm tay rồi ok"); không có chi tiết từng dòng.
  KIỂM MỚI 20/11/2026: full frontend981/981,0fail/skip (163409,7733ms), backend2633/2633, source review DUYỆT; test fixtures cuối đã review và auth-cache strengthened1/1 sau full. FE04/05/09 vẫn chờ manual desktop/360px/print/dev workflow trong Done when; các task chỉ yêu cầu test đã đạt. [Checkpoint đầy đủ](plans/P3-6/CHECKPOINT-FE-P3-03-14.md).
  Done when: all pass with real output quoted; manual walk on the dev server with the dev seed: viewing "Chốt" → create → print → upload scan → sign (password shown once) → record deposit → move-in; and a second contract → sign → record deposit → cancel. Desktop and 360 px for the deposit and move-in steps (UI-07).

## Questions for the owner

<!-- none yet -->

## Issues log

- 20/11/2026 · Kiểm lại sau owner cho tiếp tục test telemetry · Full BE113file/2633passed,141,31s; full FE981/981,0fail/skip,163409,7733ms; lint đạt. Các lỗi test DOM/input/timer đã sửa, focused10/10 rồi full; auth-cache tăng chất lượng fixture sau full, scoped1/1,831,9686ms, reviewer DUYỆT. Đóng gate tự động FE01/03/06/07/08; FE04/05/09 còn manual trong Done when, DBdev vẫn không kết nối. Các mục blocked full bên dưới là lịch sử đã được lượt mới thay thế, không bỏ dữ liệu cũ.

- 20/11/2026 · FE03..09 code ready/QA pending · Đã hoàn thiện source và reviewer DUYỆT sau sửa privacy cache, lookup/hidden-reading/archived-service/print/locale findings. Backend focused304/304 và i18n19/19; BEbuild/lint/scopednoEmit đạt, FElint0/0warning/build0(Vite7,25s),15file test/helper syntax đạt. FE runtime mới không có kết quả do automatic approval review từ chối cảnh báo telemetry VisualStudio; không retry/đọc log vòng qua. Fresh DBpreflight cả hai URLFAILED; chưa browser/print/360px/dev E2E. Các Done when cần output/manual vẫn [!]; toàn văn review và hướng dẫn ở checkpoint chung, không đóng phase.

- 20/11/2026 · FE-P3-02 checkpoint · API client và types khớp backend hiện có; chỉ gửi field DTO, giữ false/0/null/empty, idempotency cọc/hủy, xử lý lỗi theo API. Upload scan/CCCD private đúng các tham số ký, metadata-only; room flow hồi quy đạt. Final107/107 (4443.6495ms), lint/build đạt, reviewer DUYỆT; chưa có upload Cloudinary thật/dev E2E/full frontend mới. Không thêm nghiệp vụ hoặc sửa backend/schema/env/dependency. Task FE02 đạt phạm vi Done when; lịch sử QA FE01 vẫn giữ riêng.
- 20/11/2026 · FE-P3-01 sửa hồi quy từ owner · Full 879 test,877 pass,2 fail (109193.1049ms) do bỏ sót expected menu cũ trong auth-login-flow. Đã sửa đúng menu tenant4/manager8/Boss10; giữ tất cả assertion và bốn session staff. Scoped hai test đạt2/2 (4528.1554ms), lint đạt, reviewer DUYỆT; chỉ đổi test/tài liệu, thêm LESSONS. Chờ full mới trên máy owner trước chốt FE01, không chạy vòng qua full đã bị auto-review chặn ở môi trường agent.
- 20/11/2026 · FE-P3-01 checkpoint · Mã route/menu/status hoàn tất; planner và reviewer GPT kế thừa, không nhận là Opus5/Sonnet5. Final scoped 84/84, 3.062s, lint/build đạt sau bổ sung staff desktop wrap. Full frontend bị auto-review từ chối vì cảnh báo telemetry Visual Studio, không có kết quả xác minh; không retry/đọc kết quả qua ngả khác. Chưa kiểm browser trực quan; cần owner chạy full components và kiểm menu 360/1121/1200px rồi nghiệm thu/commit. Không làm FE-P3-02..09 hoặc thay BE/API/schema/dependency/env; BE27 vẫn là thay đổi cũ được owner chốt và cho tiếp tục khi chưa commit.
