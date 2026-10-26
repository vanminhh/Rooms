# Ý tưởng: chọn phòng trên mô hình 3D tòa chung cư

Trạng thái: CHỜ DUYỆT (bản nháp ý tưởng đã cập nhật theo yêu cầu ngày 26/10/2026)
Task / spec: Bản nháp ý tưởng (chưa có task) · 30-frontend `/`, `/toa/:id`, `/phong/:id`; ROOM-05, BLD-04, VIEW-01, A-05 · KIT-01..08

## Xem và làm tiếp từ đây

Đã lưu ở đây, chưa chép vào file chính, chưa commit (git đang thấy cả thư mục là chưa theo dõi).

- **Mở lại:** trong `Source/frontend` chạy `npm run dev`, rồi mở `http://localhost:5173/artifact_FE/2026-10-26-building-3d/preview.html`.
- **Chạy lại kiểm tra:** `ref/test-3d.mjs` (cách chạy ở đầu file; cần dev server và Chrome). Script trước đó nằm ở thư mục tạm của phiên làm việc nên đã chép vào đây.
- **Đã có:** 3 tòa dựng theo 3 ảnh mẫu, trỏ và bấm tòa, trỏ và bấm phòng, lọc tầng, đường phố và 4 mặt tòa, bảng thông tin dùng chuyển động An Lâm. Khi vào một tòa còn có các tòa lân cận chỉ làm bối cảnh và nút “Tầng hầm” xem gara ngầm minh họa.
- **Lần 5:** cả 3 tòa đã được tăng chi tiết hình học theo ảnh chủ dự án gửi: mái và thiết bị, khung kính, mép ban công, bồn cây, vỉa hè lát gạch, đèn đường và người đi bộ minh họa. Góc máy nhìn tòa được đưa gần hơn; vẫn xoay, chọn phòng và xem gara.
- **Chưa làm / chờ chủ dự án:** trả lời các câu hỏi ở cuối file (mô hình đặt ở trang nào, vị trí phòng lấy từ đâu, API trạng thái mọi phòng, khối đơn giản hay mô hình thật, đường quanh tòa theo thực tế); sau đó mới viết spec rồi làm thật qua pipeline. Chưa thử điện thoại thật, Safari, trình đọc màn hình.
- **Hai mockup trang chủ cũ** (kính mờ, olive) đã bỏ theo yêu cầu, chỉ còn ở thư mục tạm của phiên làm việc, có thể mất.

## Làm gì, vì sao

Chủ dự án (26/10/2026): bỏ hai mockup trang chủ (kính mờ, olive), quay về bộ kit An Lâm, và thử ý tưởng **mô hình 3D: trỏ vào tòa chung cư, trỏ vào phòng, bấm phòng thì hiện thông tin**, với chuyển động khi bấm phòng giống An Lâm.

Hai mockup cũ đã được chuyển ra khỏi repo (vào thư mục tạm của phiên làm việc), không còn trong `artifact_FE/`.

Lần 2 (cùng ngày): chủ dự án gửi 3 ảnh phối cảnh chung cư mini và yêu cầu "dựng thử như ảnh". Mỗi tòa trong mô hình dựng theo một ảnh, vẫn bằng hình khối Three.js (không dùng file 3D có sẵn):

| Tòa | Theo ảnh | Mặt tiền |
|---|---|---|
| CG01 · Rooms Dịch Vọng | ảnh 1 | 4 trụ gạch trần (vân gạch vẽ bằng canvas) từ đất lên mái, chân trụ ốp đá; 3 ban công mỗi tầng, lan can xanh rêu, chậu cây; tầng trệt cổng xanh và sảnh để xe ốp gỗ; sân thượng trồng cây |
| DD01 · Rooms Láng Hạ | ảnh 2 | khung kem dày hai bên, cụm lam xanh đứng giữa các ban công; tầng trệt cổng vòm bo góc nhìn vào sảnh vàng, hai tấm lam gỗ hai bên |
| TH01 · Rooms Quảng An | ảnh 3 | 2 ban công mỗi tầng, mép sàn dày màu kem, tấm lam gỗ cạnh cửa kính, cây rủ; tầng trệt trụ ốp đá, lối để xe và cửa kính sảnh |

