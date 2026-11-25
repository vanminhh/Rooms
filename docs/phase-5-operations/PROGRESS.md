# Phase 5 · Vận hành — tiến trình

File này giúp người hoặc agent mới vào biết ngay phase đang ở đâu. Trạng thái từng task nằm trong file task của phần (`[ ]` / `[~]` / `[x]` / `[!]`). Ở đây chỉ ghi theo **điểm dừng ⏸**.

**Cách cập nhật.** Ở mỗi điểm dừng ⏸, trước khi báo cáo, agent sửa file này:
- đổi dòng của phần mình trong bảng;
- thêm một dòng vào nhật ký.

Cột "Commit" ghi hash do chủ dự án báo lại sau khi commit. Agent chỉ điền hash sau khi đã kiểm bằng `git log`.

Trạng thái:
- `chưa làm`
- `đang làm`
- `chờ commit`: đã dừng ở ⏸, chờ chủ dự án kiểm chứng
- `xong`
- `kẹt`: ghi lý do

## Bảng tổng

| Phần | Trạng thái | Điểm dừng gần nhất đã xong | Commit | Việc tiếp theo | Ghi chú |
|---|---|---|---|---|---|
| P5-0 Chủ dự án | xong | D-45, M9 | - | - | Chủ dự án chốt Phase 5 |
| P5-1 Thông báo chung (BE) | xong | M1 · BE-P5-01..04 | `9b67fa3` | Kiểm tay cùng đợt sau | 2852/2852 test, lint và build đạt |
| P5-2 Gia hạn (BE) | xong | QA-P5-04 đạt trên dev | `0935309` (CP-1) | - | Hai giao dịch chuyển gia hạn chỉ sao chép một lần |
| P5-3 Yêu cầu (BE) | xong | QA-P5-04 đạt trên dev | `c3ad1c1` | - | Hai giao dịch duyệt chỉ áp dụng một lần |
| P5-4 Đánh giá sửa chữa (BE) | accepted on dev by owner | – | – | – | migration M2 |
| P5-5 Báo cáo, nhật ký, cài đặt (BE) | BE-P5-22..27 accepted | – | – | – | migration M3 |
| P5-6 FE nhân sự: vận hành | owner accepted P5-6 | – | – | planner `plans/P5-6/PLAN.md` | khung route của cả phase |
| P5-7 FE nhân sự: quản trị | xong | M7 | `9400ca6` | - | Chủ dự án đã nghiệm thu |
| P5-8 FE người thuê | xong | M8 | `84b9691` | - | Chủ dự án đã nghiệm thu |
| P5-9 QA | xong | M9, chủ dự án chốt ngày 26/11/2026 | - | Theo dõi riêng 141 bản ghi thử cũ | [Checklist](p5-9-qa-checklist.md) |

## Lộ trình mốc

Mỗi **mốc** kết thúc ở một điểm dừng ⏸. Ở đó:
1. Agent báo cáo.
2. Chủ dự án kiểm chứng và commit.
3. Agent ghi hash vào cột "Commit".
4. Agent chuyển sang mốc kế.

Làm các mốc theo thứ tự từ trên xuống. Ký hiệu: ✅ xong (đã commit) · ▶ đang làm · ⬜ chưa làm · ⛔ kẹt.

| | Mốc | Task | Cần trước | Trước khi code phải hỏi chủ dự án | Kiểm ở ⏸ | Commit |
|---|---|---|---|---|---|---|
| ✅ | M0 Soạn Phase 5 | README, PLAN, PROGRESS, 9 file task, D-45 | Phase 4 xong | Q-P5-1..16 (đã trả lời 24/11/2026) | link, ma trận luật → phần | `94133ae` |
| ✅ | M1 Thông báo chung (P5-1) | BE-P5-01..04 | M0 | – | unit, lint, build, reviewer | `9b67fa3` |
| ▶ | M2 Gia hạn (P5-2) | BE-P5-05..09 | M1 | planner `plans/P5-2/PLAN.md`; **duyệt tạo và áp migration M1** | + check-constraints (số thật), e2e tạo → ký → chuyển ca, cleanup list, reviewer | |
| ⬜ | M3 Yêu cầu (P5-3) | BE-P5-10..18 | M1, M2 | planner `plans/P5-3/PLAN.md` | + e2e sự cố → RESOLVED → cron đóng; MOVE_OUT → duyệt, reviewer | |
| ⬜ | M4 Đánh giá sửa chữa (P5-4) | BE-P5-19..21 | M3 | **duyệt tạo và áp migration M2** | + check-constraints, reviewer | |
| ⬜ | M5 Báo cáo, nhật ký, cài đặt (P5-5) | BE-P5-22..27 | M3 | **duyệt tạo và áp migration M3** | + check-constraints, e2e báo cáo một tháng, reviewer | |
| ⬜ | M6 FE nhân sự: vận hành (P5-6) | FE-P5-01..05 | M1..M4 | planner `plans/P5-6/PLAN.md` | FE lint, build, test:components | |
| ⬜ | M7 FE nhân sự: quản trị (P5-7) | FE-P5-06..10 | M5, M6 | **duyệt cài gói biểu đồ** | FE lint, build, test:components, kiểm tay 360 px | |
| ⬜ | M8 FE người thuê (P5-8) | FE-P5-11..16 | M4, M5, M6 | – | FE lint, build, test:components, kiểm tay 360 px vi/en | |
| ⬜ | M9 QA + chốt phase (P5-9) | QA-P5-01..06 | M1..M8 | `cleanup.mjs --apply` (chỉ khi đồng ý) | acceptance, check-constraints, e2e dev từng file, 2 ca đua, hồi quy, đi tay | |

