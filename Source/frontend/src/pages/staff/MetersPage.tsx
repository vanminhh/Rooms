import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, StatusBadge, TextField } from '../../components'
import { buildingIdQuery } from '../../features/buildings/api'
import { useBuildingSelection, type BuildingSelection } from '../../features/buildings/building-selection'
import { useContractAction } from '../../features/contracts/actions'
import type { MeterKind } from '../../features/invoices/types'
import { listDueReadings, recordReadings, uploadMeterPhoto, type DueReading, type ReadingInput } from '../../features/meters/api'
import { todayHanoi } from '../../features/pricing/labels'
import { formatDate } from '../../shared/formatters'
import '../../features/meters/meters.css'

const KINDS: { kind: MeterKind; label: string }[] = [{ kind: 'ELECTRIC', label: 'Chỉ số điện (kWh)' }, { kind: 'WATER', label: 'Chỉ số nước (m³)' }]
// MTR-11: per-item error codes of the batch; the wording follows the BE error table.
const ITEM_ERRORS: Record<string, string> = {
  METER_VALUE_DECREASED: 'Chỉ số mới nhỏ hơn chỉ số trước',
  CONFLICT_STATE: 'Không lưu được: chỉ số này đã có hoặc hóa đơn vừa thay đổi',
  VALIDATION_FAILED: 'Giá trị hoặc ảnh không hợp lệ',
  OUT_OF_SCOPE: 'Phòng không thuộc tòa bạn quản lý',
  NOT_FOUND: 'Không tìm thấy phòng',
}
type Key = `${number}:${MeterKind}`
const keyOf = (invoiceId: number, kind: MeterKind): Key => `${invoiceId}:${kind}`

function ReadingCard({ row, values, photos, errors, uploading, onValue, onPhoto }: {
  row: DueReading; values: Partial<Record<Key, string>>; photos: Partial<Record<Key, string>>; errors: Partial<Record<Key, string>>; uploading: Key | null
  onValue(key: Key, value: string): void; onPhoto(key: Key, roomId: number, file: File | undefined): void
}) {
  return <ElevatedCard className={`meters-card${row.overdue ? ' meters-card--late' : ''}`}>
    <div className="meters-card-head">
      <h3>Phòng {row.room.code} · {row.building.name}</h3>
      {row.overdue && <StatusBadge tone="reserved">Quá ngày chốt</StatusBadge>}
    </div>
    <p>{row.tenant.fullName} · kỳ {formatDate(row.periodStart)}–{formatDate(row.periodEnd)}</p>
    {row.reviewRequired && <p className="meters-warning">Tiêu thụ bất thường, hãy kiểm tra lại chỉ số trước khi phát hành.</p>}
    {KINDS.map(({ kind, label }) => {
      const key = keyOf(row.invoiceId, kind)
      const previous = row.previousReadings[kind]
      return <div key={kind} className="meters-field">
        <TextField label={label} name={key} type="number" inputMode="numeric" min="0" step="1" value={values[key] ?? ''} error={errors[key]}
          onChange={event => onValue(key, event.target.value)} />
        <p className="meters-hint">{previous ? `Mốc trước: ${previous.value} (${formatDate(previous.readOn)})` : 'Chưa có mốc'}
          {kind === 'WATER' && row.building.waterMode === 'PER_PERSON' && ' · Nước không tính tiền ở tòa này'}</p>
        <label className="meters-photo">Ảnh đồng hồ (không bắt buộc)
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading !== null} onChange={event => onPhoto(key, row.room.id, event.target.files?.[0])} />
        </label>
        {uploading === key && <Spinner label="Đang tải ảnh" />}
        {photos[key] && <p className="meters-hint">Đã đính kèm ảnh</p>}
      </div>
    })}
  </ElevatedCard>
}