Chung ở lần dựng này: 5 tầng (tầng 1 sảnh, để xe; tầng 2–5 mỗi tầng một dãy phòng mặt trước có ban công và một dãy mặt sau có cửa sổ), cửa sổ ở hai mặt bên, cầu thang lên mái, vỉa hè và một dải đường phía trước, bóng nắng. Lần 4 bên dưới chuyển chỗ để xe minh họa xuống tầng hầm.

Lần 3 (cùng ngày): chủ dự án yêu cầu "khi bấm vào tòa nhà cần xem, thêm đường lớn để người xem hình dung 4 mặt tòa nhà". Khi vào một tòa, mô hình hiện khung cảnh đường phố quanh tòa đó (màn toàn cảnh 3 tòa vẫn giữ dải đường nhỏ):

- mặt trước: đường lớn 10 m có vạch giữa nét đứt, vạch biên, vạch qua đường trước sảnh, vỉa hè và hàng cây bên kia đường;
- ba mặt còn lại: ngõ 4 m bao quanh, để xoay hướng nào cũng có mốc;
- chữ sơn dưới đất: "MẶT TRƯỚC", "MẶT BÊN TRÁI", "MẶT SAU", "MẶT BÊN PHẢI" (đọc xuôi khi đứng nhìn mặt đó), "ĐƯỜNG LỚN", "NGÕ";
- 4 nút "Mặt trước / Bên trái / Mặt sau / Bên phải" đưa máy quay sang từng mặt (900 ms, tức thì khi giảm chuyển động); vẫn kéo để xoay tự do được. "Bên trái" là bên trái khi đứng ngoài đường nhìn vào mặt tiền.

Lần 4 (cùng ngày): chủ dự án yêu cầu thêm vài tòa xung quanh và gara dưới tầng. Đã chốt: **gara dưới mặt đất**, các tòa lân cận **chỉ là bối cảnh, không bấm chọn**, xem gara bằng nút **“Tầng hầm”**. Mỗi tòa có các khối nhà lân cận ở hai bên và phía sau đường, màu trầm hơn tòa chính; tòa nằm giữa vẫn nổi bật và các khối bối cảnh gần máy quay được ẩn khi xoay. Gara được vẽ dưới cao độ đất, có lối dốc, vạch đỗ và xe máy minh họa; nút “Tầng hầm” ẩn các tầng trên và tấm đất che gara để nhìn xuống. Khi thoát chế độ này, tòa và phòng hiện lại như trước. Đây là phối cảnh ý tưởng, không phải sơ đồ gara hay phố thực tế.

Lần 5 (cùng ngày): chủ dự án gửi ảnh phối cảnh isometric DD01 và muốn mô hình có chi tiết gần ảnh. Đã chốt **làm cả 3 tòa**, ưu tiên **tương tác mượt trên điện thoại**. Bản nháp dùng lại Three.js hiện có: tăng độ dày và viền sàn, thêm đố ngang và phản sáng ở kính, mái sân thượng có lan can, bờ mái, thiết bị và biển Rooms; mặt đất có hoa văn lát, bồn cây, cây có tán nhiều lớp, đèn và người nhỏ làm tỉ lệ. Góc máy khi xem tòa được đưa gần hơn. Không thay dữ liệu phòng hay kiến trúc giả định bằng ảnh mẫu.

Cách hoạt động:

