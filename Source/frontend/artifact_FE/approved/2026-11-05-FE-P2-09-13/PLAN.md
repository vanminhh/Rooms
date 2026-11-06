# PLAN · P2-8b · Frontend đơn giá, duyệt giá, lịch hẹn, việc hôm nay (FE-P2-09..13)

Thư mục nháp: `Source/frontend/artifact_FE/2026-11-05-FE-P2-09-13/` · mọi đường dẫn bên trong mirror `Source/frontend/`.
Gốc: `8bec6ab`, **nhưng mirror từ bản main HIỆN TẠI** (P2-8a đã chép vào main, chưa commit). Mọi file sửa phải được đọc từ `Source/frontend/src/...` hiện tại rồi sửa, không dựng lại từ đầu.

## 1. Mục tiêu và phạm vi

Trong phạm vi (task · spec):

| Task | Việc | Spec |
|---|---|---|
| FE-P2-09 | "Đề xuất giá" trên `/ql/phong`: dialog đề xuất giá phòng, nhãn "Quá hạn", "Đề xuất lại" | PRC-01, PRC-04, PRC-07, PRC-10, UI-04, UI-05, UI-09 |
| FE-P2-10 | `/ql/don-gia`: biểu giá điện/nước/dịch vụ của tòa (bậc thang), lịch sử, đề xuất, trạng thái đề xuất | RATE-01..03, RATE-05, PRC-01, PRC-04, PRC-07, PRC-10 |
| FE-P2-11 | `/ql/duyet-gia` (Boss): danh sách PENDING, cũ → mới + %, dialog duyệt kèm số tiền và cảnh báo PRC-08, từ chối kèm ghi chú, nhóm quá hạn riêng | PRC-03, PRC-07, PRC-08, PRC-09, PRC-12, RATE-01, UI-04, UI-06 |
| FE-P2-12 | `/ql/lich-hen`: lọc theo ngày, thêm thủ công, nút gọi/Zalo, đổi trạng thái theo VIEW-04, đổi ngày/khung giờ theo VIEW-09; `/ql` hiện 2 thẻ | VIEW-03, VIEW-04, VIEW-07..10, VIEW-13, NOTI-06, PRC-11 |
| FE-P2-13 | `npm run lint`, `npm run build`, `npm run test:components` đạt; kiểm tay sau khi áp dụng | – |

Ngoài phạm vi (không sửa, không tạo):

- `src/app/routes.tsx`, `src/layouts/StaffLayout.tsx`, `package.json`, `src/components/**` (khung và kit đã do P2-8a dựng: mọi route, mọi mục menu, `ConfirmDialog`, `ImageUploader`, glob `tests/p2/*.test.mjs` đã có trong `test:components`). Không thêm mảnh kit mới, không thêm gói mới.
- "Chốt" trên lịch hẹn (hợp đồng, Phase 3) · trang công khai và form lịch hẹn của khách (P2-9) · mọi thay đổi backend.
- Không tính tiền, không tính %, không suy ra nhãn trạng thái ở FE (UI-06): lấy `comparison.changePercent`, `comparison.label`, `expired`, `statusLabel`, `timeSlotLabel` từ API. Ngoại lệ duy nhất chủ dự án đã chốt (Q-FE8B-1 = A): FE **so sánh ngày** `effectiveFrom` với hôm nay để chia nhóm "Đang áp dụng" / "Sắp áp dụng" / "Lịch sử" — chỉ so ngày, không tính tiền, không tính %.

## 2. Kiến trúc

```
/ql  (StaffHomePage)            /ql/phong (RoomsPage, P2-8a)      /ql/don-gia (PricesPage)
  └ features/dashboard/api        └ features/rooms/RoomInspector     ├ features/pricing/RatePlanList
      GET /dashboard                  └ features/pricing/            └ features/pricing/RatePlanForm
      (2 thẻ: Lịch hẹn mới,               RoomPriceDialog                 POST /rate-plans
       Giá chờ duyệt – Boss)              POST /room-prices           GET /rate-plans?buildingId&kind
                                                                      GET /services?buildingId (tên dịch vụ)

/ql/duyet-gia (ApprovalsPage, Boss)        /ql/lich-hen (ViewingsPage)
  ├ features/pricing/ApprovalCard            ├ features/viewings/ViewingCard
  │   └ features/pricing/PriceComparison     │     PATCH /viewings/:id
  ├ GET /room-prices?status=PENDING          └ features/viewings/ViewingForm
  ├ GET /rate-plans?status=PENDING                 POST /viewings
  └ POST .../:id/approve · .../:id/reject    GET /viewings?buildingId&status&from&to

dùng lại: shared/api.ts (apiRequest, apiRequestPage, listPath, ApiError)
          shared/formatters.ts (formatMoney, formatDate) · shared/status-labels.ts
          shared/form-errors.ts · features/buildings/{api.buildingIdQuery, building-selection, fields}
          components: SectionHeading, RoomsButton, StatusBadge, TextField, Checkbox, FormError,
                      Spinner, ConfirmDialog · features/buildings/fields: SelectField, TextAreaField
```

Quy tắc chung mọi trang: TanStack Query cho đọc, `useMutation` + `invalidateQueries` sau khi ghi (UI-09); 4 trạng thái danh sách loading / rỗng / lỗi + "Thử lại" / dữ liệu (UI-03); `error.message` hiện ra, `error.fields` map vào input (UI-05); phạm vi tòa lấy từ `useBuildingSelection()`, gửi `buildingId` chỉ khi là số (`buildingIdQuery`), manager chưa chọn tòa → gọi API không kèm `buildingId` (Q-FE8A-4).

### 2.1 File thêm/sửa

| Đường dẫn đích (từ `Source/frontend/`) | Nháp (trong thư mục nháp) | Việc |
|---|---|---|
| `src/shared/api.ts` | như đích | **Sửa**: thêm tuỳ chọn `idempotencyKey?: string` cho `apiRequest` (một header `Idempotency-Key`), không đổi gì khác |
| `src/features/pricing/api.ts` | như đích | **Mới**: type + hàm gọi `/room-prices`, `/rate-plans` |
| `src/features/pricing/schemas.ts` | như đích | **Mới**: zod form đề xuất giá phòng và biểu giá (RATE-02) |
| `src/features/pricing/labels.ts` | như đích | **Mới**: nhãn loại biểu giá, chữ khoảng bậc, chữ % |
| `src/features/pricing/water-mode.ts` | như đích | **Mới** (CP-3, chốt 05/11/2026): hook `useBuildingWaterMode(buildingId)` đọc `waterMode` từ cache `GET /buildings`. Tách khỏi component vì luật `react-refresh/only-export-components` của eslint không cho file `.tsx` export cả component và hook/hằng; không thêm API, không thêm gói |
| `src/features/pricing/RoomPriceDialog.tsx` | như đích | **Mới**: dialog đề xuất / đề xuất lại giá phòng |
| `src/features/rooms/RoomInspector.tsx` | như đích | **Sửa** (file main do P2-8a dựng, bị sửa ở CP-2): thay `<Link to="/ql/don-gia">` bằng nút mở `RoomPriceDialog`; đổi chữ dòng đề xuất **quá hạn** sang "Đề xuất đã quá hạn. Cần đề xuất lại để duyệt." (§2.5) |
| `src/features/pricing/RatePlanForm.tsx` | như đích | **Mới**: form đề xuất biểu giá, nhập bậc thang |
| `src/features/pricing/RatePlanList.tsx` | như đích | **Mới**: danh sách biểu giá của tòa theo loại |
| `src/features/pricing/PriceComparison.tsx` | như đích | **Mới**: hiển thị `comparison` (một giá hoặc bảng bậc) |
| `src/features/pricing/ApprovalCard.tsx` | như đích | **Mới**: thẻ một đề xuất + duyệt/từ chối |
| `src/features/pricing/pricing.css` | như đích | **Mới**: lớp `pricing-*` dùng token của `rooms.css` |
| `src/features/viewings/api.ts` | như đích | **Mới**: type + hàm gọi `/viewings` |
| `src/features/viewings/schemas.ts` | như đích | **Mới**: zod form thêm lịch hẹn và đổi ngày/giờ |
| `src/features/viewings/ViewingForm.tsx` | như đích | **Mới**: form thêm lịch hẹn thủ công (VIEW-03) |
| `src/features/viewings/ViewingCard.tsx` | như đích | **Mới**: thẻ lịch hẹn + nút trạng thái theo VIEW-04 |
| `src/features/viewings/viewings.css` | như đích | **Mới**: lớp `viewings-*` |
| `src/features/dashboard/api.ts` | như đích | **Mới**: `getDashboard` |
| `src/pages/staff/PricesPage.tsx` | như đích | **Sửa** (thay nội dung placeholder) |
| `src/pages/staff/ApprovalsPage.tsx` | như đích | **Sửa** (thay nội dung placeholder) |
| `src/pages/staff/ViewingsPage.tsx` | như đích | **Sửa** (thay nội dung placeholder) |
| `src/pages/staff/StaffHomePage.tsx` | như đích | **Sửa**: thêm 2 thẻ, **giữ nguyên** `<SectionHeading>Việc hôm nay</SectionHeading>` và dòng `Xin chào, {user.fullName}` |
| `tests/p2/cp7-rooms.test.mjs` | như đích | **Sửa (tester)**: 2 test cuối đang assert link `/ql/don-gia`, phải đổi theo dialog của CP-2 |
| `tests/p2/fe09-room-price.test.mjs` … `fe12-dashboard.test.mjs` | như đích | **Mới (tester)**: xem §4 |

Không có file nào bị xóa.

### 2.2 Hợp đồng API (coder phải khớp đúng, không đổi tên trường)

Nguồn: `Source/backend/src/modules/pricing/pricing.types.ts`, `viewings.types.ts`, `notifications/dashboard.service.ts`, các DTO tương ứng. Tiền là số nguyên đồng; ngày nghiệp vụ `YYYY-MM-DD`; mốc thời gian ISO 8601.

> **⚠ Phụ thuộc backend (Q-FE8B-2 = C, chốt 05/11/2026; mở rộng cho `serviceName` ngày 05/11/2026).** `roomCode` + `buildingName` trong `RoomPriceView` và `buildingName` + `serviceName` trong `RatePlanView` **chưa có trên main**; một bản nháp backend riêng đang làm song song để thêm cả ba. Hệ quả bắt buộc:
> - FE dùng **đúng** tên trường `roomCode`, `buildingName`, `serviceName`. FE **không** được gọi `GET /rooms/:id`, `GET /buildings` hay `GET /services` để lấy tên thay thế, cũng không tự ghép chuỗi `"Phòng #{roomId}"`.
> - `serviceName: string | null`. Khi `null` dùng chữ dự phòng "Đơn giá dịch vụ · {buildingName}" (bỏ phần tên) — [ASSUMPTION FE8B-17].
> - Test FE của CP-1, CP-4 (và mọi CP dùng hai trường này) chạy bằng **mock** `fakeFetch`, nên **không bị chặn** bởi backend: tester cứ chạy và báo PASS/FAIL như thường.
> - Chỉ phần **kiểm API thật / e2e / kiểm tay trên trình duyệt** phải chờ bản nháp backend được duyệt và áp dụng vào main. CP-8 ghi rõ việc này là "chờ backend", không phải FAIL của FE.
> - `ViewingView` đã có `roomCode`/`buildingName` trên main rồi (`viewings.types.ts`), nên CP-5/CP-6 không phụ thuộc gì.

