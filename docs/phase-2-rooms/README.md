# Phase 2 · Rooms – các phần

Mục tiêu (roadmap, `docs/spec/01-architecture.md#roadmap`): khách tìm được phòng và đặt lịch xem; giá chỉ đổi sau khi Boss duyệt. Kế hoạch đã duyệt (01/11/2026): `Artifacts/approved/2026-11-01-phase-2-plan/PLAN.md` (bản 4). Các quyết định của chủ dự án đã được ghi vào spec 00, 01, 10, 11, 12, 13, 19, 30; file task chỉ trỏ tới mã luật trong spec.

Mỗi phần là một file `feature_p2-*.md` giống Phase 1: danh sách task, "Done when", câu hỏi cho chủ dự án, nhật ký lỗi. Trạng thái task chỉ ghi trong các file này.

| File | Việc | Cần xong trước | Cách làm |
|---|---|---|---|
| [feature_p2-0-setup.md](feature_p2-0-setup.md) | `@nestjs/schedule`, `CLOUDINARY_URL` | – | Bằng tay |
| [feature_p2-1-spec.md](feature_p2-1-spec.md) | Sửa spec theo quyết định, tạo các file này | P2-0 | Bằng tay (bản nháp `Artifacts/`) |
| [feature_p2-2-backend-foundation.md](feature_p2-2-backend-foundation.md) | BE-P2-01..10: lỗi DB, `meta`, helper ngày/đơn giá/phòng công khai, `/files/sign`, seed, bộ chạy e2e | P2-1 | Pipeline |
| [feature_p2-3-backend-buildings.md](feature_p2-3-backend-buildings.md) | BE-P2-11..16: tòa, dịch vụ, `/managers` | P2-2 | Pipeline |
| [feature_p2-4-backend-rooms.md](feature_p2-4-backend-rooms.md) | BE-P2-17..21: phòng, ảnh, lưới tầng | P2-3 | Pipeline |
| [feature_p2-5-backend-pricing.md](feature_p2-5-backend-pricing.md) | BE-P2-22..28: đề xuất, duyệt, job giá | P2-4 | Pipeline |
| [feature_p2-6-backend-public-viewings.md](feature_p2-6-backend-public-viewings.md) | BE-P2-29..35: API công khai, lịch hẹn, `/dashboard` | P2-5 | Pipeline |
| [feature_p2-7-mockup.md](feature_p2-7-mockup.md) | Mockup 4 trang công khai + lưới tầng + Duyệt giá | P2-1 | Bằng tay (bản nháp `artifact_FE/`) |
| [feature_p2-8a-frontend-buildings-rooms.md](feature_p2-8a-frontend-buildings-rooms.md) | FE-P2-01..08: khung route, tòa, nhân sự, phòng | P2-4, P2-7 | Pipeline |
| [feature_p2-8b-frontend-pricing-viewings.md](feature_p2-8b-frontend-pricing-viewings.md) | FE-P2-09..13: đơn giá, duyệt giá, lịch hẹn, việc hôm nay | P2-6, P2-8a | Pipeline |
| [feature_p2-9-frontend-public.md](feature_p2-9-frontend-public.md) | FE-P2-14..18: trang công khai, form lịch hẹn | P2-6, P2-7, P2-8a | Pipeline |
| [feature_p2-10-qa.md](feature_p2-10-qa.md) | Kiểm tay, kiểm DB 50/50, dọn dữ liệu thử, chốt Phase 2 | Tất cả | Bằng tay |

Thứ tự:

```
P2-0 ─► P2-1 ─► P2-2 ─► P2-3 ─► P2-4 ─► P2-5 ─► P2-6 ─────────────┐
          └─► P2-7 ───────────────┐                                ├─► P2-8b ─┐
                                  └─► P2-8a (sau P2-4 và P2-7) ────┤          ├─► P2-10
                                                                   └─► P2-9 ──┘
```

- BE chạy **lần lượt**: mỗi phần sửa `app.module.ts`, mà `apply-draft.mjs` không chép khi file đích đã đổi sau commit `Gốc`.
- Song song được: P2-8a ∥ P2-5/P2-6, và P2-8b ∥ P2-9. P2-8a dựng sẵn khung (mọi route, mục menu, glob `tests/p2/*.test.mjs`), nên P2-8b và P2-9 không sửa `routes.tsx`, `package.json`. Kit mới (`src/components/`) chỉ thêm ở P2-8a.
- Giữa các phần: duyệt → chép → kiểm trên file chính → commit → dọn `approved/`.

## Ràng buộc cho mọi pipeline Phase 2

- Orchestrator mới cho mỗi phần; `main-files.mjs save` trước, `check` sau mỗi lần trả lời (chạy song song: `save` một lần trước khi giao cả hai).
- `REVIEW.md` do phiên chính giữ. Agent không đọc `.env`, không cài gói (gói mới phải hỏi chủ dự án).
- DB dev chỉ được ghi qua `npm run test:e2e` với bộ chạy e2e của BE-P2-09 (dữ liệu `[E2E <runId>]`, nhật ký `test/e2e-runs/`). Không agent nào chạy `node test/e2e-cleanup.mjs --apply`.
- Tester FE chạy `test:components` bằng `package.json` của bản nháp và tắt dev server trước khi báo cáo.
- Chữ hiển thị theo spec; spec không trả lời → dừng và hỏi.