1. **Toàn cảnh**: kéo để xoay. Trỏ chuột vào một tòa thì hiện khung viền vàng và "DD01 · Đống Đa · 7 phòng trống". Bấm để vào tòa, máy quay bay tới tòa đó (900 ms), các tòa khác ẩn đi.
2. **Trong tòa**: mỗi ô cửa là một phòng. Cửa kính sáng màu xanh là phòng trống, kính tối là phòng chưa trống. Trỏ vào phòng thì cửa sáng vàng, khối phòng phía sau mặt tiền hiện mờ lên kèm viền, và hiện "Phòng 501 · Trống · 30 m²". Lan can và cây không chặn việc trỏ. Hàng nút "Tầng n" mở nóc từ tầng đó trở lên, máy quay nhìn xuống mặt bằng tầng (phòng tô màu theo trạng thái). Nút "Cả tòa" để xem lại toàn bộ, "Tất cả tòa" để quay ra.
3. **Bấm phòng**: cửa phòng chuyển vàng, khối phòng hiện mờ màu xanh trầm viền vàng, máy quay đưa phòng vào giữa khung, bảng bên phải mở thông tin với chuyển động của An Lâm:
   - ảnh mở từ giữa ra bằng `clip-path: inset(18% … round 24px)` → toàn khung trong 1,3 s, ảnh đồng thời từ `scale(1.25)` về 1 trong 1,6 s (giống `clipReveals` trong `fx.js` của An Lâm);
   - tên phòng hiện từng chữ từ dưới lên, mỗi chữ cách nhau 22 ms, 0,9 s (giống `revealChars`);
   - trạng thái, diện tích, số người, nội thất, giá, ước tính mỗi tháng, nút "Đặt lịch xem phòng" hiện lần lượt từ dưới lên;
   - easing của An Lâm: `[0.22, 1, 0.36, 1]` và `[0.65, 0, 0.35, 1]`.
4. **Phòng chưa trống**: chỉ hiện "Chưa trống" và danh sách phòng trống cùng tòa để bấm sang, không hiện giá và ảnh (ROOM-05).
5. **Tầng hầm**: nút trong hàng chọn tầng đưa máy quay xuống lát cắt gara, bỏ chọn phòng đang xem; chọn “Cả tòa” hoặc một tầng phòng để quay lại. Không hiện chú thích màu phòng và nút bốn mặt khi xem gara.

Dưới mô hình có danh sách phòng theo tầng: dùng được bằng bàn phím và trình đọc màn hình, khi trỏ hoặc focus vào nút thì phòng tương ứng trên mô hình cũng sáng lên. Nếu máy không có WebGL, trang chỉ hiện các nút này.

Dùng lại từ kit: `RoomsHeader`, `SectionHeading`, `StatusBadge`, `RoomsButton`, `Reveal`, `useReducedMotion`, `formatMoney`, token màu và font, thư viện `three` và `motion` đã cài, ảnh trong `public/images/`. Không thêm dependency.

Không dùng pipeline: bản nháp ý tưởng để chủ dự án hình dung, chưa phải task.

## File sẽ thêm / sửa / xóa ở bản chính

| Bản nháp | Đích | Thêm / Sửa / Xóa |
|---|---|---|
| `preview.html`, `ref/*` | không có | Không chép |

Không chạy `apply-draft.mjs`. Nếu chốt ý tưởng: bổ sung spec (vị trí phòng, API trạng thái, trang đặt mô hình) rồi mới làm thật qua pipeline.

## Cách xem và kiểm tra

Trong `Source/frontend`: `npm run dev`, mở `http://localhost:5173/artifact_FE/2026-10-26-building-3d/preview.html`. Thử: kéo xoay, trỏ vào tòa, bấm vào tòa, trỏ và bấm vào phòng, nút “Tầng hầm”, trở lại “Cả tòa”, nút tầng, nút trong danh sách phòng, phím Tab và Enter.

Tòa, phòng, giá, trạng thái là dữ liệu minh họa sinh ngẫu nhiên có quy luật; ảnh phòng lặp lại 3 ảnh có sẵn (một ảnh Hà Nội, hai ảnh Đà Nẵng và Sài Gòn).

## Đã kiểm tra

26/10/2026, lần 5 (tăng chi tiết theo ảnh):

- TypeScript trên entry bản nháp, `npm run lint`, `npm run build`, `npm run test:components` (14/14): đạt. Build vẫn báo chunk Three.js > 500 kB như trước.
- Chrome headless WebGL: vào cả 3 tòa, trỏ/bấm phòng DD01, lọc tầng, xem gara, đổi bốn mặt, chọn tòa bằng bàn phím và chế độ giảm chuyển động đều hoạt động. Console không có lỗi/cảnh báo.
- Màn 360 px: không tràn ngang. Ảnh desktop đã xem cho cả 3 tòa; phần mái, kính, sân và cây hiển thị, tòa chính rõ hơn nhờ góc máy gần. Ảnh kiểm tra: `C:/Users/minha/.codex/visualizations/2026/10/26/01a17826-2583-7640-bf2a-98b71d1c2314/building-3d-detail-qa/`.

