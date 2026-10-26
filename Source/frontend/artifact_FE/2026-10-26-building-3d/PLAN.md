# Gara ngầm và bối cảnh quanh tòa · Implementation Plan

> **For agentic workers:** If delegated later, follow the draft rules in `CLAUDE.md`. This plan is for the existing idea draft and does not apply files to the main app.

**Goal:** Khi mở một trong ba tòa, có thêm các tòa lân cận làm bối cảnh và nút “Tầng hầm” cho thấy gara ngầm với lối xuống, ô đỗ và xe máy minh họa.

**Architecture:** Giữ mọi khối 3D trong `ref/building-scene.ts`. Bối cảnh thuộc nhóm `street` và không nhận raycast. Gara nằm dưới cao độ 0; chế độ tầng hầm ẩn các tầng trên cùng tấm đất che gara và đưa máy quay nhìn xuống. Nút nằm trong thanh chọn tầng hiện có ở `ref/Building3D.tsx`.

**Tech Stack:** React, TypeScript, Three.js đang cài. Không thêm gói.

**Spec:** `REVIEW.md` và lựa chọn của chủ dự án ngày 26/10/2026: gara dưới đất, các tòa quanh chỉ là bối cảnh, xem gara bằng nút “Tầng hầm”.

## Global Constraints

- Chỉ sửa bản nháp trong `Source/frontend/artifact_FE/2026-10-26-building-3d/`.
- Giữ cách chọn tòa, phòng, lọc tầng và góc nhìn bốn mặt hiện có; bối cảnh không thể bấm.
- Nội dung UI bằng tiếng Việt; dữ liệu gara và tòa xung quanh là minh họa, không giả là vị trí thật.

## Review Focus

- Tòa bối cảnh không che tòa đang xem hoặc cản chọn phòng.
- Chế độ tầng hầm lộ gara rõ, còn chế độ bình thường không thấy khối gara xuyên qua đất.
- Chuyển giữa “Tầng hầm”, tầng phòng và “Cả tòa” không giữ phòng đã chọn sai tầng.
- Bản xem 360 px không tràn ngang; bàn phím vẫn chọn được các nút tầng.

---

### Task 1: Dựng bối cảnh và gara

**Files:** Modify `ref/building-scene.ts`.

- [x] Thêm vài khối nhà lân cận thấp chi tiết, không nhận raycast, chỉ hiện khi mở một tòa.
- [x] Dựng sàn và tường gara dưới đất, lối dốc, vạch đỗ và xe máy minh họa; giữ trong nhóm riêng.
- [x] Khi lọc tầng 0, ẩn mặt đất và các tầng trên, hiện gara; khi thoát thì khôi phục và cập nhật bóng.

### Task 2: Thêm điều khiển

**Files:** Modify `ref/Building3D.tsx`.

- [x] Thêm nút “Tầng hầm” vào nhóm chọn tầng; bỏ chọn phòng khi chuyển vào hầm.
- [x] Sửa mô tả tầng 1 thành sảnh; ghi gara ngầm là phần minh họa.

### Task 3: Kiểm tra và ghi kết quả

**Files:** Modify `ref/test-3d.mjs`, `REVIEW.md` nếu cần.

- [x] Chạy TypeScript và ESLint trên bản nháp.
- [x] Kiểm tra trình duyệt bản rộng và 360 px: thấy gara, tòa bối cảnh; nút tầng, chọn tòa/phòng và bốn mặt vẫn hoạt động.
- [x] Ghi kết quả thật và giới hạn vào `REVIEW.md`; dừng ở bản nháp chờ chủ dự án duyệt.

### Task 4: Tăng chi tiết theo ảnh tham chiếu

**Files:** `ref/building-scene.ts`, `ref/test-3d.mjs`, `REVIEW.md`.

- [x] Tăng chi tiết mái, mặt kính, mép ban công, sân lát và cảnh quan cho cả ba tòa bằng hình học và vật liệu sẵn có.
- [x] Phóng gần góc nhìn từng tòa mà vẫn chọn được phòng, xem tầng và gara.
- [x] Kiểm tra lại TypeScript, lint, build, test kit, tương tác Chrome và bố cục 360 px.
