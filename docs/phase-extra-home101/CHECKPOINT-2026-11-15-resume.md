# Rooms process resumption checkpoint — 15/11/2026

## Outcome

Resumed the existing uncommitted EX-6/EX-7/EX-8 work after the conversation disconnected. EX-7 automated frontend checks pass. The Resend adapter and four mail templates have passing isolated tests; incomplete custom templates now fall back to the defaults. The overall checkpoint is **not fully verified**: this session cannot complete HTTP loopback, real PostgreSQL or browser integration checks, and real email acceptance still needs owner configuration/recipients.

The owner explicitly chose real Resend delivery whenever all MAIL_* values are configured, including development. Missing configuration still means console in development/test and MAIL_UNAVAILABLE in production. Q-14 and AUTH-13 now record that decision. TENANT option B remains unchanged: email required, verification not required; GUEST verification remains required.

No commit/push, seed, database mutation, migration, dependency install, file deletion or env-file edit was performed in this resumption. The database operation was a read-only SELECT 1 preflight, which failed before returning a result. No real email was sent.

## Files changed in this resumption

| Files | Purpose |
|---|---|
| `Source/backend/src/modules/auth/auth.reset.spec.ts` | Preserve the safe name-only failure-log assertion without pinning the provider's normalized exception to the old Error class. |
| `Source/backend/src/modules/auth/auth.signup.spec.ts` | After two simulated send failures, explicitly recover the mailer before checking immediate sign-up recovery and unconsumed code quota. |
| `Source/backend/src/modules/mailer/email-templates.ts` | Require the AUTH-07/13 and VIEW-15/19 placeholders; incomplete custom templates use defaults. |
| `Source/backend/src/modules/mailer/email-templates.spec.ts` | Four complete-template cases and 14 individual required-placeholder omissions. |
| `Source/frontend/src/features/public/api.ts` | Remove an extra trailing blank line found by diff-check; no behavior change. |
| `docs/spec/README.md`, `docs/spec/00-overview.md`, `docs/spec/10-auth.md`, `docs/phase-extra-home101/README.md` | Record the owner's Q-14 choice and replace stale Phase Extra/booking summaries with the effective decisions. |
| `docs/phase-extra-home101/feature_ex-6-backend-viewings.md`, `feature_ex-7-frontend-viewings.md`, `feature_ex-8-viewing-notifications.md`, `PROGRESS.md` | Replace stale open decisions/status with current evidence and remaining gates. |
| `docs/phase-extra-home101/email-setup.md` | Owner setup, verified domain, sending key, four-message acceptance, limits and retry semantics. |
| `docs/LESSONS.md`, this report | Preserve retry lessons, review and exact checkpoint evidence. |

Other working-tree changes belong to the inherited continuous task group; they were retained. The last committed HEAD remains d3c77c9. This list is the resumption delta, not the entire uncommitted EX-4/6/7/8 implementation.

## Verification evidence

Commands ran on the real checked-out source. Tests used existing external-network-blocking preloaders; backend allowed loopback, but the managed environment itself returned EACCES. Vitest's temporary module cache used the ignored backend node_modules/.cache directory after the OS temporary location failed with EPERM. Logs/reports were kept in session scratch.

