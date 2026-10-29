// Phase 1 seed (BE-LOGIN-06). DEV ONLY: fixed passwords, never run against production.
// Runs with `npx prisma db seed` (= node prisma/seed.ts, Node type stripping, no tsx), safe to run twice.
//
// Dev accounts (phone / password):
//   Boss                     0900000001 / Boss@2026
//   Manager 1 (CG01, DD01)   0900000002 / QuanLy1@2026
//   Manager 2 (no building)  0900000003 / QuanLy2@2026
//   Tenant, must change pw   0900000004 / NguoiThue@2026   (holds contract HD000001)
//   Tenant, locked           0900000005 / TamKhoa@2026
//
// Re-running resets only passwordHash, mustChangePassword and isActive of these 5 accounts (D5).

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

export interface DevAccount {
  key: 'boss' | 'manager1' | 'manager2' | 'tenant' | 'lockedTenant';
  role: 'BOSS' | 'MANAGER' | 'TENANT';
  phone: string;
  fullName: string;
  password: string;
  mustChangePassword: boolean;
  isActive: boolean;
}

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  { key: 'boss', role: 'BOSS', phone: '0900000001', fullName: 'Phạm Minh Đức', password: 'Boss@2026', mustChangePassword: false, isActive: true },
  { key: 'manager1', role: 'MANAGER', phone: '0900000002', fullName: 'Nguyễn Thu Hà', password: 'QuanLy1@2026', mustChangePassword: false, isActive: true },
  { key: 'manager2', role: 'MANAGER', phone: '0900000003', fullName: 'Lê Quang Huy', password: 'QuanLy2@2026', mustChangePassword: false, isActive: true },
  { key: 'tenant', role: 'TENANT', phone: '0900000004', fullName: 'Nguyễn Văn An', password: 'NguoiThue@2026', mustChangePassword: true, isActive: true },
  { key: 'lockedTenant', role: 'TENANT', phone: '0900000005', fullName: 'Trần Văn Bình', password: 'TamKhoa@2026', mustChangePassword: false, isActive: false },
];

const BOSS_CONTACT = {
  contactPhone: '0900000001',
  zaloUrl: 'https://zalo.me/0900000001',
  facebookUrl: 'https://facebook.com/tro.thong.minh',
};

interface RoomSpec {
  code: string;
  floor: number;
  areaM2: number;
  price: number | null; // null = no approved price yet (CON-02)
  maxOccupants: number;
}

interface BuildingSpec {
  code: string;
  name: string;
  address: string;
  district: string;
  ward: string;
  manager: DevAccount['key'] | null;
  rooms: RoomSpec[];
}

const BUILDINGS: BuildingSpec[] = [
  {
    code: 'CG01', name: 'Tòa Cầu Giấy', address: '1 Xuân Thủy', district: 'Cầu Giấy', ward: 'Dịch Vọng Hậu', manager: 'manager1',
    rooms: [
      { code: '203', floor: 2, areaM2: 24, price: 2_500_000, maxOccupants: 2 },
      { code: '204', floor: 2, areaM2: 22, price: 2_400_000, maxOccupants: 2 },
      { code: '301', floor: 3, areaM2: 20, price: null, maxOccupants: 2 },
    ],
  },
  {
    code: 'DD01', name: 'Tòa Đống Đa', address: '2 Tây Sơn', district: 'Đống Đa', ward: 'Quang Trung', manager: 'manager1',
    rooms: [
      { code: '101', floor: 1, areaM2: 20, price: 2_200_000, maxOccupants: 2 },
      { code: '102', floor: 1, areaM2: 22, price: 2_300_000, maxOccupants: 2 },
    ],
  },
  {
    code: 'HM01', name: 'Tòa Hoàng Mai', address: '3 Giải Phóng', district: 'Hoàng Mai', ward: 'Giáp Bát', manager: null,
    rooms: [
      { code: '101', floor: 1, areaM2: 18, price: 2_000_000, maxOccupants: 2 },
      { code: '201', floor: 2, areaM2: 25, price: 2_600_000, maxOccupants: 3 },
    ],
  },
];

