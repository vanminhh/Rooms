# P3-4 · BE-P3-21 · Hủy HOLD và số tiền hoàn cọc

Ngày 20/11/2026, bắt đầu từ `40747f6` (BE-P3-20 đã nghiệm thu/commit, Git sạch). **BE-P3-21 đã triển khai và kiểm cục bộ đạt, reviewer DUYỆT; chờ owner kiểm và commit.** Chưa làm BE-P3-22 hoặc đánh dấu toàn bộ P3-4 xong. Không đổi schema, migration, dependency, env hoặc DB dev.

## Phạm vi

- POST `/contracts/:id/cancel` cho staff trong scope hiện tại, chỉ HOLD. Body reason bắt buộc, depositKept tùy chọn mặc định 0.
- UNPAID invoice cọc thành CANCELLED cùng lý do; PAID giữ nguyên invoice/payment và tạo một settlement từ payment.amount, phần khác 0, net là tiền cần hoàn. Chưa thu/không invoice thì số tiền nhận 0, không có settlement hoàn tiền; không giữ lại tiền chưa thu.
- Không ghi refundPaidAt, không gọi ngân hàng hoặc trả tiền thực tế; bước ghi đã hoàn ở Phase 4. Giữ nguyên lịch sử viewings/account; public room được suy ra từ status hợp đồng, không set room flags.
- User/session không cần cập nhật: account mới chưa ký vốn inactive; account guest tái dùng/đã kích hoạt/đã khóa vẫn giữ trạng thái. Tránh ghi đè activation do một HOLD khác dùng cùng user.
- API-05: idempotency 24 giờ dùng helper hiện có, scope actor/route/key; hash chuẩn hóa contractId/reason/depositKept. Kiểm scope trước replay; kiểm HOLD trong callback để cùng key phát lại kết quả sau CANCELLED.

## Giao dịch và khóa

Shared mapping → current scope → idempotency key → room FOR UPDATE → contract FOR UPDATE → current scope/HOLD → invoice FOR UPDATE → invoice cancel hoặc settlement → contract CANCELLED → audit, cùng một transaction.

Payment thắng invoice lock thì cancel thấy PAID và lập settlement; cancel thắng thì payment sau thấy CANCELLED và không ghi thu. Sign/move-in/cancel cùng contract được serialize; không khóa user hoặc các contract khác để tránh vòng khóa trên tài khoản dùng chung.

Settlement.moveOutDate dùng ngày hủy tại Hà Nội; không đổi endedAt của hợp đồng (đang dành cho ENDED), không tạo invoice FINAL và không biến refund thành đã trả. Đây là cách lưu của cancellation; không đổi cách tính thanh lý ACTIVE ở Phase 4.

## Tệp

| Nhóm | Tệp |
|---|---|
| Nghiệp vụ | `Source/backend/src/modules/contracts/contract-cancel.service.ts` |
| Validation | `Source/backend/src/modules/contracts/dto/cancel-contract.dto.ts` |
| HTTP | `Source/backend/src/modules/contracts/contracts.cancel.http.spec.ts`, controller/module hiện có |
| Tài liệu | Spec CON-12, task P3-4, PROGRESS, checkpoint BE-P3-20 ghi commit và checkpoint này |

Response `{id,code,status,cancelReason,depositInvoice:{id,status}|null,settlement:{id,deposit,depositForfeit,net,refundPaidAt,moveOutDate}|null}`, no-store. Lý do trim/nonblank/tối đa 2.000 ký tự/không NUL; depositKept phải là number nguyên 0..IntMax, null và field lạ bị từ chối. API không nhận amount, net, refundPaidAt hay trạng thái client tự chỉ định.

PAID thiếu payment hoặc amount lệch total, UNPAID/CANCELLED còn payment, nhiều invoice cọc trực tiếp chưa hủy, settlement đã tồn tại trên HOLD đều là conflict bảo vệ dữ liệu. Không lấy cọc của hợp đồng khác/parent để hoàn; không sửa invoice/payment PAID hoặc các khoản giữ lại đã lưu trong một settlement cũ.

## Kiểm tra thực tế

