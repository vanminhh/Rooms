# Chia Phase 1 thành 6 file phần trong `docs/phase-1-foundation/`

Trạng thái: ĐÃ DUYỆT 28/10/2026
Task / spec: Phase 1 · Foundation (`docs/spec/01-architecture.md#roadmap`) · BE-LOGIN-01..25, FE-LOGIN-01..17 · quyết định của chủ dự án 28/10/2026: lưu ở `docs/phase-1-foundation/`, chuyển task sang file phần; chỉ ghi tài liệu theo spec, không ghi ai làm, nhánh git hay quy trình duyệt của nhóm
Gốc: cad211e

## Làm gì, vì sao

Hai file `auth/feature_login.md` chứa cả Phase 1 trong một khối. Tách thành 6 phần theo thứ tự làm, để nhóm tự chia và giao từng file cho AI:

| File | Task | Cách làm |
|---|---|---|
| `feature_p1-0-setup.md` | P1-SETUP-01, 02, FE-LOGIN-02, 03 | Bằng tay |
| `feature_p1-1-backend-foundation.md` | BE-LOGIN-01..08 | Pipeline |
| `feature_p1-2-backend-auth.md` | BE-LOGIN-09..25 | Pipeline |
| `feature_p1-3-frontend-form-kit.md` | FE-LOGIN-06 | Pipeline |
| `feature_p1-4-frontend-auth.md` | FE-LOGIN-01 (đã xong), 04, 05, 07..16 | Pipeline |
| `feature_p1-5-qa.md` | P1-QA-01..04, FE-LOGIN-17 | Bằng tay |

Mỗi file có bảng đầu trang: cần xong gì trước, mở khóa phần nào, thư mục nháp, cách làm, khi nào xong phần. `README.md` (tiếng Việt) chỉ có mục tiêu, bảng các phần và thứ tự.

Tên file bắt đầu bằng `feature_` để `staging-guard.mjs` và `main-files.mjs` coi là file task: dấu trạng thái, câu hỏi và nhật ký lỗi được sửa thẳng như `feature_login.md` cũ. Nội dung task giữ tiếng Anh như file cũ.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/phase-1-foundation/README.md` | cùng đường dẫn | Thêm |
| `docs/phase-1-foundation/feature_p1-0-setup.md` … `feature_p1-5-qa.md` (6 file) | cùng đường dẫn | Thêm |
| `Source/backend/src/modules/auth/feature_login.md` | cùng đường dẫn | Sửa: chỉ còn bảng trỏ sang file phần |
| `Source/frontend/src/features/auth/feature_login.md` | cùng đường dẫn | Sửa: chỉ còn bảng trỏ sang file phần |

Không sửa `CLAUDE.md`.

## Cách xem và kiểm tra

Mở `docs/phase-1-foundation/README.md` trong thư mục nháp, rồi từng file phần.

## Đã kiểm tra

28/10/2026, bằng script so sánh các dòng task của hai `feature_login.md` hiện tại với 6 file phần:

- 42 task cũ (BE 25, FE 17) đều có mặt, mỗi task đúng một lần; không task nào mất chữ, trừ BE-LOGIN-04 (xem dưới).
- Chỉ thêm ghi chú, không đổi nội dung task:
  - BE-LOGIN-02: thư viện cài ở P1-SETUP-02; sửa đường dẫn trong 2 file tài liệu cần bản nháp riêng trong `Artifacts/`.
  - BE-LOGIN-04: dòng "Depends on" thêm "(P1-SETUP-01: Supabase … never paste it into chat)".
  - BE-LOGIN-24: e2e cần cả máy chủ và database dev, nên chỉ chạy được sau khi phần này đã chép vào file chính.
  - FE-LOGIN-02: phiên bản kiểm ngày 28/10/2026 và "Done when".
  - FE-LOGIN-03: phải nằm ở file chính trước phần 4; "Done when".
  - FE-LOGIN-17: "Needs first: part 4 applied".
- Task mới: P1-SETUP-01 (Supabase `.env`), P1-SETUP-02 (thư viện backend), P1-QA-01..04.
- Tìm lại các chữ who / lead / helper / branch / push / nhánh / chính / phụ trong bản nháp: không còn chỗ nào nói về vai hay nhánh.
- Liên kết trong `README.md` và hai file trỏ đều tới đúng file.

## Giả định hoặc câu hỏi cho chủ dự án

- Phần "Before you start" của từng file phần là danh sách cũ, cắt theo phạm vi phần (vd phần 1 không cần AUTH-T1..T3), và thêm mockup auth làm tham chiếu cho phần 3, 4 (chỉ dùng khi mockup đã duyệt; spec thắng khi khác nhau).

Đã chép vào file chính 28/10/2026 bằng apply-draft.mjs: 9 file.
