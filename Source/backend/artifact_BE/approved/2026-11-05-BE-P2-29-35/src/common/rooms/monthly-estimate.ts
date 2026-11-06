import type { PublicEstimate, PublicRateView } from '../../modules/rooms/public.types.js';

// One active service of the building (SVC-04: locked services are never passed in).
export interface EstimateService {
  name: string;
  unit: 'ROOM' | 'PERSON' | 'VEHICLE';
  rate: PublicRateView | null; // null = no rate in effect today
}

export interface MonthlyEstimateInput {
  price: number;
  waterMode: 'PER_M3' | 'PER_PERSON';
  water: PublicRateView | null;
  services: EstimateService[];
}

const METERED_NOTE = 'chưa gồm điện, nước – tính theo đồng hồ của phòng';

// ROOM-08 / A-05: integer đồng at today's rates. Electricity and per-m³ water are never added.
// Rate tiers are validated non-empty on approval (pricing.dto), so tiers[0] is the unit price.
export function buildEstimate(input: MonthlyEstimateInput): {
  deposit: number; monthlyEstimate: number; estimate: PublicEstimate;
} {
  const items: { label: string; amount: number }[] = [{ label: 'Giá thuê', amount: input.price }];
  const missing: string[] = [];
  for (const service of input.services) {
    if (!service.rate) missing.push(`chưa gồm: ${service.name} (chưa có giá)`);
    else if (service.unit !== 'VEHICLE') items.push({ label: service.name, amount: service.rate.tiers[0].unitPrice });
  }
  if (input.waterMode === 'PER_PERSON' && input.water) {
    items.push({ label: 'Nước (1 người)', amount: input.water.tiers[0].unitPrice });
  }
  return {
    deposit: input.price,
    monthlyEstimate: items.reduce((sum, item) => sum + item.amount, 0),
    estimate: { items, missing, meteredNote: METERED_NOTE },
  };
}