| Check | Actual output / result |
|---|---|
| Frontend `npm run test:components` | `tests 853; pass 853; fail 0; cancelled 0; skipped 0; duration_ms 114251.2906`; exit 0. |
| Frontend lint / build | Both exit 0. Build retains the existing chunk-size warning above 500 kB. |
| Template regression before the production fix | `14 failed; 17 passed; 31 total`; failures are the missing-placeholder assertions, not environment errors. |
| Mailer group after the fix | `Test Files 3 passed (3); Tests 47 passed (47)`; 31 template, 12 Resend boundary/retry and 4 module/provider-selection tests; exit 0. |
| Backend full suite before template additions | `31 failed / 58 passed files; 759 failed / 1029 passed tests; 1788 total; 84.79s`. JSON inspection: all 759 failures are connect EACCES 127.0.0.1, no other assertion failure. |
| Backend full suite after template fix | `31 failed / 58 passed files; 759 failed / 1047 passed tests; 1806 total; 55.16s`. The suite is **not green**; HTTP assertions cannot be verified in this environment. |
| Backend lint / build | Both exit 0. Lint: 0 errors, 4 pre-existing array-sort warnings in dashboard/pricing tests. Two temporary warnings from the new template parsing were corrected with string type narrowing, then mailer/lint/build were rerun. |
| Final whitespace check | `git -c core.safecrlf=false diff --check`; no output, exit 0. |
| PostgreSQL preflight | `database: unreachable; name: PrismaClientInitializationError`. Eleven non-seeding viewing e2e cases were not launched after this failed read-only preflight. |
| Resend configuration presence | `mailProviderIsResend:false; mailApiKeySet:false; mailFromSet:false`. Values/secrets were not printed. |
| Browser | Vite reported ready on 127.0.0.1:5173; in-app and connected browser navigation still returned ERR_CONNECTION_TIMED_OUT (initial attempt before Vite was ready returned ERR_CONNECTION_REFUSED). Desktop/360 px and multi-account acceptance remain unverified. |

The two auth fixture corrections are supported by the recorded pre-disconnection failure traces and code inspection. Their HTTP assertions are still pending a run outside this session's network restriction; they are not claimed as passing. The 1758/1758 result in older progress entries predates EX-8 and does not establish that this working tree passes.

The final type narrowing and frontend trailing-whitespace cleanup do not change behavior. After narrowing, the 47 mailer tests and backend lint/build were rerun; the full-suite figures above are the immediately preceding run of the same template rules.

## Independent reviewer — full report

Reviewer used the inherited model because the repository's named Sonnet 5 is unavailable in the current tool. It was read-only, did not spawn another agent, and returned the report below. The owner retains the final decision.

**KẾT LUẬN BAN ĐẦU: CHẶN — sửa lỗi mẫu thư trước checkpoint.**

Phạm vi: thay đổi chưa commit so với d3c77c9, giới hạn ở EX-8 mailer, template, retry và các caller/test auth, viewings. Không sửa file, chạy migration, cài dependency hay gửi email.

**Lỗi chặn — mức quan trọng**

1. Mẫu tùy chỉnh có thể làm mất dữ liệu bắt buộc. email-templates.ts:31 lúc review chỉ kiểm tra subject/text không rỗng và các placeholder đang có đều được biết; danh sách placeholder rỗng vẫn hợp lệ.

   Ví dụ emailCode.en = { subject: 'Welcome', text: 'Hello' } được gửi nguyên dạng. Đăng ký trả thành công, mã vẫn tồn tại và tính vào hạn mức, nhưng khách không nhận được mã để xác minh — sai AUTH-13. passwordReset thiếu {url} gây lỗi tương tự với AUTH-07. Mẫu xác nhận lịch thiếu thời gian/liên hệ vẫn cho phép đổi sang CONFIRMED, sai VIEW-15; mẫu thông báo mới có thể bỏ dữ liệu VIEW-19 yêu cầu.

   Sửa: kiểm tra các placeholder bắt buộc theo từng loại thư; thiếu thì dùng mặc định. Bổ sung test bỏ từng placeholder bắt buộc và kiểm tra nội dung mặc định được phục hồi.

**Những phần đã kiểm tra**

- Resend dùng HTTPS cố định, Bearer header, nội dung plain text và kiểm tra acknowledgement có id. Lỗi provider được chuẩn hóa thành MAIL_UNAVAILABLE; không log API key, địa chỉ nhận, OTP, token hay response body.
- Retry tối đa hai lần, mỗi lần giới hạn 5 giây và truyền tín hiệu hủy. Hai lần giữ nguyên payload/key, phù hợp cơ chế chống gửi trùng 24 giờ của Resend. Nguồn API và idempotency được liên kết trong email-setup.md.
- OTP dùng cùng mã đã lưu khi retry; hai lần thất bại đi vào cleanup hiện có. Reset password dùng cùng token khi retry và vẫn trả phản hồi không tiết lộ tài khoản.
- Thông báo lịch mới nằm sau transaction, lỗi thư không hủy lịch. Xác nhận EMAIL kiểm tra scope/trạng thái trước gửi và chỉ cập nhật CONFIRMED sau thành công.
- Mẫu mặc định có VI/EN đúng đối tượng, thư staff bằng tiếng Việt; giờ Hà Nội, ngày có padding, liên hệ công khai thay vì số đăng nhập.
- Hai sửa fixture auth phù hợp thay đổi retry: mock thất bại phải thất bại cả hai lần; lần đăng ký kế tiếp phải phục hồi mock rõ ràng.
- Q-14 đã được owner giải quyết ngày 15/11/2026: development gửi Resend thật khi đủ cấu hình, thiếu thì console. Không còn finding về lựa chọn provider; cần cập nhật spec tương ứng.

