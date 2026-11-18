import { HttpException } from '@nestjs/common';
import type { Prisma, Role, ViewingStatus } from '@prisma/client';
import { verifyPassword } from '../../common/crypto/password.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ContractsService } from './contracts.service.js';
import type { CreateContractDto } from './dto/create-contract.dto.js';

const actor: AuthUser = { id: 2, role: 'MANAGER', buildingIds: [1], mustChangePassword: false };
const request = {
  roomId: 11, signer: { fullName: 'Người Ký', phone: '0912345678' },
  startDate: '2027-01-31', termMonths: 3, serviceIds: [],
} satisfies CreateContractDto;
const tenant = {
  id: 41, role: 'TENANT' as Role, ...request.signer, email: 'signer@example.test',
  isActive: true, emailVerifiedAt: null as Date | null, passwordHash: 'existing-hash', mustChangePassword: false,
  locale: 'en',
};
type Account = typeof tenant;
type Source = { id: number; roomId: number; status: ViewingStatus; userId: number | null; source: 'WEB' | 'MANUAL';
  contractId?: number; handledById?: number; note?: string };
type SavedContract = Prisma.ContractUncheckedCreateInput & { id: number };
const writeConflict = (target: string[]) => ({ code: 'P2002', meta: { target } });

function fixture(accounts: Account[] = [tenant]) {
  const building = { id: 1, code: 'TL01', name: 'Tòa thử', isActive: true, managerId: 2, manager: { isActive: true } };
  const room = { id: 11, buildingId: 1, code: '303', price: 2_500_000 as number | null, building };
  const db = {
    accounts: structuredClone(accounts), contracts: [] as SavedContract[],
    viewings: [] as Source[], audit: [] as Prisma.AuditLogUncheckedCreateInput[],
  };
  const tx = {
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, ..._params: unknown[]) => []),
    room: {
      findUnique: vi.fn(async ({ where }: { where: Prisma.RoomWhereUniqueInput }) => {
        const allowed = (where.buildingId as { in?: number[] } | undefined)?.in;
        return where.id === room.id && (!allowed || allowed.includes(room.buildingId)) ? room : null;
      }),
      findFirst: vi.fn(async (_query: { where: Prisma.RoomWhereInput }): Promise<{ id: number } | null> => ({ id: room.id })),
    },
    service: {
      findMany: vi.fn(async (_query: { where: Prisma.ServiceWhereInput }) => [{ id: 9 }]),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: Prisma.UserWhereUniqueInput }) =>
        db.accounts.find(a => where.phone === a.phone) ?? null),
      create: vi.fn(async ({ data }: { data: Prisma.UserUncheckedCreateInput }) => {
        const saved = { ...tenant, ...data, id: 200 + db.accounts.length } as Account;
        db.accounts.push(saved);
        return saved;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<Account> }) => {
        const row = db.accounts.find(a => a.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    contract: {
      create: vi.fn(async ({ data }: { data: Prisma.ContractUncheckedCreateInput }) => {
        if (db.contracts.some(c => c.roomId === data.roomId)) throw writeConflict(['room_id']);
        const saved = { ...data, id: 123 + db.contracts.length };
        db.contracts.push(saved);
        return saved;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: number }; data: { code: string } }) => {
        const saved = db.contracts.find(c => c.id === where.id)!;
        Object.assign(saved, data);
        const found = db.accounts.find(a => a.id === saved.tenantId)!;
        return {
          ...saved, room: { id: room.id, code: room.code }, building: { id: building.id, code: building.code, name: building.name },
          tenant: { id: found.id, fullName: found.fullName, phone: found.phone, email: found.email },
          createdAt: new Date('2026-11-16T17:30:00Z'),
        };
      }),
    },
    viewing: {
      findFirst: vi.fn(async ({ where }: { where: { id: number; roomId: number } }) => {
        const found = db.viewings.find(v => v.id === where.id && v.roomId === where.roomId);
        if (!found) return null;
        const user = db.accounts.find(a => a.id === found.userId);
        return { ...found, user: user && { phone: user.phone } };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: number; roomId: number; status: ViewingStatus }; data: Partial<Source> }) => {
        const found = db.viewings.find(v => v.id === where.id && v.roomId === where.roomId && v.status === where.status);
        if (!found) return { count: 0 };
        Object.assign(found, data);
        return { count: 1 };
      }),
      updateManyAndReturn: vi.fn(async ({ where, data }: {
        where: { roomId: number; status: { in: ViewingStatus[] } }; data: Partial<Source>;
      }) => db.viewings.filter(v => v.roomId === where.roomId && where.status.in.includes(v.status))
        .map(v => { Object.assign(v, data); return { id: v.id }; })),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) => { db.audit.push(data); }),
    },
  };
  let tail = Promise.resolve();
  // The DB edge models the exclusive transaction lock, the room index, and commit/rollback.
  const prisma = {
    $transaction: vi.fn(<T>(work: (t: typeof tx) => Promise<T>) => {
      const result = tail.then(async () => {
        const previous = structuredClone(db);
        try {
          return await work(tx);
        } catch (error) {
          Object.assign(db, previous);
          throw error;
        }
      });
      tail = result.then(() => {}, () => {});
      return result;
    }),
  } as unknown as PrismaService;
  const service = new ContractsService(prisma, new AuditService(prisma));
  return { service, create: (data: CreateContractDto = request) => service.create(actor, data), tx, db, room };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<Record<string, string> | undefined> {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(HttpException);
  const body = (error as HttpException).getResponse();
  if (typeof body === 'string') {
    expect(body).toBe(code);
    return;
  }
  const data = body as { code?: string; message?: string; fields?: Record<string, string> };
  expect(data.code ?? data.message).toBe(code);
  return data.fields;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T17:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('CON-01..03: create HOLD', () => {
  it('CON-03 / D-41: sets the code, current rent, default deposit and the last day of a month-end term', async () => {
    const f = fixture();
    await expect(f.create()).resolves.toMatchObject({
      id: 123, code: 'HD000123', status: 'HOLD', rent: 2_500_000, deposit: 2_500_000,
      startDate: '2027-01-31', endDate: '2027-04-29', termMonths: 3,
    });
    expect(f.db.contracts[0].code).toBe('HD000123');
    expect(f.tx.$queryRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock(');
  });

  it('CON-01: refuses a two-month contract', async () => {
    const f = fixture();
    await expectCode(f.create({ ...request, termMonths: 2 }), 'CONTRACT_TERM_TOO_SHORT');
    expect(f.db.contracts).toHaveLength(0);
  });

  it('CON-01 / G-02: today in Hanoi is accepted, yesterday and an unrepresentable end are refused', async () => {
    await expectCode(fixture().create({ ...request, startDate: '2026-11-16' }), 'VALIDATION_FAILED');
    await expectCode(fixture().create({ ...request, termMonths: 2147483647 }), 'VALIDATION_FAILED');
    await expect(fixture().create({ ...request, startDate: '2026-11-17', deposit: 0 })).resolves.toMatchObject({ deposit: 0 });
  });

  it('CON-02: null price is distinguished from room ineligibility', async () => {
    const f = fixture();
    f.room.price = null;
    await expectCode(f.create(), 'PRICE_NOT_APPROVED');
    const g = fixture();
    g.tx.room.findFirst.mockResolvedValueOnce(null);
    await expectCode(g.create(), 'ROOM_NOT_AVAILABLE');
    expect(g.tx.room.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 11, isActive: true, underMaintenance: false, price: { not: null }, building: {
        isActive: true, AND: ['ELECTRIC', 'WATER'].map(kind => ({
          ratePlans: { some: { kind, status: 'APPROVED', effectiveFrom: { lte: new Date('2026-11-17') } } },
        })),
      } },
    }));
  });

  it('CON-01 / DB-B5 / Q-P3-9: applies the building, units, active and start-date rate filters', async () => {
    const f = fixture();
    await f.create({ ...request, serviceIds: [9] });
    expect(f.tx.service.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [9] }, buildingId: 1, unit: { in: ['ROOM', 'PERSON'] }, isActive: true,
        ratePlans: { some: { kind: 'SERVICE', status: 'APPROVED', effectiveFrom: { lte: new Date('2027-01-31') } } },
      },
      select: { id: true },
    });
    expect(f.db.contracts[0].services).toEqual({ create: [{ serviceId: 9 }] });
    const fields = await expectCode(fixture().create({ ...request, serviceIds: [9, 19] }), 'VALIDATION_FAILED');
    expect(fields).toHaveProperty('serviceIds');
  });

  it('SCOPE-02: a manager outside the building never reaches the account lookup', async () => {
    const f = fixture();
    f.room.building.managerId = 7;
    await expectCode(f.create(), 'OUT_OF_SCOPE');
    expect(f.tx.user.findUnique).not.toHaveBeenCalled();
    await expectCode(f.service.create({ ...actor, role: 'GUEST' }, request), 'FORBIDDEN');
  });

  it('SCOPE-02: a manager needs both the request scope and the current assignment', async () => {
    const f = fixture();
    await expectCode(f.service.create({ ...actor, buildingIds: [] }, request), 'OUT_OF_SCOPE');
    expect(f.tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('CON-02: two concurrent creates for a room yield one HOLD and one ROOM_NOT_AVAILABLE', async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.create(), f.create()]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    const blocked = results[1] as PromiseRejectedResult;
    await expectCode(Promise.reject(blocked.reason), 'ROOM_NOT_AVAILABLE');
    expect(f.tx.contract.create).toHaveBeenCalledTimes(2);
    expect(f.db.contracts).toHaveLength(1);
  });
});

