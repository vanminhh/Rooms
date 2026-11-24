import type { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ContractsService } from './contracts.service.js';
import { RenewContractDto } from './dto/renew-contract.dto.js';

const manager: AuthUser = { id: 2, role: 'MANAGER', buildingIds: [1], mustChangePassword: false };

function fixture() {
  const source = {
    buildingId: 1, roomId: 7, tenantId: 22, status: 'ACTIVE', nextContract: null as { id: number } | null,
    building: { managerId: 2, isActive: true, manager: { isActive: true } },
    terms: 'Original', deposit: 0, rent: 3500000, endDate: new Date('2028-02-28'), services: [{ serviceId: 17 }],
  };
  const tx = {
    $queryRaw: vi.fn(),
    contract: {
      findUnique: vi.fn(async () => source),
      findUniqueOrThrow: vi.fn(async () => source),
      create: vi.fn(async () => ({ id: 31 })),
      update: vi.fn(async () => ({ createdAt: new Date(), startDate: new Date('2028-02-29'), endDate: new Date('2028-05-28') })),
    },
    auditLog: { create: vi.fn() },
  };
  const prisma = { $transaction: (fn: (client: Prisma.TransactionClient) => unknown) =>
    fn(tx as unknown as Prisma.TransactionClient) } as unknown as PrismaService;
  return { service: new ContractsService(prisma, new AuditService(prisma)), tx, source };
}

describe('CON-17 renewal creation', () => {
  it.each([{ termMonths: '3' }, { termMonths: 3.5 }, { termMonths: 3, terms: false }])(
    'CON-17 rejects invalid request fields %j', async fields => {
      expect((await validate(Object.assign(new RenewContractDto(), fields))).length).toBeGreaterThan(0);
    },
  );
  it('DB-B7 starts March 1 after leap February and DB-B1 preserves a positive deposit', async () => {
    const { service, source, tx } = fixture();
    source.endDate = new Date('2028-02-29');
    source.deposit = 1700000;
    await service.renew(manager, 19, { termMonths: 3 });
    expect(tx.contract.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      startDate: new Date('2028-03-01'), endDate: new Date('2028-05-31'), deposit: 1700000,
    }) }));
  });
  it.each([[undefined, 'Original'], ['Edited', 'Edited'], [null, null]] as const)(
    'D-46 terms %s and DB-B7 leap day', async (terms, expected) => {
      const { service, tx } = fixture();
      const result = await service.renew(manager, 19, { termMonths: 3, terms });
      expect(result.previousContractId).toBe(19);
      expect(tx.contract.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
        status: 'HOLD', previousContractId: 19, roomId: 7, tenantId: 22, buildingId: 1, rent: 3500000, deposit: 0,
        startDate: new Date('2028-02-29'), endDate: new Date('2028-05-28'), terms: expected, services: { create: [{ serviceId: 17 }] },
      }) }));
      expect(tx.auditLog.create).toHaveBeenCalledOnce();
    },
  );
  it.each(['HOLD', 'ENDED', 'CANCELLED'])('CON-17 rejects a %s source', async status => {
    const { service, source, tx } = fixture();
    source.status = status;
    await expect(service.renew(manager, 19, { termMonths: 3 })).rejects.toThrow('CONFLICT_STATE');
    expect(tx.contract.create).not.toHaveBeenCalled();
  });
  it('CON-17 rejects a duplicate, a short term and an out-of-scope manager', async () => {
    const { service, source, tx } = fixture();
    await expect(service.renew(manager, 19, { termMonths: 2 })).rejects.toThrow('CONTRACT_TERM_TOO_SHORT');
    await expect(service.renew({ ...manager, buildingIds: [5] }, 19, { termMonths: 3 })).rejects.toThrow('OUT_OF_SCOPE');
    source.nextContract = { id: 31 };
    await expect(service.renew(manager, 19, { termMonths: 3 })).rejects.toThrow('CONFLICT_STATE');
    expect(tx.contract.create).not.toHaveBeenCalled();
  });
});