function MetersList({ selection, scope }: { selection: BuildingSelection; scope: string }) {
  const client = useQueryClient()
  const action = useContractAction()
  const [values, setValues] = useState<Partial<Record<Key, string>>>({})
  const [photos, setPhotos] = useState<Partial<Record<Key, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [uploading, setUploading] = useState<Key | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [summary, setSummary] = useState('')
  const query = useQuery({ queryKey: ['meter-readings', 'due', scope, selection], queryFn: () => listDueReadings(buildingIdQuery(selection)) })
  const rows = query.data ?? []
  const readOn = todayHanoi()
  const items: (ReadingInput & { key: Key })[] = rows.flatMap(row => KINDS.flatMap(({ kind }) => {
    const key = keyOf(row.invoiceId, kind)
    const raw = values[key]?.trim()
    return raw ? [{ key, roomId: row.room.id, invoiceId: row.invoiceId, kind, value: Number(raw), readOn, ...(photos[key] ? { photoUrl: photos[key] } : {}) }] : []
  }))

  async function attach(key: Key, roomId: number, file: File | undefined) {
    if (!file) return
    setUploading(key)
    try { const url = await uploadMeterPhoto(roomId, file); setPhotos(current => ({ ...current, [key]: url })); setErrors(current => ({ ...current, [key]: undefined })) }
    catch (cause) { setErrors(current => ({ ...current, [key]: cause instanceof Error ? cause.message : 'Tải ảnh lên không thành công' })) }
    finally { setUploading(null) }
  }

  async function save() {
    const sent = items
    await action.run(async () => {
      const results = await recordReadings(sent.map(item => ({ roomId: item.roomId, invoiceId: item.invoiceId, kind: item.kind, value: item.value, readOn: item.readOn, photoUrl: item.photoUrl })))
      const failed: Partial<Record<Key, string>> = {}
      const done = new Set<Key>()
      for (const result of results) {
        const key = sent[result.index].key
        if (result.ok) done.add(key); else failed[key] = ITEM_ERRORS[result.error] ?? 'Không lưu được chỉ số này'
      }
      // Q-P4-55: saved lines leave the list; failed lines keep what was typed and show the error under the field.
      setValues(current => Object.fromEntries(Object.entries(current).filter(([key]) => !done.has(key as Key))))
      setPhotos(current => Object.fromEntries(Object.entries(current).filter(([key]) => !done.has(key as Key))))
      setErrors(failed)
      setSummary(`${done.size} chỉ số đã lưu${Object.keys(failed).length ? `, ${Object.keys(failed).length} chỉ số lỗi` : ''}.`)
      setConfirm(false)
      await Promise.all(['meter-readings', 'invoices', 'dashboard', 'notifications'].map(key => client.invalidateQueries({ queryKey: [key] })))
    })
    setConfirm(false)
  }

  if (query.isPending) return <Spinner block label="Đang tải danh sách chốt chỉ số" />
  if (query.isError) return <div className="meters-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>Thử lại</RoomsButton></div>
  return <>
    {summary && <p role="status" className="meters-summary">{summary}</p>}
    {rows.length === 0
      ? <ElevatedCard><p>Chưa có phòng nào chờ chốt chỉ số.</p><Link to="/ql/hoa-don">Xem hóa đơn</Link></ElevatedCard>
      : <div className="meters-list">{rows.map(row => <ReadingCard key={row.invoiceId} row={row} values={values} photos={photos} errors={errors} uploading={uploading}
          onValue={(key, value) => setValues(current => ({ ...current, [key]: value }))} onPhoto={(key, roomId, file) => void attach(key, roomId, file)} />)}</div>}
    {rows.length > 0 && <div className="meters-savebar">
      {action.error && <FormError>{action.error}</FormError>}
      <RoomsButton type="button" disabled={items.length === 0 || action.pending || uploading !== null} onClick={() => setConfirm(true)}>
        {action.pending ? 'Đang lưu' : `Lưu chỉ số (${items.length})`}</RoomsButton>
    </div>}
    <ConfirmDialog open={confirm} title="Lưu chỉ số đã nhập?" confirmLabel="Lưu chỉ số" pending={action.pending}
      description={<p>Sẽ lưu {items.length} chỉ số, ngày đọc {formatDate(readOn)}. Phòng đủ chỉ số sẽ được phát hành hóa đơn và gửi cho người thuê ngay.</p>}
      onClose={() => { if (!action.pending) setConfirm(false) }} onConfirm={() => void save()} />
  </>
}

// MTR-09..11, D-42, UI-07 (360 px first), Q-P4-55, Q-P4-58, Q-P4-60.
export function MetersPage() {
  const { selectedBuildingId } = useBuildingSelection()
  const { user } = useAuth()
  const scope = authScopeKey(user)
  return <>
    <SectionHeading description="Nhập chỉ số cuối kỳ cho các phòng đang chờ. Phòng quá ngày chốt hiện màu đỏ.">Chốt chỉ số</SectionHeading>
    <MetersList key={`${scope}:${selectedBuildingId}`} selection={selectedBuildingId} scope={scope} />
  </>
}