**Đơn vị đơn giá nước (Q-FE8B-3 = A, chốt 05/11/2026).** Lấy `waterMode` từ `GET /buildings` đã có (`BuildingView.waterMode: 'PER_M3' | 'PER_PERSON'`, dùng lại `src/features/buildings/api.ts`); **không thêm API, không thêm trường backend**. Nhãn: `PER_M3` → `"đ/m³"`, `PER_PERSON` → `"đ/người/kỳ"`. Hàm `waterUnitLabel(waterMode)` nằm trong `src/features/pricing/labels.ts` (CP-1). Chỉ là tra bảng nhãn, không phải tính nghiệp vụ (UI-06).

`src/features/pricing/api.ts`:

```ts
export type RateKind = 'ELECTRIC' | 'WATER' | 'SERVICE'
// shared/status-labels.ts đã có ApprovalStatus

export interface PriceChange { oldValue: number | null; newValue: number; changePercent: number | null; label: string | null }
export interface TierChange { tierNo: number; oldValue: number; newValue: number; changePercent: number | null }
export interface RateTierView { tierNo: number; upTo: number | null; unitPrice: number }
export interface TierComparison { oldTiers: RateTierView[] | null; newTiers: RateTierView[]; tierChanges: TierChange[] | null; label: string | null }
export type RatePlanComparison = PriceChange | TierComparison
export function isTierComparison(c: RatePlanComparison): c is TierComparison  // 'newTiers' in c

export interface RoomPriceView {
  id: number; roomId: number; roomCode: string; buildingId: number; buildingName: string
  price: number; effectiveFrom: string
  status: ApprovalStatus; reason: string | null; proposedById: number; reviewedById: number | null
  reviewedAt: string | null; reviewNote: string | null; createdAt: string
  expired: boolean; comparison: PriceChange
}
export interface RatePlanView {
  id: number; buildingId: number; buildingName: string
  kind: RateKind; serviceId: number | null; serviceName: string | null; effectiveFrom: string
  status: ApprovalStatus; reason: string | null; proposedById: number; reviewedById: number | null
  reviewedAt: string | null; reviewNote: string | null; createdAt: string
  expired: boolean; tiers: RateTierView[]; comparison: RatePlanComparison | null
}

export function listRoomPrices(q: { buildingId?: BuildingSelection; roomId?: number; status?: ApprovalStatus; page?: number; limit?: number; sort?: 'createdAt' | '-createdAt' }): Promise<ListPage<RoomPriceView>>
export function listRatePlans(q: { buildingId?: BuildingSelection; kind?: RateKind; status?: ApprovalStatus; page?: number; limit?: number; sort?: 'createdAt' | '-createdAt' }): Promise<ListPage<RatePlanView>>
export function proposeRoomPrice(input: { roomId: number; price: number; effectiveFrom: string; reason?: string }, idempotencyKey: string): Promise<RoomPriceView>
export function proposeRatePlan(input: { buildingId: number; kind: RateKind; serviceId?: number; effectiveFrom: string; reason?: string; tiers: RateTierView[] }, idempotencyKey: string): Promise<RatePlanView>
export function approveRoomPrice(id: number, idempotencyKey: string): Promise<RoomPriceView>
export function rejectRoomPrice(id: number, reviewNote: string, idempotencyKey: string): Promise<RoomPriceView>
export function approveRatePlan(id: number, idempotencyKey: string): Promise<RatePlanView>
export function rejectRatePlan(id: number, reviewNote: string, idempotencyKey: string): Promise<RatePlanView>
export function newIdempotencyKey(): string   // crypto.randomUUID?.() ?? fallback, xem luật khóa dưới
```

Lỗi phải xử lý: `VALIDATION_FAILED` 400 (`fields.effectiveFrom`, `fields.tiers`, `fields.serviceId`, `fields.idempotencyKey`) → map vào input; `OUT_OF_SCOPE` 403 (manager đề xuất cho tòa/phòng khóa hoặc ngoài phạm vi, Q-P5-7); `NOT_FOUND` 404; `CONFLICT_STATE` 409 (đề xuất đã rời PENDING, hoặc trùng `Idempotency-Key` khác payload); `PRICE_PROPOSAL_EXPIRED` 409 (duyệt đề xuất quá hạn). Mọi lỗi hiện `error.message` của API, không viết lại chữ.

`src/features/viewings/api.ts`:

```ts
export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING'
export type ViewingStatus = 'NEW' | 'CONFIRMED' | 'WON' | 'LOST' | 'CANCELLED'   // đã có trong shared/status-labels.ts
export interface ViewingView {
  id: number; roomId: number; roomCode: string; buildingId: number; buildingName: string
  guestName: string; guestPhone: string; visitDate: string; timeSlot: TimeSlot; timeSlotLabel: string
  note: string | null; source: 'WEB' | 'MANUAL'; status: ViewingStatus; statusLabel: string
  handledById: number | null; outcomeNote: string | null; createdAt: string; updatedAt: string
}
export function listViewings(q: { buildingId?: BuildingSelection; status?: ViewingStatus; from?: string; to?: string; page?: number; limit?: number }): Promise<ListPage<ViewingView>>
export function createViewing(input: { roomId: number; guestName: string; guestPhone: string; visitDate: string; timeSlot: TimeSlot; note?: string }): Promise<ViewingView>
export function updateViewing(id: number, input: { status?: ViewingStatus; outcomeNote?: string; visitDate?: string; timeSlot?: TimeSlot; note?: string }): Promise<ViewingView>
```

`src/features/dashboard/api.ts`:

```ts
export interface DashboardView {
  newViewings: { count: number; items: ViewingView[] }          // tối đa 5 item
  pendingPrices: { count: number; rooms: number; ratePlans: number } | null   // null với manager
}
export function getDashboard(buildingId?: BuildingSelection): Promise<DashboardView>   // GET /dashboard, không phân trang
```

`src/shared/api.ts` – sửa duy nhất một chỗ: `apiRequest(path, { method, body, idempotencyKey })` thêm header `Idempotency-Key` khi có.

**Luật khóa (chốt 05/11/2026, xem [ASSUMPTION FE8B-11]): MỘT khóa cho MỘT payload**, không phải một khóa cho mỗi lần mở dialog/form. Cùng payload (double click, bấm lại y nguyên) → **cùng** khóa, nên lần hai phát lại kết quả lần một. Payload đổi (sửa giá, ngày, lý do, bậc thang) → **khóa mới**, vì API-05 / Q-P5-6 (B) trả 409 `CONFLICT_STATE` khi cùng khóa nhưng khác payload. Cách làm: giữ `useRef<{ payloadKey: string; key: string } | null>`, `payloadKey = JSON.stringify(payload)` đã chuẩn hóa (thứ tự trường cố định), khác thì sinh khóa mới bằng `crypto.randomUUID?.() ?? <chuỗi ngẫu nhiên tự sinh>` ([ASSUMPTION FE8B-14]: `crypto.randomUUID` chỉ có trong secure context; fallback ghép chuỗi từ `crypto.getRandomValues`, nếu cũng thiếu thì `Math.random` + `Date.now`. Khóa chỉ cần đủ duy nhất cho idempotency, không dùng cho bảo mật). Với `approve` / `reject` payload là `(id, reviewNote)`. Khóa sống 24h theo `(actor, route, key)`.

### 2.3 Props các thành phần

```ts
RoomPriceDialog({ room, onClose }: { room: RoomGridItem; onClose(): void })
  // room.pendingProposal (id, effectiveFrom, expired) đã có từ GET /rooms; prefill price = room.price ?? ''
  // dialog dùng trực tiếp class kit `rooms-dialog` (+ role="dialog") trong markup của chính nó,
  // KHÔNG đi qua ConfirmDialog (đây là form nhiều trường, không phải xác nhận có/không).
  // Không thêm mảnh kit mới. ConfirmDialog vẫn dùng ở CP-4 cho hành động duyệt.
RatePlanList({ buildingId }: { buildingId: number })
RatePlanForm({ buildingId, kind, serviceId, services, prefillTiers, onSaved, onCancel }: {
  buildingId: number; kind: RateKind; serviceId?: number; services: ServiceView[]
  prefillTiers?: RateTierView[]; onSaved(): void; onCancel(): void })
PriceComparison({ comparison, kind }: { comparison: PriceChange | RatePlanComparison; kind?: RateKind })
ApprovalCard({ item, onDone }: { item: ApprovalItem; onDone(): void })
  // ApprovalItem = { type: 'room'; row: RoomPriceView } | { type: 'rate'; row: RatePlanView }
ViewingForm({ buildingId, onSaved, onCancel }: { buildingId: number; onSaved(): void; onCancel(): void })
ViewingCard({ viewing }: { viewing: ViewingView })
```

Luật nút trạng thái trong `ViewingCard` (VIEW-04, bảng cứng, không suy diễn):

| Trạng thái hiện tại | Nút hiện ra |
|---|---|
| `NEW` | "Xác nhận" (→ CONFIRMED) · "Hủy lịch" (→ CANCELLED) · "Đổi ngày/giờ" |
| `CONFIRMED` | "Không thành" (→ LOST, **bắt buộc** ghi chú kết quả) · "Hủy lịch" (→ CANCELLED, ghi chú không bắt buộc) · "Đổi ngày/giờ" |
| `WON`, `LOST`, `CANCELLED` | không nút nào |

Không bao giờ gửi `status: 'WON'` (VIEW-04). Không render nút "Chốt" ở phase này.

### 2.4 Quy tắc form (zod mirror DTO backend)

