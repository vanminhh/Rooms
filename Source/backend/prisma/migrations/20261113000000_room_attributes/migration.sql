-- EX-5 / BE-EX-12: room attributes for the public filters (D-32, ROOM-10).
-- Only adds: one enum and four nullable columns. NULL means "chưa nhập" and is never the same as false.
-- Existing rooms keep NULL in all four columns; nothing is guessed or backfilled.

CREATE TYPE "RoomType" AS ENUM ('STUDIO', 'LOFT', 'ONE_BEDROOM', 'TWO_BEDROOM');

ALTER TABLE "rooms" ADD COLUMN "room_type" "RoomType";
ALTER TABLE "rooms" ADD COLUMN "has_balcony" BOOLEAN;
ALTER TABLE "rooms" ADD COLUMN "has_window" BOOLEAN;
ALTER TABLE "rooms" ADD COLUMN "pets_allowed" BOOLEAN;
