import { BadRequestException, ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { addDays, compareDates, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PricingService } from './pricing.service.js';

// CP-2 · BE-P2-23 · RATE-01/02/03, SVC-04, Q-P5-8, Q-P5-7, API-08, G-02.
// The unit under test is PricingService itself (never mocked). The only mocked edges are
// Prisma ($transaction/tx delegates) and, in the HTTP block, the whole PrismaService.

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10, 12] };

interface BuildingFixture { id: number; isActive: boolean }
interface ServiceFixture { id: number; buildingId: number; isActive: boolean }

function makeHarness(buildings: BuildingFixture[], services: ServiceFixture[]) {
  const buildingMap = new Map(buildings.map((b) => [b.id, b]));
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const ratePlanRows: any[] = [];
  let nextPlanId = 1;
  let nextTierId = 1;
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    building: {
      findUnique: vi.fn(async ({ where }: any) => {
        const b = buildingMap.get(where.id);
        return b ? { id: b.id, isActive: b.isActive } : null;
      }),
    },
    service: {
      findUnique: vi.fn(async ({ where }: any) => {
        const s = serviceMap.get(where.id);
        return s ? { buildingId: s.buildingId, isActive: s.isActive } : null;
      }),
    },
    ratePlan: {
      // CP-4: approveRatePlanInTx (Boss self-approve, PRC-04) re-reads the row under the lock.
      findUnique: vi.fn(async ({ where }: any) => {
        const row = ratePlanRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      // CP-6: toRatePlanView's oldRateTiers comparison lookup; no prior APPROVED plan in these CP-2 fixtures.
      findFirst: vi.fn(async () => null),
      // Generic matcher: supports supersede-by-(building,kind,service)+status (propose), the
      // future-APPROVED supersede (PRC-08, effectiveFrom >= gte) and the final by-id transition.
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.buildingId !== undefined && row.buildingId !== where.buildingId) return false;
          if (where.kind !== undefined && row.kind !== where.kind) return false;
          if (where.serviceId !== undefined && row.serviceId !== where.serviceId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const tiers = (data.tiers?.create ?? []).map((t: any) => ({ id: nextTierId++, ...t }));
        const row = {
          id: nextPlanId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(),
          ...data, tiers, // `tiers` overrides data.tiers ({ create: [...] }) with the resolved rows, like real Prisma's include
        };
        ratePlanRows.push(row);
        return row;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => { auditRows.push(data); return { id: auditRows.length, ...data }; }),
    },
  };

  let lockTail = Promise.resolve();
  const prisma: any = {
    $transaction: vi.fn(async (callback: (c: any) => unknown) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
  };
  const audit = new AuditService(prisma);
  const service = new PricingService(prisma, audit);
  return { service, tx, prisma, ratePlanRows, auditRows };
}

const today = () => formatDateOnly(todayHanoi());
function electricDto(overrides: Record<string, unknown> = {}) {
  return {
    buildingId: 10, kind: 'ELECTRIC', effectiveFrom: today(),
    tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2500 }],
    ...overrides,
  };
}
function waterDto(overrides: Record<string, unknown> = {}) {
  return { buildingId: 10, kind: 'WATER', effectiveFrom: today(), tiers: [{ tierNo: 1, upTo: null, unitPrice: 20000 }], ...overrides };
}
function serviceDto(overrides: Record<string, unknown> = {}) {
  return {
    buildingId: 10, kind: 'SERVICE', serviceId: 201, effectiveFrom: today(),
    tiers: [{ tierNo: 1, upTo: null, unitPrice: 50000 }], ...overrides,
  };
}