### Một vòng mốc (lặp lại cho mọi mốc)

1. Chạy `git status`; chỉ được còn thay đổi của mốc đang làm. Có thay đổi lạ thì báo chủ dự án và chờ.
2. Mở file task của phần, đọc mục "Before you start". Mốc có planner thì chạy planner trước và hỏi một lượt các câu hỏi của nó.
3. Làm từng task: đánh `[~]`, viết code và test (tên test có mã spec), kiểm "Done when", rồi đánh `[x]`.
4. Hỏi trước mỗi lần áp migration lên DB, xóa file hay cài thư viện mới. `.env*` do chủ dự án điền.
5. Cuối mốc chạy lint, test, build của app đã sửa, cộng e2e hoặc check-constraints nếu mốc có ghi. Mốc có reviewer thì chạy reviewer rồi sửa các lỗi chặn.
6. Cập nhật file này: dấu ở bảng mốc, dòng ở "Bảng tổng", một dòng nhật ký. Lỗi nào tốn một lần làm lại thì thêm một dòng vào `docs/LESSONS.md`.
7. ⏸ Báo cáo: file đã đổi, output thật, cách kiểm tay, `[ASSUMPTION]`, thông điệp commit gợi ý kèm mã task và mã spec.
8. Chủ dự án commit và báo lại. Agent kiểm `git log`, ghi hash, chuyển ▶ sang mốc kế.

### Vào lại giữa chừng (phiên mới)

1. Đọc dòng **▶** ở bảng trên.
2. Mở file task của phần đó. Tìm task `[~]` đầu tiên; nếu không có thì lấy task `[ ]` đầu tiên.
3. Chạy `git status` và đối chiếu với nhật ký dưới đây trước khi code tiếp.

## Nhật ký điểm dừng

- 24/11/2026 · M0 · Planner viết `plans/PHASE/PLAN.md`. Chủ dự án trả lời Q-P5-1..16: mọi câu theo đề xuất, trừ Q-P5-8 chọn thư viện biểu đồ; Q-P5-7 chọn cột mới (migration M3). Ghi vào spec thành D-45; Q-13 và A-17 đã chốt; `30-frontend.md` bỏ công tắc webhook. Đã tạo README, PROGRESS và 9 file task. Chưa có code.
- 24/11/2026 · M1 · Xong BE-P5-01..04. Gửi theo phòng, tòa hoặc toàn chuỗi. Danh sách có số đã đọc và tổng người nhận. Kiểm tra quyền hộp thư người thuê đạt. Đã sửa điểm chặn PUB-05 của reviewer. Backend đạt 2852/2852 ca trên HTTP trong bộ nhớ, lint 4 cảnh báo cũ và 0 lỗi, build đạt. Chờ chủ dự án kiểm và commit.
- 24/11/2026 · M1 · Xác nhận commit `9b67fa3`. Chủ dự án sẽ kiểm tay cùng đợt sau.
- 24/11/2026 · M2 CP-1 · Đã ghi kế hoạch P5-2 và quyết định Q-P5-17 (D-46). Chủ dự án duyệt tạo M1. Bộ kiểm ràng buộc tăng từ 110/110 lên 115/115, replay 12 migration trước rồi áp M1 trên PostgreSQL nhúng đạt, lint 4 cảnh báo cũ và 0 lỗi. Reviewer DUYỆT CP-1. Chờ duyệt riêng để áp M1 lên DB dev.
- 24/11/2026 · M2 CP-1 · Xác nhận commit `0935309` cho migration M1 và kiểm thử offline. CP-2 chờ duyệt áp migration lên DB dev.
- 24/11/2026 · M2 CP-2 · Kiểm chỉ đọc từ cấu hình dev trả `P1001`. Kiểm kết nối đến cả địa chỉ ứng dụng và địa chỉ trực tiếp đều trả `ENOTFOUND`. Trạng thái áp M1 trên dev chưa xác minh được.
- 24/11/2026 — M2 CP-2 retry: local Prisma migrate status exited 1 (P1001). DNS lookup returned ENOTFOUND for both DATABASE_URL and DIRECT_URL from this session. Dev migration state remains unverified.
- 24/11/2026 — M2 CP-2: owner verified dev migration status from PowerShell. Of 13 local migrations, only 20261124000000_renewal_open_room is pending. Awaiting approval for dev deployment and read-only preflight for existing HOLD renewals.
- 24/11/2026 — CP-2: owner approved applying M1 to dev. Pending host-side HOLD renewal preflight, deployment and catalog verification.
- 24/11/2026 — CP-2 verified on the owner host: M1 applied, migration status up to date and both unique indexes match.
- 24/11/2026 — BE-P5-06: implemented renewal creation and room reservation guard. Full backend suite 2863/2863 (139 files), renewal suite 11/11, build passed, lint 0 errors and 4 existing warnings. BE-P5-07 next.
- 24/11/2026 — M2 CP-3..5: BE-P5-07/08 complete; reviewer approved code after signer and vehicle rollover fixes. Build passed, lint 0 errors (4 existing warnings), unit/HTTP 2871/2871, offline DB checker 115/115, embedded PostgreSQL E2E 1/1. Dev E2E and list-only cleanup blocked by connectivity. Two-session races pending; M2 is not accepted yet.
- 24/11/2026 — Owner reports both host checks passed (renewal dev E2E and list-only cleanup). The two independent-connection cases were not part of those commands. P5-3 plan preparation started.

