# BE-P3-23 · Người ở và tenant tự thêm người ở cùng

**Cập nhật sau checkpoint:** owner báo đã commit và yêu cầu tiếp tục; Git xác minh `ab5ebac` cùng workspace sạch trước BE-P3-24. Báo cáo dưới đây lưu kết quả tại điểm dừng BE-P3-23; không coi commit là câu trả lời riêng cho Q-P3-16/17.

20/11/2026, bắt đầu từ `af383a0` (BE-P3-22 đã commit, Git sạch trước các cập nhật tài liệu của lượt này). **BE-P3-23 đã triển khai và kiểm chứng; reviewer DUYỆT mã. Full suite cuối 2405/2405 đạt; chờ owner nghiệm thu A-25/26 và commit.** Chưa làm BE-P3-24..27. Không stage/commit, schema/migration/dependency/env hoặc DB dev changes.

## Kết quả chức năng

| Route | Quyền và hành vi |
|---|---|
| GET `/contracts/:id/occupants` | Staff trong scope, đọc cả lịch sử |
| POST `/contracts/:id/occupants` | Staff trong scope, thêm người không phải signer |
| PATCH `/contracts/:id/occupants/:oid` | Staff trong scope; occupant phải thuộc contract; sửa thông tin hoặc ghi moveOutDate, không hard-delete |
| POST `/me/contracts/:id/occupants` | TENANT sở hữu contract tự thêm người ở cùng, không cần request duyệt; contract không sở hữu và không tồn tại đều 404 |

Thêm/sửa dùng trạng thái HOLD/ACTIVE, lịch sử ENDED/CANCELLED chỉ đọc theo A-25. Client không được gán isSigner, tenantId, contractId hoặc cột nội bộ; hợp đồng phải đang có đúng một signer. Sửa snapshot người ký không đổi tài khoản users, password, role, session hoặc người đứng tên của hợp đồng. Không tự sửa rent, invoice, readings hoặc vehicle khi thêm người.

CCCD/ảnh của roommate tùy chọn. Khi có CCCD: đúng 12 chữ số, AES-GCM và last4; không trả plaintext/ciphertext. Ảnh nhận metadata idFront/idBack, xác minh ID_PHOTO đúng contract, purpose, authenticated, format/version/asset id; không nhận raw URL/cột asset id. Provider IO trước transaction, scope và trạng thái kiểm lại sau khóa. Stored asset IDs chỉ dùng để trả hasIdFront/hasIdBack, không đi ra response. Tenant self-add không trả last4 của roommate; tenant detail cũ tiếp tục chỉ thấy last4 của signer. API signed view ảnh staff là BE-P3-24; role upload staff hiện có không bị mở rộng bởi self-add. Không yêu cầu ảnh để tenant thêm người.

Dates là YYYY-MM-DD thực, không nhận ngày giả hoặc timestamp, DOB không được ở tương lai; ngày ra >= ngày vào. Có thể để trống hoặc xóa phone/DOB/CCCD/ảnh/ngày ra bằng null; không xóa tên hoặc ngày vào. Khoảng ngày không bị tự buộc vào startDate/endDate của hợp đồng.

## Capacity và transaction

Mutation khóa mapping shared → room FOR UPDATE → contract FOR UPDATE, đọc lại scope/trạng thái rồi ghi người ở, kiểm giới hạn và audit trong một transaction. Cùng room lock với giảm maxOccupants và move-in. Tenant khác không dùng được ID occupant/contract để vượt ownership; manager đổi scope lúc provider chạy hoặc transaction bắt đầu bị từ chối.

Helper tính peak giao nhau bằng các mốc ngày, không duyệt từng ngày, ngày ra được tính hết ngày. Tránh cộng nhầm tổng số người từng đi qua cả khoảng thời gian: hai lượt ở tách ngày vẫn hợp lệ. Bao gồm HOLD dự kiến; create/update kiểm trong khoảng ngày của bản ghi được thêm/sửa. Giảm giới hạn phòng giữ guard đếm ACTIVE hôm nay vốn có, thêm guard kế hoạch HOLD/ACTIVE từ hôm nay; move-in cũng kiểm cùng helper trước ghi readings. Peak quá khứ không ngăn giảm giới hạn hoặc move-in hiện tại.

