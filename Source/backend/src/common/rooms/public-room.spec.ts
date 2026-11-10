import { publicRoomWhere, publicBuildingWhere } from './public-room.js';

// CP-4 (BE-P2-06) · ROOM-05, R2-1, BLD-05, RATE-06.
// Tests both the exact shape of the `where` object PLAN 2.6 defines, and (because Prisma
// is not run here) a hand-written seed-shaped fixture check: a tiny generic evaluator that
// interprets the where object (equality, {not}, {in}, {lte}, relation {some}/{none}, AND)
// against plain fixtures, so we actually exercise the filtering logic and not just its shape.

type Where = Record<string, unknown>;

function matches(row: unknown, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Where[]).every((c) => matches(row, c));
    const value = (row as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('not' in c) return value !== c.not;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('lte' in c) return (value as Date).getTime() <= (c.lte as Date).getTime();
      if ('none' in c) return !(value as unknown[]).some((item) => matches(item, c.none as Where));
      if ('some' in c) return (value as unknown[]).some((item) => matches(item, c.some as Where));
      // nested relation filter (e.g. `building: {...}`), recurse on the related object
      return matches(value, c);
    }
    return value === cond;
  });
}

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);
const TODAY = d('2026-11-01');

// Seed-shaped fixtures (mirrors prisma/seed.ts: CG01 has rooms 203 (ACTIVE contract HD000001)
// and 301 (price: null); DD01 has room 101, fully qualifying). Not imported from seed.ts:
// BUILDINGS is not exported there yet (that export lands in CP-6 of this same plan), and the
// draft import rule forbids importing a main file not yet copied into the draft.
function ratePlans(effectiveFrom: Date) {
  return [
    { kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom },
    { kind: 'WATER', status: 'APPROVED', effectiveFrom },
  ];
}

function makeBuilding(overrides: Partial<{ isActive: boolean; ratePlans: unknown[] }> = {}) {
  return { isActive: true, ratePlans: ratePlans(d('2026-09-01')), ...overrides };
}

function makeRoom(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isActive: true,
    underMaintenance: false,
    price: 2_000_000,
    contracts: [] as { status: string }[],
    building: makeBuilding(),
    ...overrides,
  };
}

describe('ROOM-05 / R2-1 / BE-P2-06: publicRoomWhere shape', () => {
  it('ROOM-05 / BE-P2-06 #16: returns exactly the 5 branches of PLAN 2.6', () => {
    expect(publicRoomWhere(TODAY)).toEqual({
      isActive: true,
      underMaintenance: false,
      price: { not: null },
      contracts: { none: { status: { in: ['HOLD', 'ACTIVE'] } } },
      building: {
        isActive: true,
        AND: [
          { ratePlans: { some: { kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom: { lte: TODAY } } } },
          { ratePlans: { some: { kind: 'WATER', status: 'APPROVED', effectiveFrom: { lte: TODAY } } } },
        ],
      },
    });
  });

  it('RATE-06 / BE-P2-06 #17: the `today` argument is used as-is for both rate branches, never recomputed', () => {
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-06-01T00:00:00Z');
    const w1 = publicRoomWhere(t1) as unknown as { building: { AND: { ratePlans: { some: { effectiveFrom: { lte: Date } } } } }[] };
    const w2 = publicRoomWhere(t2) as unknown as { building: { AND: { ratePlans: { some: { effectiveFrom: { lte: Date } } } } }[] };
    expect(w1.building.AND[0].ratePlans.some.effectiveFrom.lte).toBe(t1);
    expect(w1.building.AND[1].ratePlans.some.effectiveFrom.lte).toBe(t1);
    expect(w2.building.AND[0].ratePlans.some.effectiveFrom.lte).toBe(t2);
  });
});

describe('ROOM-05 / BE-P2-06: publicRoomWhere against seed-shaped fixtures', () => {
  it('ROOM-05 / BE-P2-06 #18: CG01/301 shape (price: null) is never public', () => {
    const room301 = makeRoom({ price: null });
    expect(matches(room301, publicRoomWhere(TODAY))).toBe(false);
  });

  it('ROOM-05 / BE-P2-06 #19: CG01/203 shape (ACTIVE contract HD000001) is never public', () => {
    const room203 = makeRoom({ contracts: [{ status: 'ACTIVE' }] });
    expect(matches(room203, publicRoomWhere(TODAY))).toBe(false);
  });

  it('ROOM-03/05 / BE-P2-06 #20: underMaintenance = true, everything else fine, is never public', () => {
    const room = makeRoom({ underMaintenance: true });
    expect(matches(room, publicRoomWhere(TODAY))).toBe(false);
  });

  it('BLD-06 / BE-P2-06 #21: active room but building.isActive = false is never public', () => {
    const room = makeRoom({ building: makeBuilding({ isActive: false }) });
    expect(matches(room, publicRoomWhere(TODAY))).toBe(false);
  });

  it('R2-1 / BLD-05 / BE-P2-06 #22: building missing ELECTRIC (only WATER) is never public', () => {
    const room = makeRoom({ building: makeBuilding({ ratePlans: [{ kind: 'WATER', status: 'APPROVED', effectiveFrom: d('2026-09-01') }] }) });
    expect(matches(room, publicRoomWhere(TODAY))).toBe(false);
  });

  it('R2-1 / BLD-05 / BE-P2-06 #22b: building missing WATER (only ELECTRIC) is never public', () => {
    const room = makeRoom({ building: makeBuilding({ ratePlans: [{ kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom: d('2026-09-01') }] }) });
    expect(matches(room, publicRoomWhere(TODAY))).toBe(false);
  });

  it('RATE-06 / BE-P2-06 #23: building has both rate plans but effective tomorrow -> never public', () => {
    const tomorrow = d('2026-11-02');
    const room = makeRoom({ building: makeBuilding({ ratePlans: ratePlans(tomorrow) }) });
    expect(matches(room, publicRoomWhere(TODAY))).toBe(false);
  });

  it('ROOM-05 / BE-P2-06 #24: a HOLD contract hides the room; CANCELLED/ENDED do not', () => {
    const roomHold = makeRoom({ contracts: [{ status: 'HOLD' }] });
    expect(matches(roomHold, publicRoomWhere(TODAY))).toBe(false);

    const roomCancelled = makeRoom({ contracts: [{ status: 'CANCELLED' }] });
    expect(matches(roomCancelled, publicRoomWhere(TODAY))).toBe(true);

    const roomEnded = makeRoom({ contracts: [{ status: 'ENDED' }] });
    expect(matches(roomEnded, publicRoomWhere(TODAY))).toBe(true);
  });

  it('ROOM-05 / BE-P2-06 #25: a fully qualifying room (DD01/101 shape) is public', () => {
    const room101 = makeRoom();
    expect(matches(room101, publicRoomWhere(TODAY))).toBe(true);
  });
});

describe('BLD-05 / BE-P2-06: publicBuildingWhere', () => {
  it('BLD-05 / BE-P2-06 #26a: a building with no public room at all is never public', () => {
    const building = { isActive: true, rooms: [makeRoom({ price: null }), makeRoom({ underMaintenance: true })] };
    expect(matches(building, publicBuildingWhere(TODAY))).toBe(false);
  });

  it('BLD-05 / BE-P2-06 #26b: a building with at least one public room is public', () => {
    const building = { isActive: true, rooms: [makeRoom({ price: null }), makeRoom()] };
    expect(matches(building, publicBuildingWhere(TODAY))).toBe(true);
  });
});
