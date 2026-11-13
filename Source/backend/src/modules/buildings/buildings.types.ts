import type { ServiceUnit, WaterMode } from '@prisma/client';

export interface BuildingView {
  id: number;
  code: string;
  name: string;
  address: string;
  district: string;
  ward: string;
  waterMode: WaterMode;
  dueDays: number;
  managerId: number | null;
  manager: { id: number; fullName: string; isActive: boolean } | null;
  amenities: string[]; // catalog codes only (BLD-08)
  legacyAmenities: string[]; // old free text, for staff only, until they choose from the list
  description: string | null;
  isActive: boolean;
  pendingViewingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceView {
  id: number;
  buildingId: number;
  name: string;
  unit: ServiceUnit;
  isActive: boolean;
  hasCurrentRate: boolean;
}
