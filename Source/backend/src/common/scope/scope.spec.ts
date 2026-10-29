import { NotFoundException } from '@nestjs/common';
import type { PrismaClient, Role } from '@prisma/client';
import { createFakePrisma, type FakePrisma, IDS } from '../../../test/fixtures/fake-prisma.js';
import type { AuthUser } from '../guards/auth.decorators.js';
import { allowedBuildingIds, scopeWhere, tenantOwns } from './scope.js';

// Outside edge: the DB is the in-memory fake. allowedBuildingIds / scopeWhere / tenantOwns are real.
// The fake applies `where` itself, so the "contracts a user sees" checks show the fragment is well formed,
// not that Postgres filters correctly.

let fake: FakePrisma;
let db: Pick<PrismaClient, 'building' | 'contract'>;

beforeEach(async () => {
  fake = await createFakePrisma();
  db = fake as unknown as typeof db;
});

const userOf = (key: keyof typeof IDS.users) => ({
  id: IDS.users[key],
  role: fake.account(key).role as Role,
});
const sorted = (ids: number[] | null) => (ids === null ? null : [...ids].sort((a, b) => a - b));

describe('SCOPE-02: allowedBuildingIds', () => {
  it('SCOPE-02: manager1 -> CG01 and DD01, with one findMany(where managerId + isActive)', async () => {
    const spy = vi.spyOn(fake.building, 'findMany');
    const ids = await allowedBuildingIds(db, userOf('manager1'));
    expect(sorted(ids)).toEqual([IDS.buildings.CG01, IDS.buildings.DD01]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { managerId: IDS.users.manager1, isActive: true } }),
    );
  });

  it('SCOPE-02: manager2 -> [] because their building TL01 is inactive', async () => {
    expect(await allowedBuildingIds(db, userOf('manager2'))).toEqual([]);
  });

  it('SCOPE-02: a manager without any building -> [] and an unmanaged building (HM01) never shows up', async () => {
    const ids = await allowedBuildingIds(db, userOf('manager1'));
    expect(ids).not.toContain(IDS.buildings.HM01);
    expect(ids).not.toContain(IDS.buildings.TL01);
  });

  it('SCOPE-02: Boss -> null and tenant -> [], neither calls building.findMany', async () => {
    const spy = vi.spyOn(fake.building, 'findMany');
    expect(await allowedBuildingIds(db, userOf('boss'))).toBeNull();
    expect(await allowedBuildingIds(db, userOf('tenant'))).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('SCOPE-02: scopeWhere', () => {
  const as = async (key: keyof typeof IDS.users): Promise<Pick<AuthUser, 'buildingIds'>> => ({
    buildingIds: await allowedBuildingIds(db, userOf(key)),
  });

  it('SCOPE-02: Boss -> {} (no filter)', async () => {
    expect(scopeWhere(await as('boss'))).toEqual({});
  });

  it('SCOPE-02: manager1 -> { buildingId: { in: [CG01, DD01] } }', async () => {
    const where = scopeWhere(await as('manager1'));
    expect(sorted(where.buildingId!.in)).toEqual([IDS.buildings.CG01, IDS.buildings.DD01]);
    expect(Object.keys(where)).toEqual(['buildingId']);
  });

  it('SCOPE-02 / P14: manager2 and tenant -> { buildingId: { in: [] } } (match nothing), not a throw', async () => {
    expect(scopeWhere(await as('manager2'))).toEqual({ buildingId: { in: [] } });
    expect(scopeWhere(await as('tenant'))).toEqual({ buildingId: { in: [] } });
  });

  it('SCOPE-02: a null scope is not the same as an empty one (null sees all, [] sees nothing)', () => {
    expect(scopeWhere({ buildingIds: null })).toEqual({});
    expect(scopeWhere({ buildingIds: [] })).toEqual({ buildingId: { in: [] } });
  });

  it('SCOPE-02: applied to contracts, manager1 sees HD000001, manager2 nothing, Boss everything', async () => {
    fake.contract.rows.push({ id: 202, code: 'HD000002', buildingId: IDS.buildings.HM01, tenantId: IDS.users.lockedTenant });
    const codes = async (key: keyof typeof IDS.users) =>
      (await fake.contract.findMany({ where: scopeWhere(await as(key)) })).map((c) => String(c.code)).sort((a, b) => a.localeCompare(b));
    expect(await codes('manager1')).toEqual(['HD000001']); // HD000002 sits in HM01, which manager1 does not manage
    expect(await codes('manager2')).toEqual([]);
    expect(await codes('tenant')).toEqual([]);
    expect(await codes('boss')).toEqual(['HD000001', 'HD000002']);
  });
});

describe('SCOPE-03: tenantOwns', () => {
  it('SCOPE-03: the tenant that owns HD000001 passes', async () => {
    await expect(tenantOwns(db, userOf('tenant'), IDS.contracts.HD000001)).resolves.toBeUndefined();
  });

  it("SCOPE-03: another user's contract and a missing contract both throw NotFoundException", async () => {
    await expect(tenantOwns(db, userOf('lockedTenant'), IDS.contracts.HD000001)).rejects.toBeInstanceOf(NotFoundException);
    await expect(tenantOwns(db, userOf('tenant'), 999999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('SCOPE-03: "not yours" and "does not exist" are indistinguishable (same status, same response)', async () => {
    const rejection = (p: Promise<void>) =>
      p.then(
        () => { throw new Error('expected tenantOwns to reject'); },
        (e: NotFoundException) => e,
      );
    const notYours = await rejection(tenantOwns(db, userOf('lockedTenant'), IDS.contracts.HD000001));
    const missing = await rejection(tenantOwns(db, userOf('tenant'), 999999));
    expect(notYours.getStatus()).toBe(404);
    expect(missing.getStatus()).toBe(404);
    expect(notYours.getResponse()).toEqual(missing.getResponse());
    expect(notYours.message).toBe(missing.message);
  });

  it('SCOPE-03: staff are not tenants of the contract either (Boss id is not tenantId)', async () => {
    await expect(tenantOwns(db, userOf('boss'), IDS.contracts.HD000001)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('SCOPE-03: the lookup is one findFirst on { id, tenantId } and selects only the id', async () => {
    const spy = vi.spyOn(fake.contract, 'findFirst');
    await tenantOwns(db, userOf('tenant'), IDS.contracts.HD000001);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      where: { id: IDS.contracts.HD000001, tenantId: IDS.users.tenant },
      select: { id: true },
    });
  });
});
