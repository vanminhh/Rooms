import { ViewingsService } from './viewings.service.js';
import { BuildingContactService } from '../buildings/building-contact.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { viewingPrisma, BOSS, MANAGER, GUEST, HOUR, NOW } from '../../../test/fixtures/viewing-prisma.js';

export function setup() {
  const db = viewingPrisma();
  const settings = new SettingsService(db.prisma);
  const send = vi.fn(async () => { expect(db.inTransaction).toBe(false); });
  const service = new ViewingsService(db.prisma, new BuildingContactService(settings), settings, { send });
  return { db, service, send };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe('BE-EX-19 account bookings', () => {
  it('VIEW-01/12/14: copies account identity, saves exact hour, returns owner id and public contacts', async () => {
    const { db, service, send } = setup();
    const result = await service.book(GUEST, { roomId: 101, visitAt: HOUR, note: 'Giữ nguyên nội dung' });
    expect(result).toMatchObject({ id: 1, roomId: 101, visitAt: HOUR, status: 'NEW', note: 'Giữ nguyên nội dung', contact: { phone: '0981111111' }, bossContact: { phone: '0982222222' } });
    expect(db.rows[0]).toMatchObject({ userId: 4, guestName: 'Nguyễn Văn A', guestPhone: '0900000004', visitDate: null, timeSlot: null, source: 'WEB' });
    for (const key of ['userId', 'handledById', 'guestEmail', 'confirmedAt', 'confirmedVia', 'cancelledBy']) expect(result).not.toHaveProperty(key);
    expect(send).toHaveBeenCalledOnce();
    expect(db.calls.indexOf('commit')).toBeGreaterThan(db.calls.indexOf('insert'));
  });
  it.each(['email', 'emailVerifiedAt'])('VIEW-01: missing %s forbids booking', async field => {
    const { db, service } = setup(); db.users[3][field] = null;
    await expect(service.book(GUEST, { roomId: 101, visitAt: HOUR })).rejects.toMatchObject({ status: 403 });
    expect(db.prisma.viewing.create).not.toHaveBeenCalled();
  });
  it('VIEW-01/AUTH-12: TENANT with email may book without email verification (owner option B)', async () => {
    const { db, service } = setup(); db.users[4].emailVerifiedAt = null;
    expect((await service.book({ ...GUEST, id: 5, role: 'TENANT' }, { roomId: 101, visitAt: HOUR })).status).toBe('NEW');
    expect(db.rows[0].userId).toBe(5);
  });
  it('VIEW-01: TENANT without email must add one to their account before booking', async () => {
    const { db, service } = setup(); db.users[4].email = null;
    await expect(service.book({ ...GUEST, id: 5, role: 'TENANT' }, { roomId: 101, visitAt: HOUR })).rejects.toMatchObject({
      status: 400, response: { code: 'VALIDATION_FAILED', fields: { email: 'Vui lòng thêm email trong tài khoản trước khi đặt lịch' } },
    });
    expect(db.prisma.viewing.create).not.toHaveBeenCalled();
  });
  it.each(['BOSS', 'MANAGER'])('VIEW-01: %s cannot use guest booking', async role => {
    const { service } = setup();
    await expect(service.book({ ...BOSS, role: role as any }, { roomId: 101, visitAt: HOUR })).rejects.toMatchObject({ status: 403 });
  });
  it.each(['locked', 'maintenance', 'unpriced', 'occupied', 'building locked'])('VIEW-01/ROOM-05: %s room is unavailable', async kind => {
    const { db, service } = setup();
    if (kind === 'locked') db.rooms[0].isActive = false;
    if (kind === 'maintenance') db.rooms[0].underMaintenance = true;
    if (kind === 'unpriced') db.rooms[0].price = null;
    if (kind === 'occupied') db.rooms[0].contracts = [{ status: 'HOLD' }];
    if (kind === 'building locked') db.buildings[0].isActive = false;
    await expect(service.book(GUEST, { roomId: 101, visitAt: HOUR })).rejects.toMatchObject({ response: expect.objectContaining({ message: 'ROOM_NOT_AVAILABLE' }) });
  });
  it('VIEW-02: three WEB creations today count even when cancelled; MANUAL, another user and yesterday do not', async () => {
    const { db, service } = setup();
    db.add({ userId: 4, source: 'WEB', status: 'CANCELLED' });
    db.add({ userId: 4, source: 'WEB', status: 'CANCELLED' });
    db.add({ userId: 4, source: 'WEB', status: 'CANCELLED', createdAt: new Date('2026-11-14T16:59:59Z') });
    db.add({ userId: 4, source: 'MANUAL', status: 'CANCELLED' });
    db.add({ userId: 5, source: 'WEB', status: 'CANCELLED' });
    await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    await expect(service.book(GUEST, { roomId: 102, visitAt: HOUR })).rejects.toMatchObject({ status: 429 });
    expect(db.prisma.viewing.count.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date('2026-11-14T17:00:00Z'), lt: new Date('2026-11-15T17:00:00Z') });
  });
  it('VIEW-02a: duplicate open account/room refused; another room at same hour allowed', async () => {
    const { db, service } = setup();
    await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    await expect(service.book(GUEST, { roomId: 101, visitAt: HOUR })).rejects.toMatchObject({ status: 409 });
    await service.book(GUEST, { roomId: 102, visitAt: HOUR });
    expect(db.rows).toHaveLength(2);
  });
  it('VIEW-16: WEB and MANUAL same phone share one place; fourth distinct phone refused', async () => {
    const { db, service } = setup();
    for (const phone of ['0900000004', '0911111111', '0922222222']) db.add({ guestPhone: phone });
    await service.book(GUEST, { roomId: 102, visitAt: HOUR });
    await expect(service.book({ ...GUEST, id: 5, role: 'TENANT' }, { roomId: 103, visitAt: HOUR })).rejects.toMatchObject({ response: expect.objectContaining({ message: 'VIEWING_TIME_TAKEN' }) });
  });
  it.each([201, 301])('VIEW-16/16a: room %s refuses responsible overlap or requests guest acknowledgement', async roomId => {
    const { service } = setup();
    await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    await expect(service.book(GUEST, { roomId, visitAt: HOUR })).rejects.toMatchObject({ status: 409, response: roomId === 201
      ? { message: 'VIEWING_TIME_TAKEN' } : { code: 'VIEWING_OVERLAP_WARNING' } });
  });
  it('VIEW-16: responsible person cannot be at two buildings; independent manager is available', async () => {
    const { db, service } = setup(); db.add({ roomId: 201 });
    await expect(service.book(GUEST, { roomId: 101, visitAt: HOUR })).rejects.toMatchObject({ status: 409 });
    await service.book(GUEST, { roomId: 301, visitAt: HOUR });
  });
  it('VIEW-02/16: mapping, account, phone, responsible and building locks precede the insert in one transaction', async () => {
    const { db, service } = setup(); await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    const beforeInsert = db.calls.slice(0, db.calls.indexOf('insert')).join('\n');
    for (const key of ['pg_advisory_xact_lock_shared', 'viewing:account:4', 'viewing:phone:0900000004', 'viewing:responsible:2', 'viewing:building:10']) expect(beforeInsert).toContain(key);
  });
  it('VIEW-02/G-02: a lock wait across Hanoi midnight uses one new-day quota window and creation time', async () => {
    const { db, service } = setup();
    vi.setSystemTime(new Date('2026-11-14T16:59:59Z'));
    for (let i = 0; i < 3; i++) db.add({ userId: 4, source: 'WEB', status: 'CANCELLED' });
    db.prisma.$queryRaw.mockImplementation(async (_strings: TemplateStringsArray, ...values: any[]) => {
      if (values.includes('viewing:building:10')) vi.setSystemTime(new Date('2026-11-14T17:00:01Z'));
      return [];
    });
    const result = await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    expect(result.createdAt).toBe('2026-11-14T17:00:01.000Z');
    expect(db.prisma.viewing.count.mock.calls[0][0].where.createdAt.gte).toEqual(new Date('2026-11-14T17:00:00Z'));
  });
});

