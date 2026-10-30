import { readFileSync } from 'node:fs';
import argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';
import { DEV_ACCOUNTS, seed } from './seed.js';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Prisma. Only the DB edge is faked; seed() itself runs for real.
// The fake exposes just findFirst / create / upsert per model (the API subset the plan
// allows), so any other call (createMany, $transaction, connect...) fails the test.
// It also enforces the rules of docs/database/constraints.sql that a seed can hit:
// unique keys, partial unique indexes, CHECKs, the 2 triggers, foreign keys and enums.
// A seed that is not idempotent therefore throws on run 2, as it would on the real DB.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>;

const PHONE_VN = /^0[0-9]{9}$/;
const ensure = (ok: boolean, msg: string): void => {
  if (!ok) throw new Error(msg);
};
const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : (a ?? null) === (b ?? null);
const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    ensure(
      v === null || typeof v !== 'object' || v instanceof Date,
      `fake prisma: unsupported filter on ${k}`,
    );
    return v === undefined || same(row[k], v);
  });

interface Model {
  required: string[];
  defaults: Row;
  unique?: string[][];
  compound?: Record<string, string[]>; // Prisma compound key name -> columns
  trigger?: (row: Row, db: FakeDb) => void; // BEFORE INSERT
  check?: (row: Row, db: FakeDb, others: Row[]) => void;
}

const fk = (db: FakeDb, model: string, match: Row): void =>
  ensure(
    db.t[model].some((r) => matches(r, match)),
    `foreign key: no ${model} ${JSON.stringify(match)}`,
  );
const oneOf = (v: unknown, list: string[], what: string): void =>
  ensure(list.includes(v as string), `invalid ${what}: ${String(v)}`);
const sameRateKey = (a: Row, b: Row): boolean =>
  a.buildingId === b.buildingId &&
  a.kind === b.kind &&
  (a.serviceId ?? 0) === (b.serviceId ?? 0);

