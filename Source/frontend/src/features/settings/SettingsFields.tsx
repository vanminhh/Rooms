import { useState } from 'react'
import { TextField } from '../../components'
import { SelectField, TextAreaField } from '../buildings/fields'

export type EmailTemplates = Record<string, Partial<Record<'vi' | 'en', { subject: string; text: string }>>>
const emailKinds = {
  emailCode: ['Xác minh email', 'code'], passwordReset: ['Đặt lại mật khẩu', 'url'],
  viewingNew: ['Lịch xem mới', 'guestName guestPhone guestEmail room building time note'],
  viewingConfirmed: ['Xác nhận lịch xem', 'room building address time contact'],
  invoiceIssued: ['Phát hành hóa đơn', 'code total dueDate qr'], lateReadings: ['Chậm nhập chỉ số', 'count list'],
  invoiceDueTomorrow: ['Sắp đến hạn', 'code total dueDate'], invoiceOverdue: ['Quá hạn', 'code total days'],
  contractExpiringTenant: ['Sắp hết hạn thuê', 'code endDate days'], contractExpiringStaff: ['Hợp đồng sắp hết hạn cho nhân sự', 'count list'],
  invoiceReminder: ['Nhắc thanh toán', 'code total dueDate'], paymentReceived: ['Đã nhận thanh toán', 'code total'],
} as const
type Kind = keyof typeof emailKinds
const staffOnly = new Set<Kind>(['viewingNew', 'lateReadings', 'contractExpiringStaff'])

export function EmailFields({ value, change, error }: { value: EmailTemplates; change(v: EmailTemplates): void; error?: string }) {
  const [kind, setKind] = useState<Kind>('emailCode')
  const [lang, setLang] = useState<'vi' | 'en'>('vi')
  const template = value[kind]?.[lang]
  function update(field: 'subject' | 'text', next: string) {
    change({ ...value, [kind]: { ...value[kind], [lang]: { subject: '', text: '', ...template, [field]: next } } })
  }
  function restore() {
    const translations = { ...value[kind] }
    delete translations[lang]
    const result = { ...value, [kind]: translations }
    if (!Object.keys(translations).length) delete result[kind]
    change(result)
  }
  return <><SelectField label="Loại email" value={kind} onChange={e => {
    const next = e.target.value as Kind; setKind(next); if (staffOnly.has(next)) setLang('vi')
  }}>{Object.entries(emailKinds).map(([key, item]) => <option key={key} value={key}>{item[0]}</option>)}</SelectField>
    <SelectField label="Ngôn ngữ email" value={lang} onChange={e => setLang(e.target.value as 'vi' | 'en')}>
      <option value="vi">Tiếng Việt</option>{!staffOnly.has(kind) && <option value="en">English</option>}</SelectField>
    <p>{template ? 'Đang dùng mẫu tùy chỉnh.' : 'Đang dùng mẫu mặc định.'} Các biến cần có: {emailKinds[kind][1].split(' ').map(k => '{' + k + '}').join(', ')}.</p>
    <TextField label="Tiêu đề email" value={template?.subject ?? ''} required={!!template} onChange={e => update('subject', e.target.value)} />
    <TextAreaField label="Nội dung email" value={template?.text ?? ''} required={!!template} onChange={e => update('text', e.target.value)} error={error} />
    {template && <button type="button" onClick={restore}>Dùng lại mẫu mặc định</button>}</>
}
