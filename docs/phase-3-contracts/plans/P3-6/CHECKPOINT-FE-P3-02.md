# FE-P3-02 · API hợp đồng và upload riêng tư

20/11/2026. Owner yêu cầu **“triểm khai FE-P3-02”**. Phạm vi API client và upload đã triển khai, **107/107 test liên quan đạt**, lint/build đạt, reviewer DUYỆT. HEAD vẫn `b904ece`, các thay đổi BE27/FE01 đã biết còn cùng workspace; không stage/commit/push.

## Thay đổi

| File từ `Source/frontend` | Nội dung |
|---|---|
| `src/features/contracts/types.ts` | Typed read/input/result models đúng serializers và DTO backend: contract/deposit/occupant/vehicle/service, signed document, sign/reset/password response, move-in/cancel/payment |
| `src/features/contracts/api.ts` | List/detail/create/sign/print/scan/reset/move-in/cancel; occupants/photos; vehicles/lookup; selected services; ghi thu cọc. Payload chỉ gồm trường được phép, giữ metadata-only cho assets, Idempotency-Key cho cancel/payment |
| `src/features/rooms/upload.ts` | Overload upload theo purpose, kiểm MIME, giữ form ký authenticated/public_id/overwrite=false cho private, giữ room transformation/5MB. Parser/lỗi provider được xử lý an toàn |
| `src/features/viewings/api.ts` | `markViewingCalled(id)` gọi POST `/viewings/:id/called` |
| `tests/p3/fe02-api-upload.test.mjs` |40 test mới chạy client/transport thật, chỉ fake fetch; không upload hoặc đọc DB thật |

Các route dùng đúng backend hiện có, không thêm API giả hoặc phép tính nghiệp vụ ở FE. Các gap preview ngày kết thúc/refund và tenant ID_PHOTO signature của màn hình sau giữ trong PLAN; không gọi endpoint chưa có trong FE02. `/me` client chi tiết thuộc FE-P3-10.

List hợp đồng gửi các filter được DTO chấp nhận và giữ pagination metadata. Lookup xe gửi plate/isActive/page/limit, không thêm buildingId. Backend chịu trách nhiệm normalize/escape biển số và scope. Body projections loại bỏ role/tenantId/rent/isSigner/ciphertext, URL delivery/chữ ký upload, amount/refund do caller tự chèn; giữ `false`, `0`, explicit `null` và `serviceIds:[]`.

Read models không có full CCCD/ciphertext/private asset IDs. Sign/reset trả mật khẩu tạm cho màn hình xử lý ở FE-P3-06; client này không lưu browser storage/query cache. Scan và ảnh CCCD là hàm gọi theo hành động rõ ràng; chưa gắn preload vào UI.

## Cách dùng upload

```typescript
// Existing ROOM_IMAGE flow remains compatible.
assertRoomImageFile(file)
const roomSignature = await signUpload(roomId)
const roomAsset = await uploadToCloudinary(roomSignature, file)

// Staff private upload: PDF is accepted only for CONTRACT_SCAN.
assertUploadFile(file, 'CONTRACT_SCAN')
const scanSignature = await signUpload(contractId, 'CONTRACT_SCAN')
const scanAsset = await uploadToCloudinary(scanSignature, file)

assertUploadFile(photo, 'ID_PHOTO')
const photoSignature = await signUpload(contractId, 'ID_PHOTO')
const photoAsset = await uploadToCloudinary(photoSignature, photo)
```

Imports ở `features/rooms/upload.ts`; client attach/sign chỉ gửi assetId/publicId/version/format. Hai purpose private dùng contractId, yêu cầu type authenticated/publicId có giá trị/overwrite=false trước khi upload. FormData gửi đúng giá trị ký, không kèm room transformation. Upload trực tiếp không Bearer/cookie hoặc Content-Type tự đặt; trình duyệt tạo multipart boundary.

Chỉ ảnh phòng có giới hạn5.000.000 byte trong policy hiện có. Private MIME theo backend (scan JPG/PNG/WebP/PDF, CCCD JPG/PNG/WebP); không tự đặt giới hạn MB mới. Đây là bám policy hiện có, không phải một assumption nghiệp vụ mới. Cloudinary vẫn là provider thực khi UI gọi; các test ở đây chỉ dùng tài liệu synthetic/fetch fake.

## Kết quả thực tế

Từ `D:\Rooms\Source\frontend`:

```powershell
node --test tests/p3/fe02-api-upload.test.mjs tests/p2/cp8-images.test.mjs tests/auth-api.test.mjs
npm run lint
npm run build
```

| Kiểm tra | Kết quả |
|---|---|
| Lượt đầu trước bổ sung parser JSON null/array |107/107,4575.2471ms,exit0;lint0/build0(Vite6.04s) |
| Lượt cuối sau bổ sung parser |**107/107**,**4443.6495ms**,exit0;0failed/skipped/todo |
| Trong107 |40 mới,67 hồi quy auth/shared transport và ảnh phòng |
| Lint cuối |exit0,không lỗi lint |
| Build cuối |exit0,TypeScript đạt;745modules,Vite5.92s |
| Build warning |Chunk>500kB và plugin timing được Vite báo; không phải build error |
| Review |DUYỆT source, full report bên dưới |
| Full frontend mới |Chưa có; không chạy lại action full đã bị auto-review chặn ở checkpoint trước |
| Cloudinary thật/dev E2E |Chưa chạy trong FE02 |

