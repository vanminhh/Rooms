import { expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { recordBatch } from './record-batch.js';

it('MTR-11 preserves order and commits successful items separately', async () => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ building_id: 2 }]),
    invoice: { findMany: vi.fn().mockResolvedValue([{ id: 5, contractId: 2, status: 'DRAFT' }]),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'DRAFT' }) },
    meterReading: { findFirst: vi.fn().mockResolvedValueOnce({ value: 10 }).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: 100 }).mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 }) },
  };
  const db = { $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
  const raw = { roomId: 2, kind: 'ELECTRIC', value: 150, readOn: '2026-01-01' };
  const actor = { id: 1, role: 'BOSS' as const, buildingIds: null, mustChangePassword: false };
  const results = await recordBatch(db as unknown as PrismaService, actor, [raw, null, { ...raw, kind: 'WATER' }], async (_tx, r) => r);
  expect(results).toEqual([
    { index: 0, ok: true, data: { invoiceId: 5, readingId: 1, status: 'DRAFT' } },
    { index: 1, ok: false, error: 'VALIDATION_FAILED' },
    { index: 2, ok: true, data: { invoiceId: 5, readingId: 2, status: 'DRAFT' } },
  ]);
  expect(db.$transaction).toHaveBeenCalledTimes(2);
});
