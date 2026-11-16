import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../common/errors/validation.js';
import { translateField } from '../../common/i18n/messages.js';
import { BookViewingDto, CreateViewingDto, UpdateViewingDto } from './dto/viewings.dto.js';
import { setupViewings, BOSS, MANAGER, GUEST, HOUR, NOW } from '../../../test/fixtures/viewing-prisma.js';

const warning = 'Khách đã có lịch xem ở tòa khác vào cùng giờ. Bạn có muốn tiếp tục?';
const travel = 'Khách đã có lịch xem ở tòa thuộc quận khác vào cùng giờ. Vui lòng cân nhắc thời gian di chuyển trước khi tiếp tục.';
const warningResponse = (text: string) => ({ status: 409, response: { code: 'VIEWING_OVERLAP_WARNING', fields: { visitAt: text } } });
const book = { roomId: 301, visitAt: HOUR };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe('VIEW-16a owner option B: acknowledge guest overlaps', () => {
  it('VIEW-16a/19: warns before writing or emailing, then saves once on explicit acceptance', async () => {
    const { db, service, send } = setupViewings();
    await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    send.mockClear();
    await expect(service.book(GUEST, book)).rejects.toMatchObject(warningResponse(travel));
    expect(db.rows).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
    const saved = await service.book(GUEST, { ...book, acceptOverlap: true });
    expect(saved.status).toBe('NEW');
    expect(db.rows).toHaveLength(2);
    expect(send).toHaveBeenCalledOnce();
    expect(db.rows[1]).not.toHaveProperty('acceptOverlap');
  });
  it('VIEW-16a/20: same-district warning reveals no manual or other-account details', async () => {
    const { db, service } = setupViewings();
    Object.assign(db.buildings[2], { district: '  CẦU GIẤY ' });
    db.add({ guestPhone: '0900000004', guestName: 'Hidden manual guest', note: 'Hidden note' });
    try {
      await service.book(GUEST, book);
      throw new Error('Expected warning');
    } catch (error: any) {
      expect(error.getResponse()).toEqual({ code: 'VIEWING_OVERLAP_WARNING', fields: { visitAt: warning } });
    }
    expect((await service.listMine(GUEST, {})).data).toEqual([]);
  });
  it('VIEW-03/16a: manual creation can proceed after warning and sends no mail', async () => {
    const { db, service, send } = setupViewings();
    db.add({ userId: GUEST.id, source: 'WEB', guestPhone: '0900000004' });
    const dto = { ...book, guestName: 'Khách nhập tay', guestPhone: '0900000004' };
    await expect(service.create(BOSS, dto)).rejects.toMatchObject(warningResponse(travel));
    const saved = await service.create(BOSS, { ...dto, acceptOverlap: true });
    expect(saved.source).toBe('MANUAL');
    expect(db.rows[1].userId).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it('VIEW-09/16a: reschedule warning preserves the old hour, acceptance updates only the requested row', async () => {
    const { db, service } = setupViewings();
    db.add({ guestPhone: '0900000004' });
    const previous = new Date(Date.parse(HOUR) + 3600_000);
    const moving = db.add({ roomId: 301, guestPhone: '0900000004', visitAt: previous });
    await expect(service.update(BOSS, moving.id, { visitAt: HOUR })).rejects.toMatchObject(warningResponse(travel));
    expect(db.rows[1].visitAt).toEqual(previous);
    await service.update(BOSS, moving.id, { visitAt: HOUR, acceptOverlap: true });
    expect(db.rows[1].visitAt).toEqual(new Date(HOUR));
    expect(db.rows[1]).not.toHaveProperty('acceptOverlap');
  });
  it('VIEW-16a: excluding the edited row, same-building rooms and closed/legacy/different-hour rows does not warn', async () => {
    const { db, service } = setupViewings();
    db.add({ roomId: 301, guestPhone: '0900000004', status: 'CANCELLED' });
    db.add({ roomId: 301, guestPhone: '0900000004', visitAt: null, visitDate: new Date('2026-11-16'), timeSlot: 'MORNING' });
    db.add({ roomId: 301, guestPhone: '0900000004', visitAt: new Date(Date.parse(HOUR) + 3600_000) });
    const first = await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    await service.book(GUEST, { roomId: 102, visitAt: HOUR });
    await expect(service.update(BOSS, first.id, { visitAt: HOUR })).resolves.toMatchObject({ visitAt: HOUR });
  });
  it('VIEW-16: acceptance never bypasses responsible-person exclusivity', async () => {
    const { db, service } = setupViewings();
    db.add({ guestPhone: '0900000004' });
    await expect(service.book(GUEST, { roomId: 201, visitAt: HOUR, acceptOverlap: true })).rejects.toMatchObject({ response: { message: 'VIEWING_TIME_TAKEN' } });
    expect(db.rows).toHaveLength(1);
  });
  it('VIEW-16: the fourth distinct phone stays refused, including a stale accepted retry', async () => {
    const { db, service } = setupViewings();
    db.add({ guestPhone: '0900000004' });
    await expect(service.book(GUEST, book)).rejects.toMatchObject(warningResponse(travel));
    for (const guestPhone of ['0911111111', '0922222222', '0933333333']) db.add({ roomId: 301, guestPhone });
    await expect(service.book(GUEST, { ...book, acceptOverlap: true })).rejects.toMatchObject({ response: { message: 'VIEWING_TIME_TAKEN' } });
    expect(db.rows).toHaveLength(4);
  });
  it('VIEW-02: rejected warnings consume no quota; acceptance checks the current quota again', async () => {
    const { db, service } = setupViewings();
    await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    await expect(service.book(GUEST, book)).rejects.toMatchObject(warningResponse(travel));
    for (let i = 0; i < 2; i++) db.add({ userId: GUEST.id, source: 'WEB', status: 'CANCELLED' });
    await expect(service.book(GUEST, { ...book, acceptOverlap: true })).rejects.toMatchObject({ status: 429 });
    expect(db.rows).toHaveLength(3);
  });
  it('VIEW-02a/08/SCOPE-02: acknowledgement does not bypass duplicate room, past time or staff scope', async () => {
    const { service } = setupViewings();
    await service.book(GUEST, { roomId: 101, visitAt: HOUR });
    await expect(service.book(GUEST, { roomId: 101, visitAt: HOUR, acceptOverlap: true })).rejects.toMatchObject({ status: 409 });
    await expect(service.create(MANAGER, { ...book, guestName: 'Khách', guestPhone: '0900000004', acceptOverlap: true })).rejects.toMatchObject({ status: 403 });
    vi.setSystemTime(new Date(HOUR));
    await expect(service.book(GUEST, { ...book, acceptOverlap: true })).rejects.toMatchObject({ status: 400 });
  });
  it('VIEW-16a/LOC-02: both fixed warning messages have English translations', () => {
    expect(translateField(warning, 'en')).toBe('The guest already has a viewing at another building at this time. Do you want to continue?');
    expect(translateField(travel, 'en')).toBe('The guest already has a viewing in another district at this time. Please consider travel time before continuing.');
  });
});

describe('VIEW-16a strict acknowledgement DTO without HTTP', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory });
  for (const metatype of [BookViewingDto, CreateViewingDto, UpdateViewingDto]) {
    const input = metatype === CreateViewingDto ? { ...book, guestName: 'Khách', guestPhone: '0900000004' } : metatype === UpdateViewingDto ? { visitAt: HOUR } : book;
    it(`${metatype.name}: accepts absent/false/true and rejects coercion or null`, async () => {
      for (const acceptOverlap of [undefined, false, true]) expect(await pipe.transform({ ...input, ...(acceptOverlap === undefined ? {} : { acceptOverlap }) }, { type: 'body', metatype })).toMatchObject(input);
      for (const acceptOverlap of [null, 'true', 'false', 1, 0, [], {}]) await expect(pipe.transform({ ...input, acceptOverlap }, { type: 'body', metatype })).rejects.toMatchObject({ status: 400 });
    });
  }
});