| Phép kiểm | Kết quả |
|---|---|
| Native HTTP mới | `Test Files 1 passed (1)`, `Tests 79 passed (79)`, 6,63 giây, bắt đầu 11:12:01. Nest guards/DTO/service thật, chỉ fake Prisma edge |
| Hồi quy | `Test Files 9 passed (9)`, `Tests 240 passed (240)`, 29,17 giây, bắt đầu 11:12:06: contracts create/sign/read/reset/documents/move-in, billing payment, pricing idempotency, public-room |
| Build | `npm run build` exit 0 |
| Lint | `Found 4 warnings and 0 errors.`, exit 0, 249 file, 1,1 giây; 4 warning sort cũ dashboard/pricing. Scoped lint test mới 0 warning/0 error |
| Scoped noEmit | 0 diagnostics trên HTTP spec mới, exit 0 |
| Service/Prisma/SQL | PGlite qua đủ 10 migration, actual compiled ContractCancelService/BillingService/AuditService/Prisma: 11/11, exit 0, 2,90 giây |
| Review | DUYỆT, đầy đủ report bên dưới; reviewer Codex theo model có sẵn trong phiên, không có Sonnet trong catalog |
| Diff | `git diff --check` đạt, kiểm lại trước báo cáo |

SQL smoke chứng minh: cọc 2.500.000 giữ 1.000.000 → net 1.500.000/refundPaidAt null/các parts khác 0; invoice/payment PAID giữ nguyên byte-equivalent; publicRoomWhere đủ điều kiện sau hủy; account/password/role/session và viewings WON/CANCELLED giữ nguyên. Cùng key chỉ có một settlement/audit/cache; đổi payload conflict, đổi quản lý cũ không replay được. Cancel trước payment khiến invoice CANCELLED và payment bị từ chối; payment trước cancel qua trigger PAID rồi lập settlement. Cọc 0/noinvoice không settlement, giữ tiền chưa thu lỗi400. Lỗi ném sau INSERT audit thật rollback contract/settlement/invoice/cache; thử lại cùng key thành công. Repeat không key hoặc existing settlement conflict.

Script smoke tạm dưới ignored cache: `Source/backend/node_modules/.cache/rooms-p3-3/cancel-postgres-smoke.mjs`, chạy từ backend bằng `node .\node_modules\.cache\rooms-p3-3\cancel-postgres-smoke.mjs`. Hai fixture đầu thiếu visitAt và room code vượt 10 ký tự đã sửa trong harness, không sửa product để khớp test; lượt cuối 11/11 đạt.

Log audit failure/INTERNAL_ERROR trong regression là ca cố tình gây lỗi để kiểm rollback/validation, không phải test thất bại. Không cộng 79/240 hoặc smoke thành kết quả full backend suite. Chưa chạy full `npm run test` trên revision này; không dùng kết quả owner nghiệm thu BE-P3-20 thay cho BE-P3-21. Full suite/dev E2E tổng thể vẫn cần ở mốc BE-P3-22.

## Giới hạn và assumptions

HTTP concurrency dùng fake tuần tự hóa transaction; PGlite dùng một session. Hai thứ tự payment/cancel đã được thử bằng SQL thực, chưa phải proof tranh chấp nhiều connection. Production dùng row locks và unique settlement để bảo vệ. Không ghi tiền hoàn thực tế hoặc gửi thông báo/email; phase sau ghi refundPaidAt.

Không thêm assumption nghiệp vụ mới. A-16/D-26 giữ vai trò, mật khẩu và guest area; A-24 của meter từ BE-P3-20 không được thay đổi hoặc diễn giải lại trong cancellation. `depositKept` mặc định 0 và moveOutDate = ngày hủy Hà Nội là các lựa chọn lưu/chuẩn hóa đã ghi rõ ở CON-12, không đổi số tiền thanh lý ACTIVE của Phase 4.

## Kiểm trên máy dự án và commit

Tại `Source/backend`, owner có thể chạy `npm run test` trước commit để kiểm toàn bộ bản mới. Không cần migration, seed, upload hoặc gọi API ngân hàng cho thay đổi này. Không tái chạy hay xin duyệt lại migration BE-P3-20 đã được owner nghiệm thu.