// SVC-01. "Gửi xe điện" has no rate plan until the owner gives its price.
const SERVICES: { name: string; unit: 'ROOM' | 'PERSON' | 'VEHICLE' }[] = [
  { name: 'Wifi', unit: 'ROOM' },
  { name: 'Rác', unit: 'PERSON' },
  { name: 'Gửi xe máy', unit: 'VEHICLE' },
  { name: 'Gửi xe điện', unit: 'VEHICLE' },
];

// Seed prices of 12-pricing.md. tiers = [upTo, unitPrice]; upTo null = no limit (RATE-02).
interface RateSpec {
  kind: 'ELECTRIC' | 'WATER' | 'SERVICE';
  service?: string;
  tiers: [number | null, number][];
}

const RATES: RateSpec[] = [
  { kind: 'ELECTRIC', tiers: [[50, 3000], [100, 3500], [null, 4000]] },
  { kind: 'WATER', tiers: [[null, 15000]] },
  { kind: 'SERVICE', service: 'Wifi', tiers: [[null, 100000]] },
  { kind: 'SERVICE', service: 'Rác', tiers: [[null, 30000]] },
  { kind: 'SERVICE', service: 'Gửi xe máy', tiers: [[null, 100000]] },
];

// Business dates are @db.Date: `new Date('YYYY-MM-DD')` is UTC midnight, so the stored day is exact.
const day = (s: string): Date => new Date(s);
const EFFECTIVE_FROM = day('2026-09-01');
const START_DATE = day('2026-09-15');