describe('BE-EX-20 manual creation', () => {
  const dto = { roomId: 101, guestName: 'Khách nhập tay', guestPhone: '0911111111', visitAt: HOUR };
  it('VIEW-03: accepts active non-public room without owner or email', async () => {
    const { db, service, send } = setup(); db.rooms[0].price = null;
    const result = await service.create(MANAGER, dto);
    expect(result).toMatchObject({ source: 'MANUAL', status: 'NEW', handledById: 2, visitAt: HOUR });
    expect(db.rows[0].userId).toBeNull(); expect(send).not.toHaveBeenCalled();
  });
  it('VIEW-03/SCOPE-02: rechecks current manager instead of trusting stale buildingIds', async () => {
    const { db, service } = setup(); db.buildings[0].managerId = 3;
    await expect(service.create(MANAGER, dto)).rejects.toMatchObject({ status: 403 });
  });
  it('VIEW-03: locked room refuses manual creation', async () => {
    const { db, service } = setup(); db.rooms[0].isActive = false;
    await expect(service.create(BOSS, dto)).rejects.toMatchObject({ status: 409 });
  });
  it('VIEW-03/SCOPE-04: Boss may manually book an active room in a locked building; former manager cannot', async () => {
    const { db, service } = setup(); db.buildings[0].isActive = false; db.buildings[0].managerId = null as any;
    await expect(service.create(MANAGER, dto)).rejects.toMatchObject({ status: 403 });
    expect((await service.create(BOSS, dto)).status).toBe('NEW');
  });
  it('VIEW-16: manual fourth guest fails; same phone another room passes', async () => {
    const { db, service } = setup();
    for (const phone of ['0911111111', '0922222222', '0933333333']) db.add({ guestPhone: phone });
    await service.create(BOSS, { ...dto, roomId: 102 });
    await expect(service.create(BOSS, { ...dto, guestPhone: '0944444444' })).rejects.toMatchObject({ status: 409 });
  });
});
