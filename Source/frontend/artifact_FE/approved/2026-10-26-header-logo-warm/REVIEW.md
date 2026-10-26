# Logo trên header + bảng màu cát ấm ngả vàng nhẹ

Trạng thái: ĐÃ DUYỆT 26/10/2026 (chủ dự án: "ok rồi đó chốt bản sửa này sửa file chính đi")

Đã áp dụng 26/10/2026: chép `Navigation.tsx`, `effects.tsx`, `rooms.css`, `component-preview.css`, `ComponentPreview.tsx` vào file chính; so sánh lại thì cả 5 file trùng khớp hoàn toàn với bản nháp. Đã cập nhật `src/components/README.md` (`logoSrc` của `RoomsHeader` và `Preloader`) và `docs/spec/31-ui-kit.md` (KIT-09 màu và nét chữ, KIT-10 logo). Sau khi chép: `npm run lint` qua, `npm run test:components` 14/14, `npm run build` qua (vẫn còn cảnh báo cũ về chunk Three.js lớn hơn 500 kB). Trên `/components.html`: nền `#f8f2e6`, chữ phụ nét 500, logo nạp được ở header và màn chờ. Chú thích dưới logo được sửa lúc chép để ghi đúng là header và màn chờ đều đã dùng biểu tượng.

Đã dọn 26/10/2026 (theo luật dọn `approved/` trong `Artifacts/README.md`, làm trước khi commit theo yêu cầu chủ dự án): xóa bản sao `src/components/Navigation.tsx`, `src/components/effects.tsx`, `src/components/rooms.css`, `src/component-preview.css`, `src/pages/ComponentPreview.tsx` (lúc dọn, cả 5 file trùng khớp với file chính cùng tên trong `Source/frontend/`) và các file shim `preview.html`, `preview-entry.tsx`, `src/components/index.ts`, `src/components/useReducedMotion.ts`, `src/shared/formatters.ts`. Giữ `REVIEW.md` và `ref/vang-kem-151.webp` (57 KB). Mã commit: chưa có.

Task / spec: yêu cầu của chủ dự án 26/10/2026 · KIT-01, KIT-05, KIT-07

Lịch sử: bản 1 ngả vàng nhẹ → bản 2 theo mẫu sơn "Vàng Kem 151" (vàng quá) → bản 3 pha giữa 1 và 2 → quay về bản 1 → nền trang bản 1 thiên trắng thêm một chút (`#f5eedd` → `#f8f2e6`) → chữ tối hơn 30% → chữ con tối thêm 30% và nét dày hơn một bậc → **logo trên màn chờ**.

## Làm gì, vì sao

1. **Logo lên header.** `RoomsHeader` nhận thêm thuộc tính `logoSrc`. Header hiện **phần cửa sổ vòm + chìa khóa** cắt từ `public/images/rooms-logo.webp`, đặt cạnh chữ ROOMS. Không dùng cả logo vuông vì khung trang trí và chữ "ROOMS Apartments" bên trong quá nhỏ ở cỡ header. Ảnh được cắt bằng CSS và hòa nền bằng `mix-blend-mode: multiply`. Biểu tượng rộng 58px trên máy tính, 40px trên điện thoại (dưới 680px).
2. **Màu cả trang ngả vàng nhẹ.** Chỉ đổi màu nền và đường kẻ; giữ nguyên xanh trầm, vàng đất, màu chữ và màu nhãn trạng thái.

| Vai trò | Gốc | **Mới** |
|---|---|---|
| Nền trang `--rooms-sand` | `#f4f0e7` | **`#f8f2e6`** (bản 1 `#f5eedd` pha thêm 25% trắng theo yêu cầu) |
| Nền thẻ, nút `--rooms-paper` | `#fbf9f3` | **`#fcf8ee`** |
| Đường kẻ `--rooms-line` | `#d8d9cc` | **`#ddd5c0`** |
| Khối trích dẫn, khối logo, khối chuyển động | `#e9ebdf` (xanh nhạt) | **`#efe8d4`** (kem nhạt) |
| Ô mặt bằng | `#e7e5da` | **`#ebe4d0`** |
| Nút cát khi rê chuột | `#dfd5c1` | **`#e4d6b6`** |
| Nền khối mã (trang xem thử) | `#e9e9df` | **`#eee8d6`** |
| Viền vòm ảnh mở đầu (trang xem thử) | `#c6c8b9` | **`#cdc5ae`** |

3. **Màu chữ đậm hơn 30%** (giảm 30% độ sáng mỗi kênh màu) để chữ nổi hơn trên nền sáng. Xanh trầm và vàng đất còn dùng làm **nền và viền** (nút chính, footer, thanh tìm kiếm, viền focus), nên không đổi hai biến đó mà thêm hai biến chỉ dành cho chữ: `--rooms-text` và `--rooms-gold-text`. Chữ sáng trên nền tối (footer, thanh tìm kiếm, thẻ phòng) giữ nguyên.

