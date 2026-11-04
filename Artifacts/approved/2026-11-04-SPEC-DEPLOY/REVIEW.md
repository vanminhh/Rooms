# Spec: cron hóa đơn tự bù ngày lỡ + 8 đề xuất triển khai (deploy)

Trạng thái: ĐÃ DUYỆT 04/11/2026 (chủ dự án: "Duyệt, áp vào")
Task / spec: SPEC-DEPLOY · D-21, D-22, BIL-05, BIL-06, BIL-21, CON-18, MTR-09, DEP-01..06, AUTH-04, AUD-01, PUB-05, VIEW-11, BANK-08, NOTI-05, NOTI-06, A-08..10, Q-04..06
Gốc: cc47b0b

## Làm gì, vì sao

Rà lại đề xuất "website quá tải / sập" đối chiếu code và spec, rồi rà tiếp spec phase 3–5 (14–20) tìm lỗ hổng cùng loại. Chủ dự án chốt phương án **1 + 7 ngày** cho cron hóa đơn (04/11/2026) và yêu cầu đưa cả 8 đề xuất vào spec.

| # | Đề xuất | Ghi vào |
|---|---|---|
| 1 | Cron hóa đơn chạy cả lúc app khởi động, tạo bù hóa đơn nháp cho ngày tính tiền trong 7 ngày gần nhất; gia hạn hợp đồng chuyển bù không giới hạn | D-21, BIL-05, BIL-06, CON-18, MTR-09, bảng Cron, Roadmap phase 4, A-09 |
| 1b | Kỳ lỡ quá 7 ngày: thẻ đỏ "Kỳ chưa có hóa đơn" trong "Việc hôm nay" + nút "Tạo hóa đơn kỳ này"; chặn quyết toán khi còn kỳ thiếu hóa đơn | BIL-21, NOTI-06, `/ql` (30-frontend), AUD-01, A-10, Q-05 (đã trả lời) |
| 2 | FE và API chung một tên miền | DEP-01 |
| 3 | 1 instance BE luôn bật, RAM ≥ 1 GB; BE và DB cùng vùng Singapore | DEP-02, DEP-03 |
| 4 | `trust proxy` đúng số tầng proxy, để giới hạn theo IP đếm đúng IP khách | DEP-04, VIEW-11 |
| 5 | Bắt buộc có `NODE_ENV`, để cookie đăng nhập luôn `Secure` khi chạy thật | DEP-05 |
| 6 | Giới hạn đăng nhập thêm theo IP: 20 lần sai / 15 phút | AUTH-04, A-08 |
| 7 | Webhook bị lỡ khi server sập: kiểm tra nhà cung cấp có gửi lại, có API lịch sử để đối soát | BANK-08, Q-03, Q-04 |
| 8 | Cache GET public 60 giây ở CDN (trình duyệt không cache) | PUB-05, DEP-06 |
| – | Gom 2–8 thành một quyết định | D-22 |

Lỗ hổng cùng loại tìm thêm ở phase 3–5:
- **Gia hạn (BIL-06, CON-18):** cũng chỉ chạy "đúng hôm nay". Nếu lỡ, hợp đồng mới không bao giờ được kích hoạt, nên cả kỳ gia hạn không có hóa đơn. Đã gộp vào đề xuất 1.
- **Nhắc nhở 08:00 (NOTI-05):** nhắc theo đúng một ngày (còn 30/7 ngày, ngày 1/4/7 quá hạn). Lỡ thì bỏ qua lần nhắc đó. Nhẹ hơn mất hóa đơn, nên chỉ ghi câu hỏi Q-06, chưa đổi luật.
- Đã kiểm tra, **không** cùng lỗi: tự đóng sự cố (REQ-06 dùng "> 3 ngày"), đồng bộ giá (PRC-06 đã chạy lúc khởi động).

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `docs/spec/00-overview.md` | `docs/spec/00-overview.md` | Sửa: D-21, D-22, A-08..10, Q-03 (thêm câu), Q-04, Q-05 (đã trả lời), Q-06 |
| `docs/spec/01-architecture.md` | `docs/spec/01-architecture.md` | Sửa: dòng cron 00:05; mục mới "Deployment" DEP-01..06; Roadmap phase 4 |
| `docs/spec/10-auth.md` | `docs/spec/10-auth.md` | Sửa: AUTH-04 |
| `docs/spec/11-buildings-rooms.md` | `docs/spec/11-buildings-rooms.md` | Sửa: thêm PUB-05 |
| `docs/spec/13-viewings.md` | `docs/spec/13-viewings.md` | Sửa: VIEW-11 (IP thật) |
| `docs/spec/14-contracts.md` | `docs/spec/14-contracts.md` | Sửa: CON-18 |
| `docs/spec/15-meters.md` | `docs/spec/15-meters.md` | Sửa: MTR-09 |
| `docs/spec/16-billing.md` | `docs/spec/16-billing.md` | Sửa: bảng loại hóa đơn, khối Periods, BIL-05, BIL-06, thêm BIL-21 + A-10, bảng API, 7 dòng nghiệm thu |
| `docs/spec/17-bank.md` | `docs/spec/17-bank.md` | Sửa: thêm BANK-08 |
| `docs/spec/19-notifications.md` | `docs/spec/19-notifications.md` | Sửa: NOTI-05 (ghi chú Q-06), NOTI-06 (nhóm "kỳ quá 7 ngày chưa có hóa đơn" + nút) |
| `docs/spec/20-reports-audit-settings.md` | `docs/spec/20-reports-audit-settings.md` | Sửa: AUD-01 thêm "tạo hóa đơn kỳ bị lỡ" |
| `docs/spec/30-frontend.md` | `docs/spec/30-frontend.md` | Sửa: trang `/ql` thêm thẻ đỏ "Kỳ chưa có hóa đơn" + nút |

