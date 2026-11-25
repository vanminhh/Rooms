import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ConfirmDialog, FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { TextAreaField } from '../../features/buildings/fields'
import { useContractAction } from '../../features/contracts/actions'
import { EmailFields, type EmailTemplates } from '../../features/settings/SettingsFields'
import { apiRequest, ApiError } from '../../shared/api'
import '../../features/contracts/contracts.css'

const names = { bank_account: 'Tài khoản ngân hàng', default_contact: 'Liên hệ mặc định', contract_template: 'Mẫu hợp đồng', email_templates: 'Mẫu email' }
type Key = keyof typeof names
type Fields = Record<string, string | null>
interface Settings {
  bank_account: Fields | null
  default_contact: Fields | null
  contract_template: { content: string; isDraft: boolean }
  email_templates: EmailTemplates
  webhook: { provider: string; enabled: boolean }
}
const fieldNames = {
  bank_account: { bankBin: 'Mã BIN ngân hàng', bankName: 'Tên ngân hàng', accountNo: 'Số tài khoản', accountName: 'Chủ tài khoản' },
  default_contact: { phone: 'Điện thoại', zaloUrl: 'Zalo', facebookUrl: 'Facebook' },
}

function Editor({ kind, data, scope }: { kind: Key; data: Settings; scope: string }) {
  const [fields, setFields] = useState<Fields>(() => kind === 'bank_account' || kind === 'default_contact' ? data[kind] ?? {} : {})
  const [content, setContent] = useState(data.contract_template.content)
  const [emails, setEmails] = useState(data.email_templates)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmation, setConfirmation] = useState<object | null>(null)
  const [saved, setSaved] = useState(false)
  const action = useContractAction()
  const client = useQueryClient()
  function preview(e: FormEvent) {
    e.preventDefault()
    setSaved(false); action.setError('')
    const invalid: Record<string, string> = {}
    let value: object
    if (kind === 'bank_account' || kind === 'default_contact') {
      const trimmed = Object.fromEntries(Object.keys(fieldNames[kind]).map(key => [key, fields[key]?.trim() || null]))
      if (kind === 'bank_account') {
        if (!/^\d{6}$/.test(trimmed.bankBin ?? '')) invalid.bankBin = 'Nhập mã BIN gồm 6 chữ số.'
        if (!/^[a-zA-Z0-9]{1,30}$/.test(trimmed.accountNo ?? '')) invalid.accountNo = 'Nhập từ 1 đến 30 chữ hoặc số.'
        if (!trimmed.bankName) invalid.bankName = 'Nhập tên ngân hàng.'
        if (!trimmed.accountName) invalid.accountName = 'Nhập tên chủ tài khoản.'
      } else {
        if (trimmed.phone && !/^0\d{9}$/.test(trimmed.phone)) invalid.phone = 'Nhập số điện thoại gồm 10 chữ số, bắt đầu bằng 0.'
        for (const key of ['zaloUrl', 'facebookUrl']) if (trimmed[key]) {
          if (!URL.canParse(trimmed[key]) || !['http:', 'https:'].includes(new URL(trimmed[key]).protocol)) invalid[key] = 'Nhập liên kết http hoặc https hợp lệ.'
        }
      }
      value = trimmed
    } else if (kind === 'contract_template') {
      if (!content.trim()) invalid.content = 'Nhập nội dung mẫu hợp đồng.'
      value = { content, isDraft: true }
    } else value = emails
    setErrors(invalid)
    if (!Object.keys(invalid).length) setConfirmation(value)
  }
  async function save() {
    if (!confirmation) return
    const ok = await action.run(async () => {
      await apiRequest('/settings', { method: 'PATCH', body: { key: kind, value: confirmation } })
      await Promise.all([client.invalidateQueries({ queryKey: ['settings', scope] }), client.invalidateQueries({ queryKey: ['audit-logs'] }),
        ...(kind === 'default_contact' ? [client.invalidateQueries({ queryKey: ['public', 'contact'] })] : [])])
    }, error => {
      if (error instanceof ApiError && error.fields) {
        setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, message]) => [key.replace(/^value\./, ''), message])))
      }
      return error instanceof Error ? error.message : 'Không thể lưu cài đặt.'
    })
    setConfirmation(null); setSaved(ok)
  }
  return <section><h2>{names[kind]}</h2><form className="contracts-form" onSubmit={preview} onChange={() => setSaved(false)}>
    {(kind === 'bank_account' || kind === 'default_contact') && Object.entries(fieldNames[kind]).map(([key, label]) =>
      <TextField key={key} name={key} label={label} value={fields[key] ?? ''} onChange={e => setFields({ ...fields, [key]: e.target.value })} error={errors[key]} />)}
    {kind === 'contract_template' && <><p>{data.contract_template.isDraft ? 'BẢN NHÁP - chưa dùng để ký' : 'Bản chỉnh sửa sẽ được lưu thành bản nháp.'}</p>
      <TextAreaField label="Nội dung mẫu hợp đồng" rows={10} value={content} onChange={e => setContent(e.target.value)} error={errors.content ?? errors.value} /></>}
    {kind === 'email_templates' && <EmailFields value={emails} change={setEmails} error={errors.value} />}
    <RoomsButton type="submit" disabled={action.pending}>Lưu {names[kind].toLocaleLowerCase('vi')}</RoomsButton>
    {saved && <p role="status">Đã lưu.</p>}
    {action.error && <FormError>{action.error}</FormError>}
  </form><ConfirmDialog open={!!confirmation} title={'Lưu ' + names[kind].toLocaleLowerCase('vi') + '?'} description="Áp dụng thay đổi cho toàn hệ thống."
    confirmLabel="Xác nhận lưu" pending={action.pending} onClose={() => { if (!action.pending) setConfirmation(null) }} onConfirm={() => void save()} /></section>
}
export function SettingsPage() {
  const { user } = useAuth()
  const scope = authScopeKey(user)
  const q = useQuery({ queryKey: ['settings', scope], queryFn: () => apiRequest<Settings>('/settings') })
  return <><SectionHeading>Cài đặt</SectionHeading>
    {q.isPending && <Spinner block label="Đang tải cài đặt" />}
    {q.isError && <><FormError>{q.error.message}</FormError><RoomsButton onClick={() => void q.refetch()}>Thử lại</RoomsButton></>}
    {q.data && <><section><h2>Webhook {q.data.webhook.provider}</h2><p>{q.data.webhook.enabled ? 'Đang bật' : 'Đang tắt'}</p>
      <p>Để tắt webhook, quản trị viên xóa giá trị BANK_WEBHOOK_SECRET trên máy chủ rồi khởi động lại backend.</p></section>
      {(Object.keys(names) as Key[]).map(kind => <Editor key={scope + kind} kind={kind} data={q.data!} scope={scope} />)}</>}
  </>
}