describe('CP-2 · PricingService.proposeRatePlan (unit, fake Prisma)', () => {
  const activeBuilding10: BuildingFixture = { id: 10, isActive: true };
  const outOfScopeBuilding11: BuildingFixture = { id: 11, isActive: true };
  const lockedBuilding12: BuildingFixture = { id: 12, isActive: false };
  const activeService201: ServiceFixture = { id: 201, buildingId: 10, isActive: true };
  const lockedService202: ServiceFixture = { id: 202, buildingId: 10, isActive: false };
  const otherBuildingService203: ServiceFixture = { id: 203, buildingId: 20, isActive: true };

  it('RATE-01, PRC-04: ELECTRIC with several tiers from Boss is APPROVED immediately (self-review), tiers kept in ascending tierNo', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], []);
    const result = await service.proposeRatePlan(boss, electricDto() as any);
    expect(result).toMatchObject({ buildingId: 10, kind: 'ELECTRIC', serviceId: null, status: 'APPROVED', reviewedById: 1 });
    expect(result.tiers).toEqual([{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2500 }]);
    expect(ratePlanRows).toHaveLength(1);
  });

  it('RATE-01/RATE-03: WATER with exactly 1 unlimited tier is accepted regardless of the building water_mode (PER_M3 or PER_PERSON only changes the meaning of unit_price, not this validation)', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const result = await service.proposeRatePlan(manager, waterDto() as any);
    expect(result).toMatchObject({ kind: 'WATER', serviceId: null, status: 'PENDING' });
    expect(result.tiers).toEqual([{ tierNo: 1, upTo: null, unitPrice: 20000 }]);
  });

  it('RATE-01: SERVICE with a valid serviceId in the same building is accepted', async () => {
    const { service } = makeHarness([activeBuilding10], [activeService201]);
    const result = await service.proposeRatePlan(manager, serviceDto() as any);
    expect(result).toMatchObject({ kind: 'SERVICE', serviceId: 201, status: 'PENDING' });
  });

  it('RATE-01: kind=SERVICE without serviceId is 400 VALIDATION_FAILED field serviceId, checked before any DB call', async () => {
    const { service, prisma } = makeHarness([activeBuilding10], []);
    await expect(
      service.proposeRatePlan(boss, serviceDto({ serviceId: undefined }) as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('RATE-01: kind=ELECTRIC with a serviceId attached is 400 VALIDATION_FAILED field serviceId, checked before any DB call', async () => {
    const { service, prisma } = makeHarness([activeBuilding10], []);
    await expect(
      service.proposeRatePlan(boss, electricDto({ serviceId: 201 }) as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('RATE-01: kind=WATER with a serviceId attached is 400 VALIDATION_FAILED field serviceId', async () => {
    const { service, prisma } = makeHarness([activeBuilding10], []);
    await expect(
      service.proposeRatePlan(boss, waterDto({ serviceId: 201 }) as any),
    ).rejects.toMatchObject({ constructor: BadRequestException, status: 400, response: { fields: { serviceId: expect.any(String) } } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // RATE-02 · tier order and shape ([ASSUMPTION P5-3]: no silent sort of the submitted array).
  it('[ASSUMPTION P5-3] RATE-02: tiers sent out of order (tierNo 2 then 1) is 400 VALIDATION_FAILED field tiers, not silently sorted', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 2, upTo: null, unitPrice: 2500 }, { tierNo: 1, upTo: 100, unitPrice: 1800 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({
      constructor: BadRequestException, status: 400, response: { code: 'VALIDATION_FAILED', fields: { tiers: expect.any(String) } },
    });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('RATE-02: duplicate tierNo (1, 1) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 1, upTo: null, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: tierNo starting at 0 instead of 1 is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 0, upTo: 100, unitPrice: 1800 }, { tierNo: 1, upTo: null, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: tierNo starting at 2 instead of 1 is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 2, upTo: 100, unitPrice: 1800 }, { tierNo: 3, upTo: null, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: tierNo jumps from 1 to 3 (skips 2) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 3, upTo: null, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: up_to not strictly increasing between tiers (100 then 100) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({
      tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: 100, unitPrice: 2200 }, { tierNo: 3, upTo: null, unitPrice: 2500 }],
    });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: up_to decreasing (200 then 100) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({
      tiers: [{ tierNo: 1, upTo: 200, unitPrice: 1800 }, { tierNo: 2, upTo: 100, unitPrice: 2200 }, { tierNo: 3, upTo: null, unitPrice: 2500 }],
    });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: first tier up_to = 0 is 400 VALIDATION_FAILED field tiers (up_to must be > 0, matches rate_tiers_values CHECK)', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: 0, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: first tier up_to negative (-5) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: -5, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: missing terminating null on the last tier is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: 200, unitPrice: 2500 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: a middle tier with up_to = null (not the last) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({
      tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2200 }, { tierNo: 3, upTo: null, unitPrice: 2500 }],
    });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: unit_price = 0 is a valid, non-error tier value', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 0 }, { tierNo: 2, upTo: null, unitPrice: 2500 }] });
    const result = await service.proposeRatePlan(boss, dto as any);
    expect(result.tiers[0]).toEqual({ tierNo: 1, upTo: 100, unitPrice: 0 });
  });

  it('RATE-02: WATER with 2 tiers (should be exactly 1) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = waterDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 15000 }, { tierNo: 2, upTo: null, unitPrice: 20000 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: SERVICE with 2 tiers (should be exactly 1) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], [activeService201]);
    const dto = serviceDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 15000 }, { tierNo: 2, upTo: null, unitPrice: 20000 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('RATE-02: SERVICE with 1 tier whose up_to is not null (should be null) is 400 VALIDATION_FAILED field tiers', async () => {
    const { service } = makeHarness([activeBuilding10], [activeService201]);
    const dto = serviceDto({ tiers: [{ tierNo: 1, upTo: 100, unitPrice: 15000 }] });
    await expect(service.proposeRatePlan(boss, dto as any)).rejects.toMatchObject({ response: { fields: { tiers: expect.any(String) } } });
  });

  it('G-01: up_to and unit_price at the exact Int32 max boundary are accepted and stored as exact integers', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const dto = electricDto({ tiers: [{ tierNo: 1, upTo: 2147483647, unitPrice: 1 }, { tierNo: 2, upTo: null, unitPrice: 2147483647 }] });
    const result = await service.proposeRatePlan(boss, dto as any);
    expect(result.tiers[0].upTo).toBe(2147483647);
    expect(result.tiers[1].unitPrice).toBe(2147483647);
    expect(Number.isInteger(result.tiers[1].unitPrice)).toBe(true);
  });

  // SVC-04 / Q-P5-8 A: all three serviceId error branches collapse to the same 400, never 404/403.
  it('[SVC-04,Q-P5-8] a locked service (is_active=false) in the same building is 400 VALIDATION_FAILED field serviceId, not NOT_FOUND', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], [lockedService202]);
    await expect(
      service.proposeRatePlan(manager, serviceDto({ serviceId: 202 }) as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('[SVC-04,Q-P5-8] a serviceId that does not exist is 400 VALIDATION_FAILED field serviceId, not NOT_FOUND, even for Boss', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], []);
    await expect(
      service.proposeRatePlan(boss, serviceDto({ serviceId: 999999 }) as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('[SVC-04,Q-P5-8] a serviceId that belongs to a different building is 400 VALIDATION_FAILED field serviceId, not NOT_FOUND nor OUT_OF_SCOPE, even for Boss (no scope check applies to Boss at all)', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], [otherBuildingService203]);
    await expect(
      service.proposeRatePlan(boss, serviceDto({ serviceId: 203 }) as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('[SVC-04,Q-P5-8] a serviceId belonging to a different building is still 400 VALIDATION_FAILED field serviceId for a manager whose scope already covers the plan building (service error is not conflated with scope)', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], [otherBuildingService203]);
    await expect(
      service.proposeRatePlan(manager, serviceDto({ serviceId: 203 }) as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('[SVC-04,Q-P5-8] all three serviceId failure causes produce the exact same error code+field, indistinguishable from each other (no existence leak)', async () => {
    const h1 = makeHarness([activeBuilding10], [lockedService202]);
    const h2 = makeHarness([activeBuilding10], []);
    const h3 = makeHarness([activeBuilding10], [otherBuildingService203]);
    const results = await Promise.allSettled([
      h1.service.proposeRatePlan(boss, serviceDto({ serviceId: 202 }) as any),
      h2.service.proposeRatePlan(boss, serviceDto({ serviceId: 999999 }) as any),
      h3.service.proposeRatePlan(boss, serviceDto({ serviceId: 203 }) as any),
    ]);
    for (const outcome of results) {
      expect(outcome.status).toBe('rejected');
      const reason = (outcome as PromiseRejectedResult).reason;
      expect(reason.status).toBe(400);
      expect(reason.response.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(reason.response.fields)).toEqual(['serviceId']);
    }
  });

  // SCOPE-02/API-08: buildingId out of scope is still OUT_OF_SCOPE, never confused with serviceId rule.
  it('API-08,SCOPE-02: buildingId outside the manager scope is 403 OUT_OF_SCOPE, even with a well-formed body', async () => {
    const { service, ratePlanRows } = makeHarness([outOfScopeBuilding11], []);
    await expect(
      service.proposeRatePlan(manager, electricDto({ buildingId: 11 }) as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('API-08,SCOPE-02: buildingId out of scope wins over an invalid serviceId (scope is checked first; serviceId lookup never runs)', async () => {
    const { service, tx } = makeHarness([outOfScopeBuilding11], []);
    await expect(
      service.proposeRatePlan(manager, serviceDto({ buildingId: 11, serviceId: 999999 }) as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(tx.service.findUnique).not.toHaveBeenCalled();
  });

  it('a buildingId that does not exist at all is 404 NOT_FOUND', async () => {
    const { service } = makeHarness([], []);
    await expect(
      service.proposeRatePlan(boss, electricDto({ buildingId: 999999 }) as any),
    ).rejects.toMatchObject({ constructor: NotFoundException, status: 404, response: { message: 'NOT_FOUND' } });
  });

  // Q-P5-7 "Chỉ Boss": locked building, Boss can still save (APPROVED immediately, PRC-04), manager cannot.
  it('[Q-P5-7] a manager cannot propose a rate plan for a locked building', async () => {
    const { service, ratePlanRows } = makeHarness([lockedBuilding12], []);
    await expect(
      service.proposeRatePlan(manager, electricDto({ buildingId: 12 }) as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('[Q-P5-7, PRC-04] Boss can still save a rate plan proposal for a locked building; it is APPROVED immediately (self-review)', async () => {
    const { service, ratePlanRows } = makeHarness([lockedBuilding12], []);
    const result = await service.proposeRatePlan(boss, electricDto({ buildingId: 12 }) as any);
    expect(result.status).toBe('APPROVED');
    expect(result.reviewedById).toBe(1);
    expect(ratePlanRows).toHaveLength(1);
  });

  // RATE-01/PRC-02/PRC-04: superseding the previous PENDING plan of the same (building, kind, service).
  it('[RATE-01,PRC-02,PRC-04] a second proposal for the same (building, kind, serviceId=null) supersedes the first PENDING plan; the Boss one lands APPROVED', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], []);
    const tomorrow = formatDateOnly(addDays(todayHanoi(), 1));
    const first = await service.proposeRatePlan(manager, electricDto() as any);
    const second = await service.proposeRatePlan(boss, electricDto({ effectiveFrom: tomorrow }) as any);
    expect(ratePlanRows).toHaveLength(2);
    expect(ratePlanRows.find((r) => r.id === first.id).status).toBe('SUPERSEDED');
    expect(ratePlanRows.find((r) => r.id === second.id).status).toBe('APPROVED');
  });

  it('[RATE-01,PRC-02,PRC-04] a WATER proposal does not supersede an unrelated ELECTRIC plan of the same building', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], []);
    const electric = await service.proposeRatePlan(boss, electricDto() as any);
    expect(ratePlanRows.find((r) => r.id === electric.id).status).toBe('APPROVED'); // Boss self-approved
    await service.proposeRatePlan(boss, waterDto() as any);
    expect(ratePlanRows.find((r) => r.id === electric.id).status).toBe('APPROVED'); // still untouched
  });

  // G-02: Hanoi calendar date rules apply to rate plans the same way as room prices.
  it('G-02: effectiveFrom = hôm qua (yesterday, Hanoi) is rejected as VALIDATION_FAILED', async () => {
    const { service, ratePlanRows } = makeHarness([activeBuilding10], []);
    const yesterday = formatDateOnly(addDays(todayHanoi(), -1));
    await expect(
      service.proposeRatePlan(boss, electricDto({ effectiveFrom: yesterday }) as any),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED', fields: { effectiveFrom: expect.any(String) } } });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('G-02, PRC-04: effectiveFrom = last day of a future month (cuối tháng) is accepted; Boss proposal is APPROVED immediately', async () => {
    const { service } = makeHarness([activeBuilding10], []);
    const base = todayHanoi();
    const lastDayOfMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 0));
    const effectiveFrom = formatDateOnly(lastDayOfMonth);
    const result = await service.proposeRatePlan(boss, electricDto({ effectiveFrom }) as any);
    expect(result.status).toBe('APPROVED');
    expect(result.effectiveFrom).toBe(effectiveFrom);
  });

  it('G-02, PRC-04: todayHanoi 23:59:59 Hà Nội still treats the current calendar day as today for rate plans; Boss proposal is APPROVED', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-01T16:59:59Z')); // 23:59:59 Hanoi on 2026-11-01
      const { service } = makeHarness([activeBuilding10], []);
      const result = await service.proposeRatePlan(boss, electricDto({ effectiveFrom: '2026-11-01' }) as any);
      expect(result.status).toBe('APPROVED');
    } finally {
      vi.useRealTimers();
    }
  });
});

// HTTP-level: only PrismaService is mocked. Real guards, ValidationPipe, controller, service,
// error filter and response interceptor run through the actual AppModule wiring.
describe('CP-2 · BE-P2-23 · rate-plans HTTP contract and error order', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  // building 10: manager2's active building; 11: another manager's building (out of scope for manager2).
  const buildings = new Map<number, any>([
    [10, { id: 10, managerId: 2, isActive: true }],
    [11, { id: 11, managerId: 5, isActive: true }],
  ]);
  const services = new Map<number, any>([
    [201, { id: 201, buildingId: 10, isActive: true }],
    [202, { id: 202, buildingId: 10, isActive: false }], // SVC-04 locked service
  ]);
  let ratePlanRows: any[] = [];
  let nextId = 1;
  const auditCreate = vi.fn(async ({ data }: any) => ({ id: 1, ...data }));
  const buildingFindUnique = vi.fn(async ({ where }: any) => {
    const b = buildings.get(where.id);
    return b ? { id: b.id, isActive: b.isActive } : null;
  });
  const serviceFindUnique = vi.fn(async ({ where }: any) => {
    const s = services.get(where.id);
    return s ? { buildingId: s.buildingId, isActive: s.isActive } : null;
  });

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findUnique: buildingFindUnique,
      findMany: vi.fn(async ({ where }: any) => [...buildings.values()].filter((b) => b.managerId === where.managerId && b.isActive === where.isActive)),
    },
    service: { findUnique: serviceFindUnique },
    ratePlan: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = ratePlanRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      // CP-6: toRatePlanView's oldRateTiers comparison lookup; no prior APPROVED plan in these CP-2 fixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.buildingId !== undefined && row.buildingId !== where.buildingId) return false;
          if (where.kind !== undefined && row.kind !== where.kind) return false;
          if (where.serviceId !== undefined && row.serviceId !== where.serviceId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const tiers = (data.tiers?.create ?? []).map((t: any, i: number) => ({ id: i + 1, ...t }));
        const row = { id: nextId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data, tiers };
        ratePlanRows.push(row);
        return row;
      }),
    },
    auditLog: { create: auditCreate },
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work({
      $queryRaw: fakePrisma.$queryRaw, building: fakePrisma.building, service: fakePrisma.service,
      ratePlan: fakePrisma.ratePlan, auditLog: fakePrisma.auditLog,
    })),
    $disconnect: vi.fn(async () => undefined),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(fakePrisma).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });
  beforeEach(() => { ratePlanRows = []; nextId = 1; auditCreate.mockClear(); buildingFindUnique.mockClear(); serviceFindUnique.mockClear(); });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }
  const validElectricBody = () => ({
    buildingId: 10, kind: 'ELECTRIC', effectiveFrom: formatDateOnly(todayHanoi()),
    tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2500 }],
  });

  it('API-07: missing auth token is 401 UNAUTHENTICATED', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/rate-plans').send(validElectricBody());
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('API-07: a tenant is rejected with 403 FORBIDDEN before the body is even validated (RolesGuard first)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(3, 'TENANT')).send({ not: 'valid' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(buildingFindUnique).not.toHaveBeenCalled();
  });

  it('RATE-02: an empty tiers array is 400 VALIDATION_FAILED via the DTO pipe (ArrayMinSize), before any DB call', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS'))
      .send({ ...validElectricBody(), tiers: [] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(buildingFindUnique).not.toHaveBeenCalled();
  });

  it('RATE-02: a negative unit_price is 400 VALIDATION_FAILED via the DTO pipe', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS'))
      .send({ ...validElectricBody(), tiers: [{ tierNo: 1, upTo: 100, unitPrice: -1 }, { tierNo: 2, upTo: null, unitPrice: 2500 }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('RATE-02: a fractional unit_price is 400 VALIDATION_FAILED via the DTO pipe', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS'))
      .send({ ...validElectricBody(), tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800.5 }, { tierNo: 2, upTo: null, unitPrice: 2500 }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('API-08,SCOPE-02: a manager outside the building gets exact 403 OUT_OF_SCOPE body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(2, 'MANAGER'))
      .send({ ...validElectricBody(), buildingId: 11 });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'OUT_OF_SCOPE', message: 'Dữ liệu này nằm ngoài phạm vi của bạn' } });
  });

  it('[SVC-04,Q-P5-8] a locked serviceId through the full HTTP stack is 400 VALIDATION_FAILED field serviceId, not 404/403', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS'))
      .send({ buildingId: 10, kind: 'SERVICE', serviceId: 202, effectiveFrom: formatDateOnly(todayHanoi()), tiers: [{ tierNo: 1, upTo: null, unitPrice: 50000 }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.serviceId).toBeTruthy();
    expect(ratePlanRows).toHaveLength(0);
  });

  it('PRC-01: a manager with a normal active building gets 201 PENDING', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(2, 'MANAGER')).send(validElectricBody());
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ buildingId: 10, kind: 'ELECTRIC', status: 'PENDING' });
  });

  it('AUD-01, PRC-04: a successful Boss rate plan proposal writes price.propose AND price.approve audit logs in the same transaction', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS')).send(validElectricBody());
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('APPROVED');
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({ actorId: 1, action: 'price.propose', entity: 'rate_plan' });
    expect(auditCreate.mock.calls[1][0].data).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'rate_plan' });
  });
});