Audit mới occupant.create/update/move_out cùng transaction. Payload chỉ gồm contractId, tên các field thật sự được gửi và ngày; không ghi CCCD/ciphertext/asset metadata, tên/SĐT cá nhân. Explicit null được giữ trong danh sách field; property undefined do class DTO khai báo bị bỏ. Lỗi Prisma/audit không nhận diện trong mutation được chuyển INTERNAL_ERROR kiểm soát để logger toàn cục không in tham số nhạy cảm. Các route có no-store; tenant errors có VI/EN, staff luôn VI.

## Quyết định owner và [ASSUMPTION]

Đã chốt rõ: manager hoặc tenant tự thêm roommate; CCCD của roommate tùy chọn; không nhân tiền phòng/điện theo đầu người; phí theo người +1 ngay tháng moveInDate, bất kể ngày vào, không prorate thêm theo ngày riêng (Q-P3-18). D-41 của tháng lẻ hợp đồng vẫn giữ; không suy thành một xe mỗi người hoặc công thức phí xe mới. Bộ tính hóa đơn tháng vẫn Phase 4, chưa chạy trong BE-P3-23.

Hai mặc định đã trình được dùng sau yêu cầu “tiếp tục”, cần owner nghiệm thu riêng hoặc cùng checkpoint:

- **A-25/Q-P3-16:** chỉ thêm/sửa/ghi ngày ra trên HOLD/ACTIVE; ENDED/CANCELLED chỉ xem.
- **A-26/Q-P3-17:** giới hạn theo peak inclusive các ngày ở, gồm HOLD; đồng bộ guard giảm giới hạn phòng và move-in cho hiện tại/tương lai.

Không ghi owner đã trả lời từng policy chỉ từ câu trả lời tính phí hoặc yêu cầu tiếp tục. Các giới hạn này được ghi trong overview/CON-13/DB-B6/task/plan; nếu owner muốn cách khác cần sửa trước commit. Những thay đổi spec về self-add/CCCD/phí là quyết định đã chốt, tách khỏi hai giả định trên.

## Kiểm chứng thực tế

| Nhóm | Kết quả |
|---|---|
| HTTP người ở cuối | 79/79, 1 file, 7,37 giây, start 13:59:11; Nest routes/guards/DTO/service/Audit thật, fake Prisma edge và provider boundary |
| Helper capacity | 24/24, 1 file, 1,39 giây, start 13:50:25; inclusive departure, peak thực, future/open range, cutoff quá khứ, 9999-12-31 |
| Room/move-in hồi quy | 117/117, 5 file, 4,43 giây, start 13:54:10; thêm 5 ca, giữ nguyên tiền cọc/người ở/lịch sử khi bị chặn |
| Locale + HTTP sau sửa catalog | 98/98, 2 file, 3,98 giây, start 14:01:51 |
| SQL service smoke | 7/7, exit 0; PGlite qua đủ 10 migration, Prisma/service thật. Lượt đầu 2,50 giây; đã chạy lại sau build cuối, vẫn RESULT 7/7 scenarios passed (lượt cuối không in elapsed) |
| Full backend cuối | Test Files 110 passed (110), Tests 2405 passed (2405); 120,51 giây, start 14:02:25, exit 0. JSON report full-final.json lưu trong ignored cache |
| Build | npm run build / nest build exit 0 sau các sửa source |
| Lint | Found 4 warnings and 0 errors, 257 file, 1,0 giây, exit 0; 4 warning sort cũ dashboard/pricing |
| Scoped noEmit | HTTP spec mới và imports, exit 0; helper và test cũng scoped exit 0 |
| Review | DUYỆT mã; report nguyên văn bên dưới và addendum cuối |
| Diff | git diff --check đạt |

SQL smoke kiểm giới hạn cùng ngày/next day/future HOLD, tenant optional ID và encrypted CCCD, safe list/tenant response, quyền staff/owner, bảo toàn account/signer/session, historical readonly. Ném lỗi **sau INSERT audit thật** cho cả create/update chứng minh rollback và controlled INTERNAL_ERROR; không claim concurrency nhiều connection.

