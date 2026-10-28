# Artifacts – vùng nháp chờ duyệt

Mọi thứ agent tạo mới hoặc sửa (asset, giao diện, code, cấu hình, tài liệu) **làm trước ở vùng nháp**, chủ dự án xem và duyệt, rồi mới được đưa vào file chính.

| Vùng nháp | Dùng cho | Đường dẫn trong bản nháp tính từ |
|---|---|---|
| `Artifacts/` | Bản nháp dùng chung: asset, dữ liệu mẫu, schema/spec nháp, thứ cả FE và BE cùng dùng | gốc repo `Rooms/` |
| `Source/frontend/artifact_FE/` | Bản nháp frontend: component, trang, style, ảnh của app | `Source/frontend/` |
| `Source/backend/artifact_BE/` | Bản nháp backend: module, service, test, migration | `Source/backend/` |

## Một bản nháp

Mỗi việc là một thư mục `<YYYY-MM-DD>-<mã task hoặc tên ngắn>/` trong vùng nháp tương ứng, gồm:

- `REVIEW.md` theo mẫu bên dưới;
- các file nháp, **đặt đúng đường dẫn đích** tính từ cột cuối bảng trên. Ví dụ `Source/frontend/artifact_FE/2026-10-26-FE-LOGIN-06-text-field/src/components/TextField.tsx` sẽ thay/thêm vào `Source/frontend/src/components/TextField.tsx`.

```markdown
# <Tên việc>

Trạng thái: CHỜ DUYỆT        <!-- CHỜ DUYỆT · ĐÃ DUYỆT dd/mm/yyyy · TỪ CHỐI dd/mm/yyyy -->
Task / spec: FE-LOGIN-06 · KIT-07, UI-08
Gốc: a1b2c3d                 <!-- `git rev-parse --short HEAD` lúc tạo bản nháp; bắt buộc khi bản nháp sửa file đang có -->

## Làm gì, vì sao
## File sẽ thêm / sửa / xóa ở bản chính
| Bản nháp | Đích | Thêm / Sửa / Xóa |
## Cách xem và kiểm tra
## Đã kiểm tra
## Giả định hoặc câu hỏi cho chủ dự án
```

## Quy trình

1. Agent tạo thư mục bản nháp + `REVIEW.md`, chạy kiểm tra ngay trong vùng nháp. Nếu bản nháp sửa file đang có: file đó phải đã commit, và dòng `Gốc` ghi commit hiện tại (`git rev-parse --short HEAD`) trước khi chép file vào bản nháp.
2. Agent báo chủ dự án đường dẫn bản nháp và **dừng, chờ duyệt**. Không có câu "đồng ý" rõ ràng trong chat thì không làm bước 3.
3. Được duyệt: agent đổi trạng thái thành `ĐÃ DUYỆT <ngày>` rồi chạy `node .claude/scripts/apply-draft.mjs <thư mục nháp>`.
   - Claude Code hỏi chủ dự án xác nhận **một lần** cho cả bản nháp.
   - Lệnh chép mọi file sang đích, trừ `REVIEW.md`, `PLAN.md`, `ref/` và `preview.html`.
   - Lệnh **không chép file nào** nếu một file đích đã đổi so với commit `Gốc` (vd bản nháp khác hoặc bạn trong nhóm vừa sửa nó). Khi đó: xem `git diff <Gốc> -- <file>`, gộp thay đổi vào bản nháp, commit file chính, ghi lại `Gốc` bằng commit mới, chạy lại.
   - Sau đó lệnh chuyển cả thư mục vào `approved/` của vùng nháp đó để giữ lịch sử.
   - File cần xóa ở bản chính thì làm tay, sau khi chủ dự án đồng ý.
4. Chạy lại kiểm tra của app.
5. Sau khi commit thay đổi ở file chính, dọn thư mục đó trong `approved/` (chủ dự án quyết định 26/10/2026):
   - **Giữ** `REVIEW.md` (làm gì, vì sao, lịch sử chỉnh, kết quả kiểm tra, câu duyệt) và ảnh tham chiếu nhỏ không có ở file chính (thư mục `ref/`, mỗi ảnh tối đa 200 KB).
   - **Xóa** bản sao code, file shim để chạy thử (`preview.html`, …) và bản sao ảnh/asset đã có ở file chính. Nội dung chính xác lúc duyệt đã nằm trong commit.
   - Ghi vào `REVIEW.md` một dòng `Đã dọn <ngày>`: các file đã xóa, chúng nằm ở đâu trong bản chính và mã commit.
6. Bị từ chối: ghi `TỪ CHỐI <ngày>` + lý do trong `REVIEW.md`, sửa lại theo góp ý hoặc xóa nếu chủ dự án bảo bỏ.

Ngoại lệ, không cần qua vùng nháp: cập nhật dấu trạng thái task, "Issues log" và "Questions for the owner" trong các file `feature_*.md`.

## Cách chạy thử trong vùng nháp

- **Frontend:** `npm run dev` trong `Source/frontend`, tạo `preview.html` trong thư mục bản nháp import component nháp (và `../../src/components` nếu cần), mở `http://localhost:5173/artifact_FE/<thư-mục-nháp>/preview.html`. `npm run lint` cũng kiểm tra file trong `artifact_FE/` (trừ `approved/`).
- **Backend:** đặt test `*.spec.ts` trong thư mục bản nháp; chạy riêng bằng `npx vitest run artifact_BE/<thư-mục-nháp>`. Lưu ý `npm run test` cũng chạy các test này.
- **Dùng chung:** tùy loại (vd `node docs/database/check-constraints.mjs` với schema nháp đặt trong `Artifacts/`).
