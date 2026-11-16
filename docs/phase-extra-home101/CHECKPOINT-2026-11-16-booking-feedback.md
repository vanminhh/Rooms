# ⏸ Booking feedback — phương án B, 16/11/2026

Chủ dự án chọn B cho Q-EX7-03: cùng khách được đặt hai tòa cùng giờ sau cảnh báo và xác nhận tiếp tục. Đã triển khai backend/frontend/spec và popup thành công. Chờ chủ dự án kiểm tay desktop/360 px rồi commit; agent không commit.

## Phạm vi và trạng thái

- WEB, MANUAL và đổi giờ đều kiểm trùng khách; khác quận thêm lời nhắc di chuyển. Cảnh báo chưa lưu lịch, chưa gửi email, chưa dùng quota. Chỉ lần bấm tiếp tục gửi lại với boolean `acceptOverlap: true`.
- Vẫn chặn quá ba số điện thoại/tòa/giờ, người phụ trách ở hai tòa cùng giờ, trùng account/phòng, thời gian/phòng/quyền không hợp lệ và quá quota WEB. Retry kiểm lại trong transaction với các khóa hiện có.
- Public hiển thị popup sau API thành công, có phòng/giờ/liên hệ, Xem lịch hẹn và Đóng. Lịch vẫn NEW; đóng popup còn kết quả inline. Có VI/EN và fallback liên hệ Rooms khi không có quản lý.
- Đã sửa vòng Tab có link liên hệ, lớp popup trên header desktop, và trả focus về form khi đóng warning.
- BE-EX-19/20/21/24 mở lại `[~]` vì luật mới cần bằng chứng HTTP/concurrency trên host; FE-EX-27 vẫn `[~]` chờ manual. Bằng chứng host 1806/1806 và e2e 54/54 đã đóng phiên bản trước, không xác nhận bản sửa này.
- Auth chưa sửa: Q-EX7-02 còn thiếu thông tin dấu cách ở SĐT, mật khẩu hay cả hai. BE-EX-30 không đổi: bốn luồng email đã được owner xác nhận; còn mục Inbox/Spam, không gửi lại thư.
- Không thay schema, áp migration, chạy seed, sửa `.env`, cài dependency, xóa file hay thay hai Vitest config. `MAIL_PROVIDER: ''` giữ nguyên. Không thực hiện e2e hoặc thao tác DB trong lượt này.

## File thay đổi

| Nhóm | File chính và mục đích |
|---|---|
| Backend | `src/modules/viewings/{viewing-capacity.ts,viewing-reservations.ts,viewing-validation.ts,viewings.service.ts,dto/viewings.dto.ts}` — tách warning/hard limits và truyền acknowledgement; `common/errors/error-code.ts`, `common/i18n/messages.ts` — code 409 và VI/EN |
| Backend tests | `viewings.overlap-warning.spec.ts` mới; cập nhật capacity/overlap/service/cp4 tests và `test/fixtures/viewing-prisma.ts`. `src/app.setup.spec.ts`, `test/viewings.e2e-spec.ts` đổi kỳ vọng source, chưa xác nhận bằng host run mới |
| Frontend | `features/public/ViewingForm.tsx`, `features/viewings/{api.ts,ViewingForm.tsx,ViewingCard.tsx}`, `shared/i18n/{vi,en}.ts` — warning, retry, success; `components/ConfirmDialog.tsx`, `features/public/booking-panel.css` — keyboard/focus/lớp phủ |
| Frontend tests | `tests/ex/{ex7-api.test.mjs,ex7-dialog.test.mjs}`, `tests/p2/{fe-p2-17-viewing-form.test.mjs,fe12-viewing-form.test.mjs,fe12-viewings-page.test.mjs,cp3-kit.test.mjs,public-dom.mjs}` |
| Spec / QA | `docs/spec/{00-overview.md,01-architecture.md,13-viewings.md,30-frontend.md}`; task EX-6/7, checklist manual, PROGRESS, LESSONS và `plans/FE-EX-27-feedback/PLAN.md` |
| Tài liệu có sẵn của cùng lượt QA | Task EX-8 và `email-setup.md` giữ ghi nhận owner đã nhận bốn luồng email; không sửa mailer trong phần triển khai này |

Các đường dẫn backend/frontend trong bảng tính từ `Source/backend` / `Source/frontend`. Danh sách đầy đủ có trong `git status` và diff chưa commit.

## Kiểm tra thực tế