Không cộng các nhóm 79/24/117/98/7 thành full suite. Lượt full đầu khởi động 13:58:51 khi agent còn chốt locale tests, đọc phiên bản 76 ca: 2400 pass/2 fail (110 file, 153,35s). Một failure là expectation tên thiếu ở fixture cũ đã được sửa, một failure do catalog test cũ yêu cầu exact equality với dictionary chỉ quét các module cũ. Đã mở rộng scan để gồm DTO/service/helper người ở, vẫn buộc mọi thông báo được quét có bản dịch, cho phép thêm entry provider được kiểm qua HTTP; không bỏ kiểm tra dịch thiếu. Sau đó 98/98 focused đạt và full suite được chạy lại trên source ổn định. Không báo lượt đầu như pass của revision cuối.

Các script phụ nằm ignored node_modules/.cache/rooms-p3-23, không dependency mới: occupants-postgres-smoke.mjs + database.mjs, scoped tsconfig và full-final.json. Assertion SQL ban đầu serialize BigInt audit ID lỗi; sửa script để chỉ đọc payload, không sửa sản phẩm cho khớp. Một lượt HTTP cold bootstrap vượt hook 10s, đổi hook 60s; fake capacity matcher từng chưa hiểu quan hệ contract, đã sửa fixture. Những lỗi harness này không phải hành vi sản phẩm.

## Tệp và giới hạn

Source chính: contract-occupants.service/controller, dto/occupants.dto, module; common/rooms/occupant-capacity; tích hợp rooms.service và contract-move-in.service; i18n/messages và kiểm catalog. Tests mới người ở/capacity, cập nhật room capacity/move-in. Tài liệu đồng bộ CON-13/15, D-17, DB-B6, billing/requests, task BE/FE, progress và commit BE-P3-22.

Không thay schema nên không cần migration/generate/DB checker mới. Không gửi email, upload thật, truy cập CCCD thực hoặc ghi DB dev. HTTP fake tuần tự hóa transaction và PGlite một session chưa chứng minh PostgreSQL cạnh tranh nhiều connection. E2E người ở/xe dev ở BE-P3-27, sau checkpoint 23..25; không dùng output E2E BE-P3-22 thay cho endpoint mới. Frontend tenant tự khai vẫn ở FE-P3-12; task này cung cấp API, chưa có form UI hoặc máy tính hóa đơn tháng.

## Kiểm trên hợp đồng thử và commit

1. Staff GET occupants: last4/flags, không số đầy đủ/ciphertext/asset IDs/URLs. POST tên và moveInDate, không cần CCCD. PATCH moveOutDate để ghi ngày ra; không mất bản ghi.
2. Tenant đã đổi mật khẩu POST /me/contracts/{id}/occupants trên hợp đồng mình: thêm ngay, không request duyệt. Thử contract khác → 404; staff route → 403. Thêm không đổi tenant/account/signature/rent hoặc tạo xe/invoice.
3. Phòng giới hạn 2, có A và B rời ngày 25: người C vào ngày 25 bị chặn, vào 26 được. Kiểm cả danh sách dự kiến; giảm max thấp hơn peak tương lai hoặc move-in với danh sách quá giới hạn bị chặn.
4. Kiểm A-25/26 đúng ý owner trước commit. Không cần apply migration hoặc tự dọn dữ liệu E2E cũ.

Gợi ý commit: `feat(contracts): manage occupants and tenant self-add (BE-P3-23, CON-13/15/16, DB-B6)`.

## Báo cáo reviewer đầy đủ

