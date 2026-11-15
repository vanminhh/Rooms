import type { Lang } from '../../common/i18n/locale.js';
import { MAILS } from '../../common/i18n/mails.js';
import type { Mail } from './mailer.service.js';

type Text = Pick<Mail, 'subject' | 'text'>;
type Kind = 'emailCode' | 'passwordReset' | 'viewingNew' | 'viewingConfirmed';
interface TemplateReader {
  setting: { findUnique(args: { where: { key: string }; select: { value: true } }): Promise<{ value: unknown } | null> };
}
const defaults: Record<Kind, Partial<Record<Lang, Text>>> = {
  emailCode: { vi: MAILS.verifyCode('vi', '{code}'), en: MAILS.verifyCode('en', '{code}') },
  passwordReset: { vi: MAILS.resetLink('vi', '{url}'), en: MAILS.resetLink('en', '{url}') },
  viewingNew: { vi: {
    subject: 'Lịch xem phòng mới – Rooms',
    text: 'Khách: {guestName}\nĐiện thoại: {guestPhone}\nEmail: {guestEmail}\nPhòng: {room}\nTòa: {building}\nĐịa chỉ: {address}\n{time}\nGhi chú: {note}',
  } },
  viewingConfirmed: {
    vi: { subject: 'Xác nhận lịch xem phòng – Rooms', text: 'Lịch xem phòng của bạn đã được xác nhận.\n{room} – {building}\n{address}\n{time}\nLiên hệ: {contact}' },
    en: { subject: 'Your room viewing is confirmed – Rooms', text: 'Your viewing is confirmed.\n{room} – {building}\n{address}\n{time}\nContact: {contact}' },
  },
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const placeholders = /\{([a-zA-Z]+)\}/g;
// AUTH-07/13, VIEW-15/19: custom wording must still carry every required value.
const requiredPlaceholders: Record<Kind, readonly string[]> = {
  emailCode: ['code'],
  passwordReset: ['url'],
  viewingNew: ['guestName', 'guestPhone', 'guestEmail', 'room', 'building', 'time', 'note'],
  viewingConfirmed: ['room', 'building', 'address', 'time', 'contact'],
};

// NOTI-07/08: read only settings.email_templates; missing entries use the recipient's language defaults.
export async function emailTemplate(db: TemplateReader, kind: Kind, lang: Lang, values: Record<string, string>): Promise<Text> {
  const locale = kind === 'viewingNew' ? 'vi' : lang;
  const row = await db.setting.findUnique({ where: { key: 'email_templates' }, select: { value: true } });
  const stored = object(object(object(row?.value)[kind])[locale]);
  const content = typeof stored.subject === 'string' && typeof stored.text === 'string' ? `${stored.subject}\n${stored.text}` : '';
  const keys = [...content.matchAll(placeholders)].map(match => match[1]);
  const valid = typeof stored.subject === 'string' && stored.subject.trim() && typeof stored.text === 'string' && stored.text.trim()
    && keys.every(key => Object.hasOwn(values, key))
    && requiredPlaceholders[kind].every(key => keys.includes(key));
  const template = valid ? stored as Text : defaults[kind][locale]!;
  const fill = (text: string) => text.replace(placeholders, (_match, key: string) => values[key] ?? '');
  return { subject: fill(template.subject).replace(/[\r\n]+/g, ' '), text: fill(template.text) };
}