Không sửa code. Code chỉ đổi khi làm các task tương ứng (xem "Ảnh hưởng tới task").

## Cách xem và kiểm tra

```bash
git diff --no-index docs/spec Artifacts/2026-11-04-SPEC-DEPLOY/docs/spec
```

(Các dòng `=> /dev/null` là file không có trong bản nháp, giữ nguyên, bỏ qua.)

## Đã kiểm tra

- 12 file nháp chép từ commit `cc47b0b`; `docs/spec` sạch lúc chép (`git status` không có thay đổi).
- Diff chỉ chạm các dòng nêu trên.
- Lịch sử: 04/11/2026 tạo bản nháp; cùng ngày chủ dự án chọn "Giữ 7 ngày + nút" cho Q-05, thêm BIL-21, A-10, AUD-01, `/ql`.
- Đối chiếu code: không có CORS ([app.setup.ts:8](../../Source/backend/src/app.setup.ts)); cookie `SameSite=Lax`, `path=/api/v1/auth`, `secure` theo `NODE_ENV` ([auth.controller.ts:16](../../Source/backend/src/modules/auth/auth.controller.ts)); `NODE_ENV` không có trong `REQUIRED_ENV` ([env.ts:2](../../Source/backend/src/common/env.ts)); chưa có `trust proxy`; argon2 dùng mặc định 64 MB, t=3, p=4 (`node_modules/argon2/argon2.cjs:31`); giới hạn đăng nhập chỉ theo số điện thoại ([auth.service.ts:80](../../Source/backend/src/modules/auth/auth.service.ts)).
- Không có test tự động cho spec; các dòng nghiệm thu mới trong 16-billing sẽ thành test khi làm phase 4.

## Ảnh hưởng tới task

- **Phase 2 (đang làm):** BE-P2-31 (giới hạn IP form xem phòng) cần DEP-04 trước khi deploy sau proxy. P2-QA-04 đã ghi `trust proxy`, giờ có luật trong spec.
- **Phase 2 hoặc trước deploy:** AUTH-04 theo IP (A-08), DEP-05 (`NODE_ENV`), PUB-05 (header cache) là thay đổi code nhỏ, mỗi cái cần một draft riêng.
- **Phase 3–4:** BIL-05/06, CON-18 viết theo luật mới ngay từ đầu (chưa có code nên không phải sửa).

## Giả định hoặc câu hỏi cho chủ dự án

1. **Q-05: đã trả lời 04/11/2026: "Giữ 7 ngày + nút".** Đã viết thành BIL-21. Những chi tiết tôi điền theo mẫu có sẵn, bạn kiểm tra giúp:
   - **Ai được bấm:** quản lý và Boss trong phạm vi tòa, giống các nút hóa đơn khác (phát hành, ghi thu tay, xuất lại).
   - **Bấm được cho hợp đồng nào:** hợp đồng đang thuê, hoặc đã kết thúc do gia hạn (không phải do quyết toán). Kỳ đó phải đã đến ngày tính tiền và chưa có hóa đơn.
   - **Sau khi bấm:** tạo hóa đơn nháp, mở màn "Chốt chỉ số" như hóa đơn thường, có ghi audit.
   - **A-10 (mới):** chặn quyết toán khi hợp đồng còn kỳ chưa có hóa đơn. Lý do: quyết toán chỉ tính kỳ cuối (BIL-14), nên kỳ thiếu ở giữa sẽ không bao giờ được thu. Nếu bạn không muốn chặn, thì phải cho quyết toán tự cộng các kỳ thiếu vào.
2. **A-08:** 20 lần sai mỗi IP trong 15 phút có hợp lý không? Cao hơn mức theo số điện thoại vì người thuê cùng tòa thường dùng chung một Wi-Fi.
3. **A-09:** gia hạn được chuyển bù không giới hạn, kể cả khi hợp đồng gia hạn được ký **sau** ngày bắt đầu. Hiện spec không cấm ký muộn; nếu bạn muốn cấm, cần thêm luật ở CON-06.
4. **Q-06:** lỡ lần nhắc 08:00 thì nhắc bù hôm sau, hay bỏ qua?
5. **Q-04:** khi chọn SePay hoặc Casso (Q-03), cần xem họ có gửi lại webhook và có API lịch sử giao dịch không.
6. Giá trị tôi điền theo đề xuất trước (đổi được khi duyệt): RAM ≥ 1 GB, vùng Singapore, cache 60 giây, tên biến `TRUST_PROXY_HOPS`.

Đã chép vào file chính 04/11/2026 bằng apply-draft.mjs: 12 file.