describe('CON-07: signer account', () => {
  it('creates an inactive tenant with an unusable password when the phone is new', async () => {
    const f = fixture([]);
    const result = await f.create();
    const account = f.db.accounts[0];
    expect(account).toMatchObject({ role: 'TENANT', isActive: false, phone: request.signer.phone });
    expect(await verifyPassword(account.passwordHash, 'test-password')).toBe(false);
    expect(result.tenant.id).toBe(account.id);
    expect(result.tenant).not.toHaveProperty('passwordHash');
  });

  it('reuses a tenant without changing their account, including one awaiting signing', async () => {
    const active = fixture();
    await active.create();
    expect(active.db.accounts).toEqual([tenant]);
    const fresh = fixture([]);
    await fresh.create();
    const pending = fixture(fresh.db.accounts);
    await expect(pending.create()).resolves.toMatchObject({ tenant: { id: fresh.db.accounts[0].id } });
    expect(pending.db.accounts).toEqual(fresh.db.accounts);
  });

  it('A-18: discloses the verified guest in scope and requires confirmation of that account before promotion', async () => {
    const guest = { ...tenant, role: 'GUEST' as const, emailVerifiedAt: new Date('2026-11-01') };
    const f = fixture([guest]);
    const fields = await expectCode(f.create({ ...request, confirmedGuestAccountId: 99 }), 'PHONE_TAKEN');
    expect(fields).toMatchObject({
      guestAccountId: '41', guestAccountName: 'Người Ký', guestAccountEmail: 'signer@example.test',
    });
    expect(f.db.accounts).toEqual([guest]);
    f.db.viewings.push({ id: 4, roomId: 12, status: 'DONE', userId: 41, source: 'WEB' });
    await f.create({ ...request, confirmedGuestAccountId: 41 });
    expect(f.db.accounts).toEqual([{ ...guest, role: 'TENANT' }]);
    expect(f.db.viewings[0]).toMatchObject({ userId: 41 });
    expect(f.db.audit).toContainEqual(expect.objectContaining({
      action: 'user.role_change', entityId: 41, before: { role: 'GUEST' }, after: { role: 'TENANT' },
    }));
  });

  it('replaces the profile and password of a never-verified guest before linking their account', async () => {
    const f = fixture([{ ...tenant, role: 'GUEST' }]);
    await f.create({ ...request, signer: { ...request.signer, fullName: 'Thay Tên', email: 'new@example.test' } });
    expect(f.db.accounts[0]).toMatchObject({ id: 41, role: 'TENANT', isActive: false, fullName: 'Thay Tên', email: 'new@example.test' });
    expect(f.db.accounts[0].passwordHash).not.toBe(tenant.passwordHash);
    expect(f.tx.$queryRaw.mock.calls.flat()).toContain('otp:email:signer@example.test');
    expect(f.tx.$queryRaw.mock.calls.flat()).toContain('otp:email:new@example.test');
  });

  it.each(['BOSS', 'MANAGER'] as const)('refuses the phone of a %s without showing guest account details', async role => {
    const f = fixture([{ ...tenant, role }]);
    expect(await expectCode(f.create(), 'PHONE_TAKEN')).toBeUndefined();
  });

  it('refuses a staff-locked account with the specified field message', async () => {
    const f = fixture([{ ...tenant, isActive: false }]);
    expect(await expectCode(f.create(), 'ACCOUNT_LOCKED')).toEqual({ 'signer.phone': 'Tài khoản của số này đang bị khóa' });
    expect(f.db.accounts[0].isActive).toBe(false);
  });

  it('rejects a duplicate email at the DB boundary without taking over a different account', async () => {
    const f = fixture([]);
    f.tx.user.create.mockRejectedValueOnce(writeConflict(['email']));
    expect(await expectCode(f.create(), 'EMAIL_TAKEN')).toHaveProperty('signer.email');
    expect(f.db.contracts).toHaveLength(0);
  });
});

