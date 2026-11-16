import { vi } from 'vitest';
import type { AuthUser } from '../../src/common/guards/auth.decorators.js';
import { ViewingsService } from '../../src/modules/viewings/viewings.service.js';
import { BuildingContactService } from '../../src/modules/buildings/building-contact.service.js';
import { SettingsService } from '../../src/modules/settings/settings.service.js';

export const BOSS: AuthUser = { id: 1, role: 'BOSS', buildingIds: null, mustChangePassword: false };
export const MANAGER: AuthUser = { id: 2, role: 'MANAGER', buildingIds: [10, 20], mustChangePassword: false };
export const GUEST: AuthUser = { id: 4, role: 'GUEST', buildingIds: [], mustChangePassword: false };
export const NOW = new Date('2026-11-15T00:30:00Z'); // 07:30 Hanoi
export const HOUR = '2026-11-16T03:00:00.000Z'; // 10:00 Hanoi

export function setupViewings() {
  const db = viewingPrisma();
  const settings = new SettingsService(db.prisma);
  const send = vi.fn(async (_mail: { to: string; subject: string; text: string }) => {});
  const service = new ViewingsService(db.prisma, new BuildingContactService(settings), settings, { send });
  return { db, service, send };
}

// Database edge only. No service or capacity logic is mocked; real concurrency is tested in e2e.
export function viewingPrisma() {
  const users: any[] = [
    { id: 1, role: 'BOSS', phone: '0900000001', fullName: 'Boss', email: 'boss@example.test' },
    { id: 2, role: 'MANAGER', phone: '0900000002', fullName: 'Manager A', email: 'manager@example.test', contactPhone: '0981111111' },
    { id: 3, role: 'MANAGER', phone: '0900000003', fullName: 'Manager B', email: 'other@example.test' },
    { id: 4, role: 'GUEST', phone: '0900000004', fullName: 'Nguyễn Văn A', email: 'guest@example.test', locale: 'en' },
    { id: 5, role: 'TENANT', phone: '0900000005', fullName: 'Tenant', email: 'tenant@example.test' },
  ].map(u => ({ isActive: true, mustChangePassword: false, emailVerifiedAt: NOW, locale: 'vi', ...u }));
  const buildings = [
    { id: 10, managerId: 2, name: 'Tòa A', district: 'Cầu Giấy' },
    { id: 20, managerId: 2, name: 'Tòa B', district: 'Cầu Giấy' },
    { id: 30, managerId: 3, name: 'Tòa C', district: 'Đống Đa' },
  ].map(b => ({ isActive: true, address: 'Hà Nội', ...b }));
  const rooms: any[] = [101, 102, 103, 104, 105, 201, 301].map(id => ({
    id, code: `P${id}`, buildingId: id < 200 ? 10 : id < 300 ? 20 : 30,
    isActive: true, underMaintenance: false, price: 3000000, contracts: [],
  }));
  let rows: any[] = [];
  let nextId = 1;
  let inTransaction = false;
  const calls: string[] = [];
  const building = (id: number) => {
    const b = buildings.find(b => b.id === id)!;
    return { ...b, manager: users.find(u => u.id === b.managerId) ?? null,
      ratePlans: [{ kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom: new Date('2026-01-01') }, { kind: 'WATER', status: 'APPROVED', effectiveFrom: new Date('2026-01-01') }] };
  };
  const room = (id: number) => { const r = rooms.find(r => r.id === id); return r ? { ...r, building: building(r.buildingId) } : null; };
  const rowView = (r: any) => ({ ...r, room: room(r.roomId), user: users.find(u => u.id === r.userId) ?? null });
  function matches(row: any, where: any): boolean {
    if (where === undefined) return true;
    if (where === null || typeof where !== 'object' || where instanceof Date) return +row === +where || row === where;
    return Object.entries(where).every(([key, value]: [string, any]) => {
      if (value === undefined) return true;
      if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(w => matches(row, w));
      if (key === 'OR') return value.some((w: any) => matches(row, w));
      if (key === 'in') return value.includes(row);
      if (key === 'not') return !matches(row, value);
      if (key === 'gte') return row !== null && row >= value;
      if (key === 'gt') return row !== null && row > value;
      if (key === 'lte') return row !== null && row <= value;
      if (key === 'lt') return row !== null && row < value;
      if (key === 'some') return row.some((v: any) => matches(v, value));
      if (key === 'none') return !row.some((v: any) => matches(v, value));
      return matches(row?.[key], value);
    });
  }
  function add(data: any = {}) {
    data = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const row = { id: nextId++, roomId: 101, userId: null, guestName: 'Khách', guestPhone: '0911111111',
      visitAt: new Date(HOUR), visitDate: null, timeSlot: null, status: 'NEW', source: 'MANUAL',
      note: null, outcomeNote: null, handledById: null, contractId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
    rows.push(row); return row;
  }
  const prisma: any = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => { calls.push(`${strings.join('?')} ${values.join(',')}`); return []; }),
    $transaction: vi.fn(async (work: (tx: any) => Promise<any>) => {
      const snapshot = structuredClone(rows); inTransaction = true; calls.push('begin');
      try { const result = await work(prisma); calls.push('commit'); return result; }
      catch (e) { rows = snapshot; throw e; }
      finally { inTransaction = false; }
    }),
    user: {
      findUnique: vi.fn(async ({ where }: any) => users.find(u => matches(u, where)) ?? null),
      findFirst: vi.fn(async ({ where }: any) => users.find(u => matches(u, where)) ?? null),
    },
    building: { findMany: vi.fn(async ({ where }: any) => buildings.map(b => building(b.id)).filter(b => matches(b, where))) },
    room: {
      findFirst: vi.fn(async ({ where }: any) => rooms.map(r => room(r.id)).find(r => matches(r, where)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => room(where.id)),
    },
    viewing: {
      findFirst: vi.fn(async ({ where }: any) => rows.map(rowView).find(r => matches(r, where)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => rows.map(rowView).find(r => matches(r, where)) ?? null),
      findMany: vi.fn(async ({ where, orderBy = [], skip = 0, take }: any) => rows.map(rowView).filter(r => matches(r, where)).sort((a, b) => {
        for (const order of Array.isArray(orderBy) ? orderBy : [orderBy]) for (const [key, direction] of Object.entries(order)) {
          if (a[key] < b[key]) return direction === 'desc' ? 1 : -1;
          if (a[key] > b[key]) return direction === 'desc' ? -1 : 1;
        }
        return 0;
      }).slice(skip, take === undefined ? undefined : skip + take)),
      count: vi.fn(async ({ where }: any) => rows.map(rowView).filter(r => matches(r, where)).length),
      create: vi.fn(async ({ data }: any) => { calls.push('insert'); return rowView(add(data)); }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const found = rows.filter(r => matches(rowView(r), where));
        found.forEach(r => Object.assign(r, data, { updatedAt: new Date() }));
        return { count: found.length };
      }),
    },
    setting: { findUnique: vi.fn(async () => ({ value: { phone: '0982222222', zaloUrl: null, facebookUrl: null } })) },
  };
  return { prisma, users, buildings, rooms, add, calls, get rows() { return rows; }, get inTransaction() { return inTransaction; } };
}
