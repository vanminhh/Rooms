import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../app/auth-context'
import { listBuildings } from '../buildings/api'
import type { WaterMode } from '../buildings/api'

// Q-FE8B-3 / FE8B-10: waterMode from ONE cached GET /buildings list (no buildingId, never one call per building).
// The list is fetched only while its cache is empty; BuildingForm invalidates ['buildings'] after an edit.
// shortcut: one page of 100 buildings in scope (the BE maximum); page further if a scope ever has more.
export function useBuildingWaterMode(buildingId: number): WaterMode | undefined {
  const { user } = useAuth()
  const isBoss = user?.role === 'BOSS'
  const buildings = useQuery({
    queryKey: ['buildings', 'water-mode', isBoss],
    queryFn: () => listBuildings({ includeInactive: isBoss ? true : undefined, limit: 100 }),
    staleTime: Infinity,
  })
  return buildings.data?.data.find(building => building.id === buildingId)?.waterMode
}
