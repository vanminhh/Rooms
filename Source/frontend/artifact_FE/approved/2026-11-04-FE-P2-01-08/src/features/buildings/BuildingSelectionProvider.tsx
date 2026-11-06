import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../../app/auth-context'
import { BuildingSelectionContext, readStoredChoice, resolveSelection, writeStoredChoice } from './building-selection'
import type { BuildingSelectionValue, StoredChoice } from './building-selection'

// Holds the staff building pick for the session. The value is re-resolved on every render, so a refresh
// that removes a building from user.buildings falls back at once.
export function BuildingSelectionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [stored, setStored] = useState<StoredChoice | null>(readStoredChoice)
  const userId = user?.id

  const setSelectedBuildingId = useCallback((id: number | 'all') => {
    if (userId === undefined) return
    const choice: StoredChoice = { userId, value: id }
    writeStoredChoice(choice)
    setStored(choice)
  }, [userId])

  const value = useMemo<BuildingSelectionValue>(
    () => ({ selectedBuildingId: resolveSelection(user, stored), setSelectedBuildingId }),
    [user, stored, setSelectedBuildingId],
  )

  return <BuildingSelectionContext.Provider value={value}>{children}</BuildingSelectionContext.Provider>
}
