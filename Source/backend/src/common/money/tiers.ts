import type { RateTierView } from '../rates/rates-at.js';

export interface MoneyLine {
  kind: 'RENT' | 'ELECTRIC' | 'WATER' | 'SERVICE' | 'PARKING';
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  meta?: Record<string, unknown>;
}

// 12-pricing "Electric tier calculation": the total kWh of the whole period is split over the tiers in tier_no order.
// 0 kWh gives exactly one line "Điện (0 kWh)" at the tier-1 price, so the tenant still sees the reading.
export function electricLines(kWh: number, tiers: readonly RateTierView[]): MoneyLine[] {
  if (!Number.isSafeInteger(kWh) || kWh < 0) throw new RangeError('kWh must be a nonnegative integer');
  const ordered = [...tiers].sort((a, b) => a.tierNo - b.tierNo);
  if (ordered.length === 0) throw new RangeError('electric rate has no tiers');
  if (kWh === 0) return [{ kind: 'ELECTRIC', label: 'Điện (0 kWh)', quantity: 0, unitPrice: ordered[0].unitPrice, amount: 0 }];
  const lines: MoneyLine[] = [];
  let remaining = kWh;
  let previousUpTo = 0;
  for (const tier of ordered) {
    const width = tier.upTo === null ? remaining : tier.upTo - previousUpTo;
    const quantity = Math.min(remaining, width);
    if (quantity > 0) {
      const from = previousUpTo === 0 ? 0 : previousUpTo + 1;
      const range = tier.upTo === null ? `${from}+` : `${from}–${tier.upTo}`;
      lines.push({
        kind: 'ELECTRIC', label: `Điện bậc ${tier.tierNo} (${range} kWh)`, quantity,
        unitPrice: tier.unitPrice, amount: quantity * tier.unitPrice, meta: { tierNo: tier.tierNo },
      });
    }
    remaining -= quantity;
    if (tier.upTo !== null) previousUpTo = tier.upTo;
    if (remaining === 0) break;
  }
  if (remaining > 0) throw new RangeError('the last tier must have no upper limit');
  return lines;
}