| Kiểm tra | Kết quả |
|---|---|
| Backend offline, 10 file cụ thể bên dưới | **169/169**, 10/10 file, exit 0, 6.13 s |
| Backend lint | **0 errors, 4 warnings có sẵn**, exit 0 |
| Backend build | `nest build`, exit 0 |
| Danh mục thông báo LOC-02, chỉ parse source bằng TypeScript AST | **PASS, 56 messages**, exit 0; không import AppModule/test HTTP |
| Frontend nhóm booking + kit sau sửa review | **71/71**, 0 fail/skip, 3141.7964 ms |
| Frontend toàn bộ | **862/862**, 0 fail/skip, exit 0, 107898.1721 ms |
| Frontend kiểm lại sau chỉnh ref theo lint | **71/71**, 0 fail/skip, exit 0, 3389.4527 ms |
| Frontend lint / build cuối | Lint sạch, exit 0; build exit 0, **737 modules**, 4.30 s; cảnh báo chunk >500 kB có sẵn |
| Git diff / cấu hình | `git diff --check` exit 0; diff auth, Prisma/schema và hai Vitest config rỗng |
| Browser desktop/360 | **CHƯA KIỂM**; owner thao tác theo checklist |
| HTTP/e2e mới trên host | **CHƯA XÁC NHẬN**; không lấy kết quả cũ thay cho mã vừa đổi |

Lệnh backend offline, chạy tại `Source/backend`:

```powershell
node node_modules/vitest/vitest.mjs run `
  src/modules/viewings/viewing-capacity.spec.ts `
  src/modules/viewings/viewing-overlap.spec.ts `
  src/modules/viewings/viewing-time.spec.ts `
  src/modules/viewings/viewing-slot.spec.ts `
  src/modules/viewings/viewing-projection.spec.ts `
  src/modules/viewings/viewings.overlap-warning.spec.ts `
  src/modules/viewings/viewings.service.spec.ts `
  src/modules/viewings/viewings.service.cp4.spec.ts `
  src/modules/viewings/viewings.validation.spec.ts `
  src/common/errors/all-exceptions.filter.spec.ts --reporter=dot
```

Sau full FE, lint báo đọc ref trong effect cleanup; đổi sang chụp đích focus khi mở dialog, giữ cùng hành vi và kiểm lại nhóm 71 ca đạt. Không suppress lint hoặc đổi test để bỏ assertion.

Kết quả đỏ trước sửa: backend 12 fail/24 pass trong nhóm 36 ca; frontend 7 fail/52 pass trong nhóm 59 ca; regression trả focus mới 1 fail/1 pass trước sửa, sau sửa qua trong nhóm 71. Các log mail thất bại trong service tests là fixture kiểm retry, không phải gửi Resend thật.

**Sai sót đã báo owner:** một lượt chọn nhầm `common/i18n/i18n.spec.ts`, file có cả test offline và hai ca HTTP. Kết quả 185 pass/3 fail trên 188: hai ca HTTP bị `connect EACCES` ở loopback; ca thứ ba là thiếu hai câu warning trong danh mục quét field. Không chạy lại file hỗn hợp này. Đã chuyển câu warning vào `VIEWING_FIELDS`, kiểm danh mục riêng bằng AST đạt 56 messages; nhóm offline cuối 169/169. Lượt nhầm dùng fake Prisma/mailer, không e2e, không DB hay thư thật. Ghi bài học để kiểm imports/hooks của từng file trước khi chọn suite offline.

## Kiểm tay tiếp theo

1. Backend hiện đang dùng build cũ: owner Ctrl+C rồi chạy lại khối PowerShell ở nhóm 0 của [checklist](FE-EX-27-MANUAL-CHECKLIST.md) để dùng build mới, mail ghi log. Frontend đang chạy Vite chỉ cần tải lại.
2. D7/M1 kiểm success ở desktop/360, nội dung VI/EN, Đóng giữ kết quả, Xem lịch hẹn đúng ID, Tab bao gồm link liên hệ, header không nằm trên backdrop.
3. X2a/b/c kiểm cùng khách tại hai tòa khác người phụ trách: cảnh báo → quay lại không lưu → đồng ý mới lưu. Khác quận nhắc di chuyển; không suy ra khoảng cách thật. X1 giữ chặn cùng người phụ trách.
4. X3/X4 kiểm MANUAL/đổi giờ, Escape và focus. Các ca thiếu tòa/dữ liệu ghi CHƯA KIỂM, không tự xem là đạt. WEB tối đa ba lượt/ngày, hủy không trả quota; sau G1/G2/G3, kiểm EMAIL muộn cần lịch thử sẵn có hoặc chờ ngày sau.

