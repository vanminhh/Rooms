# BE-P3-23 · Quản lý người ở

20/11/2026. P3-4 đã nghiệm thu, owner báo commit; Git xác minh `af383a0`, workspace sạch trước lượt này. Đã đọc Before you start của P3-5: root/backend instructions, LESSONS, overview D-07/17/37, CON-13..16/CON-04/API, DB-B5/6/9, AUD-01/02 và code liên quan.

**Trạng thái: đã triển khai/kiểm chứng, chờ owner nghiệm thu và commit ở [checkpoint BE-P3-23](CHECKPOINT-BE-P3-23.md).** Full backend 2405/2405, reviewer DUYỆT. Dùng hai mặc định đã trình dưới A-25/26 để owner kiểm; không ghi rằng owner đã trực tiếp trả lời từng Q-P3-16/17. Phí +1 người Q-P3-18 đã chốt riêng. Không cần schema/dependency/env change; không dùng kết quả BE-P3-22 thay kiểm chứng mới.

## Owner sửa luồng ngày 20/11/2026

- Quản lý hoặc tenant được tự thêm người ở cùng vào hợp đồng của tenant đó; thao tác thêm không cần request duyệt Phase 5. Bổ sung POST `/me/contracts/:id/occupants` trong BE-P3-23, không tự mở rộng thành quyền đổi người ký/tài khoản hoặc sửa mọi hợp đồng.
- Hợp đồng giữ thông tin CCCD người ký theo luồng đang có; CCCD/ảnh của người ở cùng tùy chọn. Không tự biến idNumber? của người ký tại bước lập hợp đồng thành bắt buộc, không xóa dữ liệu cũ hoặc cho tenant đọc CCCD/ảnh đã lưu của người khác.
- Thêm người không nhân tiền phòng/điện theo đầu người. Các dịch vụ đã chọn có unit PERSON cộng người mới trong tháng vào ở khi chốt tháng. Parking cần xe thật được đăng ký, không tự tạo một xe theo mỗi người thêm. Chế độ nước của tòa giữ nguyên.
- Phần tính hóa đơn tháng vẫn là Phase 4. Q-P3-18 đã chốt: mỗi người thêm tính +1 đơn vị phí theo người trong tháng moveInDate, bất kể ngày vào, không prorate thêm theo ngày riêng. Hợp đồng trọn tháng 11/phí 30.000 đ thì vào 16 hoặc 29/11 đều thêm 30.000 đ; giữ D-41 tháng lẻ hợp đồng, không tự áp sang xe hay tính lại hóa đơn đã phát hành. BE-P3-23 lưu người/ngày ở; không yêu cầu request duyệt mới thêm được người.
- Owner chưa trực tiếp trả lời Q-P3-16/17 hoặc bỏ maxOccupants. Sau yêu cầu tiếp tục, dùng các phương án đã trình làm A-25/26, cần nêu rõ trong checkpoint: HOLD/ACTIVE được ghi, ENDED/CANCELLED chỉ đọc; capacity theo khoảng ở gồm HOLD và bảo vệ tương lai qua guard đổi room limit/move-in. Đây là mặc định triển khai chờ nghiệm thu, không phải câu trả lời owner từng mã.

## Hai quyết định cần chốt

| Mã | Khoảng trống | Đề xuất A | Lựa chọn B |
|---|---|---|---|
| Q-P3-16 | CON-13 chưa chỉ rõ trạng thái hợp đồng cho thêm/sửa/ghi ngày ra | Chỉ HOLD/ACTIVE; ENDED/CANCELLED chỉ xem | Staff được sửa cả lịch sử ENDED/CANCELLED |
| Q-P3-17 | DB-B6 định nghĩa đếm hôm nay cho đổi giới hạn phòng, chưa xác định thêm/sửa lịch ở tương lai/quá khứ | Kiểm giới hạn theo các ngày lưu trú giao nhau, bao gồm danh sách dự kiến trong HOLD, tránh ngày tương lai có quá nhiều người | Chỉ kiểm số người đang ở hôm nay trên hợp đồng ACTIVE |

A/B trên là lịch sử đề xuất trước khi owner yêu cầu tiếp tục. Bản triển khai dùng A/A dưới A-25/26 và phải nêu rõ chờ owner kiểm. Giữ guard DB-B6 đếm hôm nay khi giảm maxOccupants, bổ sung kiểm các kế hoạch từ hôm nay trở đi (HOLD/ACTIVE), bỏ peak quá khứ để không chặn giảm giới hạn vì lịch sử cũ. Move-in dùng cùng room lock và helper; CRUD kiểm trên khoảng ngày của bản ghi được thêm/sửa.

Người ra ngày 20/11 vẫn tính đến hết ngày 20/11 là quy định đã có, không hỏi lại. Schema hiện chỉ bắt moveOutDate null hoặc >= moveInDate; không tự thêm điều kiện ngày ở nằm trong startDate..endDate hay cấm nhập bù khi chưa có yêu cầu. Không đổi ngày hợp đồng hoặc tính lại hóa đơn trong task người ở.

