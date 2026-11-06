# 11 · Buildings, rooms, services

Modules: `buildings`, `rooms`. Tables: `buildings`, `rooms`, `room_images`, `services`.

## Buildings

- **BLD-01** Only Boss creates buildings and sets `code`, `name`, `address`, `district`, `ward`, `water_mode`, `due_days`, `manager_id`.
- **BLD-02** A manager MAY edit `amenities` and `description` of their own buildings only.
- **BLD-03** Assigning a manager: target must be an active MANAGER with fewer than 2 buildings (`MANAGER_MAX_2_BUILDINGS`). `manager_id = null` is allowed.
- **BLD-04** Public contact of a building = its active manager's `contact_phone`/`zalo_url`/`facebook_url`; if none, Boss's (`settings.default_contact`). "None" also covers: no manager, an inactive manager (AUTH-08), and an active manager without `contact_phone` (owner 01/11/2026). The manager's login phone is never shown. Computed at read time, never copied.
- **BLD-05** A building is public iff it is active and has at least one public room (ROOM-05). Because ROOM-05 requires the building's ELECTRIC and WATER rates, a new building is not public until both are approved and in effect.
- **BLD-06** `code` is 2–6 characters `A-Z0-9` (DB `buildings_code_format`); the BE upper-cases input. Only Boss locks (`is_active = false`) or unlocks a building, and only when no room has a HOLD/ACTIVE contract (same as ROOM-04). Locking also sets `manager_id = null` (audit `building.manager_change`) so the manager can take another building; after unlocking, Boss assigns a manager again (owner 01/11/2026). NEW/CONFIRMED viewings are kept (VIEW-13).
- **BLD-07** Staff lists hide locked buildings and locked rooms by default; `?includeInactive=true` shows them: "Hiện tòa đã khóa" (Boss; managers never see locked buildings, SCOPE-02) and "Hiện phòng đã khóa" (staff in scope).

## Rooms

- **ROOM-01** Managers and Boss create/edit rooms in scope: `code` (unique in building), `floor`, `area_m2`, `max_occupants`, `furniture`, `description`, images. Reducing `max_occupants` below the active occupant count defined by DB-B6/CON-13 is refused in the same transaction with 409 `CONFLICT_STATE` (owner 04/11/2026).
- **ROOM-02** `rooms.price` is never written by the room form. A new room has `price = null` until a room price proposal is approved ([12-pricing.md](12-pricing.md)).
- **ROOM-03** `under_maintenance` can be toggled only when the room has no HOLD/ACTIVE contract.
- **ROOM-04** Deactivate (`is_active = false`) only when no HOLD/ACTIVE contract. Never delete.
- **ROOM-05** A room is **public** iff room active, building active, not under maintenance, `price` not null, no HOLD/ACTIVE contract, **and** the building has an ELECTRIC and a WATER rate in effect today (RATE-06).
- **ROOM-06** `code` stays unique in the building also for locked rooms; the duplicate error says "Mã phòng đã có trong tòa (kể cả phòng đã khóa)". A room cannot be created in a locked building (`CONFLICT_STATE`).
- **ROOM-07** Images: at most 10 per room, JPG/PNG/WebP, uploaded directly to Cloudinary with a signature from `POST /files/sign` (FILE-01, FILE-02). The FE rejects files over 5 MB before upload (Cloudinary cannot sign a size limit). Each attached image stores a unique, verified Cloudinary `asset_id` (FILE-02). Deleting an image deletes the `room_images` row (no history) and then requests Cloudinary destroy by that immutable `asset_id`; a Cloudinary failure is logged and does not block. A late destroy must not remove a new asset that reuses the old `publicId`. Order by `sort_order`. Owner decision Q-P24-9, 03/11/2026.
- **ROOM-08** Public room detail shows the deposit = 1 month of the current price, and `monthlyEstimate` (A-05, owner 01/11/2026) = `price` + every active ROOM service + every active PERSON service × 1 + water × 1 person when `water_mode = PER_PERSON`, all at today's rates (RATE-06). Electricity and per-m³ water are not added; their unit prices are listed with "chưa gồm điện, nước – tính theo đồng hồ của phòng". An active service without a rate in effect is not added and is listed as "chưa gồm: <tên> (chưa có giá)". Locked services are left out entirely. Computed by the BE only (UI-06).
- **ROOM-09** Turning on maintenance (ROOM-03) or locking (ROOM-04) a room that has NEW/CONFIRMED viewings is allowed; the response gives their count so the FE confirm dialog says "Còn N lịch hẹn chưa xử lý" (VIEW-13).

### Public listing