## Giả định và commit

[ASSUMPTION] kế thừa: A-03 đếm mọi lượt tạo WEB trong ngày Hà Nội kể cả đã hủy; A-13 NEW quá giờ vẫn NEW; A-14 đổi phân công giữ lịch và chỉ đánh dấu hard conflicts theo luật hiện tại. Không thêm giả định về khoảng cách, thời gian di chuyển hay tự xác nhận lịch. Q-EX7-03 đã được owner quyết định; Q-EX7-02 auth vẫn mở.

Commit gợi ý sau khi owner kiểm:

```text
feat(viewings): acknowledge overlaps and show booking success (BE-EX-19/24, FE-EX-24/27, VIEW-14/16a/21/22)
```

## Báo cáo reviewer đầy đủ — lượt đầu

KẾT LUẬN: **CHẶN**

Phạm vi: thay đổi chưa commit · 40 file · +652/-99 dòng tại thời điểm rà soát; không tính tài liệu planner, không đọc `PLAN.md`. Đây là khuyến nghị cho chủ dự án.

### Lỗi chặn

1. **Popup public nằm dưới header ở desktop.**  
   `Source/frontend/src/features/public/ViewingForm.tsx:100` và `:138` render `ConfirmDialog` ngay trong cây booking form. Caller đặt form trong aside tại `Source/frontend/src/pages/public/RoomDetailView.tsx:130`; aside có `position: sticky` từ `Source/frontend/src/features/public/booking-panel.css:79`, tạo stacking context. Dialog render inline tại `Source/frontend/src/components/ConfirmDialog.tsx:54`, nên `z-index: 900` của backdrop không thoát stacking context này, trong khi header có `z-index: 30` tại `Source/frontend/src/components/Navigation.css:3`. Kết quả: ở desktop, header vẫn nổi trên lớp che và có thể nhận thao tác ngoài dialog.  
   **Hướng sửa:** đưa dialog vào lớp overlay ngoài aside qua portal, giữ theme của kit; kiểm popup cảnh báo và thành công khi header còn trong viewport.

2. **Đóng cảnh báo không khôi phục focus về form trên trình duyệt thật.**  
   `Source/frontend/src/components/ConfirmDialog.tsx:27` chỉ ghi nhận `document.activeElement` khi effect mở dialog chạy. Trước thời điểm đó, ba luồng đã vô hiệu hóa nút gửi và đặt form `inert`: public tại `Source/frontend/src/features/public/ViewingForm.tsx:51`, `:107`, `:133`; nhập tay tại `Source/frontend/src/features/viewings/ViewingForm.tsx:65`; đổi giờ tại `Source/frontend/src/features/viewings/ViewingCard.tsx:59`. Việc disable/inert làm mất focus của nút gửi; dialog không còn lưu được opener. Các `onClose` của warning chỉ xóa state, không có đích focus thay thế. Người dùng bàn phím chọn “Chọn giờ khác” hoặc Escape sẽ mất vị trí trong form. Success popup đã có fallback focus, warning chưa có.  
   **Hướng sửa:** chỉ định ref đích trả focus cho từng warning sau khi form hết inert, hoặc lưu opener trước khi disable; kiểm cả Escape và nút hủy bằng bàn phím. Fake DOM hiện không mô phỏng việc browser tự blur khi disabled/inert nên không phát hiện trường hợp này.

### Nên sửa

Không có phát hiện bổ sung đủ mức ảnh hưởng để đưa vào báo cáo.

### Ghi chú

- Chưa thấy lỗi chặn ở backend: hard limits được kiểm trước warning; warning không ghi lịch hoặc gửi mail; retry vẫn kiểm scope, thời gian, phòng, duplicate và quota. `acceptOverlap` không được lưu và không bỏ qua giới hạn người phụ trách/sức chứa.
- Khóa account/phone/responsible/building được giữ; các thao tác phân công vẫn dùng mapping lock. Cảnh báo chỉ trả thông điệp cố định, không lộ chi tiết lịch khác.
- DTO nhận boolean nghiêm ngặt; cấu hình validation trong test tương ứng cấu hình app.
- Availability và cờ xung đột đã đổi phù hợp VIEW-16a/21/22. Frontend lưu snapshot và chỉ gửi `acceptOverlap: true` khi bấm tiếp tục; có chặn gửi lặp.
- Test mới có assertion thực chất cho no-write/no-mail, privacy, quota, hard limits, payload và dialog. Reviewer **không chạy test hoặc browser**, không thực hiện HTTP/e2e hay tác động DB.
- Kết quả host **1806/1806 và 54/54** là bằng chứng cho phiên bản trước thay đổi này. Không dùng chúng để kết luận mã mới hoặc race mới đã đạt. HTTP/e2e đã sửa kỳ vọng nhưng chưa được xác nhận lại.
- Auth chưa thay đổi, phù hợp việc Q-EX7-02 còn mở.
- Tài liệu checkpoint đang được phiên chính cập nhật; chưa đánh giá các dòng trạng thái tạm thời là kết quả cuối.

