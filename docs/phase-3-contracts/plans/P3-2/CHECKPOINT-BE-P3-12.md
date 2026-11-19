# P3-2 · BE-P3-12 · E2E tạo hợp đồng

Ngày 18/11/2026. Commit API trước đó `5c56d06`.

Ngày 19/11/2026 chủ dự án xác nhận đã commit mã nghiệm thu tại `b6c7ff6`. Lượt đọc trạng thái migration từ Codex tiếp tục báo `P1001`. Kết quả E2E và cleanup list trên DB dev còn chờ xác minh.

## Thay đổi

- `test/contracts.e2e-spec.ts` có bốn ca qua Nest, HTTP và Prisma. Ca ngoài phạm vi kiểm `OUT_OF_SCOPE`. Ca tạo qua “Chốt” kiểm hai xác nhận, người ký, dịch vụ, CCCD, audit, lịch `WON`, hủy các lịch `NEW` và `CONFIRMED` cùng phòng và hai lệnh “Đã gọi”. Hai ca còn lại kiểm tranh chấp tạo HOLD cùng phòng và rollback sau khi ghi audit.
- `scripts/e2e/run.ts` đóng các HOLD chưa ký, chưa có hóa đơn và thuộc đúng lượt E2E, rồi dọn các thực thể đã ghi log trong giao dịch giữ khóa mapping và khóa các phòng thử. Hợp đồng đã hủy, người ở, liên kết dịch vụ và audit được giữ làm lịch sử theo G-05. Nhật ký chỉ sang `CLEANED` sau khi xác minh hết việc gọi chờ xử lý và thực thể thử còn hoạt động.
- `scripts/e2e/cleanup.mjs` liệt kê lịch hủy do HOLD còn chờ gọi. Chế độ list và `--apply` cùng bảo vệ HOLD của lượt bị gián đoạn. `scripts/e2e/run.spec.ts` kiểm phép dọn hợp đồng thử và bảo vệ liên kết thuộc lượt khác.

`[ASSUMPTION A-18]` Nhân sự xác nhận tài khoản khách đã xác minh thuộc người ký trước khi chuyển vai trò và tái dùng. Ca “Chốt” kiểm yêu cầu xác nhận này riêng với việc xác nhận người ký khác chủ lịch.

## Kiểm tra

| Phép kiểm | Kết quả |
|---|---|
| Build, lint, typecheck | Build exit 0. Lint `Found 4 warnings and 0 errors.` Typecheck nhắm tệp E2E và runner đạt. |
| Toàn bộ backend với HTTP trong bộ nhớ | `Test Files 97 passed (97)`, `Tests 1938 passed (1938)`, exit 0 trước lần bổ sung khóa phòng cho cleanup. |
| Runner trên bản cuối | `Tests 37 passed (37)`, exit 0. |
| E2E trên PostgreSQL nhúng | `Tests 4 passed (4)`, exit 0 sau bản sửa khóa và thêm lịch `CONFIRMED`. Log thử `CLEANED`. Kiểm SQL giữ đúng hai hợp đồng đã hủy, hai người ký, hai liên kết dịch vụ và hai audit tạo hợp đồng. Adapter dùng một phiên PostgreSQL. |
| Ràng buộc DB | `97/97 tình huống đúng như mong đợi`, exit 0. |
| DB dev | Prisma status báo `P1001`. Lệnh E2E thật dừng ở truy vấn lấy Boss, `Tests 4 skipped (4)` do hook hỏng trước khi sinh log hay dữ liệu thử. `cleanup.mjs` ở chế độ liệt kê cũng báo `Can't reach database server`. Hai kết nối thật và kết quả list sau khi chạy còn chờ máy dự án. |

## Chạy trên máy dự án

Từ PowerShell có kết nối DB dev, chạy cả bộ E2E rồi liệt kê các lượt chưa dọn. Biến `NODE_ENV` được khôi phục sau khi chạy.

