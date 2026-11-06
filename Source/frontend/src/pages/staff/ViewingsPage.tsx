import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import type { BuildingSelection } from '../../features/buildings/building-selection'
import { SelectField } from '../../features/buildings/fields'
import { plusDays, todayHanoi } from '../../features/pricing/labels'
import { listViewings } from '../../features/viewings/api'
import type { ViewingView } from '../../features/viewings/api'
import { ViewingCard } from '../../features/viewings/ViewingCard'
import { ViewingForm } from '../../features/viewings/ViewingForm'
import { formatDate } from '../../shared/formatters'
import { viewingStatusLabels } from '../../shared/status-labels'
import type { ViewingStatus } from '../../shared/status-labels'
import '../../features/viewings/viewings.css'

// shortcut: one page of 100 (the BE maximum) and no pager; add pagination when a date range holds more than 100 viewings.
const LIST_LIMIT = 100

// The BE sorts by visit date then slot (VIEW-03), so grouping by first appearance keeps that order.
function groupByDate(rows: ViewingView[]): [string, ViewingView[]][] {
  const days = new Map<string, ViewingView[]>()
  for (const row of rows) days.set(row.visitDate, [...(days.get(row.visitDate) ?? []), row])
  return [...days]
}

// The list runs only for a valid range, so a bad "Từ ngày" never sends a request (Q-FE8B-5).
function ViewingList({ selection, status, from, to }: { selection: BuildingSelection; status: ViewingStatus | ''; from: string; to: string }) {
  const query = useQuery({
    queryKey: ['viewings', 'list', selection, status, from, to],
    queryFn: () => listViewings({ buildingId: selection, status: status || undefined, from, to, limit: LIST_LIMIT }),
  })

  if (query.isPending) return <Spinner block label="Đang xử lý" />
  if (query.isError) return <div className="viewings-state">
    <FormError>{query.error.message}</FormError>
    <RoomsButton variant="sand" onClick={() => void query.refetch()}>Thử lại</RoomsButton>
  </div>
  if (query.data.data.length === 0) return <p className="rooms-empty">Chưa có lịch hẹn nào trong khoảng ngày này</p>
  return <div className="viewings-days">
    {groupByDate(query.data.data).map(([date, rows]) => <section key={date} className="viewings-day" aria-label={formatDate(date)}>
      <h3>{formatDate(date)}</h3>
      <div className="viewings-cards">{rows.map(viewing => <ViewingCard key={viewing.id} viewing={viewing} />)}</div>
    </section>)}
  </div>
}

// Staff viewings (VIEW-03, VIEW-04, VIEW-09): by date range (default today to +30 days), by status, add by hand.
export function ViewingsPage() {
  const { selectedBuildingId } = useBuildingSelection()
  const [from, setFrom] = useState(todayHanoi)
  const [to, setTo] = useState(() => plusDays(todayHanoi(), 30))
  const [status, setStatus] = useState<ViewingStatus | ''>('')
  const [creating, setCreating] = useState(false)
  // A manually added viewing belongs to one building, so "Tất cả tòa" or no pick disables the button.
  const canCreate = typeof selectedBuildingId === 'number'
  const rangeOpen = from !== '' && to !== ''
  const fromError = rangeOpen && from > to ? 'Từ ngày phải trước hoặc bằng Đến ngày' : undefined

  return <>
    <SectionHeading description="Khách gọi điện hoặc nhắn tin thì thêm ở đây.">Lịch hẹn</SectionHeading>
    <div className="viewings-toolbar">
      <TextField label="Từ ngày" type="date" value={from} error={fromError} onChange={event => setFrom(event.target.value)} />
      <TextField label="Đến ngày" type="date" value={to} onChange={event => setTo(event.target.value)} />
      <SelectField label="Trạng thái" value={status} onChange={event => setStatus(event.target.value as ViewingStatus | '')}>
        <option value="">Tất cả trạng thái</option>
        {(Object.keys(viewingStatusLabels) as ViewingStatus[]).map(value => <option key={value} value={value}>{viewingStatusLabels[value]}</option>)}
      </SelectField>
      <RoomsButton disabled={!canCreate || creating} onClick={() => setCreating(true)}>Thêm lịch hẹn</RoomsButton>
    </div>
    {!canCreate && <p className="viewings-hint">Chọn một tòa ở thanh chọn tòa để thêm lịch hẹn.</p>}
    {creating && typeof selectedBuildingId === 'number' && <ViewingForm key={selectedBuildingId} buildingId={selectedBuildingId} onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />}
    {rangeOpen && !fromError && <ViewingList selection={selectedBuildingId} status={status} from={from} to={to} />}
  </>
}
