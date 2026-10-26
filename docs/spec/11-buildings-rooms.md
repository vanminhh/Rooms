# 11 · Buildings, rooms, services

Modules: `buildings`, `rooms`. Tables: `buildings`, `rooms`, `room_images`, `services`.

## Buildings

- **BLD-01** Only Boss creates buildings and sets `code`, `name`, `address`, `district`, `ward`, `water_mode`, `due_days`, `manager_id`.
- **BLD-02** A manager MAY edit `amenities` and `description` of their own buildings only.
- **BLD-03** Assigning a manager: target must be an active MANAGER with fewer than 2 buildings (`MANAGER_MAX_2_BUILDINGS`). `manager_id = null` is allowed.
- **BLD-04** Public contact of a building = its active manager's `contact_phone`/`zalo_url`/`facebook_url`; if none, Boss's. Computed at read time, never copied.
- **BLD-05** A new building is not public until it has at least one public room (ROOM-05) and approved rate plans for ELECTRIC and WATER.

## Rooms

- **ROOM-01** Managers and Boss create/edit rooms in scope: `code` (unique in building), `floor`, `area_m2`, `max_occupants`, `furniture`, `description`, images.
- **ROOM-02** `rooms.price` is never written by the room form. A new room has `price = null` until a room price proposal is approved ([12-pricing.md](12-pricing.md)).
- **ROOM-03** `under_maintenance` can be toggled only when the room has no HOLD/ACTIVE contract.
- **ROOM-04** Deactivate (`is_active = false`) only when no HOLD/ACTIVE contract. Never delete.
- **ROOM-05** A room is **public** iff room active, building active, not under maintenance, `price` not null, no HOLD/ACTIVE contract.

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

## API

| Method | Path | Who |
|---|---|---|
| GET | `/public/locations` | public – districts/wards that have public rooms, with counts |
| GET | `/public/rooms?district&ward&buildingId&minPrice&maxPrice&page` | public – only public rooms (ROOM-05) |
| GET | `/public/rooms/:id` | public – room, building, contact (BLD-04), current rates, `monthlyEstimate` per [ASSUMPTION A-05] |
| GET | `/public/buildings/:id` | public – building, rates, public rooms |
| GET/POST/PATCH | `/buildings` | staff (POST and assignment fields: **Boss**) |
| GET/POST/PATCH | `/rooms`, `/rooms/:id/images` | staff in scope |
| GET/POST/PATCH | `/services` | GET staff; POST/PATCH **Boss** |

## Acceptance

- [ ] A room with `price = null` never appears in `/public/rooms`.
- [ ] Creating a HOLD contract removes the room from public lists in the same transaction.
- [ ] Manager cannot change a building's `code`, `address` or `manager_id` (403).
- [ ] Building with manager deactivated shows Boss's contact publicly.