- `roomPriceFormSchema`: `price` nguyên, 1..2147483647; `effectiveFrom` `YYYY-MM-DD`, ≥ hôm nay; `reason` tuỳ chọn.
- `ratePlanFormSchema`: `effectiveFrom` như trên; `tiers` ≥ 1 bậc, `tierNo` liên tục từ 1 theo đúng thứ tự mảng, `upTo` tăng dần, chỉ bậc cuối `upTo = null`, `unitPrice` ≥ 0; WATER và SERVICE đúng 1 bậc `upTo = null`; SERVICE phải có `serviceId`, loại khác không được có. Chữ lỗi lấy đúng như backend (`ratePlanFieldErrors`) để hai bên không lệch nhau.
- `viewingFormSchema`: `roomId` nguyên ≥ 1; `guestName` 2..100; `guestPhone` `/^0[0-9]{9}$/`; `visitDate` từ hôm nay đến hôm nay + 30 ngày; `timeSlot` trong 3 giá trị; `note` ≤ 500. Khung giờ hôm nay đã bắt đầu thì **BE** từ chối (`fields.timeSlot`) – FE chỉ hiện thông báo đó, không tự tính giờ.
- Ngày "hôm nay" cho giới hạn input lấy bằng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })` (một helper nhỏ trong `src/features/pricing/labels.ts`, dùng lại cho viewings) — chỉ để đặt `min`/`max`, luật thật vẫn ở BE.

### 2.5 Chữ giao diện mới (tiếng Việt)

Lấy lại nguyên văn từ mockup P2-7 khi có; phần còn lại là chữ mới, chủ dự án xem lại khi duyệt bản nháp.

Trang Duyệt giá (mockup P2-7): "Duyệt giá" · "Đối chiếu trước khi giá mới có hiệu lực." · "{n} đề xuất chờ duyệt" · "Đề xuất quá hạn" · "Không thể duyệt khi ngày áp dụng đã qua. Bạn vẫn có thể từ chối kèm ghi chú." · "Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt." · "Hiện tại" / "Đề xuất" / "Giá mới" · "Áp dụng từ {ngày}" · "Từ chối" · "Duyệt giá" · "Đơn giá điện theo bậc (đ/kWh)" · "Bậc" · "Thay đổi" · "Khác số bậc: hiển thị hai bảng, không so sánh phần trăm." · "Hiện tại · {n} bậc" / "Đề xuất · {n} bậc" · "0–50 kWh" / "Từ {n} kWh".

Chữ mới của P2-8b:
- Đề xuất giá phòng: "Đề xuất giá phòng {code}" · "Đề xuất lại giá phòng {code}" · "Giá mới (đ/tháng)" · "Áp dụng từ ngày" · "Lý do (tuỳ chọn)" · "Gửi đề xuất" · "Đóng" · "Đề xuất của bạn sẽ chờ chủ nhà duyệt." (manager) · "Bạn là chủ nhà: đề xuất được duyệt ngay." (Boss, PRC-04) · "Đề xuất đang chờ duyệt cho phòng này sẽ được thay thế." (PRC-02).
- `RoomInspector` (chốt 05/11/2026, làm ở CP-2): khi đề xuất **quá hạn** dòng mô tả ghi **"Đề xuất đã quá hạn. Cần đề xuất lại để duyệt."** (không chứa cụm "Đề xuất giá"). Chữ cũ "Đề xuất giá áp dụng từ {ngày}. Cần đề xuất lại để duyệt." **bị bỏ**. Trường hợp chưa quá hạn giữ nguyên chữ hiện có "Đề xuất giá áp dụng từ {ngày}.". Nhãn thẻ trạng thái "Đề xuất giá: Quá hạn" trên thẻ phòng **giữ nguyên** (test `cp7-rooms.test.mjs` đang assert).
- `/ql/don-gia`: "Đơn giá" · "Điện" · "Nước" · "Dịch vụ · {tên}" · "Đề xuất đơn giá" · "Bậc {n}" · "Cận trên (kWh)" · "Đơn giá (đ)" · "Bậc cuối không giới hạn" · "Thêm bậc" · "Xóa bậc" · "Lịch sử đơn giá" · "Sắp áp dụng" · "Đang áp dụng" · "Chưa có biểu giá nào cho tòa này" · "Chọn một tòa ở thanh chọn tòa để xem và đề xuất đơn giá."
- Đơn vị nước (Q-FE8B-3): "đ/m³" (`PER_M3`) · "đ/người/kỳ" (`PER_PERSON`) · "Đơn giá nước (đ/m³)" / "Đơn giá nước (đ/người/kỳ)" trên nhãn input.
- **Chữ chờ/đang gửi: dùng duy nhất "Đang xử lý"** (chốt 05/11/2026). Chữ "Đang tải …" bị bỏ ở mọi nơi, kể cả "Đang tải đơn giá" ở `RatePlanList` và chữ chờ trong `RoomPriceDialog`; dùng chữ "Đang xử lý" có sẵn của kit (Spinner / nút đang gửi). Áp dụng cho `RatePlanList` (CP-3), `RoomPriceDialog` (CP-2) và mọi trang của P2-8b. Coder CP-4 sửa hai chỗ đó; tester CP-4 sửa assert liên quan trong test CP-3 (`tests/p2/fe10-rate-plans.test.mjs`): "Đang tải đơn giá" → "Đang xử lý", không sửa gì khác trong file.
- **Form biểu giá KHÔNG có chữ giải thích PRC-04** (chốt 05/11/2026): không hiện "Bạn là chủ nhà: đề xuất được duyệt ngay." / "Đề xuất của bạn sẽ chờ chủ nhà duyệt." trên `RatePlanForm`. Lý do: PRC-04 với biểu giá đã ngầm thể hiện qua `statusLabel` của bản vừa gửi ("Đã duyệt" với Boss, "Chờ duyệt" với manager), và §2.5 chưa có chữ chính thức cho trường hợp này. Hai câu đó chỉ dùng ở `RoomPriceDialog` (CP-2). CP-4 cũng **không** thêm.
- Chữ bậc giá không hợp lệ: ô bậc trống hoặc sai dùng đúng hằng `TIER_MESSAGE` = "Bậc giá không hợp lệ" của `src/features/pricing/schemas.ts`; ô cận trên trống của bậc không phải bậc cuối gửi `null` nên schema báo "Bậc trước bậc cuối phải có cận trên".
- `/ql/duyet-gia` (Q-FE8B-2): "Giá phòng {roomCode} · {buildingName}" · "Đơn giá điện · {buildingName}" · "Đơn giá nước · {buildingName}" · "Đơn giá dịch vụ {serviceName} · {buildingName}"; khi `serviceName === null` dùng "Đơn giá dịch vụ · {buildingName}" (bỏ phần tên, không ghép `"#{serviceId}"`) — [ASSUMPTION FE8B-17].
- `/ql/duyet-gia`, chữ mới chốt 05/11/2026:
  - Nhãn đơn giá nước trên thẻ duyệt: **"Đơn giá nước (đ/m³)"** hoặc **"Đơn giá nước (đ/người/kỳ)"** theo `waterMode` của tòa, lấy qua hook `useBuildingWaterMode` (`src/features/pricing/water-mode.ts`, CP-3) + `waterUnitLabel` (Q-FE8B-3). Chưa có dữ liệu tòa → "Đơn giá nước (đ)".
  - Trạng thái rỗng của trang: **"Chưa có đề xuất nào chờ duyệt"**.
  - Nhãn ô ghi chú từ chối: **"Lý do từ chối"** (nguyên văn mockup P2-7). Lỗi khi để trống: **"Vui lòng nhập lý do từ chối"**.
  - Lý do (`reason`) của người đề xuất hiện **dưới thẻ, không có nhãn** (chỉ chữ của `reason`, bỏ qua khi `null`).
  - `comparison === null` với biểu giá: hiện **bậc đề xuất** (`tiers` của bản đó) dưới nhãn **"Giá mới"**, **không** có dòng giải thích thêm.
  - Chữ mockup P2-7 dùng nguyên văn: "Duyệt giá mới?" · "Từ chối đề xuất?" · "Xác nhận duyệt" · "Xác nhận từ chối" · "Quay lại" · "Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt." · "Giá mới" (khi không có giá cũ).
  - Nhãn đếm: **"{n} đề xuất chờ duyệt (chỉ còn hạn)"**, `n` đếm các đề xuất **còn hạn trên trang đang xem** (chỉ trang 1, 20 bản mỗi loại, **không có nút phân trang**) — [ASSUMPTION FE8B-16].
  - **PRC-08 (chốt 05/11/2026)**: hộp xác nhận duyệt **luôn** hiện câu chung **"Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực."**, không phụ thuộc dữ liệu. FE **không** gọi thêm API và **không** suy ra có hay không bản bị thay thế; backend không đổi. Câu này đứng cạnh số tiền của UI-04 trong cùng `ConfirmDialog`.
- `/ql/lich-hen`: "Lịch hẹn" · "Từ ngày" · "Đến ngày" · "Từ ngày phải trước hoặc bằng Đến ngày" · "Trạng thái" · "Tất cả trạng thái" · "Thêm lịch hẹn" · "Khách gọi điện hoặc nhắn tin thì thêm ở đây." · "Họ tên khách" · "Số điện thoại" · "Phòng" · "Ngày xem" · "Khung giờ" · "Ghi chú" · "Gọi" · "Zalo" · "Xác nhận" · "Hủy lịch" · "Không thành" · "Đổi ngày/giờ" · "Ghi chú kết quả" · "Lưu" · "Chưa có lịch hẹn nào trong khoảng ngày này" · "Nguồn: khách tự đặt" / "Nguồn: nhân viên thêm".
- Chữ lỗi ô ngày hiệu lực khi **trống**: "Vui lòng chọn ngày hiệu lực" (chốt 05/11/2026). Khi ô có chữ nhưng **sai định dạng** vẫn giữ chữ schema cũ "Ngày hiệu lực phải có dạng YYYY-MM-DD"; khi ngày trước hôm nay vẫn giữ chữ cũ. Việc đổi chữ này nằm trong **CP-2** (CP-1 đã PASS): coder CP-2 sửa đúng một chỗ trong `src/features/pricing/schemas.ts`; tester CP-2 chạy lại `tests/p2/fe09-pricing-api.test.mjs` của CP-1 để xác nhận không vỡ, và nếu test đó đang assert chữ cũ cho trường hợp ô trống thì tester CP-2 được sửa đúng assert đó (không sửa gì khác trong file) và ghi vào báo cáo.
- `/ql`: "Lịch hẹn mới" · "{n} lịch hẹn mới" · "Xem tất cả lịch hẹn" · "Giá chờ duyệt" · "{n} đề xuất chờ duyệt ({a} giá phòng, {b} đơn giá)" · "Sang trang duyệt giá" · "Chưa có việc nào hôm nay".
- Giữ nguyên: "Việc hôm nay", "Xin chào, {fullName}" (test `auth-login-flow.test.mjs` đang assert hai chữ này).

## 3. Quyết định của chủ dự án · câu hỏi bỏ ngỏ

**Không còn câu hỏi bỏ ngỏ nào.** Chủ dự án đã trả lời cả 5 câu ngày 05/11/2026 (ghi trong `docs/phase-2-rooms/feature_p2-8b-frontend-pricing-viewings.md`, mục "Questions for the owner"). CP-3, CP-4, CP-6 **không còn bị chặn**.

**Q-FE8B-1 = A — nhóm "Đang áp dụng" / "Sắp áp dụng" trên `/ql/don-gia`.** FE chia nhóm bằng **so sánh ngày** `effectiveFrom` với hôm nay theo `Asia/Ho_Chi_Minh` (`todayHanoi()`, so sánh chuỗi `YYYY-MM-DD`), **không tính tiền, không tính %, không suy ra trạng thái duyệt**:

| Nhóm | Điều kiện | Sắp xếp / chọn |
|---|---|---|
| "Đang áp dụng" | `status === 'APPROVED'` và `effectiveFrom <= todayHanoi()` | lấy **đúng một** bản có `effectiveFrom` lớn nhất trong nhóm; nếu trùng ngày thì `id` lớn nhất |
| "Sắp áp dụng" | `status === 'APPROVED'` và `effectiveFrom > todayHanoi()` | `effectiveFrom` tăng dần |
| "Lịch sử đơn giá" | mọi bản còn lại (APPROVED cũ hơn bản đang áp dụng, PENDING, REJECTED) | `effectiveFrom` giảm dần, kèm `statusLabel` và cờ `expired` |

Không có biểu giá APPROVED nào `<= hôm nay` → nhóm "Đang áp dụng" không render (không hiện ô rỗng). Việc nhóm này nằm trong một hàm thuần `groupRatePlans(rows, today)` ở `src/features/pricing/labels.ts` (CP-1) để test được trực tiếp.

**Q-FE8B-2 = C — `roomCode` / `buildingName` do backend trả.** Xem khối "⚠ Phụ thuộc backend" ở §2.2: FE dùng đúng hai tên trường đó, cấm gọi `GET /rooms/:id` hay `GET /buildings` để lấy tên thay thế; test FE dùng mock nên không bị chặn, chỉ kiểm API thật/e2e phải chờ nháp backend được áp dụng.

**Q-FE8B-3 = A — đơn vị đơn giá nước đọc `waterMode` từ `GET /buildings`**, không thêm API. Chi tiết nhãn ở §2.2.

**Q-FE8B-4 = A — nút liên hệ trên `/ql/lich-hen`.**
- "Gọi": `<a href="tel:{guestPhone}">` (cùng tab, không `target`).
- "Zalo": `<a href="https://zalo.me/{guestPhone}" target="_blank" rel="noopener noreferrer">` — **bắt buộc đủ cả `noopener` và `noreferrer`**.
- Số dùng nguyên văn `guestPhone` của API (dạng `0xxxxxxxxx`), không chuẩn hóa sang `+84`. Hai nút là `RoomsButton` dạng link của kit (hoặc `<a>` mang class kit), không dùng `window.open`.

**Q-FE8B-5 = A — khoảng ngày mặc định của `/ql/lich-hen`**: `from = todayHanoi()`, `to = todayHanoi() + 30 ngày` (khớp khung VIEW-08). Hai input ngày cho phép đổi tự do; đổi xong refetch với `from`/`to` mới. `from > to` → FE hiện lỗi cạnh input, không gọi API.

### [ASSUMPTION] đã dùng trong plan

- **[ASSUMPTION P5-1]** (đã được duyệt) hình dạng `comparison` / `expired` / nhãn "Giá mới" của backend là hợp đồng chính thức cho FE.
- **[ASSUMPTION FE8B-1]** `/ql/don-gia` chỉ làm biểu giá điện/nước/dịch vụ (`/rate-plans`); đề xuất giá phòng nằm hoàn toàn trên `/ql/phong` (FE-P2-09), đúng như spec 30 dòng `/ql/don-gia` ghi `RATE`.
- **[ASSUMPTION FE8B-2]** `/ql/duyet-gia` tải PENDING bằng hai lời gọi `status=PENDING` (`/room-prices` và `/rate-plans`), trộn lại trong FE rồi tách nhóm "còn hạn" / "quá hạn" theo cờ `expired` của API; phân trang 20 mỗi loại.
- **[ASSUMPTION FE8B-3]** FE gửi `Idempotency-Key` cho mọi POST đề xuất / duyệt / từ chối; API-05 nói API "accept" header này, không bắt buộc, nhưng nhờ nó cú bấm đôi không sinh đề xuất thứ hai. Phạm vi khóa theo [ASSUMPTION FE8B-11] (một khóa cho một payload), **không** phải một khóa cho mỗi lần mở dialog/form.
- **[ASSUMPTION FE8B-4]** Không render nút "Chốt" (kể cả dạng disabled) ở phase này.
- **[ASSUMPTION FE8B-5]** Trên `/ql/don-gia`, manager chưa chọn tòa (`null`) hoặc Boss đang chọn "Tất cả tòa" thì không đề xuất được (cần đúng một `buildingId`); trang hiện gợi ý "Chọn một tòa ở thanh chọn tòa…", giống `RoomsPage`.
- **[ASSUMPTION FE8B-6]** Thẻ "Giá chờ duyệt" chỉ render khi `pendingPrices !== null` (API trả `null` cho manager), không dựa vào `user.role` ở FE.
- **[ASSUMPTION FE8B-7]** (chi tiết của Q-FE8B-1 = A) Khi hai biểu giá APPROVED trùng `effectiveFrom`, "Đang áp dụng" lấy bản có `id` lớn hơn; không có bản APPROVED nào `<= hôm nay` thì nhóm "Đang áp dụng" không render.
- **[ASSUMPTION FE8B-8]** (chi tiết của Q-FE8B-5 = A) `from > to` được FE chặn tại input (chữ "Từ ngày phải trước hoặc bằng Đến ngày"), không gửi request; spec không nói BE xử lý thế nào.
- **[ASSUMPTION FE8B-9]** (chi tiết của Q-FE8B-4 = A) Số điện thoại gửi vào `tel:` và `https://zalo.me/` giữ nguyên dạng `0xxxxxxxxx` của API, không đổi sang `+84`.
- **[ASSUMPTION FE8B-10]** `waterMode` của tòa đang chọn lấy từ lời gọi `GET /buildings` mà `useBuildingSelection()` / `features/buildings/api.ts` đã nạp sẵn (cache TanStack Query), không thêm lời gọi mới. Nếu chưa có dữ liệu tòa, nhãn tạm là `"đ"` tới khi có `waterMode`. (Chốt 05/11/2026) `water-mode.ts` đọc **danh sách `GET /buildings` đã cache** đúng như CP-3, và **chỉ gọi khi cache chưa có danh sách**; **không** gọi `GET /buildings?buildingId=…` theo từng tòa.
- **[ASSUMPTION FE8B-11]** (chốt 05/11/2026 sau báo cáo coder CP-2) `Idempotency-Key` gắn với **payload**, không với vòng đời dialog: cùng payload dùng lại cùng khóa (double click an toàn), payload đổi thì sinh khóa mới. Lý do: API-05 / Q-P5-6 (B) coi "cùng khóa, khác payload" là 409 `CONFLICT_STATE`, nên một khóa cố định cho cả dialog sẽ chặn người dùng sửa giá rồi gửi lại. Áp dụng cho `proposeRoomPrice`, `proposeRatePlan`, `approve*`, `reject*`.
- **[ASSUMPTION FE8B-12]** (chốt 05/11/2026) Khi nút là "Đề xuất lại" (`room.pendingProposal.expired === true`), `RoomPriceDialog` được gọi **đúng một** `GET /room-prices?roomId=<id>&status=PENDING&page=1&limit=1&sort=-createdAt` (`retry: false`) để prefill `price` và `reason` của đề xuất cũ theo `pendingProposal.id`. Chỉ gọi khi `expired === true`; lỗi, rỗng hoặc không thấy đúng id → prefill `room.price` và `reason` rỗng, không hiện lỗi. `GET /rooms` không trả `price`/`reason` của đề xuất nên không có cách khác; lời gọi này là ngoại lệ hẹp của luật "không thêm lời gọi API" (nó không dùng để lấy tên `roomCode`/`buildingName`, xem Q-FE8B-2).
- **[ASSUMPTION FE8B-14]** (chốt 05/11/2026) `crypto.randomUUID` chỉ tồn tại trong secure context, nên khóa idempotency sinh bằng `crypto.randomUUID?.() ?? <chuỗi ngẫu nhiên từ crypto.getRandomValues, hoặc Math.random + Date.now nếu thiếu>`, gói trong `newIdempotencyKey()` (`src/features/pricing/api.ts`, thêm ở CP-2, dùng lại ở CP-3/CP-4). Khóa chỉ cần đủ duy nhất cho idempotency, **không** dùng cho mục đích bảo mật nên fallback không cần tính ngẫu nhiên mật mã.
- **[ASSUMPTION FE8B-15]** (chốt 05/11/2026 sau báo cáo coder CP-3) `RatePlanForm` mở sẵn với các bậc của **biểu giá đang áp dụng** của đúng loại đó (`prefillTiers` = `tiers` của bản trong nhóm "Đang áp dụng" theo `groupRatePlans`, do `RatePlanSection` truyền xuống). Không có bản đang áp dụng → form trống (một bậc rỗng, bậc cuối `upTo = null`). Chỉ là giá trị khởi tạo, người đề xuất sửa và xem lại trước khi gửi; không phải tính nghiệp vụ (UI-06).
- **[ASSUMPTION FE8B-16]** (chốt 05/11/2026) Trên `/ql/duyet-gia`, nhãn **"{n} đề xuất chờ duyệt (chỉ còn hạn)"** đếm trên **trang đang xem**, không phải tổng toàn hệ thống: FE tải 20 bản mỗi loại (`/room-prices` và `/rate-plans`, `status=PENDING`, `page=1`, `limit=20`) rồi đếm các bản `expired === false`. **Chỉ có trang 1, không render nút phân trang** (chốt 05/11/2026): nếu có hơn 20 đề xuất chờ thì phần còn lại hiện ra sau khi Boss duyệt/từ chối bớt các bản đang thấy. API trả `total` cho cả PENDING (còn hạn + quá hạn) nên không dùng được trực tiếp cho con số "chỉ còn hạn"; chữ "(chỉ còn hạn)" trong nhãn nói rõ phạm vi để người duyệt không hiểu sai. `shortcut: chỉ đếm trong 20 bản mỗi loại của trang đang xem, nâng lên khi backend trả riêng số PENDING còn hạn`.
- **[ASSUMPTION FE8B-17]** (chốt 05/11/2026) `RatePlanView.serviceName` là `string | null`. Có tên → tiêu đề "Đơn giá dịch vụ {serviceName} · {buildingName}"; `null` → "Đơn giá dịch vụ · {buildingName}" (bỏ hẳn phần tên, **không** ghép `"#{serviceId}"`, **không** gọi `GET /services` để tra tên — xem Q-FE8B-2). Áp dụng cho `ApprovalCard` (CP-4) và mọi chỗ khác hiển thị tên dịch vụ từ `RatePlanView`.
- **[ASSUMPTION FE8B-13]** `RoomPriceDialog` dùng trực tiếp class kit `rooms-dialog` (không qua `ConfirmDialog`, không thêm mảnh kit mới) vì đây là form nhiều trường, không phải hộp xác nhận có/không.