Output targeted cuối:

```text
tests 107
pass 107
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 4443.6495
```

40 test mới gồm route/method/DTO/header, nested metadata/replacement whitelist, pagination/query encoding, guest-account error fields, refresh giữ idempotency key, signed private fields, MIME/PDF, malformed signatures và sanitized network/provider/JSON errors. Hồi quy room image kiểm sign→upload→attach và gallery; token/session regression vẫn đạt. Hai lượt107 không cộng thành214. Full owner877/879 của FE01 trước sửa hai expected menu không phải kết quả FE02.

Kiểm lại bằng ba lệnh trên. Các API/màn hình sử dụng được nối ở FE-P3-03 trở đi; chưa có thao tác UI mới cần owner nhập CCCD hoặc upload tài liệu thật trong task này.

## Báo cáo reviewer đầy đủ

**DUYỆT mã FE-P3-02 hiện tại; không có phát hiện source chặn.**

Reviewer: GPT kế thừa, chỉ đọc. Không sửa file, chạy test, gọi mạng, upload hoặc commit.

1. **API client khớp backend hiện có.** Các đường dẫn, HTTP method và payload cho tạo/đọc/ký/in/scan/reset/move-in/cancel, người ở, xe, dịch vụ, thanh toán cọc và “Đã gọi” phù hợp controllers/DTO đã đối chiếu. List hợp đồng và lookup xe giữ phân trang; lookup không gửi `buildingId` mà DTO không nhận.

2. **Payload chỉ gồm trường được phép.** Client chọn rõ từng trường, kể cả signer, metadata ảnh CCCD và `oldMeterFinal` trong replacement. Không gửi `tenantId`, `rent`, `isSigner`, ciphertext, URL ảnh, chữ ký upload, số tiền thanh toán hoặc refund do client tự đặt. Các giá trị `false`, `0`, `null` và danh sách dịch vụ rỗng được giữ đúng ý nghĩa.

3. **Idempotency và lỗi API được giữ.** Cancel/payment nhận và chuyển `Idempotency-Key` qua transport chung. Structured error fields cho xác nhận tài khoản khách không bị làm mất. Không có phép tính tiền, ngày kết thúc, refund hoặc quyền truy cập được đưa vào frontend client.

4. **Read types phù hợp privacy.** Các kiểu summary/detail/occupant/vehicle/payment khớp projections và serializers đã đọc. Read model không khai báo full CCCD, ciphertext hoặc private asset ID; flags ảnh là optional vì detail và occupant endpoint có projections khác nhau. Mật khẩu tạm chỉ nằm trong response ký/reset, chưa có lưu storage hoặc cache trong lớp client này.

5. **Upload riêng tư khớp FILE-01/D-37.** `signUpload(roomId)` và purpose ROOM_IMAGE tiếp tục dùng `roomId`. Hai purpose riêng tư dùng `contractId`, yêu cầu `type='authenticated'`, `publicId` không rỗng và `overwrite=false`. FormData giữ đúng các tham số được ký; private không mang transformation của ảnh phòng. Upload trực tiếp dùng `credentials:'omit'`, không Bearer và để trình duyệt tạo multipart boundary.

6. **Định dạng và parser — đạt sau sửa.** Chỉ CONTRACT_SCAN cho phép PDF; ảnh phòng/CCCD giữ JPG/PNG/WebP. Giới hạn 5 MB vẫn riêng ROOM_IMAGE, không tự áp chính sách dung lượng private mới. Parser hiện xử lý JSON null, array và JSON lỗi trước khi đọc metadata; network/provider failures trả thông báo chung, không chuyển nguyên lỗi hoặc delivery URL ra kết quả.

7. **Kiểm thử phù hợp phạm vi.** Test dùng client và shared transport thật, chỉ thay fetch. Bao phủ route/payload/header, nested whitelist, pagination/query, refresh giữ idempotency key, signed parameters, malformed private signature, định dạng tệp và lỗi provider. Không thấy mock unit đang kiểm hoặc thêm skip/only. `git diff --check` trong phạm vi đã rà đạt.

**Giới hạn:** phiên chính đã báo **107/107**, lint/build exit0 ở bản trước sửa parser. Cần ghi riêng kết quả chạy lại trên parser cuối; reviewer không tự xác nhận lượt đó. Chưa có upload Cloudinary thật hoặc E2E dev trong review này. Full frontend/backend vẫn giữ giới hạn auto-review đã ghi; kết quả scoped không thay thế full suite.

**Xử lý phiên chính:** final107/107,lint0/build0 sau sửa parser lấy từ output thật ở bảng trên. Không có source finding còn mở. Chưa có assumption nghiệp vụ mới; giữ các defaults đã ghi trong spec và không triển khai tháng tính phí hoặc quyền tenant mới ở client này.

## Commit đề xuất

```text
feat(contracts): add API client and private uploads (FE-P3-02, FILE-01/02, CON-06/13/14)
```

Không tự stage/commit/push. Bước triển khai kế tiếp của P3-6 là FE-P3-03: danh sách hợp đồng và nút Chốt từ lịch xem.
