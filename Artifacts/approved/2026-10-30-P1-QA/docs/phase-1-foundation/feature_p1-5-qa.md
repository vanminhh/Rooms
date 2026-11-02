# Phase 1 · Part 5 – Manual checks and phase exit (P1-QA-01..04, FE-LOGIN-17)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: these checks run on the main files after the part they check is applied. Record every result (date, what was checked, pass/fail) in the "Issues log" below. All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | P1-QA-01: nothing. The others: the part named in each task, on the main files |
| Unblocks | The end of Phase 1 |
| How | By hand, no pipeline. Running the backend needs `Source/backend/.env` (P1-SETUP-01) |
| Part done when | P1-QA-04 is `[x]` |

## Tasks

- [x] **P1-QA-01** Write the manual checklist in the section below, from FE-LOGIN-17 and the AUTH cases of BE-LOGIN-24 (part 2): plain Vietnamese steps a non-developer can follow – which seeded account, what to type, what must show on screen.
  Done when: every case of FE-LOGIN-17 and every AUTH case of BE-LOGIN-24 has a step. Can start right away.
- [x] **P1-QA-02** After part 1 is applied: run the database rule check as in `docs/spec/02-database.md` ("Run the DB check"), from `Source/backend/prisma/`.
  Done when: it prints 50/50; result recorded below.
- [x] **P1-QA-03** After part 2 is applied: with the API running on the seeded dev database, log in with each seeded role through `POST /api/v1/auth/login` (any REST client), then try the inactive tenant (AUTH-02) and 6 wrong passwords in a row (AUTH-04).
  Done when: the answers match the cases listed in BE-LOGIN-24; results recorded below.
- [x] **FE-LOGIN-17** Manual end-to-end with the backend running and seed data, at 360 px and desktop width:
  - BOSS and MANAGER land on `/ql`, TENANT on `/thue` (AUTH-06)
  - the seeded tenant with the flag is forced to `/doi-mat-khau` and can continue after changing (AUTH-05)
  - inactive tenant sees "Tài khoản đã bị khóa. Liên hệ quản lý." (AUTH-02)
  - reload keeps the session when "Ghi nhớ đăng nhập" was ticked; logout returns to `/`
  - keyboard only: every field and button reachable, focus visible (UI-08)
  Record the result (date, what was checked) in the Issues log below.
  Needs first: part 4 applied.
- [x] **P1-QA-04** Phase 1 exit, the roadmap's "Done when" (`docs/spec/01-architecture.md#roadmap`): 3 roles log in and land in the right layout (FE-LOGIN-17); the DB check still prints 50/50 (P1-QA-02); unit tests for the scope guard exist and pass (`npm run test` in `Source/backend`, BE-LOGIN-22). Then "Status" in root `CLAUDE.md` and `docs/spec/README.md` moves to phase 2 (through a draft).
  Done when: all three hold and both "Status" lines are updated.

## Manual checklist

Dành cho người không viết code. Mỗi bước ghi rõ dùng tài khoản nào, gõ gì, màn hình phải hiện gì. Mã trong ngoặc (AUTH-01…) là mã yêu cầu trong `docs/spec/10-auth.md`.

**Chuẩn bị (một lần)**

1. Mở hai cửa sổ terminal. Cửa sổ 1: vào thư mục `Source/backend`, chạy `npm run start:dev`, đợi dòng "Nest application successfully started". Cửa sổ 2: vào `Source/frontend`, chạy `npm run dev`.
2. Mở trình duyệt, vào `http://localhost:5173/dang-nhap`. Làm thử ở hai cỡ: cửa sổ rộng (máy tính) và cửa sổ hẹp 360 px (bấm F12, chọn biểu tượng điện thoại, đặt rộng 360).
3. Tài khoản thử (mật khẩu ghi ở đầu `Source/backend/prisma/seed.ts`):

| Số điện thoại | Vai trò | Ghi chú |
|---|---|---|
| `0900000001` | Boss | thấy cả 3 tòa |
| `0900000002` | Quản lý 1 | tòa CG01, DD01 |
| `0900000003` | Quản lý 2 | chưa có tòa |
| `0900000004` | Người thuê | bị buộc đổi mật khẩu |
| `0900000005` | Người thuê | bị khóa |

4. Sau khi thử xong các bước đổi mật khẩu: chạy `npx prisma db seed` trong `Source/backend` để trả tài khoản về như ban đầu. Dừng rồi chạy lại backend để xóa bộ đếm "sai quá nhiều lần".

**Các bước**