## 4. Checkpoints

Mỗi CP: coder dựng (không viết test) → tester viết và chạy test. Tên file test theo task để không trùng `cp1..cp8` của P2-8a.

### Luật chung cho tester (áp dụng mọi CP)

1. **Đường dẫn trong test không được phụ thuộc độ sâu thư mục nháp.** Theo bản sửa đã duyệt `2026-11-05-FE-P2-8a-test-path-fix`: đặt `draftRoot = resolve(here, '..', '..')`, `draftSrcRoot = resolve(draftRoot, 'src')`, và **`mainSrcRoot = draftSrcRoot`** (không `resolve(draftRoot, '..', '..', 'src')`, không `../../../../src/...`). Nhờ fallback của loader, test chạy được cả trong thư mục nháp lẫn sau khi áp dụng vào `Source/frontend/tests/p2/`.
2. **Hạ tầng test**: dùng lại nguyên khuôn `tests/p2/cp7-rooms.test.mjs` (DOM giả, loader TS/TSX, `fakeFetch`, `mount`, `dispatch`, `fill`). Chỉ giả lập hai mép ngoài: `globalThis.fetch` và DOM. Mọi module trong phạm vi được nạp và chạy nguyên bản. Không cài gói mới (`node --test` + `typescript` đã có).
3. **Chạy toàn bộ bộ test cũ ở dạng giả lập "đã áp dụng"**: sao `Source/frontend` ra một thư mục tạm trong scratchpad, chép mọi file nháp lên đúng đích, rồi chạy `npm run test:components` bằng `package.json` **của bản nháp** (ở đây là bản main hiện tại vì P2-8b không sửa `package.json`). Bắt buộc bao gồm `tests/auth-login-flow.test.mjs` và `tests/auth-guards.test.mjs` với `StaffLayout` thật được mount. Báo cáo con số pass/fail (mốc hiện tại của main: **407/407**).
4. **Hai rủi ro hồi quy đã biết**, tester phải kiểm trước khi báo PASS:
   - `tests/p2/cp7-rooms.test.mjs` hai test cuối assert link `"Đề xuất giá"`/`"Đề xuất lại"` trỏ `/ql/don-gia`; CP-2 đổi sang dialog → cập nhật đúng hai test đó trong bản nháp, giữ nguyên phần còn lại của file.
   - `tests/auth-login-flow.test.mjs` mount `/ql` thật; sau CP-7 `StaffHomePage` gọi `GET /dashboard`. `StaffHomePage` phải không vỡ khi lời gọi đó lỗi hoặc không có rule (hiện trạng lỗi của UI-03), và phải giữ chữ "Việc hôm nay" + "Xin chào, {fullName}". Nếu cần, thêm rule `/dashboard` vào fake api của file test đó (bản nháp), không sửa ứng dụng để lách test.
