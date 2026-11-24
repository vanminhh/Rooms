import { billedPeriod } from './billed-period.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { type ContractPeriod, contractPeriods } from '../../common/date/period.js';
import { addDays, compareDates } from '../../common/date/today.js';

// BIL-05 (D-21): billing dates in [today − 7 days, today] are created by the job; older ones are only counted
// and left to "Tạo hóa đơn kỳ này" (BIL-21).
export const CATCH_UP_DAYS = 7;

export interface DraftPlan { create: ContractPeriod[]; missedOld: ContractPeriod[] }

export function monthlyDraftPlan(contract: { startDate: Date; termMonths: number }, existingPeriodNos: readonly number[],
  today: Date): DraftPlan {
  const oldest = addDays(today, -CATCH_UP_DAYS);
  const plan: DraftPlan = { create: [], missedOld: [] };
  for (const p of contractPeriods(contract.startDate, contract.termMonths)) {
    if (existingPeriodNos.includes(p.periodNo) || compareDates(p.billingDate, today) > 0) continue;
    (compareDates(p.billingDate, oldest) < 0 ? plan.missedOld : plan.create).push(p);
  }
  return plan;
}

export const draftData = (contractId: number, p: ContractPeriod, createdById: number | null): Prisma.InvoiceCreateManyInput => ({
  contractId, type: 'MONTHLY', periodNo: p.periodNo, periodStart: p.periodStart, periodEnd: p.periodEnd, createdById,
});

export interface MonthlyDraftSummary { contracts: number; created: number; alreadyExisting: number; missedOld: number }

// BIL-05: one statement for the whole run. ON CONFLICT DO NOTHING (skipDuplicates) also covers the partial unique
// index invoices_one_per_period, so a parallel run's row counts as "already created", not as an error.
export async function createDueMonthlyDrafts(db: Pick<PrismaClient, 'contract' | 'invoice'>, today: Date): Promise<MonthlyDraftSummary> {
  const contracts = await db.contract.findMany({ where: { status: 'ACTIVE' }, select: { id: true, startDate: true, termMonths: true,
    invoices: { where: { type: 'MONTHLY', AND: billedPeriod }, select: { periodNo: true } } } });
  const data: Prisma.InvoiceCreateManyInput[] = [];
  let missedOld = 0;
  for (const c of contracts) {
    const plan = monthlyDraftPlan(c, c.invoices.map(i => i.periodNo), today);
    data.push(...plan.create.map(p => draftData(c.id, p, null)));
    missedOld += plan.missedOld.length;
  }
  const { count } = data.length ? await db.invoice.createMany({ data, skipDuplicates: true }) : { count: 0 };
  return { contracts: contracts.length, created: count, alreadyExisting: data.length - count, missedOld };
}