Kiểm tay trên HOLD thử: PAID 2.500.000, cancel với reason và depositKept 1.000.000 → CANCELLED, net 1.500.000/refundPaidAt null; invoice/payment vẫn PAID/lịch sử nguyên vẹn, phòng lại đủ điều kiện public nếu các điều kiện khác vẫn đạt. UNPAID cancel → invoice CANCELLED và không settlement; ACTIVE cancel →409; forfeit vượt đã nhận →400; cùng Idempotency-Key/cùng body trả response cũ, không thêm settlement/audit.

Commit gợi ý:

```text
feat(contracts): cancel HOLD contracts and calculate deposit refunds (BE-P3-21, CON-12, BIL-17, API-05)
```

Owner kiểm và commit xong mới triển khai BE-P3-22. Không tự commit.

## Báo cáo reviewer đầy đủ

KẾT LUẬN: **DUYỆT**

Phạm vi: BE-P3-21 so với `40747f6`: `ContractCancelService`, DTO, controller/module và HTTP spec mới; đối chiếu CON-12, D-26, A-16, BIL-17, API-05, SCOPE-02 và AUD-01.

### Lỗi chặn

Không phát hiện lỗi chặn còn tồn tại.

### Nên sửa

Không có đề nghị sửa bắt buộc. Bàn giao nên ghi rõ `depositKept` bỏ trống được chuẩn hóa thành 0; `Settlement.moveOutDate` dùng ngày hủy tại Hà Nội; `refundPaidAt` vẫn null.

### Ghi chú

- `contract-cancel.service.ts:24–45`: kiểm scope trước replay và đọc lại assignment sau khóa. Shared mapping bảo vệ khỏi thay đổi phân công hoặc khóa manager giữa kiểm tra và ghi.
- Dòng 36–46: kiểm HOLD nằm trong callback idempotency, nên cùng key/payload phát lại được sau CANCELLED. Hash gồm contractId, lý do đã trim và depositKept chuẩn hóa.
- Dòng 38–53: thứ tự mapping → idempotency → room → contract → invoice tương thích create, sign/reset, move-in và payment; không thấy vòng khóa.
- Invoice được khóa trước khi đọc trạng thái. Payment thắng thì cancel thấy PAID và lập settlement; cancel thắng thì payment sau thấy CANCELLED và bị từ chối.
- Dòng 54–73: chỉ lấy cọc trực tiếp của hợp đồng hiện tại; dùng `payment.amount`, kiểm PAID thiếu payment hoặc lệch tổng, chặn giữ lại tiền vượt số đã nhận. Không tạo khoản hoàn từ invoice chưa trả hoặc dữ liệu không nhất quán.
- Dòng 78–91: settlement có các khoản khác bằng 0, `net = deposit − depositKept`, không FINAL invoice, không ghi đã hoàn tiền. Invoice/payment PAID được giữ nguyên; UNPAID được hủy cùng lý do.
- Dòng 93–104: contract CANCELLED, settlement hoặc invoice cancellation và audit nằm trong cùng transaction. Conflict cập nhật hoặc lỗi audit làm rollback toàn bộ; helper không lưu response thành công khi lỗi.
- Không cập nhật user/session/viewings: pending account vốn inactive được giữ nguyên; tài khoản guest tái dùng, tài khoản từng kích hoạt hoặc đang khóa không bị ảnh hưởng. Không ghi đè activation từ HOLD khác dùng chung user.
- Room status tiếp tục được suy ra từ hợp đồng; không sửa room flags hoặc mở lại lịch đã hủy.
- DTO kiểm reason bắt buộc, trim, giới hạn độ dài, NUL; depositKept là integer trong giới hạn Int. Global whitelist từ chối trường lạ/null không hợp lệ.
- HTTP spec dùng guards/DTO/service thật với Prisma fake có projection, snapshot rollback và idempotency storage; có các ca tiền, trạng thái, scope, bảo toàn account/history, replay và lỗi sau ghi.

### Giới hạn

Review bằng source không chứng minh concurrency nhiều connection. Các ca dùng fake tuần tự hóa transaction hoặc PostgreSQL nhúng một session cần được mô tả đúng giới hạn. BE-P3-22 dev E2E và thao tác ghi đã trả tiền hoàn vẫn ngoài mốc này.

Đã đọc source/tests và rà thêm helper idempotency, payment trigger/service, create/sign/move-in cùng writer phân công. Chỉ rà read-only; không chạy test/DB, đọc env/secrets hoặc sửa file.