### Đã kiểm

- Spec: `README.md`, `00-overview.md`, các thay đổi API/error trong `01-architecture.md`, `13-viewings.md` — đặc biệt VIEW-02/02a/03/09/14/16/16a/19/20/21/22; các phần liên quan trong `30-frontend.md`, `31-ui-kit.md`.
- Backend: DTO, capacity/reservations/validation/service/time, advisory locks, controllers, cấu hình validation, error filter/catalog/i18n, fixture và toàn bộ test thay đổi của viewings; kỳ vọng mới trong `app.setup.spec.ts` và e2e.
- Frontend: API, ba luồng đặt/nhập tay/đổi giờ, `ConfirmDialog`, `ViewingContacts`, VI/EN, caller `ViewingsPage`/`RoomDetailView`, public layout và CSS liên quan; các test thay đổi và fake DOM.
- Tài liệu QA: thay đổi task EX-6/7/8, PROGRESS, LESSONS, email setup và checklist kiểm tay; không đọc tài liệu kế hoạch.

## Phụ lục reviewer kiểm lại hai finding

Phụ lục kiểm lại: **DUYỆT** — hai lỗi chặn trước đã được xử lý trong source.

1. **Lớp popup:** `Source/frontend/src/features/public/booking-panel.css:102` nâng chính aside lên `z-index: 900` khi có dialog. Với cấu trúc hiện tại, aside và header không bị ngăn bởi stacking context tổ tiên khác; header `z-index: 30` nằm dưới lớp popup. Cách sửa giữ theme và tự bỏ hiệu lực khi đóng dialog.

2. **Trả focus:** `Source/frontend/src/components/ConfirmDialog.tsx:30` ưu tiên `returnFocusRef`. Cả ba warning đều truyền ref tới form/section có `tabIndex={-1}`:
   - Public: `Source/frontend/src/features/public/ViewingForm.tsx:108`, `:139`.
   - Nhập tay: `Source/frontend/src/features/viewings/ViewingForm.tsx:67`, `:83`.
   - Đổi giờ: `Source/frontend/src/features/viewings/ViewingCard.tsx:61`, `:67`.

   Khi đóng warning, React bỏ `inert` trước effect cleanup trả focus; không còn phụ thuộc nút gửi đã bị browser blur. Test bổ sung trong `Source/frontend/tests/ex/ex7-dialog.test.mjs:25` kiểm đúng trường hợp opener là body.

Không còn lỗi chặn trong phạm vi kiểm lại này. Kết luận dựa trên đọc source, caller, CSS và test; reviewer không chạy test, browser, HTTP/e2e hoặc DB. Vẫn cần kiểm tay desktop/360 px để xác nhận lớp che, Escape, Tab và focus thực tế.

## ⏸ Auth follow-up — Q-EX7-02 resolved, 16/11/2026

This section supersedes the earlier pending-auth notes for the current working tree. Owner clarified trailing whitespace in the login phone. The shared auth phone rule now trims outer whitespace before validating and submitting; login, registration and password recovery use it. Embedded spaces, malformed numbers and blank-only input stay invalid. Password characters and backend authentication are unchanged.

Changed: `Source/frontend/src/features/auth/schemas.ts` (one normalization call), `tests/auth-schemas.test.mjs`, `tests/auth-login-flow.test.mjs`, spec AUTH-01 and the QA task/progress/checklist. Two new tests failed before the fix. After the fix, full frontend **864/864**, 0 fail/skip, **157260.7201 ms**; lint clean; build exit 0, **737 modules**, 11.06 s (existing large-chunk warning). Git diff --check exit 0. Tests use fake fetch; no HTTP/e2e, real email, backend/DB/env/config edits or migration/seed/commit in this auth follow-up. No new business assumption.

Browser check pending: F5, enter the correct phone with trailing spaces and the correct password; repeat with leading/trailing spaces; embedded whitespace must still show a phone validation error. No backend restart is needed specifically for this frontend fix. Suggested commit: `fix(auth): trim phone whitespace before validation (FE-EX-27, AUTH-01/07/11, G-04)`.