5. **Fail-proof check**: trước khi báo PASS, tester phải chứng minh test thật sự bắt lỗi — tạm thời làm sai một chỗ trong mã nguồn của CP (ví bỏ cờ `expired`, cho phép nút "Không thành" ở trạng thái NEW, bỏ header `Idempotency-Key`), chạy lại và nêu test nào đỏ, rồi hoàn nguyên. Ghi kết quả này vào báo cáo.
6. Tắt dev server trước khi báo cáo; không chạy `apply-draft.mjs`; không ghi vào DB.

---

### CP-1 · Nền pricing: api, schema, nhãn (FE-P2-09, FE-P2-10, FE-P2-11)

File: `src/shared/api.ts` (sửa), `src/features/pricing/api.ts`, `src/features/pricing/schemas.ts`, `src/features/pricing/labels.ts`.
Nội dung: đúng §2.2 và §2.4; `labels.ts` có `rateKindLabels`, `tierRangeLabel(tiers, index)` ("0–50 kWh", "51–100 kWh", "Từ 101 kWh"), `formatPercent(value)` ("+5,0%" / "−3,2%" / "0,0%", dùng `Intl.NumberFormat('vi-VN')`, chỉ định dạng lại số API trả), `todayHanoi()`, `plusDays(isoDate, n)`, `waterUnitLabel(waterMode)` (Q-FE8B-3), `groupRatePlans(rows, today)` (Q-FE8B-1, trả `{ current: RatePlanView | null; upcoming: RatePlanView[]; history: RatePlanView[] }`).

**Done when**: `npx tsc -b` (trong bản sao đã áp dụng) không lỗi; test `fe09-pricing-api.test.mjs` đạt.

