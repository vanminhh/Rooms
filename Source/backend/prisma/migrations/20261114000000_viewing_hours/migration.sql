-- AlterEnum
ALTER TYPE "ViewingStatus" ADD VALUE 'DONE';

-- AlterTable
ALTER TABLE "viewings" ADD COLUMN     "user_id" INTEGER,
ADD COLUMN     "visit_at" TIMESTAMPTZ,
ALTER COLUMN "visit_date" DROP NOT NULL,
ALTER COLUMN "time_slot" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "viewings_user_id_created_at_idx" ON "viewings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "viewings_visit_at_status_idx" ON "viewings"("visit_at", "status");

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- VIEW-08: preserve legacy slots and require one usable time representation.
ALTER TABLE viewings ADD CONSTRAINT viewings_time_present
  CHECK (visit_at IS NOT NULL OR (visit_date IS NOT NULL AND time_slot IS NOT NULL));

-- VIEW-02a: one open viewing per account/room; legacy and manual rows have no owner.
-- VIEW-16 capacity and cross-building conflicts are checked under backend transaction locks.
CREATE UNIQUE INDEX viewings_one_open_per_user_room ON viewings (user_id, room_id)
  WHERE user_id IS NOT NULL AND status IN ('NEW', 'CONFIRMED');