## Thiết kế đã rà, triển khai sau khi chốt

- Service riêng trong contracts, controller staff với `GET/POST /contracts/:id/occupants`, `PATCH /contracts/:id/occupants/:oid`; thêm POST `/me/contracts/:id/occupants` cho tenant sở hữu. Thin routes, explicit DTO và no-store cho dữ liệu cá nhân.
- Staff qua BOSS/MANAGER scope; tenant self-add qua tenantId = actor.id, không tin contractId hoặc userId trong body. Occupant id phải thuộc đúng contract. Check actor scope hiện tại sau khóa, không tin buildingIds cũ khi tòa đổi quản lý; lock theo mapping → room → contract tương thích các writer hiện có.
- Mutation và kiểm capacity trong cùng transaction; serialize hai request thêm/sửa và thay đổi room limit. Không hard-delete, ngày ra lưu ở moveOutDate.
- Người ký đã được tạo tại create contract. Giữ isSigner bất biến và không có API chuyển người đứng tên hoặc đổi tenantId. Sửa snapshot occupant không đồng bộ sang users, password, role hoặc session, không tự kết thúc hợp đồng.
- Dùng encryptCccd/last4 hiện có; CCCD 12 chữ số khi được cung cấp. Không giải mã để sửa, không trả số đầy đủ/ciphertext hoặc ghi vào audit/log.
- Ảnh tùy chọn nhận metadata từ upload ID_PHOTO; tái dùng verifyContractAsset để xác minh contract folder/purpose/authenticated/type/format/version/asset ID. Không nhận public URL hoặc asset ID trần như bằng chứng. IO provider trước transaction, kiểm lại scope/state trong transaction; không tự xóa file Cloudinary cũ.
  Nếu có upload ảnh từ form tenant sau thay đổi luồng, phải triển khai đúng own-contract authorization chỉ cho ID_PHOTO; không mở chung CONTRACT_SCAN, staff routes hoặc quyền xem ảnh đã lưu. Self-add không yêu cầu ảnh, nên không được bắt tenant dùng staff upload path mới thêm được người.
- Safe select cho staff trả thông tin cơ bản và last4, không asset IDs/URLs/ciphertext. Giữ tenant detail chỉ last4 của signer. Signed view/audit occupant.view_id ở BE-P3-24, không làm sớm.
- Hai policy Q-P3-16/17 được triển khai dưới assumption A-25/26, chưa được xác nhận riêng; phải xuất hiện trong kết quả checkpoint cùng bằng chứng kiểm tra, không bị bỏ khỏi phần rủi ro/giới hạn.

## Kiểm chứng dự kiến

Test CON-13/DB-B6: rời hôm nay vẫn tính; hôm sau chỗ trống; thêm/sửa làm vượt giới hạn bị chặn theo lựa chọn owner; mutation đồng thời không vượt room limit. Giữ đúng một signer, reject đổi signer, không sửa nhầm occupant của contract khác. Tenant tự thêm người trên hợp đồng sở hữu được phép và không cần CCCD/ảnh của roommate; tenant khác, guest hoặc staff ngoài scope bị chặn. Không thêm quyền tenant sửa staff routes, tài khoản hoặc signer. Kiểm scope đổi khi provider đang chạy, ảnh sai contract/purpose/type bị chặn. CCCD được mã hóa và last4 đúng; response/audit/log không lộ số gốc, ciphertext hoặc asset IDs; account/session không bị ảnh hưởng.

Sau source implementation: test tập trung/hồi quy, lint/build/typecheck phù hợp; reviewer read-only trước checkpoint vì dữ liệu cá nhân, full report trong checkpoint. Schema đủ cho task, chưa thấy cần migration/dependency. E2E người ở + xe toàn P3-5 ở BE-P3-27, không đổi hoặc xóa dữ liệu dev để chuẩn bị lúc này.

## Tài liệu làm căn cứ

- `docs/spec/14-contracts.md`: CON-04, CON-13/15/16, API.
- `docs/spec/02-database.md`: DB-B6, DB-B8/9.
- `Source/backend/prisma/schema.prisma`: Occupant, các cột private asset đã có.
- `Source/backend/prisma/constraints.sql`: occupants_one_signer và occupants_dates.
- `Source/backend/src/modules/rooms/rooms.service.ts`: guard maxOccupants hiện tại với room lock và todayHanoi.
- `Source/backend/src/modules/files/files.service.ts`: verifyContractAsset cho ID_PHOTO.
- `Source/backend/src/common/crypto/cccd.ts`: AES-GCM và last4.

Preimplementation review độc lập xác nhận hai khoảng trống trên; phần bảo mật, ngày rời vẫn tính hết ngày, không hard-delete và role signer/account tách biệt đều có căn cứ, không cần hỏi lại. Chưa có code review/kiểm chứng feature BE-P3-23 trong lượt lập kế hoạch này.
