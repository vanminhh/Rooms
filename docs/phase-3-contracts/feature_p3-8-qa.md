# Phase 3 · Part 8 – QA and closing (QA-P3-01..06)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. This part changes no feature code: a bug found here is reported to the owner, then fixed as its own small task with the ID of the part it belongs to. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

| | |
|---|---|
| Needs first | P3-1..P3-7 committed |
| How | by hand, with the owner |
| Part done when | QA-P3-06 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root), `docs/LESSONS.md`
2. [README.md](README.md) – sections 4 (rights), 6 (old data), 7 (tests)
3. The "Acceptance" list of `docs/spec/14-contracts.md` (all lines except the renewal one, which is Phase 5)
4. `docs/phase-extra-home101/ex-9-qa-checklist.md` – the format to follow

## Tasks

Owner direction 20/11/2026: include this QA part in the continuous completion pass. Prepare the checklist, perform authorized checks and fix findings in their feature scope. Keep incomplete external/full/manual checks marked pending and do not change the phase status to done without their evidence. No automatic commit, schema/dependency/env change or deletion of unlogged historical rows is authorized by this workflow change.

- [x] **QA-P3-01** Write `p3-8-qa-checklist.md` in this folder: one line per acceptance item of spec 14 in scope, per deposit rule of D-35 (VietQR, manual payment, move-in, cancel with settlement), per privacy rule of D-37 and CON-16 (signed URLs expire, audit rows, tenant sees only last 4 digits), the end dates of D-41 (BIL-02, BIL-22), the "Đã gọi" task of D-39, move-in without meter photos (D-38), with the steps to do by hand and the expected result taken from the spec.
  22/11/2026: chủ dự án đã dùng checklist để kiểm tay.
  20/11/2026: đã viết [checklist](p3-8-qa-checklist.md), đủ acceptance trong scope/quyền/tiền/riêng tư/D-38/39/41 và cách kiểm; chờ chủ dự án đọc/xác minh.
  Done when: the owner has read the list.
- [x] **QA-P3-02** Automated checks on a clean tree: backend `npm run lint`, `npm run test`, `npm run build`, e2e (command in `LESSONS.md`); frontend `npm run lint`, `npm run build`, `npm run test:components`; `node prisma/check-constraints.mjs . prisma`.
  22/11/2026 trên cây sạch (commit `a30a53d`): BE unit **2671/2671**, lint 0 lỗi, build OK; e2e trọn bộ từng file **67/68** (1 ca hết giờ do mất kết nối DB dev, chạy riêng lại 6/6); checker **107/107**; FE lint 0 lỗi, build OK, test:components **997/997**. Số đã ghi vào checklist.
  20/11/2026 sửa verifier: checker đã đạt **107/107**, test loader **8/8** sau khi tái hiện lỗi thiếu `called_by_id` do `schema.sql` cũ. Checker tự sinh SQL từ model hiện tại, không cần Supabase. Lint và typecheck đạt. Full BE 2633/FE 981 là lượt trước sửa utility, không cộng thêm 8. Còn E2E/dev/clean tree; [hồ sơ sửa](plans/P3-8/CHECKPOINT-QA-P3-02-checker.md).
  Chủ dự án đã chạy lại checker và xác nhận **107/107** ngày 20/11/2026. Runner registrations từng dừng ở preflight; ảnh `check-db.mjs` sau đó đã cho runtime **OK 1975ms**, direct **OK 2490ms** trên máy owner. Hai runner đã được hướng dẫn chạy lại, với xác nhận mới bên dưới.
  Cập nhật sau khối lệnh chạy lại: owner báo “ok rồi”, ghi nhận xác nhận chung đã chạy ổn; chưa có số test hoặc nội dung cleanup chi tiết. Không yêu cầu chạy lại lượt đã hoàn tất. Còn hồ sơ tổng kết và clean tree trước khi đóng QA-P3-02. Xem [checklist](p3-8-qa-checklist.md).
  Done when: all pass; the real counts are written in the checklist.
