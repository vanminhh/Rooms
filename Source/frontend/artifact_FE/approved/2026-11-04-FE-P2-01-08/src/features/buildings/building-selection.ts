import { createContext, useContext } from 'react'
import type { Me, MeBuilding } from '../auth/api'

// 'all': Boss "Tất cả tòa". null: a manager with no building picked yet (0 or 2+ buildings); the list then
// calls the API without buildingId and the BE returns every building in scope (Q-FE8A-4).
export type BuildingSelection = number | 'all' | null

export interface BuildingSelectionValue {
  selectedBuildingId: BuildingSelection
  setSelectedBuildingId(id: number | 'all'): void
}

// The pick is tagged with its account, so the next account never inherits another user's building.
export interface StoredChoice {
  userId: number
  value: number | 'all'
}

const STORAGE_KEY = 'rooms.buildingSelection'

export function readStoredChoice(): StoredChoice | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredChoice) : null
  } catch {
    return null // storage blocked or corrupt: use the default
  }
}

export function writeStoredChoice(choice: StoredChoice): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // storage blocked: the in-memory choice still applies until the page reloads
  }
}

// Keeps a stored choice only while the same account still sees that building (SCOPE-02, AUTH-08).
// Otherwise: Boss gets "Tất cả tòa"; a manager with exactly one building gets it; else null (not picked).
export function resolveSelection(user: Me | null, stored: StoredChoice | null): BuildingSelection {
  const buildings: MeBuilding[] = user?.buildings ?? []
  const isBoss = user?.role === 'BOSS'
  if (user && stored?.userId === user.id) {
    if (stored.value === 'all' && isBoss) return 'all'
    if (typeof stored.value === 'number' && buildings.some(building => building.id === stored.value)) return stored.value
  }
  if (isBoss) return 'all'
  return buildings.length === 1 ? buildings[0].id : null
}

export const BuildingSelectionContext = createContext<BuildingSelectionValue | null>(null)

export function useBuildingSelection(): BuildingSelectionValue {
  const value = useContext(BuildingSelectionContext)
  if (!value) throw new Error('useBuildingSelection must be used inside BuildingSelectionProvider')
  return value
}
