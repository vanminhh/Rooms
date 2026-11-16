import { setupViewings, BOSS, MANAGER, GUEST, HOUR, NOW } from '../../../test/fixtures/viewing-prisma.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

const PAST = new Date('2026-11-14T03:00:00Z');

describe('BE-EX-20/23 staff changes', () => {
  it.each(['NEW', 'CONFIRMED'])('VIEW-09: converts legacy %s to an exact hour and clears both legacy fields', async status => {
    const { db, service } = setupViewings();
    db.add({ status, visitAt: null, visitDate: new Date('2026-11-14'), timeSlot: 'AFTERNOON' });
    const result = await service.update(MANAGER, 1, { visitAt: HOUR });
    expect(result).toMatchObject({ visitAt: HOUR, visitDate: null, timeSlot: null, handledById: 2 });
  });
  it.each(['DONE', 'LOST', 'CANCELLED', 'WON'])('VIEW-09: closed %s cannot be rescheduled', async status => {
    const { db, service } = setupViewings(); db.add({ status });
    await expect(service.update(BOSS, 1, { visitAt: HOUR })).rejects.toMatchObject({ status: 409 });
  });
  it('VIEW-16: rescheduling excludes only this row and refuses a full new hour', async () => {
    const { db, service } = setupViewings();
    db.add({ visitAt: new Date('2026-11-16T02:00:00Z'), guestPhone: '0944444444' });
    for (const phone of ['0911111111', '0922222222', '0933333333']) db.add({ guestPhone: phone });
    await expect(service.update(BOSS, 1, { visitAt: HOUR })).rejects.toMatchObject({ status: 409 });
    expect(db.rows[0].visitAt.toISOString()).toBe('2026-11-16T02:00:00.000Z');
  });
  it.each(['NEW', 'CONFIRMED'])('VIEW-04: %s may become DONE only after start', async status => {
    const { db, service } = setupViewings(); const row = db.add({ status });
    await expect(service.update(BOSS, 1, { status: 'DONE' })).rejects.toMatchObject({ status: 409 });
    db.rows[0].visitAt = PAST;
    expect((await service.update(BOSS, row.id, { status: 'DONE' })).status).toBe('DONE');
  });
  it('VIEW-04: DONE cannot be smuggled through a simultaneous future reschedule', async () => {
    const { db, service } = setupViewings(); db.add({ visitAt: PAST });
    await expect(service.update(BOSS, 1, { status: 'DONE', visitAt: HOUR })).rejects.toMatchObject({ status: 409 });
  });
  it.each(['NEW', 'CONFIRMED'])('VIEW-04: %s to LOST is refused even overdue', async status => {
    const { db, service } = setupViewings(); db.add({ status, visitAt: PAST });
    await expect(service.update(BOSS, 1, { status: 'LOST', outcomeNote: 'Không thuê' })).rejects.toMatchObject({ status: 409 });
  });
  it('VIEW-04: DONE to LOST needs outcome note; staff cancellation needs note and records actor', async () => {
    const { db, service } = setupViewings(); db.add({ status: 'DONE' }); db.add();
    await expect(service.update(BOSS, 1, { status: 'LOST' })).rejects.toMatchObject({ status: 400 });
    expect((await service.update(BOSS, 1, { status: 'LOST', outcomeNote: 'Không thuê' })).status).toBe('LOST');
    await expect(service.update(BOSS, 2, { status: 'CANCELLED' })).rejects.toMatchObject({ status: 400 });
    expect(await service.update(BOSS, 2, { status: 'CANCELLED', note: 'Khách không đến' })).toMatchObject({ status: 'CANCELLED', handledById: 1 });
  });
  it.each(['CONFIRMED', 'WON', 'NEW'])('VIEW-04/15: PATCH cannot set %s', async status => {
    const { db, service } = setupViewings(); db.add();
    await expect(service.update(BOSS, 1, { status: status as any })).rejects.toMatchObject({ status: 409 });
  });
  it('VIEW-04: conditional update detects a lost state race', async () => {
    const { db, service } = setupViewings(); db.add({ visitAt: PAST });
    db.prisma.viewing.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.update(BOSS, 1, { status: 'DONE' })).rejects.toMatchObject({ status: 409 });
  });
  it('SCOPE-02: current manager assignment controls edits and confirmations', async () => {
    const { db, service } = setupViewings(); db.add(); db.buildings[0].managerId = 3;
    await expect(service.update(MANAGER, 1, { note: 'test' })).rejects.toMatchObject({ status: 403 });
    await expect(service.confirm(MANAGER, 1, { via: 'PHONE' })).rejects.toMatchObject({ status: 403 });
  });
  it('VIEW-15a: late PHONE confirmation keeps visitAt and stores no method or time', async () => {
    const { db, service, send } = setupViewings(); db.add({ visitAt: PAST });
    expect(await service.confirm(MANAGER, 1, { via: 'PHONE' })).toMatchObject({ status: 'CONFIRMED', handledById: 2, visitAt: PAST.toISOString() });
    for (const key of ['confirmedAt', 'confirmedVia', 'cancelledBy']) expect(db.rows[0]).not.toHaveProperty(key);
    expect(send).not.toHaveBeenCalled();
  });
  it('VIEW-15/LOC-06: late EMAIL sends English with address/public phone before CONFIRMED', async () => {
    const { db, service, send } = setupViewings(); db.add({ userId: 4, visitAt: PAST });
    send.mockImplementationOnce(async () => { expect(db.rows[0].status).toBe('NEW'); });
    await service.confirm(BOSS, 1, { via: 'EMAIL' });
    expect(db.rows[0].status).toBe('CONFIRMED');
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('guest@example.test'); expect(mail.subject).toContain('confirmed');
    expect(mail.text).toContain('Hà Nội'); expect(mail.text).toContain('0981111111'); expect(mail.text).not.toContain('0900000002');
  });
  it('VIEW-15: email failure retries once and leaves NEW; no owner email refuses sending', async () => {
    const { db, service, send } = setupViewings(); db.add({ userId: 4 }); db.add();
    send.mockRejectedValue(new Error('provider down'));
    await expect(service.confirm(BOSS, 1, { via: 'EMAIL' })).rejects.toMatchObject({ status: 503 });
    expect(db.rows[0].status).toBe('NEW'); expect(send).toHaveBeenCalledTimes(2);
    await expect(service.confirm(BOSS, 2, { via: 'EMAIL' })).rejects.toMatchObject({ status: 409 });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('VIEW-20/18 ownership and cancellation', () => {
  it('VIEW-20: upcoming NEW then CONFIRMED precede history before pagination, including older creations', async () => {
    const { db, service } = setupViewings();
    db.add({ userId: 4, status: 'CONFIRMED', createdAt: new Date('2026-11-01'), visitAt: new Date(HOUR) });
    db.add({ userId: 4, status: 'NEW', createdAt: new Date('2026-11-02'), visitAt: new Date(HOUR) });
    for (let i = 0; i < 22; i++) db.add({ userId: 4, status: 'CANCELLED', visitAt: PAST });
    db.add({ userId: 5, status: 'NEW' });
    const first = await service.listMine(GUEST, { page: 1, limit: 2 });
    expect(first.data.map(v => v.id)).toEqual([2, 1]);
    expect(first.meta).toEqual({ page: 1, limit: 2, total: 24 });
    const next = await service.listMine(GUEST, { page: 2, limit: 2 });
    expect(next.data.map(v => v.id)).toEqual([24, 23]);
    expect(db.prisma.viewing.findMany.mock.calls.every(([query]) => query.take <= 2)).toBe(true);
  });
  it('VIEW-20: group counts and reads share RepeatableRead so a concurrent confirmation cannot duplicate a row', async () => {
    const { db, service } = setupViewings();
    db.add({ userId: 4 });
    const count = db.prisma.viewing.count.getMockImplementation();
    const findMany = db.prisma.viewing.findMany.getMockImplementation();
    db.prisma.viewing.count.mockImplementation(async (query: unknown) => { expect(db.inTransaction).toBe(true); return count(query); });
    db.prisma.viewing.findMany.mockImplementation(async (query: unknown) => { expect(db.inTransaction).toBe(true); return findMany(query); });
    await service.listMine(GUEST, {});
    expect(db.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead' }));
  });
  it('VIEW-20: same phone gives no ownership of manual or other account rows; locked room remains readable', async () => {
    const { db, service } = setupViewings();
    db.add({ userId: 4 }); db.add({ userId: 5, guestPhone: '0900000004' }); db.add({ guestPhone: '0900000004' });
    db.rooms[0].isActive = false;
    expect((await service.listMine(GUEST, {})).data.map(v => v.id)).toEqual([1]);
    expect((await service.getMine(GUEST, 1)).roomId).toBe(101);
    for (const id of [2, 3, 99]) {
      await expect(service.getMine(GUEST, id)).rejects.toMatchObject({ status: 404 });
      await expect(service.cancelMine(GUEST, id)).rejects.toMatchObject({ status: 404 });
    }
  });
  it('VIEW-18: one minute before start clears earlier staff handler; at/after start refuses', async () => {
    const { db, service } = setupViewings();
    db.add({ userId: 4, status: 'CONFIRMED', handledById: 2, visitAt: new Date(NOW.getTime() + 60_000) });
    db.add({ userId: 4, visitAt: NOW }); db.add({ userId: 4, visitAt: PAST });
    expect((await service.cancelMine(GUEST, 1)).status).toBe('CANCELLED');
    expect(db.rows[0].handledById).toBeNull();
    for (const id of [2, 3]) await expect(service.cancelMine(GUEST, id)).rejects.toMatchObject({ status: 409 });
  });
  it('VIEW-18: cancelling one room keeps the phone place until its last open room closes', async () => {
    const { db, service } = setupViewings();
    db.add({ userId: 4, guestPhone: '0900000004' }); db.add({ roomId: 102, userId: 4, guestPhone: '0900000004' });
    db.add({ guestPhone: '0911111111' }); db.add({ guestPhone: '0922222222' });
    await service.cancelMine(GUEST, 1);
    expect((await service.times(101, { from: '2026-11-16', to: '2026-11-16' }))[0].hours).not.toContain(HOUR);
    await service.cancelMine(GUEST, 2);
    expect((await service.times(101, { from: '2026-11-16', to: '2026-11-16' }))[0].hours).toContain(HOUR);
  });
});

describe('VIEW-21 availability', () => {
  it('VIEW-21: anonymous sees only dates/hours; private permits MANUAL-only phone at capacity without claiming it', async () => {
    const { db, service } = setupViewings();
    for (const phone of ['0900000004', '0911111111', '0922222222']) db.add({ guestPhone: phone });
    const range = { from: '2026-11-16', to: '2026-11-16' };
    const publicHours = await service.times(102, range);
    expect(publicHours[0].hours).not.toContain(HOUR);
    expect((await service.times(102, range, GUEST))[0].hours).toContain(HOUR);
    expect((await service.listMine(GUEST, {})).data).toEqual([]);
    expect(Object.keys(publicHours[0]).sort()).toEqual(['date', 'hours']);
    expect(JSON.stringify(publicHours)).not.toMatch(/phone|name|email|userId|responsible/i);
  });
  it('VIEW-16a/21: guest overlap stays selectable privately when the manager is different', async () => {
    const { db, service } = setupViewings(); db.add({ roomId: 301, guestPhone: '0900000004' });
    const range = { from: '2026-11-16', to: '2026-11-16' };
    expect((await service.times(101, range))[0].hours).toContain(HOUR);
    expect((await service.times(101, range, GUEST))[0].hours).toContain(HOUR);
  });
  it.each([['2026-02-30', '2026-03-02'], ['2026-11-17', '2026-11-16'], ['2026-11-15', '2026-12-16']])('VIEW-21: invalid range %s..%s is refused', async (from, to) => {
    const { service } = setupViewings(); await expect(service.times(101, { from, to })).rejects.toMatchObject({ status: 400 });
  });
  it('VIEW-08/21: 31 inclusive days allowed; past and beyond horizon hours remain empty', async () => {
    const { service } = setupViewings();
    const rows = await service.times(101, { from: '2026-11-15', to: '2026-12-15' });
    expect(rows).toHaveLength(31); expect(rows[0].hours).toHaveLength(12); expect(rows[30].hours).toHaveLength(12);
    expect((await service.times(101, { from: '2026-12-16', to: '2026-12-16' }))[0].hours).toEqual([]);
  });
  it('VIEW-21: nonpublic rooms are 404 on either availability route', async () => {
    const { db, service } = setupViewings(); db.rooms[0].isActive = false;
    await expect(service.times(101, { from: '2026-11-16', to: '2026-11-16' })).rejects.toMatchObject({ status: 404 });
    await expect(service.times(101, { from: '2026-11-16', to: '2026-11-16' }, GUEST)).rejects.toMatchObject({ status: 404 });
  });
});

describe('VIEW-19 notification', () => {
  it('NOTI-08 / LOC-06: both viewing callers use stored templates and a padded Hanoi date', async () => {
    const { db, service, send } = setupViewings();
    const templates = {
      viewingNew: { vi: { subject: 'Lịch mới', text: '{guestName}\n{guestPhone}\n{guestEmail}\n{room}\n{building}\n{time}\n{note}' } },
      viewingConfirmed: { en: { subject: 'Confirmed', text: '{room}\n{building}\n{address}\n{time}\n{contact}' } },
    };
    db.prisma.setting.findUnique.mockImplementation(async ({ where }: any) => ({ value: where.key === 'email_templates' ? templates : { phone: '0982222222' } }) as any);
    await service.book(GUEST, { roomId: 101, visitAt: HOUR, note: 'Gọi trước' });
    expect(send.mock.calls[0][0].subject).toBe('Lịch mới');
    expect(send.mock.calls[0][0].text).toContain('16/11/2026, 10:00 (Asia/Ho_Chi_Minh)');
    expect(send.mock.calls[0][0].text).toContain('guest@example.test');
    await service.confirm(BOSS, 1, { via: 'EMAIL' });
    expect(send.mock.calls[1][0].subject).toBe('Confirmed');
    expect(send.mock.calls[1][0].text).toContain('16/11/2026, 10:00 (Asia/Ho_Chi_Minh)');
    expect(send.mock.calls[1][0].text).toContain('0981111111');
  });
  it.each(['inactive', 'missing email', 'unassigned'])('VIEW-19: %s manager falls back to Boss', async kind => {
    const { db, service, send } = setupViewings();
    if (kind === 'inactive') db.users[1].isActive = false;
    if (kind === 'missing email') db.users[1].email = null;
    if (kind === 'unassigned') db.buildings[0].managerId = null as any;
    send.mockImplementationOnce(async () => { expect(db.inTransaction).toBe(false); });
    await service.book(GUEST, { roomId: 101, visitAt: HOUR, note: 'Gọi trước' });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'boss@example.test' });
    expect(send.mock.calls[0][0].text).toContain('Gọi trước');
  });
  it('VIEW-19/NOTI-07: email failure retries once but booking remains saved', async () => {
    const { db, service, send } = setupViewings(); send.mockRejectedValue(new Error('down'));
    expect((await service.book(GUEST, { roomId: 101, visitAt: HOUR })).id).toBe(1);
    expect(send).toHaveBeenCalledTimes(2); expect(db.rows).toHaveLength(1);
  });
});
