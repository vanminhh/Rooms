import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { ViewingsService } from './viewings.service.js';
import { PublicViewingDto } from './dto/viewings.dto.js';

// CP-3 (BE-P2-31) · VIEW-01, 02, 11, 12: unit test of ViewingsService.createPublic.
// Prisma is the only mocked edge (DB); RateLimiter is the real in-memory implementation
// (not the DB, deterministic, part of what VIEW-02/11 must actually do).
// The service builds its own `now = new Date()` internally (no injected clock), so every
// DTO here uses tomorrow's Hanoi date: VIEW-08's "already started" rule never applies to a
// future day, which keeps this test deterministic regardless of the wall-clock time it runs at.

const TOMORROW = formatDateOnly(addDays(todayHanoi(), 1));

function makeDto(overrides: Partial<PublicViewingDto> = {}): PublicViewingDto {
  return {
    roomId: 101,
    guestName: 'Nguyễn Văn A',
    guestPhone: '0912345678',
    visitDate: TOMORROW,
    timeSlot: 'EVENING',
    ...overrides,
  } as PublicViewingDto;
}

describe('CP-3 (BE-P2-31) · ViewingsService.createPublic', () => {
  let calls: string[];
  let roomFound: boolean;
  let sentToday: number;
  let viewingCreate: ReturnType<typeof vi.fn>;
  let queryRaw: ReturnType<typeof vi.fn>;
  let roomFindFirst: ReturnType<typeof vi.fn>;
  let viewingCount: ReturnType<typeof vi.fn>;
  let transactionSpy: ReturnType<typeof vi.fn>;
  let prisma: any;
  let service: ViewingsService;

  beforeEach(() => {
    calls = [];
    roomFound = true;
    sentToday = 0;
    queryRaw = vi.fn(async () => {
      calls.push('lock');
      return [{ lock: 'ok' }];
    });
    roomFindFirst = vi.fn(async () => {
      calls.push('room.findFirst');
      return roomFound ? { id: 101 } : null;
    });
    viewingCount = vi.fn(async () => {
      calls.push('viewing.count');
      return sentToday;
    });
    viewingCreate = vi.fn(async () => {
      calls.push('viewing.create');
      return { id: 1 };
    });
    transactionSpy = vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        $queryRaw: queryRaw,
        room: { findFirst: roomFindFirst },
        viewing: { count: viewingCount, create: viewingCreate },
      }),
    );
    prisma = { $transaction: transactionSpy };
    service = new ViewingsService(prisma);
  });

  it('VIEW-01 happy: a public room and a valid date/slot creates exactly one WEB/NEW viewing, body has no id', async () => {
    const res = await service.createPublic(makeDto(), '1.1.1.1');
    expect(res).toEqual({ received: true });
    expect(viewingCreate).toHaveBeenCalledTimes(1);
    const data = viewingCreate.mock.calls[0][0].data;
    expect(data.source).toBe('WEB');
    expect(data.status).toBe('NEW');
    expect(data.roomId).toBe(101);
    expect('id' in (res as object)).toBe(false);
  });

  it('VIEW-01: a room that fails publicRoomWhere (not found by the query) is 409 ROOM_NOT_AVAILABLE, nothing is created', async () => {
    roomFound = false;
    await expect(service.createPublic(makeDto(), '1.1.1.2')).rejects.toMatchObject({
      getStatus: expect.any(Function),
    });
    try {
      roomFound = false;
      await service.createPublic(makeDto(), '1.1.1.3');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getStatus()).toBe(409);
      expect(e.getResponse().message ?? e.getResponse()).toBe('ROOM_NOT_AVAILABLE');
    }
    expect(viewingCreate).not.toHaveBeenCalled();
  });

  it('VIEW-01: a non-existent room id looks identical to a non-public one (same 409 ROOM_NOT_AVAILABLE)', async () => {
    roomFound = false; // findFirst with publicRoomWhere returns null either way
    await expect(service.createPublic(makeDto({ roomId: 999999 }), '1.1.1.4')).rejects.toMatchObject({});
    expect(roomFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 999999 }) }),
    );
  });

  it('VIEW-11: a phone with 3 WEB viewings today is refused with 429, nothing more is created', async () => {
    sentToday = 3;
    try {
      await service.createPublic(makeDto(), '2.2.2.1');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getStatus()).toBe(429);
    }
    expect(viewingCreate).not.toHaveBeenCalled();
  });

  it('VIEW-11: a phone with 2 WEB viewings today is still allowed (boundary below the cap)', async () => {
    sentToday = 2;
    const res = await service.createPublic(makeDto(), '2.2.2.2');
    expect(res).toEqual({ received: true });
    expect(viewingCreate).toHaveBeenCalledTimes(1);
  });

  it('VIEW-11: the phone count filters on guestPhone and source=WEB (MANUAL rows must not count)', async () => {
    await service.createPublic(makeDto(), '2.2.2.3');
    const where = viewingCount.mock.calls[0][0].where;
    expect(where.guestPhone).toBe('0912345678');
    expect(where.source).toBe('WEB');
  });

  it('VIEW-11: advisory lock, count and create happen inside one transaction, lock before count before create', async () => {
    await service.createPublic(makeDto(), '2.2.2.4');
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['lock', 'room.findFirst', 'viewing.count', 'viewing.create']);
  });

  it('VIEW-02: the 6th request from the same IP within the hour is 429, the 5th still goes through', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await service.createPublic(makeDto(), '3.3.3.3');
      expect(res).toEqual({ received: true });
    }
    try {
      await service.createPublic(makeDto(), '3.3.3.3');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getStatus()).toBe(429);
    }
    expect(transactionSpy).toHaveBeenCalledTimes(5); // the 6th never reaches the DB
  });

  it('VIEW-02: a different IP is not affected by another IP being blocked', async () => {
    for (let i = 0; i < 5; i++) await service.createPublic(makeDto(), '4.4.4.4');
    const res = await service.createPublic(makeDto(), '5.5.5.5');
    expect(res).toEqual({ received: true });
  });

  it('VIEW-12 honeypot: a non-empty website field returns the same body, writes nothing to the DB', async () => {
    const res = await service.createPublic(makeDto({ website: 'http://spam' }), '6.6.6.6');
    expect(res).toEqual({ received: true });
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(viewingCreate).not.toHaveBeenCalled();
  });

  it('VIEW-02/VIEW-12: a honeypot hit still counts against the IP rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      await service.createPublic(makeDto({ website: 'bot' }), '7.7.7.7');
    }
    try {
      await service.createPublic(makeDto(), '7.7.7.7'); // 6th hit, this time a real submission
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getStatus()).toBe(429);
    }
    expect(transactionSpy).not.toHaveBeenCalled(); // never reached the DB, not even once
  });
});