> **KẾT LUẬN: DUYỆT mã nguồn BE-P3-23. Không còn finding chặn.** Đây là đánh giá kỹ thuật; owner vẫn cần nghiệm thu hai giả định A-25/A-26 và kết quả kiểm chứng tại checkpoint.
>
> Phạm vi review: controller/service/DTO người ở mới; `occupant-capacity.ts`; đăng ký module; phần tích hợp giảm `maxOccupants` và move-in; các test HTTP, capacity và hồi quy liên quan; tài liệu quyết định người ở và tính phí.
>
> Đã kiểm tra:
>
> - Staff chỉ dùng route quản lý trong scope. Tenant chỉ có POST thêm người vào hợp đồng sở hữu; hợp đồng người khác và không tồn tại cùng trả 404. Tenant không được dùng route staff, đổi tenantId hoặc isSigner.
> - Scope/trạng thái được kiểm trước provider IO và kiểm lại sau khóa. Thứ tự mapping → room → contract phù hợp writer hiện tại. Room lock dùng chung với đổi giới hạn phòng và move-in.
> - Mutation yêu cầu hợp đồng có đúng một signer; người mới luôn `isSigner=false`; API không có hard-delete. Không ghi users, mật khẩu, session, tiền thuê, invoice hoặc vehicle.
> - CCCD/ảnh của roommate tùy chọn. CCCD được mã hóa; response không trả ciphertext, asset IDs hay URL ảnh. Response tenant không trả last4 của roommate; ảnh được xác minh đúng hợp đồng, mục đích ID_PHOTO và kiểu authenticated.
> - Capacity tính peak giao nhau thực tế, gồm HOLD dự kiến; ngày ra vẫn tính hết ngày. Việc kiểm một khoảng không cộng nhầm mọi người từng xuất hiện trong khoảng ấy. Guard giảm giới hạn/move-in bỏ qua peak quá khứ nhưng bảo vệ lịch từ hôm nay trở đi.
> - Audit và dữ liệu người ở dùng cùng transaction; lỗi ghi audit hoặc capacity làm rollback. Lỗi ghi Prisma không được đưa nguyên tham số nhạy cảm vào logger toàn cục.
> - Route dữ liệu cá nhân có `Cache-Control: no-store`. DTO giới hạn field, ID, độ dài, ngày và kiểu dữ liệu; nullable chỉ áp dụng các field được phép xóa.
>
> Hai finding đã được sửa:
>
> 1. `Object.keys(dto)` từng ghi nhận cả field tùy chọn không được gửi vì class DTO tạo chúng với `undefined`. Service hiện lọc giá trị `undefined`, giữ explicit null; test đã có assertion chỉ ghi field được gửi.
> 2. Validation mới từng trộn thông báo mặc định tiếng Anh cho staff và thiếu bản dịch field cho tenant. DTO hiện có thông báo tiếng Việt rõ ràng; FIELDS_EN bổ sung các thông báo ngày, capacity, CCCD và xác minh provider. Test đã có trường hợp tiếng Anh và lỗi provider.
>
> Review chỉ đọc, không chạy mạng hoặc đọc secrets. Đã trực tiếp kiểm cấu trúc DTO đã compile để xác nhận finding audit; không nhận kết quả test của agent khác như lượt chạy độc lập của reviewer. Các nhóm kiểm chứng được báo trong phiên gồm helper 24/24, hồi quy capacity/move-in 117/117 và SQL smoke 7/7; root cần ghi số cuối của các lượt HTTP/full suite sau sửa.
>
> Giới hạn cần giữ trong checkpoint:
>
> - **A-25/Q-P3-16:** chỉ sửa HOLD/ACTIVE, lịch sử ENDED/CANCELLED chỉ đọc.
> - **A-26/Q-P3-17:** capacity theo khoảng lưu trú, gồm HOLD dự kiến, phối hợp guard phòng/move-in.
>
> Owner yêu cầu tiếp tục sau khi nghe đề xuất nhưng chưa trực tiếp trả lời từng chính sách này; tài liệu hiện ghi đúng là giả định triển khai, không được đổi thành “owner đã chốt”.
>
> BE-P3-23 cung cấp API và lưu ngày ở. Phí +1 người trong tháng vào ở đã được ghi nhận; bộ lập hóa đơn, phí xe và frontend tự khai chưa được triển khai bởi thay đổi này. HTTP dùng Prisma edge tuần tự và SQL smoke PGlite một session không chứng minh cạnh tranh nhiều connection hay E2E DB dev của BE-P3-27.

Addendum cho thay đổi coverage locale cuối:

> **Bổ sung review: DUYỆT** thay đổi cuối của `i18n.spec.ts` và `messages.ts`, không có finding chặn. Test đã mở rộng phạm vi quét sang DTO/service người ở và helper capacity, vẫn bắt mọi thông báo được quét phải có bản dịch, đồng thời kiểm toàn bộ catalog có tiếng Anh khác rỗng và khác tiếng Việt. Cho phép catalog chứa thêm khóa hợp lệ là phù hợp với các lỗi provider dùng chung; các ca HTTP tiếng Anh bổ sung kiểm đường trả lỗi thực tế. Mapping “Mã người ở không hợp lệ” đúng nội dung. Kết quả do phiên chính cung cấp: focused 98/98, full backend 110 file/2405 test đạt trong 120,51 giây; reviewer không chạy lại test hoặc sửa file.
