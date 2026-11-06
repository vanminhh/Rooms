# P2-5c · Spec: PRC-12 mô tả serviceName

Trạng thái: ĐÃ DUYỆT 06/11/2026
Task / spec: Q-FE8B-7 · PRC-10, PRC-12
Gốc: 77f5c31

## Làm gì, vì sao

Cập nhật `docs/spec/12-pricing.md` (PRC-12): bảng giá (rate plan) trả thêm `serviceName` (`services.name`) khi `kind = SERVICE`, và `null` cho ELECTRIC/WATER, để trang "Duyệt giá" hiện tên dịch vụ (backend: `Source/backend/artifact_BE/2026-11-05-BE-P2-SERVICE-NAME/`).

## File sẽ sửa ở bản chính

| Bản nháp | Đích | Sửa |
|---|---|---|
| `docs/spec/12-pricing.md` | `docs/spec/12-pricing.md` | Sửa (1 câu trong PRC-12) |

## Cách xem và kiểm tra

`git diff --no-index --ignore-cr-at-eol docs/spec/12-pricing.md Artifacts/2026-11-05-BE-P2-SERVICE-NAME/docs/spec/12-pricing.md`

## Đã kiểm tra

Khớp hành vi code của draft backend `serviceName`.

## Giả định hoặc câu hỏi cho chủ dự án

Không có.

Đã chép vào file chính 06/11/2026 bằng apply-draft.mjs: 1 file.