- 24/11/2026 - P5-2 commit 30dd68b confirmed. P5-3 BE-P5-10..18 implemented and reviewed. Embedded PostgreSQL HTTP E2E passed, including webhook payment confirmation, latest repair cost, move-out, duplicate plate rollback and scheduled closure. Dev E2E, list-only cleanup and two independent database sessions remain unverified.
- P5-3 verification: 2,882/2,882 tests (140 files), build passed, lint 0 errors and 4 existing warnings. Embedded E2E passed 1/1.
- 24/11/2026 - Owner reports P5-3 dev E2E and list-only cleanup passed; verified commit c3ad1c1. The separate two-connection submission test remains unverified. P5-4 awaits approval to create migration M2 for repair reviews.
- 24/11/2026 - BE-P5-19: M2 created with owner approval. Offline PostgreSQL checks 124/124, migration chain 14/14, request tests 10/10, lint 0 errors (4 existing warnings), schema review approved. Dev deployment pending.
- 24/11/2026 - P5-4: owner approved dev M2. Dev status failed (P1001); deployment unconfirmed. Review and moderation endpoints passed rollback HTTP E2E on embedded PostgreSQL, including edit after hide, original moderated text retained in audit, and scope guards. TypeScript build passed. Lint: 0 errors, 4 existing warnings.
- P5-4 final local regression: 140/140 suites, 2882/2882 tests passed. Host M2 deployment and dev E2E pending.

