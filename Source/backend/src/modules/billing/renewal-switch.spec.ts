import { billedPeriod } from './billed-period.js';
import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { switchRenewal } from './renewal-switch.js';

// BIL-06, CON-18, CON-19, A-09, Q-P4-15. The old contract runs 01/09/2026 for 6 months (N = 6, end 28/02/2027);
// the signed renewal starts 01/03/2027. No route creates renewals yet (Phase 5), so the rows are built here.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const NOW = new Date('2027-03-03T17:05:00Z');

function fixture(opts: { waterMode?: 'PER_M3' | 'PER_PERSON'; final?: boolean; readings?: ('ELECTRIC' | 'WATER')[]; renewalSigner?: boolean } = {}) {
  const { waterMode = 'PER_M3', final = true, readings = ['ELECTRIC', 'WATER'], renewalSigner = false } = opts;
  const next = { id: 20, status: 'HOLD', signedAt: d('2027-02-10'), startDate: d('2027-03-01'), previousContractId: 10 };
  const old = { id: 10, code: 'HD000010', status: 'ACTIVE', startDate: d('2026-09-01'), termMonths: 6, endDate: d('2027-02-28'),
    building: { waterMode },
    occupants: [
      { id: 1, contractId: 10, createdAt: d('2026-09-01'), fullName: 'An', isSigner: true, moveInDate: d('2026-09-01'), moveOutDate: null },
      { id: 2, contractId: 10, createdAt: d('2026-09-01'), fullName: 'Bình', isSigner: false, moveInDate: d('2026-10-05'), moveOutDate: d('2026-12-01') },
    ],
    vehicles: [{ id: 5, contractId: 10, buildingId: 3, serviceId: 7, plate: '29A12345', type: 'MOTORBIKE', isActive: true, registeredAt: d('2026-09-01') }] };
  const reading = (id: number, kind: string, value: number) => ({ id, kind, value, roomId: 4, readOn: d('2027-02-28'), isOpening: false, readById: 2 });
  const tx = {
    $queryRaw: vi.fn(async () => []),
    contract: {
      findUnique: vi.fn(async () => ({ previousContractId: 10, roomId: 4 })),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: number } }) => (where.id === 20 ? next : old)),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    invoice: { findFirst: vi.fn(async () => (final ? { id: 99, meterReadings: readings.map((k, i) => reading(50 + i, k, k === 'ELECTRIC' ? 1_600 : 140)) } : null)) },
    meterReading: { create: vi.fn() },
    occupant: { count: vi.fn(async () => (renewalSigner ? 1 : 0)), createMany: vi.fn() },
    vehicle: { update: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { tx, old, run: () => switchRenewal(tx as unknown as Prisma.TransactionClient, 20, d('2027-03-03'), NOW) };
}

