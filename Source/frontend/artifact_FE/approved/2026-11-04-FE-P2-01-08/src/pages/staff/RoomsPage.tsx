import { useState } from 'react'
import { Checkbox, RoomsButton, SectionHeading } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { RoomForm } from '../../features/rooms/RoomForm'
import { RoomGrid } from '../../features/rooms/RoomGrid'
import '../../features/rooms/staff-rooms.css'

// Staff room page (ROOM-01..09): floor grid of the selected scope, inspector, and the create form.
export function RoomsPage() {
  const { selectedBuildingId } = useBuildingSelection()
  const [showLocked, setShowLocked] = useState(false)
  const [creating, setCreating] = useState(false)
  // A room is created in one building, so "Tất cả tòa" or no pick disables the button.
  const canCreate = typeof selectedBuildingId === 'number'

  return <>
    <SectionHeading>Phòng</SectionHeading>
    <div className="staff-room-toolbar">
      <RoomsButton disabled={!canCreate || creating} onClick={() => setCreating(true)}>Thêm phòng</RoomsButton>
      <Checkbox label="Hiện phòng đã khóa" checked={showLocked} onChange={event => setShowLocked(event.target.checked)} />
    </div>
    {!canCreate && <p className="staff-room-hint">Chọn một tòa ở thanh chọn tòa để thêm phòng.</p>}
    {creating && typeof selectedBuildingId === 'number' && <RoomForm key={selectedBuildingId} buildingId={selectedBuildingId} onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />}
    {/* Keyed by scope: page and selection restart when the building or the locked filter changes. */}
    <RoomGrid key={`${selectedBuildingId}-${showLocked}`} selection={selectedBuildingId} includeInactive={showLocked || undefined} />
  </>
}