describe('CON-04..05 / VIEW-05..06: signer and viewing changes', () => {
  const booking: Source = { id: 4, roomId: 11, status: 'CONFIRMED', userId: 41, source: 'WEB' };
  const other: Source = { id: 5, roomId: 11, status: 'NEW', userId: null, source: 'MANUAL' };

  it('keeps only an encrypted CCCD and the last four digits in the signer row', async () => {
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 17).toString('base64'));
    const f = fixture();
    const cc = '000123456789';
    const result = await f.create({ ...request, signer: { ...request.signer, idNumber: cc } });
    expect(f.db.contracts[0].occupants).toMatchObject({ create: {
      isSigner: true, moveInDate: new Date('2027-01-31'), idNumberEnc: expect.stringMatching(/^v1:/), idNumberLast4: '6789',
    } });
    expect(JSON.stringify([result, f.db.audit, f.db.contracts])).not.toContain(cc);
  });

  it.each(['CONFIRMED', 'DONE'] as const)('turns a %s booking into WON, cancels only other open viewings of the room', async status => {
    const f = fixture();
    f.db.viewings.push({ ...booking, status }, { ...other }, { ...other, id: 6, roomId: 12 }, { ...booking, id: 7, status: 'LOST' });
    await f.create({ ...request, viewingId: 4 });
    expect(f.db.viewings).toMatchObject([
      { id: 4, status: 'WON', contractId: 123, userId: 41, handledById: actor.id },
      { id: 5, status: 'CANCELLED', note: 'Phòng đã có người đặt cọc', handledById: actor.id, depositCancelledByContractId: 123 },
      { id: 6, status: 'NEW' },
      { id: 7, status: 'LOST' },
    ]);
    expect(f.db.viewings.filter(viewing => 'depositCancelledByContractId' in viewing).map(viewing => viewing.id)).toEqual([5]);
    expect(f.db.audit).toContainEqual(expect.objectContaining({
      action: 'contract.create', entityId: 123, after: expect.objectContaining({ viewingId: 4, cancelledViewingIds: [5] }),
    }));
  });

  it('rejects a NEW booking as the source', async () => {
    const f = fixture();
    f.db.viewings.push({ ...booking, status: 'NEW' });
    await expectCode(f.create({ ...request, viewingId: 4 }), 'CONFLICT_STATE');
    expect(f.db.viewings[0].status).toBe('NEW');
    expect(f.db.contracts).toHaveLength(0);
  });

  it('Q-P3-10: an explicit different-owner confirmation preserves the owner and links the actual signer', async () => {
    const owner = { ...tenant, id: 42, phone: '0901234567', role: 'GUEST' as const };
    const f = fixture([tenant, owner]);
    f.db.viewings.push({ ...booking, userId: owner.id });
    expect(await expectCode(f.create({ ...request, viewingId: 4 }), 'CONFLICT_STATE')).toHaveProperty('confirmDifferentViewingOwner');
    await expect(f.create({ ...request, viewingId: 4, confirmDifferentViewingOwner: true })).resolves.toMatchObject({ tenant: { id: 41 } });
    expect(f.db.viewings[0]).toMatchObject({ status: 'WON', userId: 42, contractId: 123 });
  });

  it('rolls back the tenant promotion, contract, signer and both booking changes if the audit fails', async () => {
    const guest = { ...tenant, role: 'GUEST' as const, emailVerifiedAt: new Date('2026-11-01') };
    const f = fixture([guest]);
    f.db.viewings.push({ ...booking }, { ...other });
    f.tx.auditLog.create.mockImplementationOnce(async () => {}).mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(f.create({ ...request, viewingId: 4, confirmedGuestAccountId: 41 })).rejects.toThrow('audit unavailable');
    expect(f.db).toEqual({ accounts: [guest], contracts: [], viewings: [booking, other], audit: [] });
  });
});