26/10/2026, lần 4 (gara ngầm và các tòa bối cảnh):

- TypeScript trên entry bản nháp, `npm run lint`, `npm run build`, `npm run test:components` (14/14): đạt. Cảnh báo bundle Three.js > 500 kB khi build đã có từ trước.
- Trình duyệt: mở tòa CG01/DD01 thấy tòa lân cận; bấm vào tòa bối cảnh không đổi phòng hoặc tòa. Bấm một ô cửa sáng trên mô hình vẫn mở đúng phòng 403.
- Nút “Tầng hầm” hiện lối dốc, vạch đỗ và xe máy; khi đang xem phòng 501 rồi mở hầm, phòng được bỏ chọn; trở lại “Cả tòa” hiện phòng như cũ. Console không có lỗi/cảnh báo.
- Màn 360 px: tổng thể và tầng hầm không tràn ngang; nút tầng hầm hoạt động và ẩn danh sách phòng khi xem gara.
- Ảnh kiểm tra: `C:/Users/minha/.codex/visualizations/2026/10/26/01a17826-2583-7640-bf2a-98b71d1c2314/building-3d-qa/garage-preview.png` và `neighborhood-preview.png`.

26/10/2026, lần 3 (đường phố quanh tòa):

- `tsc`, `eslint`: 0 lỗi; không có lỗi console.
- 1440 × 900: vào tòa CG01, chụp đủ 4 nút mặt: đường lớn, vạch qua đường, hàng cây, ngõ và chữ dưới đất đúng vị trí và đọc được; các bước trỏ, bấm phòng, lọc tầng, bàn phím vẫn chạy như trước.
- 360 × 780: không tràn ngang; hàng nút mặt xuống dòng riêng.
- Đã chỉnh: chữ dưới đất lúc đầu quá nhỏ, đã phóng to và đậm hơn. Chữ "NGÕ" trên nền ngõ xám vẫn hơi nhạt.

Lần 2 (mô hình theo 3 ảnh), cùng cách kiểm tra như lần 1:

- `tsc`, `eslint`: 0 lỗi; không có lỗi hay cảnh báo console (đã đổi `PCFSoftShadowMap` đã bị bỏ trong bản Three.js này sang `PCFShadowMap`).
- 1440 × 900: chụp toàn cảnh và cận cảnh từng tòa, khớp bố cục 3 ảnh; rê chuột tìm được tòa DD01 rồi phòng 501 qua lan can, bấm mở đúng thông tin; nút "Tầng 3" mở nóc, mặt bằng tầng 3 tô màu đúng; phòng chưa trống, bàn phím, giảm chuyển động vẫn chạy.
- 360 × 780: không tràn ngang.
- Đã sửa: khối phòng đang chọn lơ lửng phía trên mô hình khi chọn một tầng thấp hơn (nay ẩn và bỏ chọn phòng không thuộc tầng đó).

Lần 1:

Bảng trình duyệt trong app bị ẩn nên không vẽ khung hình; kiểm tra bằng Chrome headless với WebGL phần mềm (SwiftShader), chuột thật qua CDP (script tạm trong scratchpad):