| Chữ | Trước | **Sau** | Biến |
|---|---|---|---|
| Chữ chính (cả chữ trong sơ đồ mặt bằng) | `#153d36` | **`#0f2b26`** | `--rooms-text` (mới) |
| Chữ phụ | `#5f6b61` | `#434b44` → **`#2f3530`** (bước 4) | `--rooms-muted` |
| Chữ nhấn (nhãn nhỏ, eyebrow) | `#876136` | `#5f4426` → **`#43301b`** (bước 4) | `--rooms-accent-text` |
| Chữ vàng (tiêu đề nghiêng) | `#aa7d45` | **`#775830`** (nâu đồng) | `--rooms-gold-text` (mới) |
| Nhãn Còn trống / Đang thuê / Đã giữ chỗ / Bảo trì | `#325641` / `#3a5868` / `#7b5b24` / `#6d625d` | **`#233c2e` / `#293e49` / `#564019` / `#4c4541`** | — |

4. **Chữ con đậm hơn để nhìn rõ** (yêu cầu "chữ con thêm 30%", "cho đậm lên nhìn cho rõ"). Hai thay đổi, bỏ riêng từng cái được:
   - **Màu:** chữ phụ và chữ nhấn tối thêm 30% nữa (bảng trên). Chữ chính đã gần đen nên không đổi; nhãn trạng thái giữ nguyên vì đã nét 600 và tương phản 7,4–9,7.
   - **Nét chữ:** mọi chữ nhỏ (8–13px) và chữ phụ đang nét 400 lên **500**: dòng chữ dưới ROOMS, mô tả mục, ghi chú mặt bằng và chi phí, nhãn ô tìm kiếm, chữ trên thẻ phòng, hành trình, tính năng, trích dẫn, chữ nhỏ ở footer, màn chờ, và các chữ nhỏ của trang xem thử. Làm bằng **một nhóm luật `font-weight: 500`** cuối `rooms.css` và một nhóm cuối `component-preview.css`, không sửa từng luật. Eyebrow và nhãn trạng thái vẫn 600, tiêu đề Taviraj vẫn 300, nút vẫn như cũ. Manrope 500 đã được nạp sẵn, không cần thêm font.

5. **Logo trên màn chờ** (yêu cầu "trang loading này để logo đc k"). `Preloader` nhận thêm `logoSrc` giống `RoomsHeader`: có logo thì hiện biểu tượng cửa vòm + chìa khóa (cùng phần cắt với header, rộng 96px) **thay cho hình mặt trời**; không truyền thì vẫn là mặt trời như cũ. Logo gốc có viền cửa xanh đậm gần trùng màu nền màn chờ (`#153d36`) nên sẽ chìm mất. Vì vậy trên màn chờ ảnh được **đảo độ sáng nhưng giữ sắc màu** (`filter: invert(1) hue-rotate(180deg)` + `mix-blend-mode: lighten`). Kết quả: vòm và chìa khóa vẫn vàng đồng, khung cửa thành xanh bạc hà nhạt, nền kem của ảnh biến mất. Chỉ dùng CSS, không cần file ảnh mới.

Trong trang xem thử: bảng màu ghi "Cát ấm `#f8f2e6`" và "Kem nhạt `#efe8d4`" (thay "Xanh nhạt"); chú thích dưới logo ghi header đã dùng biểu tượng; ảnh logo vuông trong khối "Logo thương hiệu" hòa nền (`multiply`, thêm từ bản 2 để không lộ ô trắng; bỏ được nếu không muốn).

## File sẽ thêm / sửa ở bản chính

| Bản nháp | Đích | |
|---|---|---|
| `src/components/Navigation.tsx` | `Source/frontend/src/components/Navigation.tsx` | Sửa: thêm `logoSrc` |
| `src/components/rooms.css` | `Source/frontend/src/components/rooms.css` | Sửa: màu, nét chữ nhỏ, kiểu biểu tượng ở header và màn chờ |
| `src/components/effects.tsx` | `Source/frontend/src/components/effects.tsx` | Sửa: `Preloader` thêm `logoSrc` |
| `src/component-preview.css` | `Source/frontend/src/component-preview.css` | Sửa: màu + hòa nền ảnh logo |
| `src/pages/ComponentPreview.tsx` | `Source/frontend/src/pages/ComponentPreview.tsx` | Sửa: truyền `logoSrc` cho header và màn chờ, bảng màu, chú thích |
| (sửa lúc chép) | `Source/frontend/src/components/README.md` | Thêm `logoSrc` vào bảng props của `RoomsHeader` và `Preloader` |
| (sửa lúc chép) | `docs/spec/31-ui-kit.md` | Ghi bảng màu mới là màu chính thức; luật mới: chữ dùng `--rooms-text` / `--rooms-gold-text`, nền và viền dùng `--rooms-ink` / `--rooms-gold`; chữ nhỏ và chữ phụ nét 500 |
| `preview.html`, `preview-entry.tsx`, `src/components/index.ts`, `src/components/useReducedMotion.ts`, `src/shared/formatters.ts`, `ref/vang-kem-151.webp` | — | **Không chép**, chỉ để chạy thử và tham chiếu |

