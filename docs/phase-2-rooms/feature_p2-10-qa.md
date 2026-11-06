# Phase 2 · Part 10 – QA and close (P2-QA-01..05)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Parts 2–9 on the main files |
| Unblocks | Phase 3 · Contracts |
| How | By hand |
| Part done when | Every step passes and "Status" in `CLAUDE.md` and `docs/spec/README.md` says Phase 3 (through a draft) |

## Phase 2 exit (roadmap)

1. A guest filters rooms (district, ward, building, price), opens a room, books a viewing; the building's manager (or Boss when the building has no active manager) sees it in "Việc hôm nay" and handles it.
2. A manager proposes a room price / rate → the public price does not change until Boss approves; a price approved for a later date applies at 01:00 (or at the next app start).
3. Every acceptance case of spec 10 (new ones), 11, 12, 13 has a test with its ID and passes, except the ones that need contracts or invoices (spec 11 "HOLD contract removes the room", spec 12 "84 kWh", "0 kWh", spec 13 "HOLD contract cancels viewing B" – Phase 3/4). BE `lint`, `test`, `test:e2e` and FE `lint`, `build`, `test:components` pass; DB check 50/50.

## Tasks

- [x] **P2-QA-01** Step-by-step manual checklist in Vietnamese (written into this file) covering exit 1 and 2, at 360 px and with the keyboard.
  Done when: every step marked "đạt" by the owner.
- [x] **P2-QA-02** Automated checks on the main files: the commands of exit 3; DB check `node prisma/check-constraints.mjs . prisma` (needs `npm i --no-save @electric-sql/pglite@0.2`).
  Done when: real output pasted into the Issues log.
- [x] **P2-QA-03** Test data: `node test/e2e-cleanup.mjs` (list mode); the owner reviews the list; `--apply <runId>` only for runs the owner agrees to.
  Done when: no log left outside `CLEANED`, or the owner accepted what is left.
- [x] **P2-QA-04** Production notes carried over: in-memory limits (login, viewing IP), console mailer, seed without production guard, `engines` Node ≥ 24.2, `trust proxy` behind a proxy, orphan Cloudinary uploads.
  Done when: listed in the Phase 2 summary for the owner.
- [ ] **P2-QA-05** Draft: "Status" in `CLAUDE.md` and `docs/spec/README.md` → Phase 3 · Contracts.
  Done when: approved, applied, committed.

## Questions for the owner

None yet.

## Issues log
- 06/11/2026 · P2-QA-02 · Kiểm tự động trên main (9/9 lệnh exit 0): backend lint 0 lỗi (7 cảnh báo require-array-sort-compare/restrict-template-expressions có sẵn), build PASS, test 77/77 file 1502/1502, e2e 5/5 file 43/43, DB check `migrate diff` + `check-constraints.mjs` = 54/54; frontend lint PASS, build PASS, test:components 645/645 (lần 2; lần 1 thoát mã 1 không rõ test nào, nghi flaky do tải máy, cần chạy lại vài lần để xác nhận). `prisma/schema.sql` sinh ra là file gitignored.
- 06/11/2026 · P2-QA-04 · Ghi chú môi trường thật đã ghi trong docs/phase-2-rooms/p2-10-qa-checklist.md (mục "Ghi chú cho môi trường thật", 10 mục) và đã áp dụng.
- 06/11/2026 · P2-QA-03 · Còn mở: 4 bản ghi viewings [E2E sót (#2, #3 từ 20261105T1358-3HF9; #5, #6 từ 20261105T1404-IDHU, tên "Khách lặp lại") chưa dọn; chờ chủ dự án đồng ý `cleanup.mjs --apply`.
- 06/11/2026 · P2-QA-03 · Chạy `cleanup.mjs` chế độ liệt kê: không có nhật ký nào ngoài CLEANED; chỉ còn đúng 4 lịch hẹn [E2E ngoài nhật ký (#2, #3, #5, #6, "Khách lặp lại"). Chủ dự án chấp nhận giữ lại (dữ liệu thử vô hại trên DB dev), không xóa. Task đóng.
- 06/11/2026 · P2-QA-01 · Chủ dự án chạy checklist tay: A5, A9, B1, D3 không đạt lần đầu, đã sửa (bản nháp QA-fixes và QA-fixes-tests, đã áp dụng; backend 1502/1502, DB 54/54, frontend test:components 657/657 chạy tuần tự, lint sạch). A7 là giới hạn 5 lần/giờ theo IP đúng spec (VIEW-02, A-03). Chủ dự án kiểm lại và cho đạt hết cùng ngày. Status trong CLAUDE.md và docs/spec/README.md (Phase 2 xong) giữ nguyên.

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