- `tsc` (tsconfig tạm kế thừa `tsconfig.app.json`, đã xóa): 0 lỗi. `eslint artifact_FE/2026-10-26-building-3d`: 0 lỗi. Không có lỗi console.
- 1440 × 900: rê chuột tìm được tòa DD01 và hiện chú thích; bấm vào tòa thì bảng chuyển sang "Rooms Láng Hạ, 7 / 24 phòng trống"; rê và bấm phòng 501 trên mô hình thì bảng hiện đủ thông tin; chụp giữa chuyển cảnh thấy ảnh đang mở từ giữa ra.
- Nút "Tầng 3": chỉ còn tầng 3 trên mô hình và trong danh sách. Bấm phòng chưa trống thì hiện "Chưa trống" và 7 phòng trống cùng tòa.
- Bàn phím: Enter trên nút tòa trong bảng thì vào tòa CG01.
- `prefers-reduced-motion: reduce`: chọn phòng vẫn chạy; máy quay nhảy thẳng, ảnh và chữ chỉ mờ dần 200 ms.
- 360 × 780: không phần tử nào tràn ngang; mô hình ở trên, nút tầng cuộn ngang, danh sách phòng và bảng thông tin xếp dưới.
- Đã sửa trong lúc kiểm tra: ở 360 px hàng nút tầng làm cột rộng hơn màn hình; nền đất 3D tạo vệt chân trời màu vàng; chú thích nổi còn đứng lại sau khi bấm.
- Chưa kiểm tra: điện thoại thật (GPU thật, cảm ứng), Safari, trình đọc màn hình, cảm giác chuyển động khi xem trực tiếp.

## Giới hạn đã biết

- Trên điện thoại, kéo trên mô hình là xoay chứ không cuộn trang; đã tắt phóng to bằng con lăn để không chặn cuộn trang trên máy tính.
- Three.js là gói riêng khoảng 530 kB (133 kB nén), như `ImageJourney` của kit.
- Mô hình chỉ vẽ lại khi khung 3D đang hiện trên màn hình; bóng nắng chỉ tính lại khi đổi tòa hoặc tầng.
- Mỗi tòa vài trăm khối hình; chưa đo trên điện thoại yếu. Nếu chậm thì gộp các khối tĩnh hoặc tắt bóng trên mobile.
- Mặt tiền là hình khối đơn giản theo tinh thần ảnh, không phải bản vẽ kiến trúc; tỷ lệ phòng, ban công là ước lượng.
- Độ chi tiết vẫn là mô hình Three.js phong cách minh họa; chưa giống chất liệu, ánh sáng và hình học của ảnh phối cảnh dựng chuyên nghiệp. Để sát ảnh hơn cần file 3D `.glb` dựng riêng và tối ưu từng tòa.
- Gara, số xe và các tòa lân cận là mô hình minh họa. Lối dốc, địa giới và kết cấu không dựa trên bản vẽ hay địa chỉ thật; cần bản vẽ trước khi dùng để giới thiệu mặt bằng thực tế.

## Câu hỏi cho chủ dự án

1. **Đặt mô hình ở đâu:** trang chủ, trang Chi tiết tòa `/toa/:id`, hay cả trang quản lý `/ql/phong` (spec đã có "lưới tầng tô màu theo trạng thái"; bản quản lý có thể tô 4 trạng thái)?
2. **Vị trí phòng chưa có trong DB:** bảng `rooms` có `floor` và `code` nhưng không có vị trí trên tầng (hàng, cột), `buildings` chưa có số tầng. Cần thêm cột hoặc một mặt bằng cho mỗi tòa. Ai nhập dữ liệu này?
3. **Phòng chưa trống:** API công khai chỉ trả phòng trống (ROOM-05). Muốn vẽ cả tòa thì cần API trả trạng thái rút gọn (trống / chưa trống) của mọi phòng, không kèm giá hay người thuê. Có đồng ý hiện như vậy không?
4. **Mức chi tiết mô hình:** khối đơn giản sinh tự động từ dữ liệu (như bản này), hay mô hình thật của từng tòa (file 3D `.glb` dựng từ bản vẽ, đẹp hơn nhưng mỗi tòa cần làm riêng)?
6. **Đường quanh tòa** là minh họa chung (đường lớn phía trước, ngõ ba mặt). Có cần vẽ đúng thực tế từng tòa (tên đường, tòa sát vách, hướng Bắc) không? Nếu có, mỗi tòa cần thêm dữ liệu vị trí và hướng.
5. **3 tòa đặt cạnh nhau** chỉ là cách trình bày; thực tế các tòa ở các quận khác nhau. Giữ cách này, hay chọn tòa bằng danh sách/bản đồ rồi mới hiện mô hình một tòa?