1. **Mỗi vai trò vào đúng nơi (AUTH-01, AUTH-06).** Đăng nhập `0900000001` rồi `0900000002`: trang `/ql` "Việc hôm nay", câu "Xin chào, <tên>", dòng "Tòa đang quản lý" (Quản lý 1: CG01 và DD01; Boss: cả 3 tòa). Bấm "Đăng xuất": về trang `/`. Đăng nhập `0900000004`: xem bước 5.
2. **Sai mật khẩu và số lạ báo giống nhau (AUTH-01).** Gõ `0900000001` với mật khẩu sai, rồi gõ `0911111111` với mật khẩu bất kỳ: cả hai hiện "Số điện thoại hoặc mật khẩu không đúng".
3. **Tài khoản bị khóa (AUTH-02).** Đăng nhập `0900000005` với mật khẩu đúng: hiện "Tài khoản đã bị khóa. Liên hệ quản lý." và vẫn ở trang đăng nhập.
4. **Sai 6 lần liên tiếp (AUTH-04).** Với `0900000001`, gõ mật khẩu sai 6 lần: 5 lần đầu báo như bước 2, lần thứ 6 hiện "Bạn thao tác quá nhiều lần, vui lòng thử lại sau". Gõ mật khẩu đúng ngay sau đó vẫn bị chặn (khoảng 15 phút). Xong thì dừng và chạy lại backend.
5. **Bị buộc đổi mật khẩu (AUTH-05).** Đăng nhập `0900000004`: tự chuyển sang `/doi-mat-khau` ("Bạn cần đổi mật khẩu trước khi tiếp tục"), có nút "Đăng xuất". Gõ thẳng `/thue` vào thanh địa chỉ: bị đưa lại `/doi-mat-khau`. Gõ "Nhập lại mật khẩu mới" khác ô trên rồi bấm "Đổi mật khẩu": hiện "Mật khẩu nhập lại không khớp" dưới ô, chưa đổi gì. Gõ khớp (mật khẩu mới ít nhất 8 ký tự, khác mật khẩu cũ): vào `/thue` "Tổng quan", "Xin chào, <tên>".
6. **Ghi nhớ đăng nhập và tải lại trang (AUTH-T2).** Đăng nhập `0900000002` có tick "Ghi nhớ đăng nhập", bấm F5: vẫn ở `/ql`, không phải đăng nhập lại. Bấm "Đăng xuất" rồi gõ `/ql` vào thanh địa chỉ: bị đưa tới `/dang-nhap?next=/ql`.
7. **Đúng vai trò mới vào được (AUTH-06).** Người thuê gõ `/ql`: bị đưa về `/thue`. Nhân viên gõ `/thue`: bị đưa về `/ql`. Đã đăng nhập mà gõ `/dang-nhap`: được chuyển như sau khi đăng nhập.
8. **Liên hệ trên trang đăng nhập (AUTH-10).** Chưa đăng nhập, mở `/dang-nhap`: dòng "Điện thoại: 0900000001" (chọn và sao chép được), link "Zalo", "Facebook", link "Xem phòng trống" (hiện "Trang đang được xây dựng").
9. **Đổi mật khẩu ở nơi khác thì phiên cũ hết hiệu lực (AUTH-T3).** Mở hai cửa sổ trình duyệt (một cửa sổ ẩn danh), đăng nhập `0900000002` ở cả hai. Ở cửa sổ A vào "Tài khoản", đổi mật khẩu. Ở cửa sổ B bấm F5: bị đưa tới `/dang-nhap`. Cửa sổ A vẫn đăng nhập. Chạy lại seed (chuẩn bị, mục 4).
10. **Quên mật khẩu (AUTH-07).** Bấm "Quên mật khẩu?", gõ `0900000002`, bấm "Gửi": hiện "Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý." Gõ một số không có tài khoản: hiện đúng câu đó. (Tài khoản mẫu chưa có email nên không có thư; link chỉ in ra cửa sổ backend khi tài khoản có email.)
11. **Trang tài khoản (AUTH-09).** Nhân viên vào "Tài khoản": có "Đổi mật khẩu" và "Thông tin liên hệ" (Email, Số điện thoại liên hệ, Zalo, Facebook, kèm "Khách sẽ thấy:"). Người thuê vào "Tài khoản": chỉ có "Đổi mật khẩu" và "Email".
12. **Cỡ 360 px.** Ở mỗi trang trên: không cuộn ngang, chữ trong ô nhập không bị trình duyệt phóng to khi bấm vào, nút "Hiện" và ô "Ghi nhớ đăng nhập" bấm được bằng ngón tay.
13. **Chỉ dùng bàn phím (UI-08).** Ở `/dang-nhap` bấm Tab từ đầu: thứ tự Số điện thoại → Mật khẩu → "Hiện" → "Ghi nhớ đăng nhập" → "Đăng nhập" → "Quên mật khẩu?" → các link; mỗi chỗ dừng có viền vàng thấy rõ. Gõ số điện thoại, Tab, gõ mật khẩu, Enter: đăng nhập được.
14. **Kiểm bằng test tự động (cần người có kỹ thuật).** AUTH-T2 (làm mới phiên, phiên cũ hết dùng), AUTH-T3 và SCOPE-01 (đường dẫn không khai báo quyền bị chặn): chạy `npm run test:e2e` trong `Source/backend` (chạy trên database dev, tự chạy lại seed trước và sau); kỳ vọng 17/17 qua. Kiểm database: xem mục P1-QA-02 (sau `npm install` phải cài lại `npm i --no-save @electric-sql/pglite@0.2` rồi mới chạy được).

