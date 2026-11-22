import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { parseReading, saveReading } from './save-reading.js';

const today = new Date('2026-10-01T00:00:00Z');
const item = { roomId: 2, kind: 'ELECTRIC', value: 1250, readOn: '2026-09-30' };
const actor = { id: 1, role: 'MANAGER' as const, buildingIds: [3], mustChangePassword: false };
function fixture() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ building_id: 3 }]),
    building: { findFirst: vi.fn().mockResolvedValue({ id: 3 }) },
    invoice: { findMany: vi.fn().mockResolvedValue([{ id: 7, status: 'DRAFT', contractId: 4 }]),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'DRAFT' }) },
    meterReading: { findFirst: vi.fn().mockResolvedValueOnce({ value: 1284 }).mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValue({ id: 17 }) },
  };
}
describe('MTR-03/04/10/11', () => {
  it.each([null, { ...item, value: -1 }, { ...item, readOn: '2026-09-31' }, { ...item, readOn: '2026-10-02' },
    { ...item, isMeterReplaced: true }, { ...item, oldMeterFinal: 1300 }])('rejects an invalid item', raw => {
    expect(() => parseReading(raw, today)).toThrow('VALIDATION_FAILED');
  });
  it('rejects a decrease from 1284 to 1250', async () => {
    const tx = fixture();
    await expect(saveReading(tx as unknown as Prisma.TransactionClient, actor, parseReading(item, today))).rejects.toThrow('METER_VALUE_DECREASED');
    expect(tx.meterReading.create).not.toHaveBeenCalled();
  });
  it('records old final 1300 and new start zero on the selected invoice', async () => {
    const tx = fixture();
    await saveReading(tx as unknown as Prisma.TransactionClient, actor,
      parseReading({ ...item, value: 0, isMeterReplaced: true, oldMeterFinal: 1300, invoiceId: 7 }, today));
    expect(tx.meterReading.create).toHaveBeenCalledWith({ data: expect.objectContaining({ value: 0, oldMeterFinal: 1300, invoiceId: 7, contractId: 4 }) });
  });
  it('requires a selection for overlapping eligible periods', async () => {
    const tx = fixture();
    tx.invoice.findMany.mockResolvedValue([{ id: 6 }, { id: 7 }]);
    await expect(saveReading(tx as unknown as Prisma.TransactionClient, actor, parseReading(item, today))).rejects.toThrow('CONFLICT_STATE');
  });
  it('rechecks staff scope before selecting invoices', async () => {
    const tx = fixture();
    tx.building.findFirst.mockResolvedValue(null);
    await expect(saveReading(tx as unknown as Prisma.TransactionClient, actor, parseReading(item, today))).rejects.toThrow('OUT_OF_SCOPE');
    expect(tx.invoice.findMany).not.toHaveBeenCalled();
  });
});
it('MTR-04 accepts a mid-period replacement before a draft exists', async () => {
  const tx = { ...fixture(), contract: { findFirst: vi.fn().mockResolvedValue({ id: 4 }) } };
  tx.invoice.findMany.mockResolvedValue([]);
  tx.meterReading.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce({ value: 1284 }).mockResolvedValueOnce(null);
  const result = await saveReading(tx as unknown as Prisma.TransactionClient, actor,
    parseReading({ ...item, value: 0, readOn: '2026-09-20', isMeterReplaced: true, oldMeterFinal: 1300 }, today));
  expect(result.invoiceId).toBeNull();
  expect(tx.meterReading.create).toHaveBeenCalledWith({ data: expect.objectContaining({ contractId: 4, invoiceId: null, oldMeterFinal: 1300 }) });
});