const MODELS: Record<string, Model> = {
  user: {
    required: ['role', 'phone', 'fullName', 'passwordHash'],
    defaults: {
      email: null,
      mustChangePassword: true,
      isActive: true,
      contactPhone: null,
      zaloUrl: null,
      facebookUrl: null,
      lastLoginAt: null,
    },
    unique: [['phone'], ['email']],
    check: (r, _db, others) => {
      oneOf(r.role, ['BOSS', 'MANAGER', 'TENANT'], 'role');
      ensure(PHONE_VN.test(r.phone), `users_phone_vn: ${r.phone}`);
      ensure(
        r.contactPhone === null || PHONE_VN.test(r.contactPhone),
        'users_contact_phone_vn',
      );
      ensure(
        r.role !== 'BOSS' || !others.some((o) => o.role === 'BOSS'),
        'users_one_boss',
      );
    },
  },
  setting: {
    required: ['key', 'value'],
    defaults: { updatedById: null },
    unique: [['key']],
    check: (r, db) => {
      if (r.updatedById !== null) fk(db, 'user', { id: r.updatedById });
    },
  },
  building: {
    required: ['code', 'name', 'address', 'district', 'ward', 'waterMode'],
    defaults: {
      managerId: null,
      dueDays: 5,
      amenities: [],
      description: null,
      isActive: true,
    },
    unique: [['code']],
    // check_building_manager (BLD-03)
    trigger: (r, db) => {
      if (r.managerId === null) return;
      const mgr = db.t.user.find((u) => u.id === r.managerId && u.isActive);
      ensure(mgr?.role === 'MANAGER', 'BUILDING_MANAGER_ROLE');
      ensure(
        db.t.building.filter((b) => b.managerId === r.managerId && b.id !== r.id)
          .length < 2,
        'MANAGER_MAX_2_BUILDINGS',
      );
    },
    check: (r, db) => {
      ensure(/^[A-Z0-9]{2,6}$/.test(r.code), `buildings_code_format: ${r.code}`);
      ensure(r.dueDays >= 1 && r.dueDays <= 31, 'buildings_due_days');
      oneOf(r.waterMode, ['PER_M3', 'PER_PERSON'], 'waterMode');
      if (r.managerId !== null) fk(db, 'user', { id: r.managerId });
    },
  },
  room: {
    required: ['buildingId', 'code', 'floor', 'areaM2'],
    defaults: {
      price: null,
      maxOccupants: 2,
      furniture: [],
      description: null,
      underMaintenance: false,
      isActive: true,
    },
    unique: [['buildingId', 'code']],
    compound: { buildingId_code: ['buildingId', 'code'] },
    check: (r, db) => {
      fk(db, 'building', { id: r.buildingId });
      ensure(
        r.price === null || (Number.isInteger(r.price) && r.price > 0),
        'rooms_price_positive',
      );
      ensure(Number(r.areaM2) > 0, 'rooms_area_positive');
      ensure(r.maxOccupants >= 1, 'rooms_max_occupants');
    },
  },
  roomPrice: {
    required: ['roomId', 'price', 'effectiveFrom', 'proposedById'],
    defaults: {
      status: 'PENDING',
      reason: null,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
    check: (r, db, others) => {
      fk(db, 'room', { id: r.roomId });
      fk(db, 'user', { id: r.proposedById });
      if (r.reviewedById !== null) fk(db, 'user', { id: r.reviewedById });
      ensure(Number.isInteger(r.price) && r.price > 0, 'room_prices_positive');
      oneOf(r.status, ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'], 'status');
      ensure(
        r.status !== 'PENDING' ||
          !others.some((o) => o.roomId === r.roomId && o.status === 'PENDING'),
        'room_prices_one_pending',
      );
    },
  },
  service: {
    required: ['buildingId', 'name', 'unit'],
    defaults: { isActive: true },
    unique: [['buildingId', 'name']],
    compound: { buildingId_name: ['buildingId', 'name'] },
    check: (r, db) => {
      fk(db, 'building', { id: r.buildingId });
      oneOf(r.unit, ['ROOM', 'PERSON', 'VEHICLE'], 'unit');
    },
  },
  ratePlan: {
    required: ['buildingId', 'kind', 'effectiveFrom', 'proposedById'],
    defaults: {
      serviceId: null,
      status: 'PENDING',
      reason: null,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
    check: (r, db, others) => {
      fk(db, 'building', { id: r.buildingId });
      oneOf(r.kind, ['ELECTRIC', 'WATER', 'SERVICE'], 'kind');
      oneOf(r.status, ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'], 'status');
      ensure((r.kind === 'SERVICE') === (r.serviceId !== null), 'rate_plans_service_iff');
      // composite FK (service_id, building_id): the service must belong to the same building
      if (r.serviceId !== null)
        fk(db, 'service', { id: r.serviceId, buildingId: r.buildingId });
      fk(db, 'user', { id: r.proposedById });
      if (r.reviewedById !== null) fk(db, 'user', { id: r.reviewedById });
      ensure(
        !(
          r.status === 'PENDING' &&
          others.some((o) => o.status === 'PENDING' && sameRateKey(o, r))
        ),
        'rate_plans_one_pending',
      );
      ensure(
        !(
          r.status === 'APPROVED' &&
          others.some(
            (o) =>
              o.status === 'APPROVED' &&
              sameRateKey(o, r) &&
              same(o.effectiveFrom, r.effectiveFrom),
          )
        ),
        'rate_plans_one_per_day',
      );
    },
  },
  rateTier: {
    required: ['ratePlanId', 'tierNo', 'unitPrice'],
    defaults: { upTo: null },
    unique: [['ratePlanId', 'tierNo']],
    check: (r, db) => {
      fk(db, 'ratePlan', { id: r.ratePlanId });
      ensure(
        r.tierNo >= 1 && r.unitPrice >= 0 && (r.upTo === null || r.upTo > 0),
        'rate_tiers_values',
      );
    },
  },
  contract: {
    required: [
      'code',
      'buildingId',
      'roomId',
      'tenantId',
      'startDate',
      'termMonths',
      'endDate',
      'billingDay',
      'rent',
      'deposit',
      'createdById',
    ],
    defaults: {
      status: 'HOLD',
      previousContractId: null,
      terms: null,
      pdfUrl: null,
      signedScanUrl: null,
      signedAt: null,
      movedInAt: null,
      moveOutNoticeDate: null,
      plannedMoveOutDate: null,
      endedAt: null,
      cancelReason: null,
    },
    unique: [['code']],
    // check_contract_tenant
    trigger: (r, db) =>
      ensure(
        db.t.user.some((u) => u.id === r.tenantId && u.role === 'TENANT'),
        'CONTRACT_TENANT_ROLE',
      ),
    check: (r, db, others) => {
      fk(db, 'building', { id: r.buildingId });
      fk(db, 'room', { id: r.roomId, buildingId: r.buildingId });
      fk(db, 'user', { id: r.createdById });
      oneOf(r.status, ['HOLD', 'ACTIVE', 'ENDED', 'CANCELLED'], 'status');
      ensure(r.termMonths >= 3, 'contracts_term_min_3');
      ensure(r.billingDay >= 1 && r.billingDay <= 31, 'contracts_billing_day');
      ensure(r.endDate.getTime() > r.startDate.getTime(), 'contracts_dates');
      ensure(r.rent > 0 && r.deposit >= 0, 'contracts_money');
      ensure(
        r.status !== 'ACTIVE' || (r.signedAt !== null && r.movedInAt !== null),
        'contracts_active_ready',
      );
      ensure(
        !(
          ['HOLD', 'ACTIVE'].includes(r.status) &&
          others.some(
            (o) => o.roomId === r.roomId && ['HOLD', 'ACTIVE'].includes(o.status),
          )
        ),
        'contracts_one_open_per_room',
      );
    },
  },
  contractService: {
    required: ['contractId', 'serviceId', 'buildingId'],
    defaults: {},
    unique: [['contractId', 'serviceId']],
    compound: { contractId_serviceId: ['contractId', 'serviceId'] },
    check: (r, db) => {
      fk(db, 'contract', { id: r.contractId, buildingId: r.buildingId });
      fk(db, 'service', { id: r.serviceId, buildingId: r.buildingId });
    },
  },
  occupant: {
    required: ['contractId', 'fullName', 'moveInDate'],
    defaults: {
      phone: null,
      dateOfBirth: null,
      idNumberEnc: null,
      idNumberLast4: null,
      idFrontUrl: null,
      idBackUrl: null,
      isSigner: false,
      moveOutDate: null,
    },
    check: (r, db, others) => {
      fk(db, 'contract', { id: r.contractId });
      ensure(
        r.moveOutDate === null || r.moveOutDate.getTime() >= r.moveInDate.getTime(),
        'occupants_dates',
      );
      ensure(
        !(
          r.isSigner &&
          others.some((o) => o.contractId === r.contractId && o.isSigner)
        ),
        'occupants_one_signer',
      );
    },
  },
  vehicle: {
    required: ['contractId', 'buildingId', 'serviceId', 'plate', 'type', 'registeredAt'],
    defaults: { isActive: true, removedAt: null },
    check: (r, db, others) => {
      fk(db, 'contract', { id: r.contractId, buildingId: r.buildingId });
      fk(db, 'service', { id: r.serviceId, buildingId: r.buildingId });
      oneOf(r.type, ['MOTORBIKE', 'E_BIKE', 'BICYCLE', 'CAR', 'OTHER'], 'type');
      ensure(r.isActive || r.removedAt !== null, 'vehicles_removed');
      ensure(
        !(r.isActive && others.some((o) => o.isActive && o.plate === r.plate)),
        'vehicles_plate_active',
      );
    },
  },
  meterReading: {
    required: ['roomId', 'kind', 'value', 'readOn', 'readById'],
    defaults: {
      contractId: null,
      photoUrl: null,
      isMeterReplaced: false,
      oldMeterFinal: null,
      note: null,
    },
    unique: [['roomId', 'kind', 'readOn']],
    compound: { roomId_kind_readOn: ['roomId', 'kind', 'readOn'] },
    check: (r, db) => {
      fk(db, 'room', { id: r.roomId });
      if (r.contractId !== null) fk(db, 'contract', { id: r.contractId });
      fk(db, 'user', { id: r.readById });
      oneOf(r.kind, ['ELECTRIC', 'WATER'], 'kind');
      ensure(
        r.value >= 0 && (!r.isMeterReplaced || r.oldMeterFinal !== null),
        'meter_readings_values',
      );
    },
  },
};

const NO_AUTO_ID = new Set(['setting', 'contractService']);

interface Call {
  model: string;
  method: string;
  args: Row;
}

class FakeDb {
  t: Record<string, Row[]> = Object.fromEntries(
    Object.keys(MODELS).map((m) => [m, [] as Row[]]),
  );
  calls: Call[] = [];
  private lastId: Record<string, number> = {};

  private validate(model: string, row: Row, others: Row[]): void {
    const def = MODELS[model];
    for (const cols of def.unique ?? []) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      ensure(
        !others.some((o) => cols.every((c) => same(o[c], row[c]))),
        `unique violation: ${model}(${cols.join(',')})`,
      );
    }
    def.check?.(row, this, others);
  }

  private allowed(model: string): Set<string> {
    const def = MODELS[model];
    return new Set([...def.required, ...Object.keys(def.defaults)]);
  }

  insert(model: string, data: Row): Row {
    const def = MODELS[model];
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );
    for (const k of Object.keys(clean))
      ensure(this.allowed(model).has(k), `fake prisma: unknown field ${model}.${k}`);
    for (const k of def.required)
      ensure(clean[k] !== undefined && clean[k] !== null, `not null: ${model}.${k}`);
    const row: Row = { ...structuredClone(def.defaults), ...clean };
    if (!NO_AUTO_ID.has(model)) {
      this.lastId[model] = (this.lastId[model] ?? 0) + 1; // like nextval: taken before the trigger
      row.id = this.lastId[model];
    }
    def.trigger?.(row, this);
    this.validate(model, row, this.t[model]);
    this.t[model].push(row);
    return row;
  }

  private create(model: string, data: Row): Row {
    if (model !== 'ratePlan') return this.insert(model, data);
    const { tiers, ...plan } = data;
    const row = this.insert('ratePlan', plan);
    ensure(
      tiers === undefined || Object.keys(tiers).join() === 'create',
      'fake prisma: only tiers.create is supported',
    );
    for (const tier of tiers?.create ?? [])
      this.insert('rateTier', { ...tier, ratePlanId: row.id });
    return row;
  }

  private upsert(model: string, { where, update, create }: Row): Row {
    const def = MODELS[model];
    const flat: Row = {};
    for (const [k, v] of Object.entries(where))
      Object.assign(flat, def.compound?.[k] ? v : { [k]: v });
    // PostgreSQL ON CONFLICT: BEFORE INSERT triggers fire for the proposed row before the
    // conflict is detected (its id is already taken from the sequence).
    if (def.trigger)
      def.trigger(
        { ...structuredClone(def.defaults), ...create, id: (this.lastId[model] ?? 0) + 1 },
        this,
      );
    const found = this.t[model].find((r) => matches(r, flat));
    if (!found) return this.create(model, create);
    for (const k of Object.keys(update))
      ensure(this.allowed(model).has(k), `fake prisma: unknown field ${model}.${k}`);
    this.validate(
      model,
      { ...found, ...update },
      this.t[model].filter((r) => r !== found),
    );
    Object.assign(found, update);
    return found;
  }

  client(): PrismaClient {
    const delegates = Object.fromEntries(
      Object.keys(MODELS).map((model) => [
        model,
        {
          // Prisma calls return promises that reject, they never throw synchronously
          findFirst: (args: Row) =>
            new Promise((resolve) => {
              this.calls.push({ model, method: 'findFirst', args });
              const r = this.t[model].find((x) => matches(x, args.where));
              resolve(r ? structuredClone(r) : null);
            }),
          create: (args: Row) =>
            new Promise((resolve) => {
              this.calls.push({ model, method: 'create', args });
              resolve(structuredClone(this.create(model, args.data)));
            }),
          upsert: (args: Row) =>
            new Promise((resolve) => {
              this.calls.push({ model, method: 'upsert', args });
              resolve(structuredClone(this.upsert(model, args)));
            }),
        },
      ]),
    );
    return delegates as unknown as PrismaClient;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expected values come from PLAN.md section 2.4 / the spec, never from seed.ts.
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_COUNTS = {
  user: 5,
  setting: 2,
  building: 3,
  room: 7,
  roomPrice: 6,
  service: 12,
  ratePlan: 15,
  rateTier: 21,
  contract: 1,
  contractService: 2,
  occupant: 2,
  vehicle: 1,
  meterReading: 2,
};
const counts = (db: FakeDb): Record<string, number> =>
  Object.fromEntries(Object.keys(db.t).map((m) => [m, db.t[m].length]));
const snapshot = (db: FakeDb): string =>
  JSON.stringify(db.t, (k, v) => (k === 'passwordHash' ? undefined : v));
const midnightUtc = (ymd: string): string => `${ymd}T00:00:00.000Z`;
const sorted = <T>(xs: readonly T[]): T[] =>
  [...xs].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));

describe('BE-LOGIN-06: seed (in-memory Prisma)', { timeout: 120_000 }, () => {
  let db: FakeDb;
  let afterFirst: Record<string, number>;
  let afterSecond: Record<string, number>;
  let snapFirst: string;
  let snapSecond: string;
  let secondRunError: unknown;

  const user = (phone: string): Row => db.t.user.find((u) => u.phone === phone)!;
  const bossId = (): number => user('0900000001').id;
  const bld = (code: string): Row => db.t.building.find((b) => b.code === code)!;
  const roomOf = (b: string, code: string): Row =>
    db.t.room.find((r) => r.buildingId === bld(b).id && r.code === code)!;
  const svcOf = (b: string, name: string): Row =>
    db.t.service.find((s) => s.buildingId === bld(b).id && s.name === name)!;
  const setting = (key: string): Row => db.t.setting.find((s) => s.key === key)!;
  const tiersOf = (planId: number): [number, number | null, number][] =>
    db.t.rateTier
      .filter((t) => t.ratePlanId === planId)
      .sort((a, b) => a.tierNo - b.tierNo)
      .map((t) => [t.tierNo, t.upTo, t.unitPrice]);

  beforeAll(async () => {
    db = new FakeDb();
    await seed(db.client());
    afterFirst = counts(db);
    snapFirst = snapshot(db);
    try {
      await seed(db.client());
    } catch (e) {
      secondRunError = e;
    }
    afterSecond = counts(db);
    snapSecond = snapshot(db);
  }, 120_000);

  it('BE-LOGIN-06: seed runs twice without errors and creates no extra rows', () => {
    expect(secondRunError).toBeUndefined();
    expect(afterFirst).toEqual(EXPECTED_COUNTS);
    expect(afterSecond).toEqual(EXPECTED_COUNTS);
    // nothing else changed either: same ids, same values (only the password hashes are re-salted)
    expect(snapSecond).toBe(snapFirst);
  });

  it('BE-LOGIN-06: harness can fail, a non-idempotent seed (contract upsert replaced by create) throws on run 2', async () => {
    const fresh = new FakeDb();
    const client = fresh.client();
    // replace one outside-edge call only; seed() itself is the real code
    client.contract.upsert = ((args: Row) =>
      client.contract.create({ data: args.create })) as never;
    await seed(client);
    await expect(seed(client)).rejects.toThrow(/unique violation: contract\(code\)/);
  });

  describe('fake Prisma enforces the DB rules (so the idempotency check is meaningful)', () => {
    it('G-04: a second user with an existing phone is rejected', async () => {
      await expect(
        db.client().user.create({
          data: { role: 'TENANT', phone: '0900000004', fullName: 'X', passwordHash: 'h' },
        }),
      ).rejects.toThrow(/unique violation: user\(phone\)/);
    });

    it('G-04: a phone that is not ^0[0-9]{9}$ is rejected', async () => {
      await expect(
        db.client().user.create({
          data: { role: 'TENANT', phone: '123', fullName: 'X', passwordHash: 'h' },
        }),
      ).rejects.toThrow(/users_phone_vn/);
    });

    it('AUTH-01 (users_one_boss): a second BOSS is rejected', async () => {
      await expect(
        db.client().user.create({
          data: { role: 'BOSS', phone: '0911111111', fullName: 'X', passwordHash: 'h' },
        }),
      ).rejects.toThrow(/users_one_boss/);
    });

    it('BLD-03: a native upsert of a building of a manager who already has 2 buildings raises MANAGER_MAX_2_BUILDINGS (why seed uses findFirst + create)', async () => {
      const c = db.client();
      await expect(
        c.building.upsert({
          where: { code: 'CG01' },
          update: {},
          create: {
            code: 'CG01',
            name: 'x',
            address: 'x',
            district: 'x',
            ward: 'x',
            managerId: user('0900000002').id,
            waterMode: 'PER_M3',
          },
        }),
      ).rejects.toThrow(/MANAGER_MAX_2_BUILDINGS/);
    });

    it('DB-07 (rate_plans_one_per_day): a second APPROVED plan for the same (building, kind, service, effective day) is rejected', async () => {
      await expect(
        db.client().ratePlan.create({
          data: {
            buildingId: bld('CG01').id,
            kind: 'ELECTRIC',
            serviceId: null,
            effectiveFrom: new Date('2026-09-01'),
            status: 'APPROVED',
            proposedById: bossId(),
            reviewedById: bossId(),
            reviewedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/rate_plans_one_per_day/);
    });
  });

  describe('BE-LOGIN-06 + D5: re-running the seed', () => {
    it('D5: resets only passwordHash, mustChangePassword and isActive of the dev accounts', async () => {
      const local = new FakeDb();
      await seed(local.client());
      const tenant = local.t.user.find((u) => u.phone === '0900000004')!;
      const locked = local.t.user.find((u) => u.phone === '0900000005')!;
      tenant.mustChangePassword = false;
      tenant.passwordHash = 'x';
      locked.isActive = true;

      await seed(local.client());

      expect(tenant.mustChangePassword).toBe(true);
      expect(await argon2.verify(tenant.passwordHash, 'NguoiThue@2026')).toBe(true);
      expect(locked.isActive).toBe(false);
      expect(local.t.user).toHaveLength(5);
    });

    it('D5: every other seeded row keeps the value changed by hand and no row is added', async () => {
      const local = new FakeDb();
      await seed(local.client());
      local.t.building.find((b) => b.code === 'CG01')!.name = 'Tên đã sửa';
      local.t.roomPrice[0].price = 2_999_999;
      const m1 = local.t.user.find((u) => u.phone === '0900000002')!;
      m1.fullName = 'Tên quản lý đã sửa';
      const before = counts(local);

      await seed(local.client());

      expect(local.t.building.find((b) => b.code === 'CG01')!.name).toBe('Tên đã sửa');
      expect(local.t.roomPrice[0].price).toBe(2_999_999);
      expect(m1.fullName).toBe('Tên quản lý đã sửa');
      expect(counts(local)).toEqual(before);
    });

    it('D5: every user.upsert update contains exactly passwordHash, mustChangePassword, isActive', () => {
      const upserts = db.calls.filter((c) => c.model === 'user' && c.method === 'upsert');
      expect(upserts).toHaveLength(10); // 5 accounts x 2 runs
      for (const c of upserts)
        expect(sorted(Object.keys(c.args.update))).toEqual([
          'isActive',
          'mustChangePassword',
          'passwordHash',
        ]);
    });

    it('BE-LOGIN-06: only findFirst / create / upsert were called, and all other tables use update {} on re-run', () => {
      const methods = new Set(db.calls.map((c) => c.method));
      expect(sorted([...methods])).toEqual(['create', 'findFirst', 'upsert']);
      for (const c of db.calls.filter((x) => x.method === 'upsert' && x.model !== 'user'))
        expect(c.args.update).toEqual({});
    });
  });

  describe('accounts', () => {
    it('G-04 + AUTH-03: 1 BOSS, 2 MANAGER, 2 TENANT; phones valid and unique; argon2id hashes verify', async () => {
      const roles = sorted(db.t.user.map((u) => u.role));
      expect(roles).toEqual(['BOSS', 'MANAGER', 'MANAGER', 'TENANT', 'TENANT']);
      const phones = db.t.user.map((u) => u.phone);
      expect(new Set(phones).size).toBe(5);
      for (const p of phones) expect(p).toMatch(/^0[0-9]{9}$/);
      expect(sorted(phones)).toEqual([
        '0900000001',
        '0900000002',
        '0900000003',
        '0900000004',
        '0900000005',
      ]);
      expect(DEV_ACCOUNTS).toHaveLength(5);
      for (const a of DEV_ACCOUNTS) {
        const row = user(a.phone);
        expect(row.role).toBe(a.role);
        expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
        expect(await argon2.verify(row.passwordHash, a.password)).toBe(true);
        expect(await argon2.verify(row.passwordHash, a.password + 'x')).toBe(false);
        expect(a.password.length).toBeGreaterThanOrEqual(8);
      }
    });

    it('AUTH-03: no table contains a raw dev password', () => {
      const dump = JSON.stringify(db.t);
      for (const pw of [
        'Boss@2026',
        'QuanLy1@2026',
        'QuanLy2@2026',
        'NguoiThue@2026',
        'TamKhoa@2026',
      ])
        expect(dump).not.toContain(pw);
    });

    it('AUTH-05: tenant 0900000004 must change password and is active', () => {
      expect(user('0900000004')).toMatchObject({
        role: 'TENANT',
        mustChangePassword: true,
        isActive: true,
      });
    });

    it('AUTH-02: tenant 0900000005 is locked (isActive false)', () => {
      expect(user('0900000005')).toMatchObject({ role: 'TENANT', isActive: false });
    });

    it('AUTH-01: boss and both managers are active and do not need a password change', () => {
      for (const p of ['0900000001', '0900000002', '0900000003'])
        expect(user(p)).toMatchObject({ mustChangePassword: false, isActive: true });
    });

    it('AUTH-10: settings.default_contact has exactly phone/zaloUrl/facebookUrl and equals the Boss contact; bank_account has its 4 keys', () => {
      const boss = user('0900000001');
      const contact = setting('default_contact').value;
      expect(sorted(Object.keys(contact))).toEqual(['facebookUrl', 'phone', 'zaloUrl']);
      expect(contact).toEqual({
        phone: boss.contactPhone,
        zaloUrl: boss.zaloUrl,
        facebookUrl: boss.facebookUrl,
      });
      expect(contact.phone).toBe('0900000001');
      expect(sorted(Object.keys(setting('bank_account').value))).toEqual([
        'accountName',
        'accountNo',
        'bankBin',
        'bankName',
      ]);
      expect(db.t.setting.every((s) => s.updatedById === boss.id)).toBe(true);
    });
  });

  describe('buildings, rooms, prices, services', () => {
    it('D-18 / BLD-03: CG01 and DD01 belong to manager1, HM01 has no manager; manager2 has none; code format; PER_M3; dueDays 5', () => {
      const m1 = user('0900000002');
      const m2 = user('0900000003');
      expect(bld('CG01').managerId).toBe(m1.id);
      expect(bld('DD01').managerId).toBe(m1.id);
      expect(bld('HM01').managerId).toBeNull();
      expect(db.t.building.filter((b) => b.managerId === m1.id)).toHaveLength(2);
      expect(db.t.building.filter((b) => b.managerId === m2.id)).toHaveLength(0);
      expect(m1).toMatchObject({ role: 'MANAGER', isActive: true });
      expect(sorted(db.t.building.map((b) => b.code))).toEqual(['CG01', 'DD01', 'HM01']);
      for (const b of db.t.building) {
        expect(b.code).toMatch(/^[A-Z0-9]{2,6}$/);
        expect(b.waterMode).toBe('PER_M3');
        expect(b.dueDays).toBe(5);
      }
      expect(bld('CG01')).toMatchObject({
        name: 'Tòa Cầu Giấy',
        address: '1 Xuân Thủy',
        district: 'Cầu Giấy',
        ward: 'Dịch Vọng Hậu',
      });
    });

    it('ROOM-05 / CON-02: the 7 rooms match the table; CG01 301 has no price and no room_prices row', () => {
      const table = Object.fromEntries(
        db.t.room.map((r) => [
          `${db.t.building.find((b) => b.id === r.buildingId)!.code}/${r.code}`,
          [r.floor, Number(r.areaM2), r.price, r.maxOccupants],
        ]),
      );
      expect(table).toEqual({
        'CG01/203': [2, 24, 2_500_000, 2],
        'CG01/204': [2, 22, 2_400_000, 2],
        'CG01/301': [3, 20, null, 2],
        'DD01/101': [1, 20, 2_200_000, 2],
        'DD01/102': [1, 22, 2_300_000, 2],
        'HM01/101': [1, 18, 2_000_000, 2],
        'HM01/201': [2, 25, 2_600_000, 3],
      });
      expect(
        db.t.room.filter((r) => r.price === null).map((r) => r.id),
      ).toEqual([roomOf('CG01', '301').id]);
      expect(
        db.t.roomPrice.filter((p) => p.roomId === roomOf('CG01', '301').id),
      ).toHaveLength(0);
    });

    it('ROOM-05: every building has 2-3 rooms and at least one priced room with no HOLD/ACTIVE contract', () => {
      for (const b of db.t.building) {
        const rooms = db.t.room.filter((r) => r.buildingId === b.id);
        expect(rooms.length).toBeGreaterThanOrEqual(2);
        expect(rooms.length).toBeLessThanOrEqual(3);
        const free = rooms.filter(
          (r) =>
            r.price !== null &&
            !db.t.contract.some(
              (c) => c.roomId === r.id && ['HOLD', 'ACTIVE'].includes(c.status),
            ),
        );
        expect(free.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('PRC-04: each priced room has exactly one APPROVED room_prices row from 2026-09-01, proposed and reviewed by the Boss, price = rooms.price', () => {
      const priced = db.t.room.filter((r) => r.price !== null);
      expect(priced).toHaveLength(6);
      expect(db.t.roomPrice).toHaveLength(6);
      for (const room of priced) {
        const rows = db.t.roomPrice.filter((p) => p.roomId === room.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('APPROVED');
        expect(rows[0].effectiveFrom.toISOString()).toBe(midnightUtc('2026-09-01'));
        expect(rows[0].proposedById).toBe(bossId());
        expect(rows[0].reviewedById).toBe(bossId());
        expect(rows[0].reviewedAt).toBeInstanceOf(Date);
        expect(rows[0].price).toBe(room.price);
      }
    });

    it('SVC-01: each building has exactly Wifi ROOM, Rác PERSON, Gửi xe máy VEHICLE, Gửi xe điện VEHICLE', () => {
      for (const b of db.t.building) {
        const svcs = sorted(
          db.t.service.filter((s) => s.buildingId === b.id).map((s) => [s.name, s.unit]),
        );
        expect(svcs).toEqual(
          sorted([
            ['Wifi', 'ROOM'],
            ['Rác', 'PERSON'],
            ['Gửi xe máy', 'VEHICLE'],
            ['Gửi xe điện', 'VEHICLE'],
          ]),
        );
      }
    });

    it('RATE-02: per building ELECTRIC 3 tiers, WATER 1 tier, Wifi/Rác/Gửi xe máy 1 tier each; all APPROVED from 2026-09-01 by the Boss; no plan for Gửi xe điện', () => {
      for (const b of db.t.building) {
        const plans = db.t.ratePlan.filter((p) => p.buildingId === b.id);
        expect(plans).toHaveLength(5);
        const byKey = Object.fromEntries(
          plans.map((p) => {
            const svc = p.serviceId
              ? db.t.service.find((s) => s.id === p.serviceId)!
              : null;
            return [`${p.kind}${svc ? `:${svc.name}` : ''}`, p];
          }),
        );
        expect(sorted(Object.keys(byKey))).toEqual(
          sorted([
            'ELECTRIC',
            'WATER',
            'SERVICE:Wifi',
            'SERVICE:Rác',
            'SERVICE:Gửi xe máy',
          ]),
        );
        expect(tiersOf(byKey.ELECTRIC.id)).toEqual([
          [1, 50, 3000],
          [2, 100, 3500],
          [3, null, 4000],
        ]);
        expect(tiersOf(byKey.WATER.id)).toEqual([[1, null, 15000]]);
        expect(tiersOf(byKey['SERVICE:Wifi'].id)).toEqual([[1, null, 100000]]);
        expect(tiersOf(byKey['SERVICE:Rác'].id)).toEqual([[1, null, 30000]]);
        expect(tiersOf(byKey['SERVICE:Gửi xe máy'].id)).toEqual([[1, null, 100000]]);
        for (const p of plans) {
          expect(p.status).toBe('APPROVED');
          expect(p.effectiveFrom.toISOString()).toBe(midnightUtc('2026-09-01'));
          expect(p.proposedById).toBe(bossId());
          expect(p.reviewedById).toBe(bossId());
          expect(p.reviewedAt).toBeInstanceOf(Date);
          expect(p.serviceId !== null).toBe(p.kind === 'SERVICE');
          if (p.serviceId !== null)
            expect(db.t.service.find((s) => s.id === p.serviceId)!.buildingId).toBe(b.id);
        }
        expect(plans.some((p) => p.serviceId === svcOf(b.code, 'Gửi xe điện').id)).toBe(
          false,
        );
      }
      expect(db.t.rateTier).toHaveLength(21);
    });

    it('RATE-02: tiers are strictly increasing and the last tier has up_to null', () => {
      for (const plan of db.t.ratePlan) {
        const tiers = db.t.rateTier
          .filter((t) => t.ratePlanId === plan.id)
          .sort((a, b) => a.tierNo - b.tierNo);
        tiers.forEach((t, i) => expect(t.tierNo).toBe(i + 1));
        expect(tiers[tiers.length - 1].upTo).toBeNull();
        const bounded = tiers.slice(0, -1).map((t) => t.upTo as number);
        expect([...bounded].sort((a, b) => a - b)).toEqual(bounded);
        expect(new Set(bounded).size).toBe(bounded.length);
        if (plan.kind !== 'ELECTRIC') expect(tiers).toHaveLength(1);
      }
    });
  });

  describe('contract HD000001', () => {
    const contract = (): Row => db.t.contract[0];

    it('BIL-01 / CON-03 / DB-B1: HD000001 at CG01 room 203, 15/09/2026 for 6 months ends 14/03/2027, billing day 15, rent = room price, deposit 0, ACTIVE', () => {
      expect(db.t.contract).toHaveLength(1);
      const c = contract();
      const r203 = roomOf('CG01', '203');
      expect(c.code).toBe('HD000001');
      expect(c.buildingId).toBe(bld('CG01').id);
      expect(c.buildingId).toBe(r203.buildingId);
      expect(c.roomId).toBe(r203.id);
      expect(c.tenantId).toBe(user('0900000004').id);
      expect(user('0900000004').role).toBe('TENANT');
      expect(c.startDate.toISOString()).toBe(midnightUtc('2026-09-15'));
      expect(c.termMonths).toBe(6);
      expect(c.endDate.toISOString()).toBe(midnightUtc('2027-03-14'));
      expect(c.billingDay).toBe(15);
      expect(c.rent).toBe(2_500_000);
      expect(c.rent).toBe(r203.price);
      expect(c.deposit).toBe(0);
      expect(c.status).toBe('ACTIVE');
      expect(c.signedAt).toBeInstanceOf(Date);
      expect(c.movedInAt).toBeInstanceOf(Date);
      expect(c.createdById).toBe(user('0900000002').id);
    });

    it('CON-04 / DB-B6: 2 occupants, exactly one signer = the tenant, CCCD empty, within max_occupants', () => {
      const occ = db.t.occupant;
      expect(occ).toHaveLength(2);
      const signers = occ.filter((o) => o.isSigner);
      expect(signers).toHaveLength(1);
      expect(signers[0]).toMatchObject({
        fullName: 'Nguyễn Văn An',
        phone: '0900000004',
        idNumberEnc: null,
        idNumberLast4: null,
        idFrontUrl: null,
        idBackUrl: null,
      });
      expect(signers[0].fullName).toBe(user('0900000004').fullName);
      expect(signers[0].moveInDate.toISOString()).toBe(midnightUtc('2026-09-15'));
      expect(occ.find((o) => !o.isSigner)).toMatchObject({
        fullName: 'Trần Thị Mai',
        phone: null,
      });
      expect(occ.every((o) => o.contractId === contract().id)).toBe(true);
      expect(occ.length).toBeLessThanOrEqual(roomOf('CG01', '203').maxOccupants);
    });

    it('DB-B5: contract services are only Wifi (ROOM) and Rác (PERSON) of CG01; the vehicle uses the VEHICLE service "Gửi xe máy" of CG01', () => {
      const cs = db.t.contractService.map((link) => ({
        link,
        svc: db.t.service.find((x) => x.id === link.serviceId)!,
      }));
      expect(sorted(cs.map((s) => [s.svc.name, s.svc.unit]))).toEqual([
        ['Rác', 'PERSON'],
        ['Wifi', 'ROOM'],
      ]);
      for (const s of cs) {
        expect(s.link.contractId).toBe(contract().id);
        expect(s.link.buildingId).toBe(bld('CG01').id);
        expect(s.svc.buildingId).toBe(bld('CG01').id);
      }
      const v = db.t.vehicle[0];
      expect(v.serviceId).toBe(svcOf('CG01', 'Gửi xe máy').id);
      expect(db.t.service.find((s) => s.id === v.serviceId)!.unit).toBe('VEHICLE');
      expect(v.buildingId).toBe(bld('CG01').id);
    });

    it('CON-14: plate is uppercase without spaces, type MOTORBIKE, active, registered 15/09/2026', () => {
      expect(db.t.vehicle).toHaveLength(1);
      const v = db.t.vehicle[0];
      expect(v.plate).toBe('29B112345');
      expect(v.plate).toBe(v.plate.toUpperCase().replace(/\s/g, ''));
      expect(v.type).toBe('MOTORBIKE');
      expect(v.isActive).toBe(true);
      expect(v.removedAt).toBeNull();
      expect(v.registeredAt.toISOString()).toBe(midnightUtc('2026-09-15'));
      expect(v.contractId).toBe(contract().id);
    });

    it('CON-10 / CON-11 / MTR-02: room 203 has ELECTRIC 1284 and WATER >= 0 read on the start date 15/09/2026 by manager1', () => {
      const readings = db.t.meterReading;
      expect(readings).toHaveLength(2);
      const r203 = roomOf('CG01', '203').id;
      const electric = readings.find((m) => m.kind === 'ELECTRIC')!;
      const water = readings.find((m) => m.kind === 'WATER')!;
      expect(electric.value).toBe(1284);
      expect(water.value).toBeGreaterThanOrEqual(0);
      for (const m of readings) {
        expect(m.roomId).toBe(r203);
        expect(m.contractId).toBe(contract().id);
        expect(m.readOn.toISOString()).toBe(contract().startDate.toISOString());
        expect(m.isMeterReplaced).toBe(false);
        expect(m.readById).toBe(user('0900000002').id);
      }
    });

    it('BIL-09: the seeded data reproduces the worked example, first invoice total 3.119.000 đ', () => {
      // Test-side calculation straight from the spec formula (16-billing.md BIL-09), using only seeded rows.
      const c = contract();
      const periodStart = c.startDate as Date;
      const cost = (qty: number, planId: number): number => {
        let lower = 0;
        let sum = 0;
        for (const t of db.t.rateTier
          .filter((x) => x.ratePlanId === planId)
          .sort((a, b) => a.tierNo - b.tierNo)) {
          const upper = t.upTo ?? Infinity;
          sum += Math.max(0, Math.min(qty, upper) - lower) * t.unitPrice;
          lower = upper;
        }
        return sum;
      };
      const planOf = (kind: string, serviceId: number | null): Row => {
        const candidates = db.t.ratePlan.filter(
          (p) =>
            p.buildingId === c.buildingId &&
            p.kind === kind &&
            (p.serviceId ?? null) === serviceId &&
            p.status === 'APPROVED' &&
            p.effectiveFrom.getTime() <= periodStart.getTime(),
        );
        return candidates.sort(
          (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
        )[0];
      };
      const reading = (kind: string): number =>
        db.t.meterReading.find((m) => m.kind === kind)!.value;
      // spec: electric 1.284 -> 1.368, water 6 m3 (PER_M3)
      const electric = cost(1368 - reading('ELECTRIC'), planOf('ELECTRIC', null).id);
      const water = cost(6, planOf('WATER', null).id);
      expect(electric).toBe(150_000 + 119_000);
      expect(water).toBe(90_000);

      const occupants = db.t.occupant.filter(
        (o) => o.moveInDate.getTime() <= periodStart.getTime(),
      ).length;
      const vehicles = db.t.vehicle.filter(
        (v) => v.isActive && v.registeredAt.getTime() <= periodStart.getTime(),
      ).length;
      let services = 0;
      for (const cs of db.t.contractService) {
        const svc = db.t.service.find((s) => s.id === cs.serviceId)!;
        const qty = svc.unit === 'PERSON' ? occupants : 1;
        services += qty * cost(1, planOf('SERVICE', svc.id).id);
      }
      const vehicleFee = db.t.vehicle
        .filter((v) => v.isActive)
        .reduce((s, v) => s + cost(1, planOf('SERVICE', v.serviceId).id), 0);

      expect(occupants).toBe(2);
      expect(vehicles).toBe(1);
      expect(services).toBe(100_000 + 60_000);
      expect(vehicleFee).toBe(100_000);
      expect(c.rent + electric + water + services + vehicleFee).toBe(3_119_000);
    });
  });

  describe('money and dates', () => {
    it('G-01: every money column is an integer; prices and unit prices > 0, deposit = 0', () => {
      const money = [
        ...db.t.room.filter((r) => r.price !== null).map((r) => r.price),
        ...db.t.roomPrice.map((p) => p.price),
        ...db.t.rateTier.map((t) => t.unitPrice),
        ...db.t.contract.flatMap((c) => [c.rent]),
      ];
      expect(money.length).toBe(6 + 6 + 21 + 1);
      for (const m of money) {
        expect(Number.isInteger(m)).toBe(true);
        expect(m).toBeGreaterThan(0);
      }
      expect(db.t.contract[0].deposit).toBe(0);
      for (const m of db.t.meterReading) expect(Number.isInteger(m.value)).toBe(true);
    });

    const checkDates = (data: FakeDb): void => {
      const dateCols: [string, string, string][] = [
        ['roomPrice', 'effectiveFrom', '2026-09-01'],
        ['ratePlan', 'effectiveFrom', '2026-09-01'],
        ['contract', 'startDate', '2026-09-15'],
        ['contract', 'endDate', '2027-03-14'],
        ['occupant', 'moveInDate', '2026-09-15'],
        ['vehicle', 'registeredAt', '2026-09-15'],
        ['meterReading', 'readOn', '2026-09-15'],
      ];
      for (const [model, col, ymd] of dateCols) {
        expect(data.t[model].length).toBeGreaterThan(0);
        for (const row of data.t[model]) {
          expect(row[col].toISOString()).toBe(midnightUtc(ymd));
        }
      }
      const c = data.t.contract[0];
      expect(c.signedAt.toISOString()).toBe('2026-09-14T03:00:00.000Z'); // 14/09/2026 10:00 +07:00
      expect(c.movedInAt.toISOString()).toBe('2026-09-15T02:00:00.000Z'); // 15/09/2026 09:00 +07:00
      const vnDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      expect(vnDay.format(c.movedInAt)).toBe('2026-09-15');
      expect(vnDay.format(c.signedAt)).toBe('2026-09-14');
    };

    it('G-02: business dates are UTC midnight of the exact day; movedInAt is 15/09/2026 in Asia/Ho_Chi_Minh', () => {
      checkDates(db);
    });

    it('G-02: dates stay exact when the machine runs in Asia/Ho_Chi_Minh (UTC+7)', async () => {
      const previous = process.env.TZ;
      process.env.TZ = 'Asia/Ho_Chi_Minh';
      try {
        // prove the timezone switch really took effect before relying on it
        expect(new Date(2026, 8, 15).getTimezoneOffset()).toBe(-420);
        const local = new FakeDb();
        await seed(local.client());
        checkDates(local);
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    });
  });
});

// Run-guard `if (import.meta.main) await main();` (plan CP-4, D7).
// The "runs when executed directly" half cannot be tested inside vitest; it is checked by
// the $NODB command in the plan (Done when 3). Only the DB edge is faked here: PrismaClient
// is replaced by a counter, so even a broken guard could not reach a database.
describe('BE-LOGIN-06: run-guard (import.meta.main)', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.doUnmock('@prisma/client');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('BE-LOGIN-06: importing seed.ts does not run main() (no PrismaClient, no output, no exit code)', async () => {
    let constructed = 0;
    let disconnected = 0;
    vi.resetModules();
    vi.doMock('@prisma/client', () => ({
      PrismaClient: class {
        constructor() {
          constructed++;
        }
        async $disconnect(): Promise<void> {
          disconnected++;
        }
      },
    }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitBefore = process.exitCode;
    try {
      const mod = await import('./seed.js');
      // the module really loaded fresh (exports present), it just did not run
      expect(mod.DEV_ACCOUNTS).toHaveLength(5);
      expect(typeof mod.seed).toBe('function');
      expect(constructed).toBe(0);
      expect(disconnected).toBe(0);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(exitBefore);
    } finally {
      process.exitCode = exitBefore;
    }
  });

  it('BE-LOGIN-06: the only main() call is `if (import.meta.main) await main();`, no argv/pathToFileURL comparison', () => {
    const src = readFileSync(new URL('./seed.ts', import.meta.url), 'utf8');
    expect(src.match(/\bmain\(\)/g)).toHaveLength(1 + 1); // `function main()` + the guarded call
    expect(src).toContain('\nif (import.meta.main) await main();\n');
    expect(src).not.toMatch(/pathToFileURL/);
    expect(src).not.toMatch(/process\.argv/);
  });
});
