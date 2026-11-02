# Phần 5 · QA: danh sách kiểm tay, kết quả kiểm và chốt Phase 1

Trạng thái: ĐÃ DUYỆT 30/10/2026 (chủ dự án: "chốt phase 1 duyệt vào dự án")
Task / spec: P1-QA-01, P1-QA-03, FE-LOGIN-17, P1-QA-04 · `docs/spec/01-architecture.md#roadmap` (Phase 1 "Done when")
Gốc: 8f08d04

## Làm gì, vì sao

Phần 5 của Phase 1 làm bằng tay, không qua pipeline:

- **P1-QA-01:** viết "Manual checklist" trong `feature_p1-5-qa.md`: 14 mục bằng tiếng Việt cho người không viết code (chuẩn bị, tài khoản thử, từng case AUTH và FE-LOGIN-17, cỡ 360 px, bàn phím). Mục 14 chỉ ra những case chỉ kiểm được bằng test tự động (AUTH-T2, AUTH-T3, SCOPE-01).
- **P1-QA-03, FE-LOGIN-17:** đã chạy 30/10/2026, kết quả ghi trong "Issues log".
- **P1-QA-04:** chốt Phase 1. Điều kiện của roadmap đều đạt (xem Đã kiểm tra). Dòng "Status" trong `CLAUDE.md` gốc và `docs/spec/README.md` chuyển sang Phase 2 · Rooms; trong `docs/spec/README.md` sửa luôn số test (40 → 234) và mô tả những gì đã có.
- Dấu `[x]` của 4 task trong bản nháp chỉ đúng khi bản nháp được duyệt và chép; không duyệt thì giữ file cũ.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/phase-1-foundation/feature_p1-5-qa.md` | cùng đường dẫn | Sửa: 4 dấu `[x]`, "Manual checklist", 4 dòng "Issues log" |
| `CLAUDE.md` | cùng đường dẫn | Sửa: mục "Status" |
| `docs/spec/README.md` | cùng đường dẫn | Sửa: mục "Status" |

## Cách xem và kiểm tra

Với mỗi file: `git diff --no-index <đích> Artifacts/2026-10-30-P1-QA/<đích>`

## Đã kiểm tra

30/10/2026, trên file chính (backend `node dist/main.js` cổng 3000 + Vite cổng 5173, database dev đã seed):

- **P1-QA-03 (API):** 5 tài khoản đúng kết quả; số lạ và sai mật khẩu cùng một câu; sai 6 lần liên tiếp → lần 6 là 429, đúng mật khẩu ngay sau đó vẫn 429.
- **FE-LOGIN-17 (trình duyệt):** 360 px và máy tính; quản lý, Boss, người thuê có cờ (đổi mật khẩu xong vào `/thue`), người thuê bị khóa, "Ghi nhớ đăng nhập" + F5, đăng xuất, thứ tự Tab, đăng nhập chỉ bằng bàn phím. Chi tiết và những gì chưa chạy tay: "Issues log".
- **P1-QA-04:** kiểm database `50/50 tình huống đúng như mong đợi` (phải cài lại `@electric-sql/pglite` tạm vì `npm install` đã gỡ nó); test scope guard `src/common/scope/scope.spec.ts` 14/14; `npm run test` 592/592.
- Sau khi thử: chạy lại seed, người thuê `0900000004` về mật khẩu và cờ ban đầu; đã tắt backend và Vite; cổng 3000 và 5173 trống.

- **Test tay của chủ dự án (30/10/2026):** mục 1 đến 11 của checklist đều đạt (hướng dẫn từng bước, chủ dự án báo "đạt"); đã ghi vào "Issues log". Ở mục 4, chủ dự án lúc đầu báo vẫn đăng nhập được sau 6 lần sai; tôi kiểm lại trên backend của chủ dự án (số bị chặn 429) và trên backend mới (lần 6 và mật khẩu đúng đều bị chặn), nên chặn hoạt động đúng. Mục 12, 13 chủ dự án chưa làm tay; tôi đã đo 360 px và thứ tự Tab ở FE-LOGIN-17.
- Seed chạy lại sau các bước đổi mật khẩu; `0900000002` và `0900000004` về trạng thái ban đầu.

## Giả định hoặc câu hỏi cho chủ dự án

- Chưa chạy tay: nút "Hiện", dùng bàn phím ở 360 px và thứ tự Tab ngoài `/dang-nhap` (các test tự động đã phủ; checklist mục 12, 13 có bước để làm).
- "Phase 2 · Rooms" lấy từ roadmap; nếu muốn ghi "Status" theo cách khác, sửa câu trong bản nháp.

Đã chép vào file chính 30/10/2026 bằng apply-draft.mjs: 3 file.
