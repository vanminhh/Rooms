import { useId } from 'react'
import { useAuth } from '../../app/auth-context'
import { useBuildingSelection } from './building-selection'

// Staff building selector (FE-P2-03). Boss gets "Tất cả tòa"; a manager only sees his own buildings.
export function BuildingSelector() {
  const { user } = useAuth()
  const { selectedBuildingId, setSelectedBuildingId } = useBuildingSelection()
  const selectId = useId()
  const buildings = user?.buildings ?? []
  const isBoss = user?.role === 'BOSS'
  const isEmpty = buildings.length === 0
  // Placeholder only: a manager with null does not block the list, which then loads without buildingId (Q-FE8A-4).
  const value = isEmpty || selectedBuildingId === null ? '' : String(selectedBuildingId)

  return <div className="rooms-field layout-building-select">
    <label className="rooms-field-label" htmlFor={selectId}>Tòa</label>
    <select
      id={selectId}
      className="rooms-field-input"
      value={value}
      disabled={isEmpty}
      onChange={event => setSelectedBuildingId(event.target.value === 'all' ? 'all' : Number(event.target.value))}
    >
      {isEmpty && <option value="">Chưa được giao tòa nào</option>}
      {!isEmpty && isBoss && <option value="all">Tất cả tòa</option>}
      {!isEmpty && !isBoss && selectedBuildingId === null && <option value="" disabled>Chọn tòa</option>}
      {buildings.map(building => <option key={building.id} value={building.id}>{building.code} · {building.name}</option>)}
    </select>
  </div>
}
