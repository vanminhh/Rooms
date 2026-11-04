import type { RateKind } from '@prisma/client';
import type {
  PriceChange,
  RatePlanComparison,
  RateTierView,
  TierChange,
  TierComparison,
} from './pricing.types.js';

export const NEW_PRICE_LABEL = 'Giá mới';

// PRC-12: (new − old) / old × 100, rounded half away from zero to 1 decimal, in integer arithmetic.
// Old 0 → null (Q-P5-2 A: shown as "0 → giá mới", no %).
// shortcut: assumes old >= 0 (DB CHECKs force price > 0 and unit_price >= 0), upgrade if negative prices are ever allowed.
export function percentChange(oldValue: number, newValue: number): number | null {
  if (oldValue === 0) return null;
  const tenths = Math.floor((2 * Math.abs(newValue - oldValue) * 1000 + oldValue) / (2 * oldValue));
  if (tenths === 0) return 0;
  return (newValue < oldValue ? -tenths : tenths) / 10;
}

// Room price, water and service (one value). oldValue null = no old approved value.
export function priceChange(oldValue: number | null, newValue: number): PriceChange {
  if (oldValue === null) return { oldValue: null, newValue, changePercent: null, label: NEW_PRICE_LABEL };
  return { oldValue, newValue, changePercent: percentChange(oldValue, newValue), label: null };
}

// Electric: tier tables side by side; tierChanges (per-tier %) only when the tier counts match (PRC-12).
export function electricComparison(oldTiers: RateTierView[] | null, newTiers: RateTierView[]): TierComparison {
  if (oldTiers === null) return { oldTiers: null, newTiers, tierChanges: null, label: NEW_PRICE_LABEL };
  const tierChanges: TierChange[] | null = oldTiers.length !== newTiers.length
    ? null
    : newTiers.map((tier, index) => ({
        tierNo: tier.tierNo,
        oldValue: oldTiers[index].unitPrice,
        newValue: tier.unitPrice,
        changePercent: percentChange(oldTiers[index].unitPrice, tier.unitPrice),
      }));
  return { oldTiers, newTiers, tierChanges, label: null };
}

// WATER and SERVICE plans have exactly one tier (RATE-02), so their comparison is that tier's unit price.
// No new tier means nothing to show: null, so an odd row never fails the approve/reject response (DTO requires >= 1 tier).
// An empty old tier list counts as no old value (label "Giá mới").
export function ratePlanComparison(
  kind: RateKind,
  oldTiers: RateTierView[] | null,
  newTiers: RateTierView[],
): RatePlanComparison | null {
  if (newTiers.length === 0) return null;
  const old = oldTiers?.length ? oldTiers : null;
  if (kind === 'ELECTRIC') return electricComparison(old, newTiers);
  return priceChange(old?.[0]?.unitPrice ?? null, newTiers[0].unitPrice);
}