```powershell
cd D:\Rooms\Source\backend
$roomsPreviousNodeEnv = $env:NODE_ENV
try {
    $env:NODE_ENV = 'test'
    node --env-file=.env .\node_modules\vitest\vitest.mjs run --config .\vitest.config.e2e.ts
    if ($LASTEXITCODE -eq 0) {
        node --env-file=.env .\scripts\e2e\cleanup.mjs
    }
} finally {
    $env:NODE_ENV = $roomsPreviousNodeEnv
}
```

Đối chiếu các dòng tổng `Test Files`, `Tests`, `BE-P3-12 <runId> CLEANED` và xác nhận phần liệt kê không có chính `<runId>` đó. Các log cũ có thể được in riêng. Cần kết quả này trước khi đánh dấu BE-P3-12 hoàn tất.

Commit gợi ý sau nghiệm thu `test(contracts): verify HOLD and viewing side effects (BE-P3-12, CON-02, CON-07, VIEW-05, VIEW-06)`.

## Rà soát độc lập

Reviewer Codex thực hiện do reviewer Sonnet báo `ENOTFOUND`. Lượt đầu phát hiện list/apply có thể xử lý khác nhau và dọn tự động có thể kiểm liên kết trước khi khóa phòng. Bản cuối dùng cùng chính sách list/apply và khóa mapping, phòng trước khi dọn trong E2E.

**KẾT LUẬN — DUYỆT**

Phạm vi BE-P3-12 so với `5c56d06`, 5 file, +387/-12 dòng.

### Lỗi chặn

Không còn lỗi chặn trong phạm vi review.

### Nên sửa

Không có.

### Ghi chú

- `Source/backend/test/contracts.e2e-spec.ts:123` — Cleanup lấy khóa mapping theo cùng thứ tự với luồng tạo hợp đồng, rồi khóa đúng các phòng trong log theo thứ tự ID. Các bước dọn và kiểm tra hợp đồng, lịch, tòa, phòng, người dùng và dịch vụ nằm trong cùng giao dịch 60 giây. `CLEANED` được ghi sau khi commit.
- `Source/backend/scripts/e2e/run.ts:183` — Cleanup tự động chỉ hủy hợp đồng `HOLD` khớp dấu nhận diện và ID của lượt thử, chưa ký, chưa vào ở và chưa có hóa đơn. Tác vụ gọi thử còn mở được đóng bằng ID người tạo thử. Hợp đồng, người ở, liên kết dịch vụ và audit được giữ theo G-05. Chế độ list và `--apply` tiếp tục bảo vệ hợp đồng `HOLD` của lượt bị gián đoạn. Log cũ thiếu `kind` vẫn tương thích.
- `Source/backend/test/contracts.e2e-spec.ts:155` — Ca HTTP kiểm `OUT_OF_SCOPE`. Từ dòng 164, ca thành công kiểm xác nhận A-18 và người ký khác chủ lịch, giữ chủ lịch gốc khi chuyển `WON`, hủy cả lịch `NEW` lẫn `CONFIRMED` cùng phòng, và giữ nguyên lần ghi đầu khi hai yêu cầu đánh dấu gọi đến đồng thời. Một tác vụ gọi được giữ lại để kiểm cleanup tự động.
- `Source/backend/test/contracts.e2e-spec.ts:239` — Ca rollback ghi audit thật rồi chủ động phát sinh lỗi. Các xác nhận kiểm hợp đồng, người ở, dịch vụ, tài khoản, hai lịch và audit sau rollback.

### Đã kiểm

Đã đối chiếu thay đổi với luồng tạo hợp đồng, cập nhật lịch, dashboard, schema, G-05, SCOPE-02, A-18, VIEW-05/06 và BE-P2-09. `git diff --check 5c56d06` trả mã 0. Review chỉ đọc, chưa chạy HTTP hoặc truy cập DB dev.