export async function seed(prisma: PrismaClient): Promise<void> {
  const now = new Date();

  const userId = {} as Record<DevAccount['key'], number>;
  for (const a of DEV_ACCOUNTS) {
    const passwordHash = await argon2.hash(a.password, { type: argon2.argon2id });
    const contact = a.role === 'BOSS' ? BOSS_CONTACT : a.role === 'MANAGER' ? { contactPhone: a.phone } : {};
    const user = await prisma.user.upsert({
      where: { phone: a.phone },
      update: { passwordHash, mustChangePassword: a.mustChangePassword, isActive: a.isActive },
      create: {
        role: a.role, phone: a.phone, fullName: a.fullName, passwordHash,
        mustChangePassword: a.mustChangePassword, isActive: a.isActive, ...contact,
      },
    });
    userId[a.key] = user.id;
  }
  const boss = userId.boss;

  const settings = {
    default_contact: { phone: BOSS_CONTACT.contactPhone, zaloUrl: BOSS_CONTACT.zaloUrl, facebookUrl: BOSS_CONTACT.facebookUrl },
    bank_account: { bankBin: '970436', bankName: 'Vietcombank', accountNo: '0000000000', accountName: 'TRO THONG MINH' },
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value, updatedById: boss } });
  }

  const buildingId: Record<string, number> = {};
  const roomId: Record<string, number> = {}; // key "<building>/<room>"
  const serviceId: Record<string, number> = {}; // key "<building>/<service>"
  for (const b of BUILDINGS) {
    // findFirst + create, not upsert: Prisma's native upsert fires the BEFORE INSERT manager trigger
    // even when the row exists, which raises MANAGER_MAX_2_BUILDINGS for a manager with 2 buildings.
    const building =
      (await prisma.building.findFirst({ where: { code: b.code } })) ??
      (await prisma.building.create({
        data: {
          code: b.code, name: b.name, address: b.address, district: b.district, ward: b.ward,
          managerId: b.manager ? userId[b.manager] : null, waterMode: 'PER_M3', dueDays: 5,
        },
      }));
    buildingId[b.code] = building.id;

    for (const r of b.rooms) {
      const room = await prisma.room.upsert({
        where: { buildingId_code: { buildingId: building.id, code: r.code } },
        update: {},
        create: { buildingId: building.id, code: r.code, floor: r.floor, areaM2: r.areaM2, price: r.price, maxOccupants: r.maxOccupants },
      });
      roomId[`${b.code}/${r.code}`] = room.id;
      if (r.price === null) continue;
      // PRC-04: a priced room has one APPROVED room_prices row, proposed and reviewed by the Boss.
      const priced = await prisma.roomPrice.findFirst({ where: { roomId: room.id, status: 'APPROVED', effectiveFrom: EFFECTIVE_FROM } });
      if (!priced) {
        await prisma.roomPrice.create({
          data: {
            roomId: room.id, price: r.price, effectiveFrom: EFFECTIVE_FROM, status: 'APPROVED',
            proposedById: boss, reviewedById: boss, reviewedAt: now,
          },
        });
      }
    }

    for (const s of SERVICES) {
      const service = await prisma.service.upsert({
        where: { buildingId_name: { buildingId: building.id, name: s.name } },
        update: {},
        create: { buildingId: building.id, name: s.name, unit: s.unit },
      });
      serviceId[`${b.code}/${s.name}`] = service.id;
    }

    for (const rate of RATES) {
      const planServiceId = rate.service ? serviceId[`${b.code}/${rate.service}`] : null;
      const exists = await prisma.ratePlan.findFirst({
        where: { buildingId: building.id, kind: rate.kind, serviceId: planServiceId, status: 'APPROVED', effectiveFrom: EFFECTIVE_FROM },
      });
      if (exists) continue;
      await prisma.ratePlan.create({
        data: {
          buildingId: building.id, kind: rate.kind, serviceId: planServiceId, effectiveFrom: EFFECTIVE_FROM,
          status: 'APPROVED', proposedById: boss, reviewedById: boss, reviewedAt: now,
          tiers: { create: rate.tiers.map(([upTo, unitPrice], i) => ({ tierNo: i + 1, upTo, unitPrice })) },
        },
      });
    }
  }

  // Active contract shaped like BIL-01 / BIL-09 (dates as given there). deposit 0: no deposit invoice (CON-10).
  const cg01 = buildingId.CG01;
  const room203 = roomId['CG01/203'];
  const contract = await prisma.contract.upsert({
    where: { code: 'HD000001' },
    update: {},
    create: {
      code: 'HD000001', buildingId: cg01, roomId: room203, tenantId: userId.tenant,
      startDate: START_DATE, termMonths: 6, endDate: day('2027-03-14'), billingDay: 15,
      rent: 2_500_000, deposit: 0, status: 'ACTIVE',
      signedAt: new Date('2026-09-14T10:00:00+07:00'), movedInAt: new Date('2026-09-15T09:00:00+07:00'),
      createdById: userId.manager1,
    },
  });

  for (const name of ['Wifi', 'Rác']) {
    const sid = serviceId[`CG01/${name}`];
    await prisma.contractService.upsert({
      where: { contractId_serviceId: { contractId: contract.id, serviceId: sid } },
      update: {},
      create: { contractId: contract.id, serviceId: sid, buildingId: cg01 },
    });
  }

  // CON-04: the tenant is the signer (CCCD fields empty), plus one more occupant.
  const tenant = DEV_ACCOUNTS.find((a) => a.key === 'tenant')!;
  const occupants = [
    { fullName: tenant.fullName, phone: tenant.phone, isSigner: true },
    { fullName: 'Trần Thị Mai', phone: null, isSigner: false },
  ];
  for (const o of occupants) {
    const exists = await prisma.occupant.findFirst({ where: { contractId: contract.id, fullName: o.fullName } });
    if (!exists) await prisma.occupant.create({ data: { contractId: contract.id, ...o, moveInDate: START_DATE } });
  }

  const plate = '29B112345';
  const vehicle = await prisma.vehicle.findFirst({ where: { plate, isActive: true } });
  if (!vehicle) {
    await prisma.vehicle.create({
      data: {
        contractId: contract.id, buildingId: cg01, serviceId: serviceId['CG01/Gửi xe máy'],
        plate, type: 'MOTORBIKE', registeredAt: START_DATE,
      },
    });
  }

  for (const [kind, value] of [['ELECTRIC', 1284], ['WATER', 52]] as const) {
    await prisma.meterReading.upsert({
      where: { roomId_kind_readOn: { roomId: room203, kind, readOn: START_DATE } },
      update: {},
      create: { roomId: room203, contractId: contract.id, kind, value, readOn: START_DATE, readById: userId.manager1 },
    });
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    console.log(`Seed xong: ${DEV_ACCOUNTS.length} tài khoản, ${BUILDINGS.length} tòa, ${BUILDINGS.flatMap((b) => b.rooms).length} phòng, 1 hợp đồng.`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run directly (`node prisma/seed.ts`), not when a test imports `seed`.
// `import.meta.main` (Node >= 24.2) survives junctions, 8.3 short names and drive-letter case.
if (import.meta.main) await main();
