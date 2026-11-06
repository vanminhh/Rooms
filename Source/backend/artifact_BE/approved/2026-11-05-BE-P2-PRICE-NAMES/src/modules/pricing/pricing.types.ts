import type { ApprovalStatus, RateKind } from '@prisma/client';

// PRC-12 comparison. Water/service/room use PriceChange; electric uses TierComparison.
// label is "Giá mới" when there is no old value (then no %); changePercent is null for old 0 (Q-P5-2 A).
export interface PriceChange {
  oldValue: number | null;
  newValue: number;
  changePercent: number | null;
  label: string | null;
}

export interface TierChange {
  tierNo: number;
  oldValue: number;
  newValue: number;
  changePercent: number | null;
}

export interface TierComparison {
  oldTiers: RateTierView[] | null;
  newTiers: RateTierView[];
  tierChanges: TierChange[] | null;
  label: string | null;
}

export type RatePlanComparison = PriceChange | TierComparison;

// Dates are YYYY-MM-DD, timestamps ISO 8601 (API-06); money is integer đồng.
export interface RoomPriceView {
  id: number;
  roomId: number;
  buildingId: number;
  price: number;
  effectiveFrom: string;
  status: ApprovalStatus;
  reason: string | null;
  proposedById: number;
  reviewedById: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  expired: boolean; // PRC-07: PENDING with effective_from before today
  comparison: PriceChange;
  roomCode: string; // Q-FE8B-2: rooms.code as the rooms API returns it, e.g. "203"
  buildingName: string; // buildings.name
}

export interface RateTierView {
  tierNo: number;
  upTo: number | null;
  unitPrice: number;
}

export interface RatePlanView {
  id: number;
  buildingId: number;
  kind: RateKind;
  serviceId: number | null;
  effectiveFrom: string;
  status: ApprovalStatus;
  reason: string | null;
  proposedById: number;
  reviewedById: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  expired: boolean; // PRC-07
  tiers: RateTierView[];
  comparison: RatePlanComparison | null; // null when the plan has no tiers to compare
  buildingName: string; // buildings.name (Q-FE8B-2)
}