Kịch bản test (`tests/p2/fe09-pricing-api.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| API-02/SCOPE-02 | `listRoomPrices({ buildingId: 5, status: 'PENDING' })`; rồi `'all'`; rồi `null` | URL có `page=1&limit=20`, `buildingId=5` chỉ ở lần đầu, hai lần sau không có `buildingId` |
| API-05 | `proposeRoomPrice(..., 'key-1')` | request có header `Idempotency-Key: key-1`; body đúng 4 trường `roomId/price/effectiveFrom/reason`, không trường lạ |
| API-05 | `apiRequest` không truyền `idempotencyKey` | không có header `Idempotency-Key` |
| PRC-03 | `rejectRoomPrice(7, 'Giá cao quá', 'k')` | `POST /room-prices/7/reject`, body `{ reviewNote: 'Giá cao quá' }` |
| PRC-12 | `isTierComparison` với `PriceChange` và với `TierComparison` | `false` / `true` |
| RATE-02 | `ratePlanFormSchema`: 1 bậc `upTo:null` (đạt); 2 bậc `upTo` 50/null (đạt); `upTo` 50/50 (lỗi); bậc giữa `upTo:null` (lỗi); `tierNo` 1,3 (lỗi); `unitPrice:0` (đạt); `unitPrice:-1` (lỗi); WATER 2 bậc (lỗi); SERVICE thiếu `serviceId` (lỗi) | như ghi trong ô |
| PRC-01/RATE-05 | `roomPriceFormSchema`: `price` 0 (lỗi), 1 (đạt), 2147483647 (đạt), 2147483648 (lỗi), 1.5 (lỗi); `effectiveFrom` hôm qua (lỗi), hôm nay (đạt) | như ghi trong ô |
| UI-01 | `formatPercent(5)`, `formatPercent(-3.2)`, `formatPercent(0)` | `+5,0%`, `−3,2%`, `0,0%` |
| UI-01 | `tierRangeLabel` cho bậc 0–50 / 51–100 / 101+ | `0–50 kWh`, `51–100 kWh`, `Từ 101 kWh` |
| Q-FE8B-1 | `groupRatePlans` với: APPROVED hôm qua, APPROVED hôm nay, APPROVED ngày mai, PENDING, REJECTED (`today` truyền cố định) | `current` = bản hôm nay (biên `effectiveFrom === today` thuộc "Đang áp dụng"); `upcoming` = [ngày mai]; `history` = [APPROVED hôm qua, PENDING, REJECTED] giảm dần theo `effectiveFrom` |
| Q-FE8B-1 | `groupRatePlans` khi chỉ có PENDING và APPROVED ngày mai | `current === null`, `upcoming` 1 phần tử |
| Q-FE8B-1/ASSUMPTION FE8B-7 | hai APPROVED trùng `effectiveFrom` (id 7 và 9), cả hai `<= today` | `current.id === 9`, bản id 7 vào `history` |
| Q-FE8B-3 | `waterUnitLabel('PER_M3')`, `waterUnitLabel('PER_PERSON')`, `waterUnitLabel(undefined)` | `đ/m³`, `đ/người/kỳ`, `đ` |
| Q-FE8B-2 | mock `GET /room-prices` trả `roomCode: 'CG01-203'`, `buildingName: 'Tòa Cầu Giấy'` | type và hàm đọc đúng hai trường, không phát sinh thêm request `GET /rooms/:id` hay `GET /buildings` |

---

### CP-2 · Dialog đề xuất giá phòng trên `/ql/phong` (FE-P2-09)

File: `src/features/pricing/RoomPriceDialog.tsx`, `src/features/pricing/pricing.css`, `src/features/rooms/RoomInspector.tsx` (**file main do P2-8a dựng** — sửa: bỏ `<Link to="/ql/don-gia">`, thêm nút mở dialog, đổi chữ dòng đề xuất quá hạn thành "Đề xuất đã quá hạn. Cần đề xuất lại để duyệt."; giữ nguyên toàn bộ phần khóa phòng / bảo trì / ảnh / sửa đã được duyệt ở P2-8a), `src/features/pricing/api.ts` (thêm `newIdempotencyKey()`, [ASSUMPTION FE8B-14]), `src/features/pricing/schemas.ts` (**sửa đúng một chỗ**: chữ lỗi ô ngày hiệu lực khi trống, xem §2.5), `tests/p2/cp7-rooms.test.mjs` (tester cập nhật 2 test).

Hành vi: nút ghi "Đề xuất giá", đổi thành "Đề xuất lại" khi `room.pendingProposal?.expired` (PRC-07). Dialog dựng bằng class kit `rooms-dialog` trực tiếp, không qua `ConfirmDialog` ([ASSUMPTION FE8B-13]).

Prefill khi "Đề xuất lại" ([ASSUMPTION FE8B-12]): chỉ khi `expired === true`, gọi **đúng một** `GET /room-prices?roomId=<id>&status=PENDING&page=1&limit=1&sort=-createdAt` với `retry: false`, lấy bản có `id === room.pendingProposal.id` để prefill `price` và `reason`; lỗi / rỗng / không thấy → prefill `room.price`, `reason` rỗng, không hiện lỗi. Khi `expired !== true` **không** gọi gì thêm, prefill `room.price ?? ''`.

`Idempotency-Key` theo [ASSUMPTION FE8B-11]: khóa theo payload — bấm hai lần với payload y nguyên gửi cùng khóa; sửa giá/ngày/lý do rồi gửi lại thì khóa mới (nếu không sẽ nhận 409). Sinh khóa qua `newIdempotencyKey()` với fallback khi thiếu `crypto.randomUUID` ([ASSUMPTION FE8B-14]).

Sau khi gửi thành công: invalidate `['rooms']` và đóng dialog. Lỗi 403 `OUT_OF_SCOPE` (tòa/phòng khóa, Q-P5-7) và 400 `fields.effectiveFrom` hiện tại chỗ.

**Done when**: `node --test tests/p2/fe09-room-price.test.mjs tests/p2/cp7-rooms.test.mjs tests/p2/fe09-pricing-api.test.mjs` đạt toàn bộ (chạy lại cả file của CP-1 vì CP-2 đổi chữ lỗi trong `schemas.ts`; nếu file đó assert chữ cũ cho ô trống, tester CP-2 sửa đúng assert đó và ghi vào báo cáo).

Kịch bản test (`tests/p2/fe09-room-price.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| PRC-01 | mở dialog, nhập giá 2.600.000 và ngày hôm nay, gửi | đúng một `POST /room-prices`, body `{ roomId, price: 2600000, effectiveFrom: <hôm nay>, reason: … }` |
| PRC-01 | gửi với ngày hôm qua | không có request nào (zod chặn), hiện lỗi trên trường ngày |
| PRC-01 | giá 0; giá 1; giá 2147483648 | 0 và 2147483648 bị chặn ở FE; 1 đi tới API |
| PRC-01 | ngày hôm nay + 1 và hôm nay (biên) | cả hai đi tới API |
| PRC-07/PRC-10 | `pendingProposal = { expired: true }` | nhãn **nút** là "Đề xuất lại", không phải "Đề xuất giá"; dòng mô tả ghi đúng "Đề xuất đã quá hạn. Cần đề xuất lại để duyệt." và **không** còn "Đề xuất giá áp dụng từ". (Nhãn thẻ trạng thái "Đề xuất giá: Quá hạn" vẫn còn — đừng assert cả container không chứa "Đề xuất giá") |
| API-05/FE8B-14 | `newIdempotencyKey()` khi `crypto.randomUUID` bị xoá tạm (và khi có) | khóa là chuỗi không rỗng; hai payload khác nhau nhận hai khóa khác nhau (test nhỏ, tên test mang ID `FE-P2-09` / `API-05`) |
| PRC-07 | `pendingProposal = { expired: false }` | nút ghi "Đề xuất giá", thẻ trạng thái ghi "Chờ duyệt", không có "Quá hạn" |
| PRC-02 | có `pendingProposal` chưa quá hạn | dialog hiện câu "Đề xuất đang chờ duyệt cho phòng này sẽ được thay thế." |
| PRC-04 | mở dialog khi user là BOSS / là MANAGER | Boss thấy "Bạn là chủ nhà: đề xuất được duyệt ngay."; manager thấy "Đề xuất của bạn sẽ chờ chủ nhà duyệt." |
| Q-P5-7 | API trả 403 `OUT_OF_SCOPE` "Bạn không có quyền với tòa này" | chữ đó hiện trong dialog, dialog không đóng |
| UI-05 | API trả 400 với `fields.effectiveFrom` | chữ lỗi hiện cạnh input ngày |
| API-05/FE8B-11 | bấm "Gửi đề xuất" hai lần liên tiếp, payload y nguyên | cả hai request (nếu có) mang **cùng** `Idempotency-Key`; nút bị disable khi đang gửi |
| API-05/FE8B-11 | gửi lần 1 (API lỗi 400), sửa giá rồi gửi lần 2 | lần 2 mang `Idempotency-Key` **khác** lần 1 (cùng khóa khác payload là 409 theo Q-P5-6 B) |
| FE8B-12 | mở dialog khi `pendingProposal = { id: 31, expired: true }`, mock `GET /room-prices` trả bản id 31 `price: 2400000`, `reason: 'Tăng theo thị trường'` | đúng **một** `GET /room-prices` với `roomId` và `status=PENDING`; ô giá prefill 2400000, ô lý do prefill chữ đó |
| FE8B-12 | cùng tình huống nhưng `GET /room-prices` trả 500 (hoặc danh sách rỗng / id khác) | không retry, không hiện lỗi; ô giá prefill `room.price`, ô lý do rỗng; form vẫn gửi được |
| FE8B-12 | `pendingProposal = { expired: false }` hoặc không có `pendingProposal` | **không** có request `GET /room-prices` nào |
| FE8B-13 | markup dialog | có class `rooms-dialog` của kit; không dùng `ConfirmDialog` |
| UI-05 | để trống ô ngày hiệu lực rồi gửi | hiện "Vui lòng chọn ngày hiệu lực", không gửi request |
| UI-05 | nhập ngày sai định dạng (`05-11-2026`) | vẫn hiện chữ schema "Ngày hiệu lực phải có dạng YYYY-MM-DD" |
| UI-09 | gửi thành công | `['rooms']` được invalidate (có request `GET /rooms` mới), dialog đóng |
| UI-08 | dialog mở | có `role="dialog"`, mọi input có `<label>`, nút là `<button>` |

Cập nhật `cp7-rooms.test.mjs`: hai test cuối đổi từ "link trỏ `/ql/don-gia`" sang "nút mở dialog đề xuất", giữ nguyên nhãn "Đề xuất giá" / "Đề xuất lại" (PRC-07, PRC-10).

---

### CP-3 · `/ql/don-gia` (FE-P2-10) — **không còn bị chặn** (Q-FE8B-1 = A, Q-FE8B-3 = A)

File: `src/pages/staff/PricesPage.tsx`, `src/features/pricing/RatePlanList.tsx`, `src/features/pricing/RatePlanForm.tsx`, `src/features/pricing/water-mode.ts` (**mới**, chốt 05/11/2026: hook `useBuildingWaterMode` tách ra khỏi component để không vi phạm `react-refresh/only-export-components` của eslint; chỉ đọc cache `GET /buildings`, không thêm API).

Chi tiết đã chốt 05/11/2026 (báo cáo coder CP-3):
- Prefill form: `prefillTiers` = bậc của biểu giá **đang áp dụng** cùng loại ([ASSUMPTION FE8B-15]); không có bản đang áp dụng → form trống.
- Dịch vụ khóa (`isActive: false`): vẫn hiện mục và lịch sử đơn giá, nhưng **không** có nút "Đề xuất đơn giá" (SVC-04).
- `RatePlanView` không có `statusLabel`, nên nhãn trạng thái map ở FE: `expired === true` → "Quá hạn", còn lại dùng `approvalStatusLabels` của `shared/status-labels.ts` (PRC-10) — chỉ tra bảng nhãn, không suy ra trạng thái.
- Ô bậc trống/không hợp lệ hiện `TIER_MESSAGE` "Bậc giá không hợp lệ" của `schemas.ts`; ô cận trên trống gửi `null`, schema báo "Bậc trước bậc cuối phải có cận trên".
- Tải biểu giá bằng `GET /rate-plans` một lời gọi cho mỗi `kind` với `limit=100`; riêng SERVICE lọc theo `serviceId` ở FE. Coder ghi trong mã: `shortcut: chỉ lấy 100 bản mới nhất mỗi loại, nâng lên phân trang khi một tòa có >100 biểu giá`.
- Form biểu giá **không** có chữ PRC-04 "Bạn là chủ nhà…" (xem §2.5).
- Chữ chờ "Đang tải đơn giá" của `RatePlanList` **bị bỏ**, thay bằng "Đang xử lý" (§2.5). CP-3 đã PASS nên việc sửa chữ này do coder CP-4 làm, và tester CP-4 sửa assert tương ứng trong `tests/p2/fe10-rate-plans.test.mjs`. Chữ chờ trong `RoomPriceDialog` (CP-2) đổi cùng lúc.

Nội dung: chọn tòa từ `useBuildingSelection()`; `GET /services?buildingId` để biết các dịch vụ; với mỗi loại (Điện, Nước, mỗi dịch vụ đang hoạt động) hiện ba nhóm "Đang áp dụng" / "Sắp áp dụng" / "Lịch sử đơn giá" bằng `groupRatePlans(rows, todayHanoi())` theo bảng Q-FE8B-1 ở §3, kèm trạng thái đề xuất (`statusLabel`, `expired` → "Quá hạn"); nút "Đề xuất đơn giá" mở `RatePlanForm`. Bậc thang: nhập bậc, thêm/xóa bậc, bậc cuối luôn "không giới hạn"; WATER và SERVICE khóa ở đúng 1 bậc. Khối Nước ghi đơn vị bằng `waterUnitLabel(building.waterMode)` (Q-FE8B-3), lấy `waterMode` của tòa đang chọn từ dữ liệu `GET /buildings` đã cache — không thêm lời gọi mới. Dịch vụ đang khóa (`isActive: false`) không hiện nút đề xuất (SVC-04). `Idempotency-Key` của `proposeRatePlan` theo [ASSUMPTION FE8B-11] (khóa theo payload, đổi bậc thang / ngày / lý do → khóa mới). Chữ lỗi ô ngày hiệu lực khi trống là "Vui lòng chọn ngày hiệu lực" (đã đổi ở CP-2).

**Done when**: `node --test tests/p2/fe10-rate-plans.test.mjs` đạt.

Kịch bản test (`tests/p2/fe10-rate-plans.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| RATE-01 | đề xuất điện 3 bậc 0–50 / 51–100 / 101+ | một `POST /rate-plans`, body `{ buildingId, kind:'ELECTRIC', effectiveFrom, reason, tiers:[{tierNo:1,upTo:50,unitPrice:…},{tierNo:2,upTo:100,…},{tierNo:3,upTo:null,…}] }`, không có `serviceId` |
| RATE-02 | bấm "Thêm bậc" rồi "Xóa bậc" | `tierNo` luôn liên tục 1..n, chỉ bậc cuối `upTo = null` |
| RATE-02 | nhập `upTo` bậc 2 ≤ bậc 1 | FE chặn, không gửi, hiện lỗi "Cận trên của các bậc phải tăng dần" |
| RATE-02 | form nước và form dịch vụ | đúng 1 bậc, không có nút "Thêm bậc"; body `tiers` có 1 phần tử `upTo: null` |
| RATE-02 | `unitPrice` 0 (biên) và −1 | 0 gửi được, −1 bị chặn |
| RATE-01 | đề xuất cho dịch vụ | body có `serviceId` đúng của dịch vụ đang chọn |
| SVC-04 | dịch vụ `isActive: false` | mục dịch vụ và lịch sử đơn giá vẫn hiện; **không** có nút "Đề xuất đơn giá" cho dịch vụ đó |
| FE8B-15 | có biểu giá điện đang áp dụng 3 bậc, bấm "Đề xuất đơn giá" | form mở sẵn 3 bậc với `upTo`/`unitPrice` của bản đang áp dụng; sửa một bậc rồi gửi thì body là giá trị đã sửa |
| FE8B-15 | không có biểu giá nào đang áp dụng | form mở trống (1 bậc, `upTo` rỗng), không prefill từ bản PENDING hay REJECTED |
| RATE-02 | ô đơn giá bậc để trống rồi gửi | hiện "Bậc giá không hợp lệ", không gửi request |
| PRC-10 | biểu giá REJECTED trong lịch sử | hiện nhãn "Từ chối" của `approvalStatusLabels`, không hiện "Quá hạn" |
| RATE-05 | API trả 409 `PRICE_PROPOSAL_EXPIRED` | chữ `error.message` hiện ra, form không đóng |
| PRC-07/PRC-10 | biểu giá PENDING `expired: true` / `expired: false` | hiện "Quá hạn" / "Chờ duyệt" |
| Q-FE8B-1 | dữ liệu có 1 plan APPROVED hôm qua, 1 APPROVED ngày mai, 1 REJECTED | mục "Đang áp dụng" chứa bản hôm qua; "Sắp áp dụng" chứa bản ngày mai; bản REJECTED chỉ nằm trong "Lịch sử đơn giá" |
| Q-FE8B-1 | chỉ có plan APPROVED ngày mai | không render tiêu đề "Đang áp dụng"; có "Sắp áp dụng" |
| Q-FE8B-1 | plan APPROVED `effectiveFrom` = đúng hôm nay (biên) | nằm trong "Đang áp dụng", không nằm trong "Sắp áp dụng" |
| Q-FE8B-3 | tòa `waterMode: 'PER_M3'` | khối Nước hiện "đ/m³"; không hiện "đ/người/kỳ" |
| Q-FE8B-3 | tòa `waterMode: 'PER_PERSON'` | khối Nước hiện "đ/người/kỳ"; không hiện "đ/m³" |
| Q-FE8B-3 | đếm request sau khi trang tải xong | **không** có lời gọi API mới nào chỉ để lấy `waterMode` ngoài `GET /buildings` đã có |
| SCOPE-02 | manager chưa chọn tòa (`null`) / Boss "Tất cả tòa" | hiện "Chọn một tòa ở thanh chọn tòa để xem và đề xuất đơn giá.", không có nút đề xuất |
| UI-03 | 4 trạng thái danh sách | loading có nhãn Spinner; rỗng "Chưa có biểu giá nào cho tòa này"; lỗi + "Thử lại" gọi lại API; có dữ liệu |
| PRC-04 | Boss gửi đề xuất, API trả `status: 'APPROVED'` | trang hiện "Đã duyệt", không hiện "Chờ duyệt" |

---

### CP-4 · `/ql/duyet-gia` (FE-P2-11) — **không còn bị chặn** (Q-FE8B-2 = C, Q-FE8B-3 = A) · ⚠ cần backend đã áp dụng để kiểm API thật

File: `src/pages/staff/ApprovalsPage.tsx`, `src/features/pricing/PriceComparison.tsx`, `src/features/pricing/ApprovalCard.tsx`, `src/features/pricing/pricing.css` (**sửa**, đã tạo ở CP-1: thêm vài dòng cho bảng so sánh `<table>` bằng token của `rooms.css`), `src/features/pricing/RatePlanList.tsx` + `src/features/pricing/RoomPriceDialog.tsx` (**sửa chữ**: bỏ "Đang tải …", dùng "Đang xử lý", xem §2.5).
Tiêu đề mỗi thẻ (Q-FE8B-2 = C): giá phòng → "Giá phòng {roomCode} · {buildingName}"; biểu giá → "Đơn giá điện/nước · {buildingName}" và "Đơn giá dịch vụ {serviceName} · {buildingName}", `serviceName === null` → "Đơn giá dịch vụ · {buildingName}" ([ASSUMPTION FE8B-17]). Dùng đúng `item.row.roomCode` / `item.row.buildingName` / `item.row.serviceName`; **cấm** `GET /rooms/:id`, `GET /buildings`, `GET /services` để lấy tên, cấm `"Phòng #{roomId}"` và `"#{serviceId}"`. Nhãn đơn giá nước trên thẻ: "Đơn giá nước (đ/m³)" / "Đơn giá nước (đ/người/kỳ)" theo `waterMode` đọc qua `useBuildingWaterMode` của CP-3 + `waterUnitLabel` (Q-FE8B-3), không thêm lời gọi API.
Nhãn đếm đầu trang: "{n} đề xuất chờ duyệt (chỉ còn hạn)", đếm bản `expired === false` **trên trang đang xem** (chỉ trang 1, `page=1&limit=20` mỗi loại, **không render nút phân trang**) — [ASSUMPTION FE8B-16]. Trạng thái rỗng: "Chưa có đề xuất nào chờ duyệt". Ô ghi chú từ chối mang nhãn "Lý do từ chối"; để trống → "Vui lòng nhập lý do từ chối". `reason` của người đề xuất hiện dưới thẻ, **không có nhãn**. `comparison === null` với biểu giá → hiện bậc của `tiers` dưới nhãn "Giá mới", không thêm dòng giải thích. `waterMode` lấy qua `useBuildingWaterMode` đọc **danh sách `GET /buildings` đã cache** (chỉ gọi khi cache trống, **không** gọi `GET /buildings?buildingId=` theo từng tòa — [ASSUMPTION FE8B-10]). Chữ dialog lấy nguyên văn mockup: "Duyệt giá mới?", "Từ chối đề xuất?", "Xác nhận duyệt", "Xác nhận từ chối", "Quay lại"; dòng quá hạn: "Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt."; không có giá cũ: "Giá mới" (xem §2.5).
**PRC-08 (chốt 05/11/2026)**: `ConfirmDialog` duyệt **luôn** chứa câu chung "Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực." — câu cố định, không điều kiện, **không** gọi thêm API, **không** sửa backend, FE không tự suy ra có bản sẽ bị thay thế hay không (UI-06).
Nội dung: hai lời gọi `status=PENDING`, trộn, tách "còn hạn" / "Đề xuất quá hạn" theo `expired`. `PriceComparison` hiển thị đúng ba dạng của PRC-12: một giá (cũ → mới + `changePercent`), bảng bậc có `tierChanges`, hai bảng bậc khi `tierChanges === null`; `comparison.label` (= "Giá mới") thì không hiện % và không hiện giá cũ. `Idempotency-Key` cho `approve` / `reject` theo [ASSUMPTION FE8B-11]: khóa theo payload `(id, reviewNote)` — bấm lại y nguyên dùng cùng khóa, đổi ghi chú thì khóa mới. Duyệt mở `ConfirmDialog` nêu số tiền (UI-04) và câu PRC-08 cố định ở trên. Từ chối mở form bắt buộc ghi chú. Đề xuất quá hạn chỉ có nút "Từ chối".

**Done when**: `node --test tests/p2/fe11-approvals.test.mjs` đạt (chạy bằng mock, không chờ backend). Việc gọi API thật trên trang này chờ nháp backend `roomCode`/`buildingName` được duyệt và áp dụng — ghi vào báo cáo CP-8 là "chờ backend", không tính FAIL.

Kịch bản test (`tests/p2/fe11-approvals.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| Q-FE8B-2 | mock giá phòng `roomCode: 'CG01-203'`, `buildingName: 'Tòa Cầu Giấy'` | thẻ hiện "Giá phòng CG01-203 · Tòa Cầu Giấy"; **không** hiện "Phòng #" |
| Q-FE8B-2 | mock biểu giá điện `buildingName: 'Tòa Cầu Giấy'` | thẻ hiện "Đơn giá điện · Tòa Cầu Giấy" |
| Q-FE8B-2 | đếm toàn bộ request của trang | chỉ `GET /room-prices` và `GET /rate-plans` (+ `GET /buildings` đã có từ thanh chọn tòa); **không** có `GET /rooms/:id` |
| Q-FE8B-3 | đề xuất đơn giá nước, tòa `PER_PERSON` | hiện "đ/người/kỳ" |
| PRC-12 | `comparison = { oldValue: 2500000, newValue: 2625000, changePercent: 5, label: null }` | hiện "2.500.000 đ", "2.625.000 đ", "+5,0%" |
| UI-06 | cùng dữ liệu nhưng `changePercent: 7.3` (không khớp số tự tính) | hiện "+7,3%" — FE không tự tính lại % |
| PRC-12 | `comparison.label = 'Giá mới'`, `oldValue: null` | hiện "Giá mới", không hiện %, không hiện giá cũ |
| PRC-12 | `changePercent: null` với `oldValue: 0` | hiện giá cũ 0 và giá mới, không hiện % |
| PRC-12 | điện, `tierChanges` 3 bậc | một bảng 3 dòng, cột "Hiện tại"/"Đề xuất"/"Thay đổi" đúng từng bậc |
| PRC-12 | điện, `oldTiers` 3 bậc và `newTiers` 2 bậc, `tierChanges: null` | hai bảng, không có cột/ô % nào |
| PRC-07 | 1 đề xuất `expired: true` | nằm trong mục "Đề xuất quá hạn", **không có** nút duyệt, có nút "Từ chối" |
| PRC-11 | 3 PENDING trong đó 1 quá hạn | nhãn đếm ở đầu trang là "2 đề xuất chờ duyệt (chỉ còn hạn)" |
| UI-04 | bấm duyệt một giá phòng 2.625.000 đ | `ConfirmDialog` mở và chứa "2.625.000 đ"; chưa gọi API trước khi xác nhận |
| PRC-08 | mở dialog duyệt cho **bất kỳ** item (giá phòng và biểu giá, có/không có giá cũ) | dialog luôn chứa đúng câu "Duyệt có thể thay thế giá đã duyệt chưa có hiệu lực."; **không** có request nào phát sinh khi mở dialog |
| FE8B-17 | biểu giá SERVICE `serviceName: 'Internet'` | thẻ hiện "Đơn giá dịch vụ Internet · {buildingName}" |
| FE8B-17 | biểu giá SERVICE `serviceName: null` | thẻ hiện "Đơn giá dịch vụ · {buildingName}"; **không** chứa "#" hay `serviceId`; không có `GET /services` |
| Q-FE8B-3 | đề xuất đơn giá nước, tòa `PER_M3` / `PER_PERSON` | nhãn thẻ là "Đơn giá nước (đ/m³)" / "Đơn giá nước (đ/người/kỳ)"; chỉ đọc `GET /buildings` đã có |
| FE8B-16 | 20 PENDING mỗi loại, trong đó 2 quá hạn | URL có `limit=20` cho cả hai lời gọi; nhãn đếm là "{n} đề xuất chờ duyệt (chỉ còn hạn)" với `n` = số bản `expired === false` của trang đang xem |
| PRC-03 | từ chối với ghi chú rỗng | hiện đúng chữ "Vui lòng nhập lý do từ chối", không gửi request |
| PRC-07 | thẻ `expired: true` | hiện "Đã qua ngày áp dụng. Cần quản lý đề xuất lại để duyệt." |
| PRC-12 | thẻ không có giá cũ (`oldValue: null`) | nhãn "Giá mới" |
| UI-04 | dialog duyệt / dialog từ chối | chữ "Duyệt giá mới?" + "Xác nhận duyệt" + "Quay lại"; "Từ chối đề xuất?" + "Xác nhận từ chối" + "Quay lại" |
| UI-03 | không còn đề xuất nào | hiện "Chưa có đề xuất nào chờ duyệt" |
| PRC-03 | xác nhận duyệt | `POST /room-prices/:id/approve` (hoặc `/rate-plans/:id/approve`) đúng id, có `Idempotency-Key`; danh sách được invalidate |
| PRC-03 | từ chối với ghi chú rỗng / toàn khoảng trắng | không gửi request, hiện lỗi bắt buộc ghi chú |
| PRC-03 | từ chối với ghi chú "Chưa hợp lý" | `POST .../reject` body `{ reviewNote: 'Chưa hợp lý' }` |
| PRC-07 | duyệt trả 409 `PRICE_PROPOSAL_EXPIRED` | `error.message` hiện ra, dialog không đóng, item vẫn còn |
| PRC-09 | duyệt trả 409 `CONFLICT_STATE` (hai tab) | `error.message` hiện ra, không gọi lại API |
| API-05/FE8B-11 | bấm duyệt hai lần cùng một item | cùng một `Idempotency-Key`, nút disable khi đang gửi |
| API-05/FE8B-11 | từ chối với ghi chú A (lỗi), sửa thành ghi chú B rồi gửi lại | lần 2 mang `Idempotency-Key` khác (payload `reviewNote` đã đổi) |
| API-05/FE8B-11 | duyệt hai item khác nhau | hai `Idempotency-Key` khác nhau |
| SCOPE-02/AUTH-06 | manager mở `/ql/duyet-gia` | router P2-8a đã chặn (đã có test `cp1-routes`); CP này chỉ kiểm trang không gọi API khi `pendingPrices` không dành cho manager — không viết lại test guard |
| UI-03 | 4 trạng thái | loading; rỗng "Chưa có đề xuất nào chờ duyệt"; lỗi + "Thử lại"; dữ liệu |
| UI-03 | chữ khi đang tải / đang gửi trên `/ql/duyet-gia`, `/ql/don-gia`, dialog đề xuất giá phòng | hiện "Đang xử lý"; **không** còn chuỗi "Đang tải" ở đâu cả |
| PRC-03 | mở form từ chối | ô ghi chú có nhãn "Lý do từ chối" |
| PRC-12 | đề xuất có `reason: 'Tăng theo thị trường'` | chữ đó hiện dưới thẻ, **không** kèm nhãn ("Lý do", "Ghi chú" …); `reason: null` → không hiện gì |
| PRC-12 | biểu giá điện `comparison: null`, `tiers` 3 bậc | hiện nhãn "Giá mới" và 3 bậc của `tiers`; không hiện %, không hiện giá cũ, không có dòng giải thích thêm |
| FE8B-16 | 25 PENDING mỗi loại | URL có `page=1&limit=20`; **không** có nút/ô phân trang nào trong trang |
| FE8B-10 | trang mở khi cache `GET /buildings` đã có danh sách | **không** có request `GET /buildings` mới, và không có request nào dạng `GET /buildings?buildingId=` |

Các quyết định 05/11/2026 ở trên **không** đổi thứ tự hay phạm vi các checkpoint còn lại: CP-5 → CP-6 → CP-7 → CP-8 giữ nguyên như dưới đây, không có CP mới, không CP nào bị gộp hay bỏ.

---

### CP-5 · Nền viewings: api, schema, form thêm thủ công (FE-P2-12)

File: `src/features/viewings/api.ts`, `src/features/viewings/schemas.ts`, `src/features/viewings/ViewingForm.tsx`, `src/features/viewings/viewings.css`.
Nội dung: đúng §2.2 và §2.4. Form chọn phòng từ `GET /rooms?buildingId` (phòng đang hoạt động; không cần công khai, VIEW-03), ngày `min` = hôm nay, `max` = hôm nay + 30, 3 khung giờ với nhãn VIEW-08.

**Done when**: `node --test tests/p2/fe12-viewing-form.test.mjs` đạt.

Kịch bản test (`tests/p2/fe12-viewing-form.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| VIEW-03 | điền đủ và gửi | một `POST /viewings`, body đúng `{ roomId, guestName, guestPhone, visitDate, timeSlot, note }`, không trường lạ, không `source` |
| VIEW-01 | `guestPhone` `0901234567` (đạt), `090123456` (9 số, lỗi), `1901234567` (lỗi), `09012345678` (11 số, lỗi) | như ghi trong ô |
| VIEW-01 | `guestName` 1 ký tự (lỗi), 2 (đạt), 100 (đạt), 101 (lỗi) | như ghi trong ô |
| VIEW-08 | `visitDate` hôm qua (lỗi), hôm nay (đạt), hôm nay+30 (đạt), hôm nay+31 (lỗi) | như ghi trong ô, biên tính theo Asia/Ho_Chi_Minh |
| VIEW-08 | nhãn 3 khung giờ | "Sáng (8:00–11:00)", "Chiều (14:00–17:00)", "Tối (18:00–20:00)" |
| VIEW-08 | API trả 400 `fields.timeSlot` = "Khung giờ này hôm nay đã bắt đầu, vui lòng chọn khung giờ khác" | chữ đó hiện cạnh ô khung giờ (FE không tự tính giờ) |
| VIEW-03 | `note` 500 ký tự (đạt), 501 (lỗi) | như ghi trong ô |
| VIEW-03 | API trả 409 `CONFLICT_STATE` (phòng đã khóa) | `error.message` hiện ra, form không đóng |
| SCOPE-02 | API trả 403 `OUT_OF_SCOPE` | `error.message` hiện ra |
| UI-09 | gửi thành công | `['viewings']` được invalidate, form đóng |

---

### CP-6 · `/ql/lich-hen` (FE-P2-12) — **không còn bị chặn** (Q-FE8B-4 = A, Q-FE8B-5 = A)

File: `src/pages/staff/ViewingsPage.tsx`, `src/features/viewings/ViewingCard.tsx`.
Nội dung: lọc `from`/`to` mặc định `todayHanoi()` → `todayHanoi() + 30` (Q-FE8B-5) và `status`; `from > to` chặn tại input, không gọi API; nhóm theo ngày xem; mỗi thẻ hiện `roomCode`, `buildingName` (đã có trong `ViewingView` trên main), tên và số khách, `timeSlotLabel`, `statusLabel`, nguồn, ghi chú; nút liên hệ theo Q-FE8B-4: "Gọi" = `<a href="tel:{guestPhone}">`, "Zalo" = `<a href="https://zalo.me/{guestPhone}" target="_blank" rel="noopener noreferrer">`; nút trạng thái theo bảng §2.3; "Đổi ngày/giờ" chỉ khi NEW/CONFIRMED (VIEW-09); 409 `CONFLICT_STATE` hiện `error.message` và refetch.

**Done when**: `node --test tests/p2/fe12-viewings-page.test.mjs` đạt.

Kịch bản test (`tests/p2/fe12-viewings-page.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| VIEW-04 | thẻ NEW | có "Xác nhận", "Hủy lịch", "Đổi ngày/giờ"; **không** có "Không thành", không có "Chốt" |
| VIEW-04 | thẻ CONFIRMED | có "Không thành", "Hủy lịch", "Đổi ngày/giờ"; không có "Xác nhận", không có "Chốt" |
| VIEW-04 | thẻ WON / LOST / CANCELLED | không có nút đổi trạng thái nào |
| VIEW-04 | bấm "Xác nhận" ở NEW | `PATCH /viewings/:id` body `{ status: 'CONFIRMED' }` |
| VIEW-04/Q-P6-3 | bấm "Không thành" rồi gửi với ghi chú rỗng | FE chặn, không gửi; với ghi chú "Khách chọn nơi khác" → body `{ status:'LOST', outcomeNote:'Khách chọn nơi khác' }` |
| Q-P6-3 | bấm "Hủy lịch", không ghi chú | gửi được, body `{ status: 'CANCELLED' }` (ghi chú không bắt buộc) |
| VIEW-04 | không bao giờ có đường nào gửi `status: 'WON'` | grep/assert: không request nào chứa `WON` |
| VIEW-09 | đổi ngày/giờ ở NEW và CONFIRMED | `PATCH` chỉ chứa `visitDate` và/hoặc `timeSlot` |
| VIEW-09 | 409 `CONFLICT_STATE` khi đổi (ai đó vừa hủy) | `error.message` hiện ra, danh sách được refetch |
| VIEW-08 | đổi ngày ra hôm nay + 31 | FE chặn trước khi gửi |
| VIEW-10 | 5 trạng thái | hiện đúng `statusLabel` của API ("Mới", "Đã xác nhận", "Đã chốt", "Không thành", "Đã hủy") |
| SCOPE-02 | chọn tòa 5 / "Tất cả tòa" / manager `null` | `buildingId=5` chỉ ở trường hợp đầu |
| Q-FE8B-5 | lần tải đầu | URL có `from=<hôm nay>` và `to=<hôm nay+30>` (tính theo `Asia/Ho_Chi_Minh`); hai input ngày hiện đúng hai giá trị đó |
| Q-FE8B-5 | đổi "Từ ngày" sang hôm nay+5 | request mới có `from=<hôm nay+5>`, `to` giữ nguyên |
| Q-FE8B-5/ASSUMPTION FE8B-8 | đặt "Từ ngày" sau "Đến ngày" | không có request mới, hiện "Từ ngày phải trước hoặc bằng Đến ngày" |
| Q-FE8B-4 | nút "Gọi" của thẻ có `guestPhone: '0901234567'` | `<a href="tel:0901234567">`, không có `target` |
| Q-FE8B-4 | nút "Zalo" cùng thẻ | `href="https://zalo.me/0901234567"`, `target="_blank"`, `rel` chứa **cả** `noopener` và `noreferrer` |
| Q-FE8B-4 | mã nguồn trang và thẻ | không dùng `window.open` cho hai nút này |
| VIEW-03 | bấm "Thêm lịch hẹn" khi chưa chọn tòa | nút disable + gợi ý chọn tòa |
| UI-03 | 4 trạng thái | loading; rỗng "Chưa có lịch hẹn nào trong khoảng ngày này"; lỗi + "Thử lại"; dữ liệu |
| UI-01 | ngày xem | định dạng `dd/mm/yyyy`, không lệch múi giờ (dùng `formatDate`) |

---

### CP-7 · Hai thẻ "Việc hôm nay" trên `/ql` (FE-P2-12)

File: `src/features/dashboard/api.ts`, `src/pages/staff/StaffHomePage.tsx` (sửa).
Nội dung: `GET /dashboard` với `buildingId` theo lựa chọn tòa; thẻ "Lịch hẹn mới" (count + tối đa 5 item + link `/ql/lich-hen`); thẻ "Giá chờ duyệt" chỉ khi `pendingPrices !== null` (count + `rooms`/`ratePlans` + link `/ql/duyet-gia`). Giữ "Việc hôm nay" và "Xin chào, {fullName}".

**Done when**: `node --test tests/p2/fe12-dashboard.test.mjs tests/auth-login-flow.test.mjs` đạt.

Kịch bản test (`tests/p2/fe12-dashboard.test.mjs`):

| Mã | Tình huống | Kỳ vọng |
|---|---|---|
| NOTI-06 | `pendingPrices: null` (manager) | có thẻ "Lịch hẹn mới", **không** có thẻ "Giá chờ duyệt" |
| NOTI-06/PRC-11 | `pendingPrices: { count: 3, rooms: 2, ratePlans: 1 }` (Boss) | hiện "3", "2 giá phòng", "1 đơn giá" đúng số API trả |
| VIEW-07/Q-P6-2 | `newViewings: { count: 12, items: [5 item] }` | hiện số 12 và 5 item (không hiện 5 thay cho 12) |
| VIEW-07 | `newViewings.count: 0`, `items: []` | hiện trạng thái rỗng, không hiện danh sách trống trơn |
| SCOPE-02 | tòa 5 / "Tất cả tòa" / `null` | `GET /dashboard?buildingId=5` chỉ ở trường hợp đầu; `/dashboard` không có `page`/`limit` |
| UI-03 | API lỗi 500 | hiện `error.message` + "Thử lại"; **trang vẫn hiện "Việc hôm nay" và "Xin chào, …"** |
| FE-LOGIN-11 | hồi quy | `tests/auth-login-flow.test.mjs` vẫn đạt toàn bộ (tiêu đề "Việc hôm nay", lời chào theo tên) |
| UI-02 | nhãn trạng thái của item | lấy `statusLabel` từ API, không tự map |

---

### CP-8 · FE-P2-13 · chốt chất lượng

Không thêm file ứng dụng. Tester chạy trên bản sao `Source/frontend` đã áp dụng toàn bộ nháp:

1. `npm run lint` → 0 lỗi.
2. `npm run build` (`tsc -b && vite build`) → thành công.
3. `npm run test:components` bằng `package.json` bản nháp → **báo số pass/fail**; phải ≥ 407 test cũ + test mới, 0 fail. Nêu rõ `tests/auth-login-flow.test.mjs`, `tests/auth-guards.test.mjs`, `tests/p2/cp1..cp8` đều xanh.
4. Nêu lại kết quả fail-proof check của từng CP.
4b. Xác nhận lại hai luật đã chốt 05/11/2026: `Idempotency-Key` theo payload ([ASSUMPTION FE8B-11], không phải theo lần mở dialog) và lời gọi `GET /room-prices` chỉ xảy ra khi "Đề xuất lại" ([ASSUMPTION FE8B-12]); nêu test nào bao hai luật này.
5. Ghi một dòng **"Chờ backend"**: `/ql/duyet-gia` chỉ hiện đúng `roomCode` / `buildingName` / `serviceName` khi nháp backend (Q-FE8B-2 = C) đã được duyệt và áp dụng. Mọi test FE của CP-1/CP-4 dùng mock nên vẫn phải xanh; thiếu backend **không** được báo FAIL, chỉ ghi là phụ thuộc còn mở.

**Done when**: cả 3 lệnh đạt và báo cáo có số pass/fail cụ thể. Kiểm tay trên trình duyệt ("manager đề xuất → Boss duyệt → giá đổi") do phiên chính làm **sau khi** áp dụng vào file chính **và sau khi** nháp backend `roomCode`/`buildingName` được áp dụng, không phải việc của agent.