- [x] **QA-P3-03** Manual walk of the checklist on the dev database with two browsers (manager and tenant), at desktop and 360 px, the tenant side in Vietnamese and English; print preview checked.
  22/11/2026: chủ dự án báo đã kiểm tay xong và đạt ("tui kiểm tay rồi ok"); không có chi tiết từng dòng.
  CHỜ 20/11/2026: cần kết quả kiểm trực tiếp trên trình duyệt, gồm desktop, 360 px, VI/EN và bản in. Xem [checklist](p3-8-qa-checklist.md).
  Done when: every line is marked pass or has a bug entry in the Issues log.
- [x] **QA-P3-04** Regression: the 4 roles log in; guest sign-up and viewings of Phase Extra; a manager is still limited to 2 buildings; price approval; public lists follow ROOM-05 (a room with a HOLD contract disappears, a cancelled one comes back); no `/public/*` response contains contract, occupant or invoice data.
  22/11/2026: chủ dự án báo đã kiểm tay xong và đạt ("tui kiểm tay rồi ok"); không có chi tiết từng dòng.
  CHỜ 20/11/2026: unit test đã đạt; cần bằng chứng hồi quy trực tiếp cho các điểm trong [checklist](p3-8-qa-checklist.md).
  Done when: each point is marked pass in the checklist.
- [x] **QA-P3-05** Clean the dev database of rows left by e2e runs with `scripts/e2e/cleanup.mjs`; list mode first, apply mode only after the owner agrees.
  22/11/2026: cleanup `--apply 20261120T2324-2HAX` sau khi chủ dự án đồng ý; liệt kê lại không còn lượt chờ dọn.
  CHỜ 20/11/2026: cần kết quả cleanup LIST trên DB dev và owner xác nhận. Không tự xóa dữ liệu lịch sử không có journal. Xem [checklist](p3-8-qa-checklist.md).
  Done when: the owner confirms the cleanup result.
- [x] **QA-P3-06** ⏸ Close the phase: update the "Status" paragraphs of `docs/spec/README.md`, root `CLAUDE.md` and `AGENTS.md` (Phase 3 done, real test and DB-check counts, next Phase 4); set the status line of [README.md](README.md) and [PROGRESS.md](PROGRESS.md); note whether Q-15 (the real contract text) is still open.
  22/11/2026: chủ dự án duyệt chữ đóng phase và commit.
  CHỜ 20/11/2026: còn E2E, cleanup, kiểm trực tiếp và nghiệm thu của owner. Full BE 2633/FE 981 và checker 107/107 đã đạt; chưa đủ bằng chứng đóng Phase 3. Xem [checklist](p3-8-qa-checklist.md).
  Done when: the owner approves the texts.

## Questions for the owner

<!-- none yet -->

## Issues log

- 20/11/2026 · QA-P3-02/DB-07 · Lỗi ảnh owner42703missingcalled_by_id tái hiện do snapshotSQL stale, không phải bằng chứng thiếu migration dev. Đã sửa loader model→SQLoffline failclosed, checker107/107 và8testhelper đạt; hướng dẫn trước vềchecker cầndevconnection đã được đính chính. Các mục blockedDBchecker bên dưới là lịch sử đã được kết quả mới thay thế; còn E2E/cleanupdev và manual browser/print. Không suy E2E đãpass chỉ từ ảnh của lệnhcuối.

- 20/11/2026 · Full auto checks đã chạy sau owner xác nhận · Backend2633/2633,frontend981/981,0fail/skip,lint đạt; source application không đổi nên giữ build đã đạt. Đã loại block quyền chạy full, không còn chờ full do telemetry ở lượt hiện tại. QA02 vẫn thiếu E2E/DBchecker/clean tree; QA03/04 cần manual/regression trực tiếp; QA05 thiếuDB/owner-cleanup; QA06 thiếuownerapproval. Fresh SELECT1runtime/direct đềuFAILED, không tạo fixtures hoặc chạy cleanup/checker.

- 20/11/2026 · QA01..06 · Checklist và lệnh kiểm đã chuẩn bị, source review DUYỆT, kết quả scoped/lint/build có trong hồ sơ. Automatic approval review chặn full và scoped frontend vì cảnh báo telemetry VisualStudio; không có output runtime mới. SELECT1 cả hai URL DBFAILED nên chưa E2E/checker/cleanup; browser/print/manual không có công cụ. Chưa có gate clean-tree/owner-read/owner-approval cuối, giữ Phase3inprogress. Không áp cleanup đối với dữ liệu unlogged cũ.

<!-- date · part and task ID · what failed · what is needed -->