**Kiểm chứng và giới hạn**

- Lượt review chỉ đọc diff, code, test, spec và tài liệu Resend; không chạy test riêng. Không dùng kết quả cũ làm bằng chứng suite hiện tại đã xanh.
- Chưa có bằng chứng bốn thư tới hộp thư thật hoặc không vào spam; BE-EX-30 vẫn cần xác minh.
- Provider đã nhận thư rồi DB commit thất bại có thể khiến khách nhận xác nhận trong khi lịch còn NEW. Code đã log trường hợp này; không thể coi hủy HTTP là thu hồi email. Không đề xuất thêm outbox/schema ngoài phạm vi.
- Không review lại frontend, schema hay nghiệp vụ capacity EX-6/EX-7; đã có lượt review riêng.

Không phát hiện lỗi nghiêm trọng về lộ bí mật hoặc vượt quyền trong phần đã đọc. Cần sửa finding 1 và kiểm chứng lại trước khi chuyển khuyến nghị thành DUYỆT.

**Phụ lục cùng lượt review — KẾT LUẬN: DUYỆT**

Lỗi chặn số 1 đã được xử lý. email-templates.ts khai báo đủ placeholder bắt buộc theo AUTH-07/13 và VIEW-15/19; kiểm tra chuyển về mẫu mặc định nếu thiếu dữ liệu bắt buộc hoặc có placeholder không được hỗ trợ.

email-templates.spec.ts có 14 trường hợp bỏ từng placeholder và bốn trường hợp mẫu tùy chỉnh đầy đủ. Các assertion kiểm tra nội dung thực tế và phân biệt mẫu tùy chỉnh với fallback, không mock hàm đang kiểm thử.

Không phát hiện lỗi chặn còn lại trong bản sửa này. Q-14 đã được owner chốt cho phép Resend trong development khi đủ cấu hình.

Reviewer chỉ đọc lại hai file, không chạy test trùng. Theo kết quả phiên chính: trước sửa 14 failed / 17 passed; sau sửa nhóm mailer 47/47 passed. Khuyến nghị DUYỆT áp dụng cho code đã review; BE-EX-30 vẫn cần bằng chứng nhận bốn thư thật và kiểm tra spam.

## Owner verification and next checkpoint

Run the current backend checks from an ordinary terminal at D:\Rooms\Source\backend:

```powershell
npm run test
node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.config.e2e.ts test/viewings.e2e-spec.ts
```

The second command is only the 11 non-seeding viewing e2e cases. It creates uniquely named test users/buildings/rooms/viewings and soft-cleans those fixtures afterward. Do not run the full e2e suite: older auth e2e invokes seed and resets seeded accounts.

Manual acceptance follows FE-EX-27: at desktop and 360 px, book as guest/tenant, enforce three distinct phones per building/hour, allow extra rooms for an already-counted phone, refuse cross-building conflicts, confirm by PHONE/EMAIL, cancel before start, check last-room capacity release and overdue NEW→DONE. Verify VI/EN and legacy labels. These are outstanding checks, not reported successes.

For real email, complete email-setup.md with the owner's verified domain, sender and named recipients. No more migration is required for this checkpoint. Keep EX-6/7 open until real integration checks pass, and keep BE-EX-30 open until the owner confirms the four deliveries.

Retained assumptions: A-03, A-11, A-12, A-13, A-14 and A-15. No new business assumption was introduced; the development Resend behavior is an explicit owner decision.

Suggested commit after owner verification: `fix(mailer): validate required template values and verify Resend setup (BE-EX-28..30, AUTH-07/13, VIEW-15/19, NOTI-07/08)`.