Bản nháp lấy từ phiên bản hiện tại của `ComponentPreview.tsx` và `component-preview.css`, đã gồm phần logo chủ dự án đang thêm dở (chưa commit).

## Cách xem

```bash
cd Source/frontend
npm run dev
```

Bản nháp đã được dọn, không mở xem riêng được nữa. Xem kết quả ở `/components.html`; xem code lúc duyệt trong commit chứa thay đổi này.

## Đã kiểm tra

- Trang nháp hiển thị đủ, không lỗi console, không tràn ngang; nền đọc được `rgb(248, 242, 230)` = `#f8f2e6`; logo trong header nạp được; biểu tượng 58 × 47px; header máy tính cao 106px, bằng bản gốc.
- 360px: không tràn ngang; header cao 168px, bằng bản gốc; nút Menu cùng hàng với logo.
- Tương phản chữ (WCAG):

| Chữ | Trước, nền trang | **Sau: nền trang `#f8f2e6`** | Khối kem `#efe8d4` | Thẻ `#fcf8ee` |
|---|---|---|---|---|
| Chữ chính | 10,75 | **13,51** | 12,31 | 14,21 |
| Chữ phụ | 5,01 | 8,09 → **11,26** | 10,26 | 11,84 |
| Chữ nhấn | 4,97 | 8,04 → **11,23** | 10,23 | 11,81 |
| Chữ vàng | 3,29 | **5,84** | 5,33 | 6,14 |
| Nhãn trạng thái (trên nền nhãn) | 4,67–6,70 | **7,43–9,69** | | |

  Mọi chữ giờ đều ≥ 4,5 (kể cả chữ vàng, trước đây chỉ đủ cho chữ lớn).
- Đọc trực tiếp trên trang: chữ chính `rgb(15, 43, 38)`, tiêu đề vàng `rgb(119, 88, 48)`, chữ mặt bằng `rgb(15, 43, 38)`; nền footer, nút chính, thanh tìm kiếm vẫn `rgb(21, 61, 54)` = `#153d36` (không đổi). Không lỗi console.
- Bước 4, đọc trực tiếp: chữ nhỏ (dòng dưới ROOMS, mô tả mục, ghi chú, footer, chữ trang xem thử) nét `500`; chữ phụ `rgb(47, 53, 48)`; eyebrow `600` màu `rgb(67, 48, 27)`; nhãn trạng thái `600`; tiêu đề `300`. Font Manrope 500 đã nạp. Không tràn ngang ở 360 / 768 / 1280px; header 168 / 98 / 106px, bằng bản chính. Trang ở 360px dài hơn vì chữ dày hơn làm vài dòng xuống hàng. Không lỗi console.
- Bước 5: mở màn chờ trong trang nháp. Logo nạp được, biểu tượng 96 × 78px, vòm và chìa khóa vàng, khung cửa sáng, không lộ ô nền của ảnh. Không truyền `logoSrc` thì vẫn là mặt trời.
- `npx eslint` cho thư mục nháp: không lỗi. Chưa chạy `tsc` cho bản nháp (build chính sẽ kiểm tra khi chép).

## Giả định hoặc câu hỏi cho chủ dự án

- Bước 3 "đậm hơn 30%" chỉ đổi màu. Bước 4 làm cả màu và nét cho chữ con; chữ lớn (tiêu đề Taviraj 300, chữ thường 14px) vẫn nét cũ.
- Chữ phụ `#2f3530` giờ gần bằng chữ chính `#0f2b26` (11,3 so với 13,5), nên khác nhau chủ yếu ở sắc (xám và xanh) và cỡ chữ. Nếu thấy mất phân cấp, có thể bỏ phần màu của bước 4 và chỉ giữ nét 500.
- Tiêu đề nghiêng màu vàng giờ thành nâu đồng `#775830`, bớt "vàng" hơn trước; nếu muốn giữ ánh vàng có thể chỉ làm tối 15% cho riêng màu này.

- Màn chờ hiện ngay khi trang đang tải, mà ảnh logo nặng 113 KB, nên lần đầu có thể thấy chữ ROOMS trước rồi logo mới hiện. File biểu tượng riêng nhỏ (SVG) sẽ hết chuyện này.
- Màn hình hẹp dưới khoảng 330px, chữ ROOMS 60px trên màn chờ bị xuống dòng ("ROO / MS"). Lỗi này có từ trước, bản nháp chưa sửa.
- Biểu tượng header là ảnh cắt từ logo vuông nên ở cỡ nhỏ hơi mờ; muốn sắc nét cần file biểu tượng riêng (SVG hoặc PNG nền trong). Footer chưa có logo.
