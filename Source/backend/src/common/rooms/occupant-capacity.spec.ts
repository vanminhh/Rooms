import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertOccupantCapacity, peakOccupants, type OccupantStay } from './occupant-capacity.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const stay = (start: string, end: string | null = null): OccupantStay => ({
  moveInDate: day(start), moveOutDate: end === null ? null : day(end),
});

describe('CON-13 / DB-B6: inclusive occupant capacity', () => {
  it('returns zero when no stays intersect the requested range', () => {
    expect(peakOccupants([])).toBe(0);
    expect(peakOccupants([stay('2026-11-01', '2026-11-10'), stay('2026-12-01')], day('2026-11-11'), day('2026-11-30'))).toBe(0);
  });

  it('counts a departing person through their departure day', () => {
    const stays = [stay('2026-11-01', '2026-11-20'), stay('2026-11-20')];
    expect(peakOccupants(stays, day('2026-11-20'), day('2026-11-20'))).toBe(2);
    expect(peakOccupants(stays, day('2026-11-21'), day('2026-11-21'))).toBe(1);
  });

  it('counts a one-day stay and preserves inclusive end-bound clipping', () => {
    expect(peakOccupants([stay('2026-11-20', '2026-11-20')], day('2026-11-20'), day('2026-11-20'))).toBe(1);
    expect(peakOccupants([stay('2026-11-20')], undefined, day('2026-11-20'))).toBe(1);
    expect(peakOccupants([stay('2026-11-21')], undefined, day('2026-11-20'))).toBe(0);
  });

  it('measures the true peak rather than counting all stays that touch a broad horizon', () => {
    const stays = [stay('2026-11-01', '2026-11-05'), stay('2026-11-06', '2026-11-10'), stay('2026-11-11', '2026-11-15')];
    expect(peakOccupants(stays, day('2026-11-01'), day('2026-11-30'))).toBe(1);
  });

  it('checks future overlaps and combines starts/exits at the same boundary without depending on input order', () => {
    const stays = [stay('2027-01-01', '2027-01-05'), stay('2027-01-06'), stay('2027-01-06'), stay('2027-01-03', '2027-01-06')];
    expect(peakOccupants(stays)).toBe(3);
    expect(peakOccupants([...stays].reverse())).toBe(3);
    expect(peakOccupants(stays, day('2027-01-07'))).toBe(2);
  });

  it('ignores past violations when a lower limit is checked from today onward', () => {
    const stays = [stay('2026-10-01', '2026-11-19'), stay('2026-10-01', '2026-11-19'), stay('2026-11-20')];
    expect(peakOccupants(stays)).toBe(2);
    expect(peakOccupants(stays, day('2026-11-20'))).toBe(1);
  });

  it('clips a candidate interval without counting conflicts outside it', () => {
    const stays = [stay('2026-10-01'), stay('2026-10-02', '2026-10-31'), stay('2026-12-01')];
    expect(peakOccupants(stays)).toBe(2);
    expect(peakOccupants(stays, day('2026-11-01'), day('2026-11-30'))).toBe(1);
    expect(peakOccupants(stays, day('2026-12-01'), null)).toBe(2);
  });

  it('supports open ranges and open-ended stays without a per-day loop', () => {
    const stays = [stay('1900-01-01'), stay('9999-12-31')];
    expect(peakOccupants(stays)).toBe(2);
    expect(peakOccupants(stays, undefined, null)).toBe(2);
    expect(peakOccupants(stays, day('1900-01-01'), day('9999-12-30'))).toBe(1);
  });

  it('handles an inclusive 9999-12-31 departure numerically', () => {
    expect(peakOccupants([stay('9999-12-30', '9999-12-31'), stay('9999-12-31')], day('9999-12-31'), day('9999-12-31'))).toBe(2);
  });

  it.each([
    { label: 'invalid move-in', stays: [{ moveInDate: new Date('invalid'), moveOutDate: null }] },
    { label: 'invalid move-out', stays: [{ moveInDate: day('2026-11-20'), moveOutDate: new Date('invalid') }] },
    { label: 'move-out before move-in', stays: [stay('2026-11-20', '2026-11-19')] },
    { label: 'timestamp instead of business date', stays: [{ moveInDate: new Date('2026-11-20T01:00:00Z'), moveOutDate: null }] },
  ])('rejects $label with a controlled error even outside the requested horizon', ({ stays }) => {
    expect(() => peakOccupants(stays, day('2030-01-01'))).toThrow(BadRequestException);
  });

  it('rejects invalid or reversed horizon bounds even for an empty stay list', () => {
    expect(() => peakOccupants([], new Date('invalid'))).toThrow(BadRequestException);
    expect(() => peakOccupants([], undefined, new Date('invalid'))).toThrow(BadRequestException);
    expect(() => peakOccupants([], day('2026-11-21'), day('2026-11-20'))).toThrow(BadRequestException);
  });

  it('allows the exact limit and selects only dates from HOLD/ACTIVE contracts of the room', async () => {
    const findMany = vi.fn(async () => [stay('2026-11-01'), stay('2026-11-20', '2026-11-20')]);
    await expect(assertOccupantCapacity({ occupant: { findMany } }, 17, 2)).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      where: { contract: { roomId: 17, status: { in: ['HOLD', 'ACTIVE'] } } },
      select: { moveInDate: true, moveOutDate: true },
    });
  });

  it('refuses capacity overflow with 409 CONFLICT_STATE', async () => {
    const db = { occupant: { findMany: vi.fn(async () => [stay('2026-11-01', '2026-11-20'), stay('2026-11-20')]) } };
    let error: unknown;
    try { await assertOccupantCapacity(db, 17, 1, day('2026-11-20')); } catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'CONFLICT_STATE' });
  });

  it('allows a lower room limit after earlier occupants have departed', async () => {
    const db = { occupant: { findMany: vi.fn(async () => [stay('2026-11-01', '2026-11-19'), stay('2026-11-01')]) } };
    await expect(assertOccupantCapacity(db, 17, 1, day('2026-11-20'))).resolves.toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])('rejects invalid capacity %s before querying', async value => {
    const findMany = vi.fn(async () => []);
    await expect(assertOccupantCapacity({ occupant: { findMany } }, 17, value)).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid room id or horizon before querying', async () => {
    const findMany = vi.fn(async () => []);
    await expect(assertOccupantCapacity({ occupant: { findMany } }, 0, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertOccupantCapacity({ occupant: { findMany } }, 17, 1, day('2026-11-21'), day('2026-11-20'))).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