describe('BIL-06 renewal switch', () => {
  it('CON-19: late switch retains the actual date for a newly registered vehicle', async () => {
    const { old, tx, run } = fixture();
    old.vehicles[0].registeredAt = d('2027-03-02');
    await run();
    expect(tx.vehicle.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { isActive: false, removedAt: d('2027-03-02') } });
    expect(tx.vehicle.create).toHaveBeenCalledWith({ data: expect.objectContaining({ registeredAt: d('2027-03-02') }) });
  });
  it('CON-19/22: preserves a departed signer and includes a roommate through the departure day', async () => {
    const { tx, old, run } = fixture();
    old.occupants[0].moveOutDate = d('2027-02-27');
    old.occupants[1].moveOutDate = d('2027-03-01');
    await run();
    const copied = tx.occupant.createMany.mock.calls[0][0].data;
    expect(copied).toHaveLength(2);
    expect(copied).toContainEqual(expect.objectContaining({ isSigner: true, moveOutDate: d('2027-02-27') }));
    expect(copied).toContainEqual(expect.objectContaining({ isSigner: false, moveOutDate: d('2027-03-01') }));
  });
  it('BIL-06 catch-up: a missed switch day is switched by the next run once the period-N invoice and readings exist', async () => {
    const { tx, run } = fixture();
    expect(await run()).toBe('SWITCHED');
    expect(tx.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: 10, type: 'MONTHLY', periodNo: 6, AND: billedPeriod } }));
    expect(tx.contract.updateMany).toHaveBeenNthCalledWith(1, { where: { id: 10, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: NOW } });
    expect(tx.contract.updateMany).toHaveBeenNthCalledWith(2, { where: { id: 20, status: 'HOLD' }, data: { status: 'ACTIVE', movedInAt: d('2027-03-01') } });
  });

  it('AUD-01, AUD-03: the switch writes contract.renew with no actor; a waiting renewal writes nothing', async () => {
    const { tx, run } = fixture();
    await run();
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: null, action: 'contract.renew', entity: 'contract', entityId: 20 }) });
    const waiting = fixture({ final: false });
    await waiting.run();
    expect(waiting.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('CON-18: the old period-end readings become the new contract\'s opening readings', async () => {
    const { tx, run } = fixture();
    await run();
    expect(tx.meterReading.create.mock.calls.map(([a]) => [a.data.contractId, a.data.kind, a.data.value, a.data.isOpening])).toEqual([
      [20, 'ELECTRIC', 1_600, true], [20, 'WATER', 140, true]]);
  });

  it('CON-19: occupants still living there and active vehicles are copied; the old vehicle is closed at the old end date', async () => {
    const { tx, run } = fixture();
    await run();
    expect(tx.occupant.createMany).toHaveBeenCalledWith({ data: [
      { fullName: 'An', isSigner: true, moveInDate: d('2026-09-01'), moveOutDate: null, contractId: 20 }] });
    expect(tx.vehicle.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { isActive: false, removedAt: d('2027-02-28') } });
    expect(tx.vehicle.create).toHaveBeenCalledWith({ data: { contractId: 20, buildingId: 3, serviceId: 7, plate: '29A12345',
      type: 'MOTORBIKE', registeredAt: d('2027-03-01') } });
    expect(tx.vehicle.update.mock.invocationCallOrder[0]).toBeLessThan(tx.vehicle.create.mock.invocationCallOrder[0]); // vehicles_plate_active
  });

  it('CON-19: a renewal that already has its signer keeps it; copied people are not signers', async () => {
    const { tx, run } = fixture({ renewalSigner: true });
    await run();
    expect(tx.occupant.createMany.mock.calls[0][0].data[0].isSigner).toBe(false);
  });

  it('Q-P4-15: without the period-N invoice, or without its handover readings, the old contract stays ACTIVE', async () => {
    for (const [opts, outcome] of [[{ final: false }, 'WAITING_FINAL_INVOICE'], [{ readings: ['ELECTRIC'] as const }, 'WAITING_HANDOVER_READINGS']] as const) {
      const { tx, run } = fixture(opts);
      expect(await run()).toBe(outcome);
      expect(tx.contract.updateMany).not.toHaveBeenCalled();
    }
  });

  it('Q-P4-15, MTR-06: a PER_PERSON building also waits for the water handover reading (owner 22/11/2026)', async () => {
    expect(await fixture({ waterMode: 'PER_PERSON', readings: ['ELECTRIC'] }).run()).toBe('WAITING_HANDOVER_READINGS');
    expect(await fixture({ waterMode: 'PER_PERSON', readings: ['WATER'] }).run()).toBe('WAITING_HANDOVER_READINGS');
    expect(await fixture({ waterMode: 'PER_PERSON' }).run()).toBe('SWITCHED');
  });

  it('BIL-06: a renewal that is not signed, not started or whose old contract is no longer ACTIVE is left alone', async () => {
    const { tx, run } = fixture();
    tx.contract.findUniqueOrThrow.mockImplementation(async ({ where }) => (where.id === 20
      ? { id: 20, status: 'HOLD', signedAt: null, startDate: d('2027-03-01'), previousContractId: 10 }
      : { id: 10, status: 'ACTIVE' }) as never);
    expect(await run()).toBe('CHANGED');
    expect(tx.contract.updateMany).not.toHaveBeenCalled();
  });
});