- **PUB-01** `/public/rooms` lists only public rooms (ROOM-05). Default sort: price ascending; "Mới nhất" = most recently approved current price first. `/public/featured-rooms` = the 6 public rooms whose current price was approved most recently.
- **PUB-02** `/public/rooms/:id` and `/public/buildings/:id` for a room or building that is not public return 404 `NOT_FOUND` (no hint that it exists).
- **PUB-03** Rates shown publicly = today's rates (RATE-06). Rates approved for a later date are shown as an extra line "Từ dd/mm/yyyy: …".
- **PUB-04** Public responses never include internal fields (user ids, phone of login, review notes, proposal data).
- **PUB-05** Successful `GET /public/*` responses carry `Cache-Control: public, max-age=0, s-maxage=60`: the CDN (DEP-06) may serve them for 60 s, browsers always ask again. Error responses and every non-GET (e.g. `POST /public/viewings`) carry `Cache-Control: no-store`. So a new price, a locked room or a newly listed room may show publicly up to 60 s late, including PUB-02's 404 (owner 04/11/2026). Staff and tenant routes are never cached.

### Room status

Derived, never stored. Priority top to bottom:

| Status | Vietnamese | Condition |
|---|---|---|
| ACTIVE contract exists | "Đang thuê" | contract status ACTIVE |
| HOLD contract exists | "Đã cọc" | contract status HOLD |
| Maintenance | "Bảo trì" | `under_maintenance` |
| Otherwise | "Trống" | |

## Services

- **SVC-01** Each building has its own service catalog: `name` unique in building, `unit` = `ROOM` (per room), `PERSON` (per occupant), `VEHICLE` (per vehicle). Example seed: "Wifi" ROOM, "Rác" PERSON, "Gửi xe máy" VEHICLE, "Gửi xe điện" VEHICLE.
- **SVC-02** Boss creates/deactivates services. Their prices are rate plans of kind `SERVICE` (approval flow).
- **SVC-03** Water per person is NOT a service; it is the WATER rate plan when `water_mode = PER_PERSON`.
- **SVC-04** A locked service (`is_active = false`) is hidden publicly, left out of ROOM-08, and cannot get a new rate plan (`VALIDATION_FAILED`). A service without a rate in effect shows "Chưa có giá" to staff.
- **SVC-05** Seed adds "Gửi xe điện" (VEHICLE) at 150.000 đ/xe/kỳ to every seeded building as an approved rate plan (owner 01/11/2026, temporary – Boss can change it through the approval flow).

## API

| Method | Path | Who |
|---|---|---|
| GET | `/public/locations` | public – districts/wards that have public rooms, with counts |
| GET | `/public/rooms?district&ward&buildingId&minPrice&maxPrice&sort&page` | public – only public rooms (ROOM-05, PUB-01) |
| GET | `/public/rooms/:id` | public – room, images, building, contact (BLD-04), current and upcoming rates (PUB-03), deposit, `monthlyEstimate` (ROOM-08) |
| GET | `/public/buildings/:id` | public – building, rates, public rooms |
| GET | `/public/featured-rooms` | public – PUB-01 |
| GET/POST/PATCH | `/buildings` | staff (POST, assignment fields, lock: **Boss**; managers: `amenities`, `description` only) |
| GET/POST/PATCH | `/rooms`, `/rooms/:id/images` | staff in scope |
| GET | `/rooms/:id` | staff in scope – chi tiết phòng: như `/rooms` + `furniture`, `description`, `images` (ROOM-07) và `pendingViewingCount` (ROOM-09, VIEW-13) |
| GET/POST/PATCH | `/services` | GET staff; POST/PATCH **Boss** |
| POST | `/files/sign` | staff in scope (FILE-01) |

Public controllers live in the module that owns the data (`buildings`, `rooms`); there is no `public` module.

## Acceptance

- [ ] A room with `price = null` never appears in `/public/rooms`.
- [ ] Creating a HOLD contract removes the room from public lists in the same transaction.
- [ ] Manager cannot change a building's `code`, `address` or `manager_id` (403).
- [ ] Building with manager deactivated shows Boss's contact publicly.
- [ ] A building without an ELECTRIC or WATER rate in effect has no public rooms (ROOM-05).
- [ ] Locking a building sets `manager_id = null`; that manager can then be assigned another building (BLD-06).
- [ ] A manager cannot get an upload signature for a room in another building (FILE-01); a `publicId` outside the room's folder is rejected (FILE-02).
- [ ] `monthlyEstimate` for a PER_M3 and a PER_PERSON building matches ROOM-08 by hand.
