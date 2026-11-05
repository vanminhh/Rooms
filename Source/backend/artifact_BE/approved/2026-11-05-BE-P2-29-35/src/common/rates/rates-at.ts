import type { Prisma, PrismaClient, RateKind } from '@prisma/client';

export interface RateTierView { tierNo: number; upTo: number | null; unitPrice: number }
export interface RateView {
  ratePlanId: number; kind: RateKind; serviceId: number | null;
  effectiveFrom: Date; reviewedAt: Date | null; tiers: RateTierView[];
}
export interface RatesAt { electric: RateView | null; water: RateView | null; services: Map<number, RateView> }

type RatePlanRow = Prisma.RatePlanGetPayload<{ include: { tiers: true } }>;

// Explicit mapping keeps reviewNote, proposedById, reviewedById out of public responses (PUB-04).
function toRateView(p: RatePlanRow): RateView {
  return {
    ratePlanId: p.id, kind: p.kind, serviceId: p.serviceId,
    effectiveFrom: p.effectiveFrom, reviewedAt: p.reviewedAt,
    tiers: p.tiers.map((t) => ({ tierNo: t.tierNo, upTo: t.upTo, unitPrice: t.unitPrice })),
  };
}

// RATE-04 + RATE-06: APPROVED plan with the greatest effective_from ≤ date, per (kind, serviceId).
// Missing rate → null (the caller decides; billing raises RATE_PLAN_MISSING).
export async function ratesAt(
  db: Pick<PrismaClient, 'ratePlan'>, buildingId: number, date: Date,
): Promise<RatesAt> {
  const plans = await db.ratePlan.findMany({
    where: { buildingId, status: 'APPROVED', effectiveFrom: { lte: date } },
    orderBy: [{ effectiveFrom: 'desc' }, { reviewedAt: 'desc' }, { id: 'desc' }],
    include: { tiers: { orderBy: { tierNo: 'asc' } } },
  });
  const out: RatesAt = { electric: null, water: null, services: new Map() };
  for (const p of plans) {
    const view = toRateView(p);
    if (p.kind === 'ELECTRIC') out.electric ??= view;
    else if (p.kind === 'WATER') out.water ??= view;
    else if (p.serviceId !== null && !out.services.has(p.serviceId)) out.services.set(p.serviceId, view);
  }
  return out;
}

// PUB-03: APPROVED plans that take effect after `date`, earliest first (shown as "Từ dd/mm/yyyy").
export async function ratesAfter(
  db: Pick<PrismaClient, 'ratePlan'>, buildingId: number, date: Date,
): Promise<RateView[]> {
  const plans = await db.ratePlan.findMany({
    where: { buildingId, status: 'APPROVED', effectiveFrom: { gt: date } },
    orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
    include: { tiers: { orderBy: { tierNo: 'asc' } } },
  });
  return plans.map(toRateView);
}

// PRC-06: APPROVED room price with the greatest effective_from ≤ date; same date → later reviewed_at wins.
export async function currentRoomPrice(
  db: Pick<PrismaClient, 'roomPrice'>, roomId: number, date: Date,
): Promise<{ id: number; price: number; effectiveFrom: Date; reviewedAt: Date | null } | null> {
  return db.roomPrice.findFirst({
    where: { roomId, status: 'APPROVED', effectiveFrom: { lte: date } },
    orderBy: [{ effectiveFrom: 'desc' }, { reviewedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, price: true, effectiveFrom: true, reviewedAt: true },
  });
}
