import type { BuildingManager, ServiceUnit, WaterMode } from './api'

export const waterModeLabels: Record<WaterMode, string> = {
  PER_M3: 'Theo đồng hồ (m³)',
  PER_PERSON: 'Theo số người',
}

export const serviceUnitLabels: Record<ServiceUnit, string> = {
  ROOM: 'Theo phòng',
  PERSON: 'Theo người',
  VEHICLE: 'Theo xe',
}

// A locked manager stays on his building until Boss assigns another one (BLD-06), so the name is still shown.
export function managerText(manager: BuildingManager | null): string {
  if (!manager) return 'Chưa có quản lý'
  return manager.isActive ? manager.fullName : `${manager.fullName} (đã khóa)`
}