## Questions for the owner

- None yet.

## Issues log

<!-- date · task ID · what was checked · pass/fail · what is needed -->
- 29/10/2026 · P1-QA-02 · after part 1 applied, in `Source/backend`: `npm i --no-save @electric-sql/pglite@0.2`, `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/schema.sql`, `node prisma/check-constraints.mjs . prisma` → "50/50 tình huống đúng như mong đợi" · pass · none
- 30/10/2026 · P1-QA-03 · API running on the seeded dev database, `POST /api/v1/auth/login`: `0900000001` BOSS, `0900000002` and `0900000003` MANAGER, `0900000004` TENANT with `mustChangePassword=true` → 200; `0900000005` → 403 `ACCOUNT_LOCKED` "Tài khoản đã bị khóa. Liên hệ quản lý."; unknown phone → 401 `INVALID_CREDENTIALS` "Số điện thoại hoặc mật khẩu không đúng"; 6 wrong passwords in a row on `0900000001`: 1–5 → 401, 6th → 429 `TOO_MANY_REQUESTS` "Bạn thao tác quá nhiều lần, vui lòng thử lại sau", the right password right after → 429 · pass · none
- 30/10/2026 · FE-LOGIN-17 · browser against the running API and seed data. 360 px: manager 1 with "Ghi nhớ đăng nhập" ticked → `/ql` (CG01, DD01), F5 keeps the session, "Đăng xuất" → `/`, then `/ql` → `/dang-nhap?next=%2Fql`; tenant `0900000004` (also with `next=/ql` in the URL) → `/doi-mat-khau`, mismatching repeat → "Mật khẩu nhập lại không khớp" under the field with no API call, matching → `/thue`, tenant opening `/ql` → `/thue`; locked tenant → "Tài khoản đã bị khóa. Liên hệ quản lý.". No horizontal scroll (scrollWidth 360) on `/dang-nhap`, `/ql`, `/doi-mat-khau`, `/thue`; phone input 16 px, checkbox row 44 px. Desktop (1024 px): Boss typed with the keyboard only (type, Tab, type, Enter) → `/ql` with all 3 buildings, `/ql/tai-khoan` shows "Đổi mật khẩu" and "Thông tin liên hệ" pre-filled with the Boss contact, "Đăng xuất" → `/`; Tab order on `/dang-nhap` is Số điện thoại → Mật khẩu → Hiện → Ghi nhớ đăng nhập → Đăng nhập → Quên mật khẩu? → links, every stop with a visible outline. Boss/manager/locked tenant at desktop width were also checked on 29/10/2026 · pass · not run by the main session: `/quen-mat-khau`, the tenant account page, the "Hiện" toggle, keyboard-only at 360 px, tab order on pages other than `/dang-nhap`; `/quen-mat-khau` and both account pages were checked by the owner (P1-QA-01 steps 10, 11); the rest is covered by automated tests only
- 30/10/2026 · P1-QA-01 · manual checklist run by the owner on the dev stack (browser, steps guided one by one): steps 1 (Boss and manager 1 land on `/ql` with the right buildings and names), 2 (wrong password and unknown phone give the same message), 3 (locked tenant: "Tài khoản đã bị khóa. Liên hệ quản lý." with the right password, the generic message with a wrong one), 4 (6 wrong passwords: 6th and the right password are blocked, other phones still log in), 5 (forced change: `/thue` redirects to `/doi-mat-khau`, mismatch message, success → `/thue`), 6 ("Ghi nhớ đăng nhập", F5 keeps the session, logout then `/ql` → login), 7 (role redirects), 8 (Boss contact on `/dang-nhap`), 9 (change password on one window revokes the other window's session), 10 (`/quen-mat-khau` same message for known and unknown phone, format error), 11 (staff and tenant account pages) → pass. Step 4 note: the owner first reported logging in after 6 wrong passwords; checked on the owner's backend (the phone was blocked, 429) and on a fresh instance (6th and right password blocked), so the block works; most likely the right password was typed for another phone or the backend had been restarted · steps 12 (360 px by hand) and 13 (keyboard by hand) not run by the owner; the main session measured 360 px and the keyboard order on 30/10/2026 (see FE-LOGIN-17); step 14 = `npm run test:e2e` 17/17 (29/10/2026) · pass · none
- 30/10/2026 · P1-QA-04 · phase exit: the 3 roles log in and land in the right layout (FE-LOGIN-17, above); DB check 50/50 re-run after `npm i --no-save @electric-sql/pglite@0.2` (the earlier `npm install` had removed it); scope guard unit tests exist and pass: `src/common/scope/scope.spec.ts` 14/14, `npm run test` 592/592 · pass · "Status" lines in root `CLAUDE.md` and `docs/spec/README.md` move to phase 2 in this draft
- 30/10/2026 · QA note · browser testing: a login still in flight when the page is changed gets cancelled (the login looked like it failed); wait for the redirect before reloading. After the manual run the seed was re-run, tenant `0900000004` is back to `NguoiThue@2026` with the flag set
