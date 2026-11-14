# CP-4 review — BE-EX-10 / BE-EX-11 — 14/11/2026

Read-only reviewer subagent, inherited session model (the repository's pinned Sonnet model was not available in this session).

## Final report

**DUYỆT về mã nguồn; chưa đủ điều kiện xác nhận CP-4 hoàn tất do kiểm thử môi trường còn bị chặn.**

Đã đọc lại các sửa đổi:

- Subject email xác minh VI đã khôi phục đúng dấu `–`.
- `selectMail` fallback về VI nếu subject hoặc body EN rỗng; có test cho cả hai.
- Test mới chạy `AuthService` thật trong `AppModule`, kiểm thư đăng ký, gửi lại mã, khôi phục cho tenant EN và boss VI.
- Test estimate đi qua controller → service → public view → `buildEstimate`, kiểm `en-US`, tiền, nhãn nước và tên dịch vụ nguyên văn; có cả nhánh HTTP và gọi controller trực tiếp.
- Không phát hiện thêm lỗi logic cần chặn trong diff đã review.

**Điểm còn treo là xác minh, không phải lỗi mã đã chứng minh:** parent báo HTTP loopback bị `EACCES` trong sandbox, nên các test HTTP và e2e chưa có bằng chứng chạy xanh. Build đã đạt; cần ghi kết quả lint/full suite thực tế khi kết thúc. Không được báo “toàn bộ test đạt” hoặc đánh dấu CP-4 hoàn tất bằng kết quả chỉ của nhóm không dùng HTTP.

Review chỉ đọc, không chỉnh file hay chạy lại test.

## Earlier findings resolved

1. Preserve the Vietnamese verification subject's en dash exactly.
2. Add the CP-4 fallback for an empty English mail subject/body.
3. Cover the actual register/resend/recovery mail delivery and controller-to-estimate language propagation, beyond helper-only assertions.

## Verification addendum - 14/11/2026

The owner supplied terminal screenshots from runs outside the managed sandbox:

- Unit/HTTP: 81/81 files, 1655/1655 tests passed, 64.40 s (start 19:21:08).
- E2e: 7/7 files, 53/53 tests passed, 216.14 s (start 19:32:01). The owner explicitly approved the suite resetting seeded dev accounts before running it.
- Earlier agent checks: backend lint exit 0 (7 existing warnings, 0 errors), build exit 0, git diff --check clean.

This evidence resolves the verification blocker above. The reviewer report remains the historical source review; the reviewer did not rerun these tests. CP-4 is verified and awaiting the owner commit.
