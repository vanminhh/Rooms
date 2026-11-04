# Phase 2 · Part 5 – Backend pricing, approval, price job (BE-P2-22..28)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified on the main files. Do tasks in order. Every task is drafted in `Source/backend/artifact_BE/` and approved by the owner before it touches main files (root `CLAUDE.md`). All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Part 4 on the main files |
| Unblocks | Part 6; frontend part 8b |
| Draft folder | `Source/backend/artifact_BE/<YYYY-MM-DD>-BE-P2-22-28/` |
| How | Pipeline |
| Part done when | BE-P2-28 on the main files; the public price does not change before Boss approves |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` (D-08, D-09), `docs/spec/01-architecture.md` (cron, error codes)
3. `docs/spec/12-pricing.md` – PRC-01..12, RATE-01..06 (this part)
4. `docs/spec/11-buildings-rooms.md` – SVC-04
5. `docs/spec/20-reports-audit-settings.md` – AUD-01
6. Part 2 code: `src/common/{date,rates}`; `@nestjs/schedule` is installed (P2-SETUP-01)

## Scope

In: `/room-prices`, `/rate-plans`, approve/reject, the price job, data for the "Duyệt giá" page.
Out: billing use of rates (Phase 4), FE (parts 8a/8b).

## Tasks

- [x] **BE-P2-22** Propose a room price (PRC-01, PRC-02): `effectiveFrom` ≥ today, old PENDING → `SUPERSEDED` in one transaction; audit `price.propose`.
  Chủ dự án trả lời Q-P5-3 B và Q-P5-4 A; tiếp tục planner/checkpoint trong draft.
  Done when: acceptance spec 12 "Two quick proposals → exactly one PENDING".
- [x] **BE-P2-23** Propose a rate plan (RATE-01, RATE-02, RATE-03, SVC-04): tier validation; locked service refused.
  Chủ dự án trả lời Q-P5-3 B và Q-P5-4 A; tiếp tục planner/checkpoint trong draft.
  Done when: unit tests for every RATE-02 rule and the locked-service case.
- [x] **BE-P2-24** Approve / reject, Boss only (PRC-03, PRC-07, PRC-09, RATE-05): conditional update on PENDING; expired → `PRICE_PROPOSAL_EXPIRED`; reject needs `review_note`; room price effective today → `rooms.price` set in the same transaction; audit `price.approve`, `price.reject`.
  Chủ dự án trả lời Q-P5-1 A và Q-P5-4 A; tiếp tục planner/checkpoint trong draft.
  Done when: tests: double approve → `CONFLICT_STATE`; yesterday's proposal → 409; reject without note → `VALIDATION_FAILED`.
- [x] **BE-P2-25** Boss proposal = approved at once (PRC-04) and PRC-08 superseding of future approved prices/plans (before writing the new one).
  Chủ dự án trả lời Q-P5-1 A và Q-P5-4 A; tiếp tục planner/checkpoint trong draft.
  Done when: tests for both PRC-08 examples, for a room price and a rate plan; no `rate_plans_one_per_day` error.
- [x] **BE-P2-26** Price job `src/jobs/room-price-sync.job.ts` (PRC-06): 01:00 Asia/Ho_Chi_Minh and at app start; `roomIds` filter; never writes `null`; logs a summary line; `ScheduleModule` off in tests.
  Done when: tests: idempotent, null never written, the start-up run fixes a missed day.
- [x] **BE-P2-27** Lists for staff and the "Duyệt giá" page (PRC-10..12): `expired` flag, old → new, % rounded to 1 decimal, electric tiers table, "Giá mới" when no old value.
  Chủ dự án trả lời Q-P5-2 A; tiếp tục planner/checkpoint trong draft.
  Done when: unit tests for each PRC-12 case.
- [x] **BE-P2-28** `npm run lint`, `test`, `build`, `test:e2e` pass; e2e: manager proposes → public price unchanged → Boss approves → price changes (job run with the test's `roomIds`).
  Done when: all pass; list every `[ASSUMPTION]`.

## Questions for the owner

- Q-P5-1 (BE-P2-24/25): Bảng giá APPROVED đã hiệu lực hôm nay, Boss duyệt bảng mới cũng từ hôm nay: A thay thế bản cùng ngày; B trả 409 `CONFLICT_STATE`, yêu cầu ngày khác; C quy trình riêng?
  Chủ dự án chọn A ngày 04/11/2026: thay thế bảng đã duyệt cùng ngày.
- Q-P5-2 (BE-P2-27): Giá cũ 0, giá mới >0: A hiển thị 0→giá mới, không có %; B hiển thị “Giá mới”, không có %; C cách khác?
  Chủ dự án chọn A ngày 04/11/2026: hiện 0→giá mới, không có %.
- Q-P5-3 (BE-P2-22/23): Phòng/tòa đã khóa có được đề xuất giá: A cấm với `VALIDATION_FAILED`; B cho lưu nhưng chưa công khai/đồng bộ tới khi mở khóa; C quy tắc khác?
  Chủ dự án chọn B ngày 04/11/2026: cho lưu đề xuất, chỉ áp dụng sau khi mở khóa.
- Q-P5-4 (BE-P2-22..25): API-05 `Idempotency-Key` 24 giờ áp dụng cho POST giá nào: A đề xuất/duyệt/từ chối; B chỉ duyệt và Boss tự đề xuất; C ngoại lệ không áp dụng P2-5?
  Chủ dự án chọn A ngày 04/11/2026: đề xuất, duyệt và từ chối đều cần idempotency 24 giờ.

- Q-P5-5 (BE-P2-24/25, từ PLAN): Duyệt giá khi phòng/tòa đang khóa — khi nào cập nhật `rooms.price`?
  Chủ dự án chọn A ngày 04/11/2026: duyệt thành APPROVED ngay, giữ `rooms.price` khi khóa, cập nhật đồng bộ trong transaction mở khóa phòng/tòa.
- Q-P5-6 (BE-P2-22..25, từ PLAN): Phạm vi `Idempotency-Key` 24 giờ?
  Chủ dự án chọn B ngày 04/11/2026: khóa theo `(actorId, route, key)`; payload khác → 409 `CONFLICT_STATE`.
- Q-P5-7 (BE-P2-22/23, từ coder CP-1): Manager có đề xuất giá cho phòng/dịch vụ thuộc tòa đang khóa không (SCOPE-02 coi tòa khóa là ngoài phạm vi)?
  Chủ dự án chọn "Chỉ Boss" ngày 04/11/2026: manager nhận 403 `OUT_OF_SCOPE` với tòa khóa; chỉ Boss đề xuất được; không đổi SCOPE-02.
- Q-P5-8 (BE-P2-23, từ coder CP-2): `serviceId` không tồn tại / thuộc tòa khác / đã khóa khi đề xuất bảng giá SERVICE?
  Chủ dự án chọn A ngày 04/11/2026: cả ba trường hợp → 400 `VALIDATION_FAILED` field `serviceId`.
- Q-P5-9 (BE-P2-24, từ coder CP-3): Boss duyệt bảng giá SERVICE đang PENDING khi dịch vụ đã bị khóa?
  Chủ dự án chọn A ngày 04/11/2026: duyệt bình thường → APPROVED; dịch vụ khóa vẫn ẩn công khai.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->

- 04/11/2026 · BE-P2-22..25/27 · Orchestrator DỪNG sau PLAN CP-1..7, trước code/test: spec chưa quyết Q-P5-1..4. `main-files.mjs check` ngay sau DỪNG: không file chính nào đổi. Chờ chủ dự án chọn phương án; draft chưa áp dụng.
- 04/11/2026 · BE-P2-22..25/27 · Chủ dự án đã trả lời Q-P5-1 A, Q-P5-2 A, Q-P5-3 B, Q-P5-4 A; nối lại planner để cập nhật PLAN, schema/migration idempotency trong draft và các checkpoint. Chưa duyệt áp dụng draft.
- 04/11/2026 · BE-P2-22..27 · Chủ dự án duyệt và áp dụng P2-5 + bản sửa 2 test. Trên main: DB 54/54, lint 0 lỗi, build PASS, unit 62 file/1272 test PASS, migration `20261104000000_pricing_idempotency` đã chạy lên DB dev, e2e hiện có 3 file/23 test PASS. BE-P2-22..27 đạt Done when (unit test).
- 04/11/2026 · BE-P2-28 · Còn [~]: e2e "manager đề xuất → giá công khai không đổi → Boss duyệt → job `roomIds` → giá đổi" chưa được viết (draft không kèm file e2e). Cần một draft nhỏ thêm `test/pricing.e2e-spec.ts`.
- 04/11/2026 · BE-P2-28 · E2E giá đã duyệt và áp dụng (`test/pricing.e2e-spec.ts`). Trên main: `npm run test:e2e` 4 file/33 test PASS trên DB dev. Part 5 đạt Done when; giá công khai kiểm bằng `rooms.price` (API công khai thuộc P2-6).
