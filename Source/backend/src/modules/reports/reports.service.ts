import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { todayHanoi } from '../../common/date/today.js';
import { deriveRoomStatus } from '../rooms/room-status.js';
import { collected, debt, depositUsed, monthResult, type reportRange } from './report-math.js';

function occupancyCounts(occupied: number, rooms: number) {
  return { occupied, rooms, percent: rooms ? Math.round(10000 * occupied / rooms) / 100 : 0 };
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}

  async occupancy(ids: number[] | null, compare: boolean) {
    const buildings = await this.db.building.findMany({
      where: { id: ids ? { in: ids } : undefined }, orderBy: { id: 'asc' },
      select: { id: true, name: true, rooms: { where: { isActive: true }, select: {
        underMaintenance: true, contracts: { where: { status: { in: ['ACTIVE', 'HOLD'] } }, select: { status: true } },
      } } },
    });
    const comparison = buildings.map(({ id, name, rooms }) => ({
      buildingId: id, name, ...occupancyCounts(rooms.filter(r => deriveRoomStatus(r) === 'Đang thuê').length, rooms.length),
    }));
    const total = occupancyCounts(comparison.reduce((n, b) => n + b.occupied, 0), comparison.reduce((n, b) => n + b.rooms, 0));
    return { ...total, ...(compare ? { comparison } : {}) };
  }

  async revenue(ids: number[] | null, compare: boolean, range: ReturnType<typeof reportRange>) {
    const contract = { buildingId: ids ? { in: ids } : undefined };
    const dates = { gte: range.gte, lt: range.lt };
    const selectBuilding = { select: { buildingId: true } } as const;
    const today = todayHanoi();
    return this.db.$transaction(async tx => {
      const buildings = await tx.building.findMany({ where: { id: contract.buildingId }, select: { id: true, name: true }, orderBy: { id: 'asc' } });
      const payments = await tx.payment.findMany({ where: { paidAt: dates, invoice: { contract, type: { in: ['MONTHLY', 'FINAL'] } } },
        select: { amount: true, paidAt: true, invoice: { select: { type: true, contract: selectBuilding } } } });
      const settlements = await tx.settlement.findMany({ where: { contract, createdAt: dates },
        select: { deposit: true, net: true, createdAt: true, contract: selectBuilding } });
      const incidents = await tx.request.findMany({ where: { contract, type: 'INCIDENT', status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: dates },
        select: { cost: true, resolvedAt: true, contract: selectBuilding } });
      const unpaid = await tx.invoice.findMany({ where: { contract, status: 'UNPAID', type: { in: ['MONTHLY', 'FINAL'] } },
        select: { type: true, status: true, total: true, dueDate: true, contract: selectBuilding } });
      // UNION deduplicates the old ACTIVE and its HOLD renewal during handover.
      const deposits = buildings.length ? await tx.$queryRaw<{ buildingId: number; total: number }[]>`
        WITH RECURSIVE held(id, building_id, previous_contract_id) AS (
          SELECT id, building_id, previous_contract_id FROM contracts
          WHERE status IN ('HOLD','ACTIVE') AND building_id = ANY(${buildings.map(b => b.id)}::int[])
          UNION
          SELECT c.id, c.building_id, c.previous_contract_id FROM contracts c
          JOIN held h ON h.previous_contract_id = c.id AND h.building_id = c.building_id
        )
        SELECT h.building_id AS "buildingId", p.amount AS total FROM held h
        JOIN invoices i ON i.contract_id = h.id AND i.type = 'DEPOSIT' AND i.status = 'PAID'
        JOIN payments p ON p.invoice_id = i.id` : [];
      const summary = () => ({
        months: range.months.map(month => ({ month, ...monthResult(0, 0) })), outstanding: 0, overdue: 0, depositsHeld: 0,
      });
      const total = summary();
      const byId = new Map(buildings.map(b => [b.id, { buildingId: b.id, name: b.name, ...summary() }]));
      const monthIndex = new Map(range.months.map((month, i) => [month, i]));
      function targets(id: number) {
        const building = byId.get(id);
        return building ? [total, building] : [total];
      }
      function record(id: number, date: Date, revenue: number, costs: number) {
        const index = monthIndex.get(todayHanoi(date).toISOString().slice(0, 7))!;
        for (const target of targets(id)) {
          const month = target.months[index];
          Object.assign(month, monthResult(month.revenue + revenue, month.costs + costs));
        }
      }
      for (const p of payments) record(p.invoice.contract.buildingId, p.paidAt, collected(p.invoice.type, p.amount), 0);
      for (const s of settlements) record(s.contract.buildingId, s.createdAt, depositUsed(s.deposit, s.net), 0);
      for (const r of incidents) if (r.resolvedAt) record(r.contract.buildingId, r.resolvedAt, 0, r.cost ?? 0);
      for (const i of unpaid) {
        const balance = debt(i.type, i.status, i.total, i.dueDate, today);
        for (const target of targets(i.contract.buildingId)) {
          target.outstanding += balance.outstanding;
          target.overdue += balance.overdue;
        }
      }
      for (const d of deposits) for (const target of targets(d.buildingId)) target.depositsHeld += d.total;
      return { ...total, ...(compare ? { comparison: [...byId.values()] } : {}) };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
