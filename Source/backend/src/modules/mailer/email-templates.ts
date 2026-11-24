import type { Lang } from '../../common/i18n/locale.js';
import { MAILS } from '../../common/i18n/mails.js';
import type { Mail } from './mailer.service.js';

type Text = Pick<Mail, 'subject' | 'text'>;
type Kind = 'emailCode' | 'passwordReset' | 'viewingNew' | 'viewingConfirmed' | 'invoiceIssued'
  | 'lateReadings' | 'invoiceDueTomorrow' | 'invoiceOverdue' | 'contractExpiringTenant' | 'contractExpiringStaff'
  | 'invoiceReminder' | 'paymentReceived';
interface TemplateReader {
  setting: { findUnique(args: { where: { key: string }; select: { value: true } }): Promise<{ value: unknown } | null> };
}
const defaults: Record<Kind, Partial<Record<Lang, Text>>> = {
  invoiceIssued: {
    vi: { subject: 'Hóa đơn {code} đã phát hành', text: 'Số tiền {total}. Hạn thanh toán {dueDate}.\nVietQR: {qr}' },
    en: { subject: 'Invoice {code} issued', text: 'Amount: {total}. Due date: {dueDate}.\nVietQR: {qr}' },
  },
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
  // NOTI-10, NOTI-05 (Phase 4).
  lateReadings: { vi: {
    subject: 'Còn {count} hóa đơn tháng chờ chỉ số – Trọ Thông Minh',
    text: 'Ngày {date}, còn {count} hóa đơn tháng đã qua ngày thu mà chưa có chỉ số:\n\n{list}\n\nQuản lý nhập chỉ số ở trang "Chốt chỉ số".',
  } },
  invoiceDueTomorrow: {
    vi: { subject: 'Hóa đơn {code} đến hạn ngày mai – Trọ Thông Minh', text: 'Hóa đơn {code} phòng {room}: {total}.\nHạn thanh toán: {dueDate}.' },
    en: { subject: 'Invoice {code} is due tomorrow – Trọ Thông Minh', text: 'Invoice {code} for room {room}: {total}.\nDue date: {dueDate}.' },
  },
  invoiceOverdue: {
    vi: { subject: 'Hóa đơn {code} đã quá hạn {days} ngày – Trọ Thông Minh', text: 'Hóa đơn {code} phòng {room}: {total}.\nHạn thanh toán {dueDate}, đã quá {days} ngày.' },
    en: { subject: 'Invoice {code}: {days} day(s) overdue – Trọ Thông Minh', text: 'Invoice {code} for room {room}: {total}.\nDue date {dueDate}, now {days} day(s) overdue.' },
  },
  contractExpiringTenant: {
    vi: { subject: 'Hợp đồng {code} hết hạn ngày {endDate} – Trọ Thông Minh', text: 'Hợp đồng {code} phòng {room} hết hạn ngày {endDate} (còn {days} ngày).\nLiên hệ quản lý nếu bạn muốn gia hạn.' },
    en: { subject: 'Contract {code} ends on {endDate} – Trọ Thông Minh', text: 'Contract {code} for room {room} ends on {endDate} ({days} days left).\nContact the manager if you want to renew.' },
  },
  contractExpiringStaff: { vi: {
    subject: 'Có {count} hợp đồng sắp hết hạn – Trọ Thông Minh',
    text: 'Các hợp đồng tới mốc nhắc ngày {date}:\n\n{list}',
  } },
  // Q-P4-7 "Nhắc thanh toán" and BIL-11 "Đã nhận tiền" (P4-4).
  invoiceReminder: {
    vi: { subject: 'Nhắc thanh toán hóa đơn {code} – Trọ Thông Minh', text: 'Hóa đơn {code} phòng {room}: {total}.\nHạn thanh toán: {dueDate}.\nMã VietQR: {qr}' },
    en: { subject: 'Payment reminder for invoice {code} – Trọ Thông Minh', text: 'Invoice {code} for room {room}: {total}.\nDue date: {dueDate}.\nVietQR: {qr}' },
  },
  paymentReceived: {
    vi: { subject: 'Đã nhận {total} cho hóa đơn {code} – Trọ Thông Minh', text: 'Trọ Thông Minh đã nhận {total} cho hóa đơn {code} phòng {room}. Cảm ơn bạn.' },
    en: { subject: 'Received {total} for invoice {code} – Trọ Thông Minh', text: 'Trọ Thông Minh received {total} for invoice {code}, room {room}. Thank you.' },
  },
};
// LOC-06: mails to staff are always Vietnamese.
const STAFF_ONLY: ReadonlySet<Kind> = new Set(['viewingNew', 'lateReadings', 'contractExpiringStaff']);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const placeholders = /\{([a-zA-Z]+)\}/g;
// AUTH-07/13, VIEW-15/19: custom wording must still carry every required value.
const requiredPlaceholders: Record<Kind, readonly string[]> = {
  invoiceIssued: ['code', 'total', 'dueDate', 'qr'],
  emailCode: ['code'],
  passwordReset: ['url'],
  viewingNew: ['guestName', 'guestPhone', 'guestEmail', 'room', 'building', 'time', 'note'],
  viewingConfirmed: ['room', 'building', 'address', 'time', 'contact'],
  lateReadings: ['count', 'list'],
  invoiceDueTomorrow: ['code', 'total', 'dueDate'],
  invoiceOverdue: ['code', 'total', 'days'],
  contractExpiringTenant: ['code', 'endDate', 'days'],
  contractExpiringStaff: ['count', 'list'],
  invoiceReminder: ['code', 'total', 'dueDate'],
  paymentReceived: ['code', 'total'],
};

export function validEmailTemplates(value: unknown): boolean {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!record(value)) return false;
  return Object.entries(value).every(([name, translations]) => {
    if (!Object.hasOwn(defaults, name) || !record(translations)) return false;
    const kind = name as Kind;
    return Object.entries(translations).every(([lang, template]) => {
      if ((lang !== 'vi' && lang !== 'en') || !Object.hasOwn(defaults[kind], lang) || !record(template)) return false;
      if (Object.keys(template).some(k => k !== 'subject' && k !== 'text')) return false;
      const { subject, text } = template;
      if (typeof subject !== 'string' || !subject.trim() || typeof text !== 'string' || !text.trim()) return false;
      const source = defaults[kind][lang]!;
      const allowed = new Set([...(`${source.subject}\n${source.text}`).matchAll(placeholders)].map(m => m[1]));
      const content = subject + '\n' + text;
      const keys = [...content.matchAll(placeholders)].map(m => m[1]);
      return !/[{}]/.test(content.replace(placeholders, '')) && keys.every(k => allowed.has(k))
        && requiredPlaceholders[kind].every(k => keys.includes(k));
    });
  });
}

// NOTI-07/08: read only settings.email_templates; missing entries use the recipient's language defaults.
export async function emailTemplate(db: TemplateReader, kind: Kind, lang: Lang, values: Record<string, string>): Promise<Text> {
  const locale = STAFF_ONLY.has(kind) ? 'vi' : lang;
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
