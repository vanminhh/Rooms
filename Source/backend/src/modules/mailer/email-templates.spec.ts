import { describe, expect, it, vi } from 'vitest';
import { emailTemplate } from './email-templates.js';

const database = (value: unknown = {}) => ({ setting: { findUnique: vi.fn(async () => ({ value })) } });
const viewing = { guestName: 'Nguyễn Văn A', guestPhone: '0912345678', guestEmail: 'guest@example.test', room: 'A101', building: 'Tòa Cầu Giấy', address: 'Hà Nội', time: '16/11/2026 10:00 (Asia/Ho_Chi_Minh)', note: 'Gọi trước', contact: '0987654321\nhttps://zalo.me/0987654321' };

describe('BE-EX-29 / NOTI-08 / LOC-06: email templates', () => {
  for (const lang of ['vi', 'en'] as const) {
    it(`AUTH-13: ${lang} code and five-minute expiry, default when setting is absent`, async () => {
      const db = database();
      const mail = await emailTemplate(db, 'emailCode', lang, { code: '123456' });
      expect(mail.subject).toBe(lang === 'en' ? 'Email verification code - Trọ Thông Minh' : 'Mã xác minh email – Trọ Thông Minh');
      expect(mail.text).toContain('123456');
      expect(mail.text).toContain(lang === 'en' ? '5 minutes' : '5 phút');
      expect(db.setting.findUnique).toHaveBeenCalledWith({ where: { key: 'email_templates' }, select: { value: true } });
    });
    it(`AUTH-07: ${lang} reset URL and thirty-minute expiry`, async () => {
      const mail = await emailTemplate(database(), 'passwordReset', lang, { url: 'https://rooms.example/quen-mat-khau?token=secret' });
      expect(mail.text).toContain('https://rooms.example/quen-mat-khau?token=secret');
      expect(mail.text).toContain(lang === 'en' ? '30 minutes' : '30 phút');
    });
    it(`VIEW-15: ${lang} confirmation has room, building, address, Hanoi time and public contact`, async () => {
      const mail = await emailTemplate(database(), 'viewingConfirmed', lang, viewing);
      expect(mail.subject).toBe(lang === 'en' ? 'Your room viewing is confirmed – Rooms' : 'Xác nhận lịch xem phòng – Rooms');
      for (const key of ['room', 'building', 'address', 'time', 'contact'] as const) expect(mail.text).toContain(viewing[key]);
      expect(mail.text).not.toMatch(/viewingId|userId|roomId|buildingId/);
    });
  }
  it('VIEW-19 / LOC-06: staff booking mail is always Vietnamese with every calling detail', async () => {
    const mail = await emailTemplate(database(), 'viewingNew', 'en', viewing);
    expect(mail.subject).toBe('Lịch xem phòng mới – Rooms');
    for (const key of ['guestName', 'guestPhone', 'guestEmail', 'room', 'building', 'time', 'note'] as const) expect(mail.text).toContain(viewing[key]);
  });
  it('NOTI-07: uses stored language text; interpolates values once as plain text', async () => {
    const db = database({ emailCode: { en: { subject: 'Code {code}', text: 'Use {code}.' } } });
    expect(await emailTemplate(db, 'emailCode', 'en', { code: '{url}' })).toEqual({ subject: 'Code {url}', text: 'Use {url}.' });
  });
  const requiredContent = [
    { kind: 'emailCode', rule: 'AUTH-13', lang: 'en', text: 'Code: {code}', values: { code: '123456' }, keys: ['code'] },
    { kind: 'passwordReset', rule: 'AUTH-07', lang: 'en', text: 'Reset: {url}', values: { url: 'https://rooms.example/quen-mat-khau?token=secret' }, keys: ['url'] },
    { kind: 'viewingNew', rule: 'VIEW-19', lang: 'vi', text: '{guestName}\n{guestPhone}\n{guestEmail}\n{room}\n{building}\n{time}\n{note}', values: viewing, keys: ['guestName', 'guestPhone', 'guestEmail', 'room', 'building', 'time', 'note'] },
    { kind: 'viewingConfirmed', rule: 'VIEW-15', lang: 'en', text: '{room}\n{building}\n{address}\n{time}\n{contact}', values: viewing, keys: ['room', 'building', 'address', 'time', 'contact'] },
  ] as const;
  for (const row of requiredContent) {
    it(`${row.rule}: a complete stored template is used`, async () => {
      const db = database({ [row.kind]: { [row.lang]: { subject: 'Custom', text: row.text } } });
      const mail = await emailTemplate(db, row.kind, row.lang, row.values);
      expect(mail.subject).toBe('Custom');
      for (const key of row.keys) expect(mail.text).toContain((row.values as Record<string, string>)[key]);
    });
    for (const key of row.keys) it(`${row.rule}: missing {${key}} restores the required content from the default`, async () => {
      const db = database({ [row.kind]: { [row.lang]: { subject: 'Custom', text: `Hello ${row.text.replace(`{${key}}`, '')}` } } });
      const mail = await emailTemplate(db, row.kind, row.lang, row.values);
      expect(mail.subject).not.toBe('Custom');
      for (const required of row.keys) expect(mail.text).toContain((row.values as Record<string, string>)[required]);
    });
  }
  for (const value of [null, [], { emailCode: { vi: { subject: 'VI', text: 'VI {code}' } } }, { emailCode: { en: { subject: '', text: 'blank subject' } } }, { emailCode: { en: { subject: 'Bad', text: '{unknown}' } } }]) {
    it('NOTI-07: missing or malformed template/language falls back to the code default', async () => {
      const mail = await emailTemplate(database(value), 'emailCode', 'en', { code: '654321' });
      expect(mail.subject).toBe('Email verification code - Trọ Thông Minh');
      expect(mail.text).toContain('654321');
    });
  }
});