- P5-4: owner reported the dev checkpoint passed and requested continuing into P5-5 without committing.
- P5-5: BE-P5-22/23 implemented (revenue, current debt and deposits, occupancy, scoped Boss comparison). Local TypeScript build, targeted tests 13/13 and embedded report integration 1/1 passed. Awaiting M3 creation approval for BE-P5-24.
- BE-P5-24: M3 and Boss archive/cancel implemented; 15 migrations replayed, 128/128 DB checks, PostgreSQL HTTP E2E 1/1, TypeScript build passed. Reviewer approved after verifying waived periods remain covered for billing and readings. Dev deployment pending approval.
- M3 deployment to dev approved by owner. Two read-only Prisma status attempts returned P1001; DNS resolved. No deploy command issued. Dev schema and E2E await host verification.
- 25/11/2026 - Owner reports the dev E2E passed after splitting the requests suite into three independent rollback fixtures. Reviewed the change; all three cases and the separate revenue report passed individually on embedded PostgreSQL. Combined embedded run hit a connection-emulation error. Direct dev migration status from this session still returns P1001.
- 25/11/2026 - BE-P5-25 completed: Boss-only audit history, filtered Hanoi dates, stable pagination, nested snapshot field redaction, exact BigInt IDs. HTTP tests 2/2, build passed, audit lint clean.
- 25/11/2026 - BE-P5-26/27: settings and consumption implemented and reviewed. Renewal-chain held deposits tested before and after switching; legacy email overrides validated per translation. Full local regression 2893/2893 (144 suites), Nest build passed, lint 0 errors / 4 existing warnings, DB checker 128/128, embedded report and renewal E2Es 2/2. Dev report and list-only cleanup could not connect; host verification pending.
- 25/11/2026 — Owner confirmed the P5-5 dev checks passed. BE-P5-27 closed. P5-6 planning started.
- 25/11/2026 - FE-P5-01: added eight staff/tenant routes, role-specific menus and tenant translations. Role checks passed for direct URLs, including Boss-only audit and settings. Frontend lint, build and the full component suite passed (0 failed, 0 skipped).
- 25/11/2026 - FE-P5-02 completed: scoped request board, staff decisions, payment resolution, dashboard links and prefilled renewal form. Lint and build passed. Component tests: 1028/1028, including 10 request workflow tests with simulated API responses. Headless Chrome could not start for the viewport check; 360px and desktop browser verification remains for FE-P5-05.
- 25/11/2026 - FE-P5-03/04: added confirmed room/building/chain announcements, read counts, direct renewal and HOLD cancellation entry. Staff detail now returns predecessor/successor IDs and the backend-calculated renewal start date. Targeted frontend 17/17; backend contract tests 61/61 with a longer test startup timeout.
- 25/11/2026 - M6 automatic checkpoint: frontend lint and production build passed, full component suite 1035/1035 passed, 0 skipped. Backend build passed, lint 0 errors / 4 existing warnings. Two legacy UI tests were updated to wait for displayed data. Reviewer approved FE-P5-03/04. Browser viewport checks (360 px / desktop) and live staff acceptance remain open; neither Chrome nor Edge returned a usable headless page here.
- 25/11/2026 - Owner accepted P5-6. P5-7 report data, monthly balances, occupancy, Boss comparison and overdue actions wired. Frontend lint, production build and 43 focused tests passed. Chart package approval pending.
- 25/11/2026 - Owner approved recharts@3.3.0. Installed and pinned with its lockfile. Report and dashboard charts, Boss audit filters and settings forms are implemented. Chart component tests use simulated narrow and desktop containers. Actual 360 px browser acceptance is pending.
- 25/11/2026 - P5-7 automated checkpoint: frontend lint and production build passed; full component regression 1041/1041, 0 skipped. Backend build and audit HTTP 3/3 passed. Reviewer approved after allowing entityId=0 for settings while actorId remains positive. Owner manual review at 360 px still pending.
- 25/11/2026 - Owner accepted P5-7 and committed 9400ca6. P5-8 tenant inbox, requests, reviews, contract and invoice actions and consumption charts implemented. Review approved after correcting parking choices, moderated comments, invoice eligibility and the early move-out warning.
- 25/11/2026 - M8 automated checks passed. Frontend lint, production build and all 1052 component tests passed (0 skipped). The legacy public filter case timed out in two earlier runs and passed individually and in the final full run. Backend build and 89 targeted tests passed; backend lint had 0 errors and 4 existing warnings. Manual tenant browser acceptance at 360 px in Vietnamese and English is pending.
- 25/11/2026 - Chủ dự án xác nhận đã nghiệm thu P5-7 và P5-8. Git xác nhận lần lượt 9400ca6 và 84b9691. P5-9 bắt đầu, bộ kiểm ràng buộc PostgreSQL nhúng đạt 128/128.
- 25/11/2026 - P5-9: toàn bộ 2.895 test backend đạt (144 bộ). Đã bổ sung E2E cho yêu cầu trả phòng trùng, biển số đang dùng ở hợp đồng khác và so tiền thuê lúc duyệt với lúc quyết toán trên cùng hợp đồng. Các ca cập nhật chờ chạy trên Supabase dev; chưa xác nhận hai tranh chấp hay cleanup.
- 25/11/2026 - QA-P5-03..06: bộ test hai kết nối và runner tuần tự đã sẵn sàng; bổ sung kiểm lịch sử hai hợp đồng bằng tài khoản người thuê. Frontend kiểm lại 172/172. Đang chờ mã thoát E2E và trạng thái cleanup trên dev để chốt M9.
- 25/11/2026 - Đối chiếu log dev 17:19 và 22:58. QA-P5-04 đạt; requests exit=1 chưa có output chi tiết; cleanup exit=1 do 141 bản ghi ngoài nhật ký. P5-9 vẫn mở.
- 25/11/2026 - Lượt dev riêng lúc 23:10:02: requests đạt 3/3. Đã đối chiếu rooms-p5-requests.txt. QA-P5-01..04 đạt. Toàn bộ 141 bản ghi ngoài nhật ký trong báo cáo cleanup mang mã lượt chạy từ 03–06/11; chờ quyết định của chủ dự án.
- 26/11/2026 - Chủ dự án chốt Phase 5. QA-P5-05 được chấp nhận với ngoại lệ 141 bản ghi thử cũ. Cleanup toàn DB vẫn ghi exit 1; theo dõi riêng sau M9.
