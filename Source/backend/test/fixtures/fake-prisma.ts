// In-memory stand-in for PrismaService, used by the draft specs (outside edge: the DB).
// It supports only the Prisma surface listed in PLAN.md 2.4, plus contract.findMany for scope tests.
// Seed-shaped data: the 5 DEV_ACCOUNTS (real argon2id hashes), buildings CG01/DD01/HM01/TL01, HD000001.
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { DEV_ACCOUNTS } from '../../prisma/seed.js';

export type Row = Record<string, unknown>;
interface Args {
  where?: Row;
  select?: Record<string, boolean>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  data?: Row;
}

const isOp = (v: unknown): v is Row => typeof v === 'object' && v !== null && !(v instanceof Date);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (!isOp(cond)) return row[key] === cond;
    if ('in' in cond) return (cond.in as unknown[]).includes(row[key]);
    if ('not' in cond) return row[key] !== cond.not;
    throw new Error(`fake-prisma: unsupported operator on ${key}`);
  });
}

const known = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'fake' });

function project(row: Row, select?: Record<string, boolean>): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([k]) => [k, row[k]]));
}

class Table {
  rows: Row[] = [];
  private nextId = 1;

  constructor(
    private readonly uniques: string[] = [],
    private readonly defaults: Row = {},
  ) {}

  load(rows: Row[]): void {
    this.rows.splice(0, this.rows.length, ...rows.map((r) => ({ ...r })));
    this.nextId = Math.max(0, ...this.rows.map((r) => Number(r.id ?? 0))) + 1;
  }

  private find(where?: Row): Row[] {
    return this.rows.filter((r) => matches(r, where));
  }

  private checkUnique(data: Row, self?: Row): void {
    for (const f of this.uniques) {
      if (data[f] != null && this.rows.some((r) => r !== self && r[f] === data[f])) {
        throw known('P2002', `Unique constraint failed on the fields: (${f})`);
      }
    }
  }

  async findUnique({ where }: Args): Promise<Row | null> {
    const row = this.find(where)[0];
    return row ? { ...row } : null;
  }

  async findFirst({ where, select }: Args): Promise<Row | null> {
    const row = this.find(where)[0];
    return row ? project(row, select) : null;
  }

  async findMany({ where, select, orderBy }: Args = {}): Promise<Row[]> {
    const found = this.find(where);
    if (orderBy) {
      const [[key, dir]] = Object.entries(orderBy);
      found.sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : 1) * (dir === 'asc' ? 1 : -1));
    }
    return found.map((r) => project(r, select));
  }

  async create({ data = {} }: Args): Promise<Row> {
    this.checkUnique(data);
    const row: Row = { ...this.defaults, id: this.nextId++, ...data };
    this.rows.push(row);
    return { ...row };
  }

  async update({ where, data = {} }: Args): Promise<Row> {
    const row = this.find(where)[0];
    if (!row) throw known('P2025', 'Record to update not found.');
    this.checkUnique(data, row);
    Object.assign(row, data);
    return { ...row };
  }

  async updateMany({ where, data = {} }: Args): Promise<{ count: number }> {
    const found = this.find(where);
    for (const row of found) Object.assign(row, data);
    return { count: found.length };
  }
}

let hashes: Promise<string[]> | undefined;
// Hashed once per test file: argon2 is slow, and the fake is rebuilt for every test.
const devHashes = () =>
  (hashes ??= Promise.all(DEV_ACCOUNTS.map((a) => argon2.hash(a.password, { type: argon2.argon2id }))));

export const IDS = {
  users: { boss: 1, manager1: 2, manager2: 3, tenant: 4, lockedTenant: 5 },
  buildings: { CG01: 101, DD01: 102, HM01: 103, TL01: 104 },
  contracts: { HD000001: 201 },
} as const;

export async function createFakePrisma() {
  const passwordHashes = await devHashes();

  const user = new Table(['phone', 'email'], {
    email: null, contactPhone: null, zaloUrl: null, facebookUrl: null, lastLoginAt: null,
    mustChangePassword: false, isActive: true,
  });
  const building = new Table(['code']);
  const contract = new Table(['code']);
  const setting = new Table();
  const session = new Table(['tokenHash'], { remember: false, revokedAt: null, userAgent: null });
  const passwordResetToken = new Table(['tokenHash'], { usedAt: null });
  const auditLog = new Table();

  function reset(): void {
    user.load(
      DEV_ACCOUNTS.map((a, i) => ({
        id: i + 1, role: a.role, phone: a.phone, fullName: a.fullName, passwordHash: passwordHashes[i],
        email: null,
        contactPhone: a.role === 'TENANT' ? null : a.phone,
        zaloUrl: a.role === 'BOSS' ? 'https://zalo.me/0900000001' : null,
        facebookUrl: a.role === 'BOSS' ? 'https://facebook.com/tro.thong.minh' : null,
        mustChangePassword: a.mustChangePassword, isActive: a.isActive, lastLoginAt: null,
      })),
    );
    building.load([
      { id: IDS.buildings.CG01, code: 'CG01', name: 'Tòa Cầu Giấy', managerId: IDS.users.manager1, isActive: true },
      { id: IDS.buildings.DD01, code: 'DD01', name: 'Tòa Đống Đa', managerId: IDS.users.manager1, isActive: true },
      { id: IDS.buildings.HM01, code: 'HM01', name: 'Tòa Hoàng Mai', managerId: null, isActive: true },
      { id: IDS.buildings.TL01, code: 'TL01', name: 'Tòa Thăng Long', managerId: IDS.users.manager2, isActive: false },
    ]);
    contract.load([
      { id: IDS.contracts.HD000001, code: 'HD000001', buildingId: IDS.buildings.CG01, tenantId: IDS.users.tenant },
    ]);
    setting.load([
      {
        key: 'default_contact',
        value: { phone: '0900000001', zaloUrl: 'https://zalo.me/0900000001', facebookUrl: 'https://facebook.com/tro.thong.minh' },
      },
    ]);
    session.load([]);
    passwordResetToken.load([]);
    auditLog.load([]);
  }
  reset();

  const fake = {
    user, building, contract, setting, session, passwordResetToken, auditLog,
    db: { user: user.rows, building: building.rows, contract: contract.rows, setting: setting.rows, session: session.rows, passwordResetToken: passwordResetToken.rows, auditLog: auditLog.rows },
    reset,
    /** Mutable seed row of a dev account, e.g. fake.account('tenant').mustChangePassword = false. */
    account: (key: keyof typeof IDS.users): Row => user.rows.find((r) => r.id === IDS.users[key])!,
    // No rollback: the fake only checks what the code wrote, not atomicity. `any` avoids a self-referencing type.
    async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      return fn(fake);
    },
  };
  return fake;
}

export type FakePrisma = Awaited<ReturnType<typeof createFakePrisma>>;
