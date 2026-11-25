import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { buildingIdQuery } from '../../features/buildings/api'
import { getRevenue, getOccupancy, type Revenue } from '../../features/reports/api'
import { OverdueList } from '../../features/reports/OverdueList'
import { LazyReportChart as ReportChart } from '../../features/reports/LazyReportChart'
import { todayHanoi } from '../../features/pricing/labels'
import { formatMoney } from '../../shared/formatters'
import '../../features/contracts/contracts.css'

function Balances({ data }: { data: Revenue }) {
  return <dl className="contracts-facts">{([
    ['Còn phải thu', data.outstanding], ['Trong đó quá hạn', data.overdue], ['Tiền cọc đang giữ', data.depositsHeld],
  ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>)}</dl>
}

export function ReportsPage() {
  const { user } = useAuth()
  const scope = authScopeKey(user)
  const buildingId = buildingIdQuery(useBuildingSelection().selectedBuildingId)
  const [month, setMonth] = useState(() => todayHanoi().slice(0, 7))
  const revenue = useQuery({ queryKey: ['reports', 'revenue', scope, buildingId, month], queryFn: () => getRevenue(buildingId, month) })
  const occupancy = useQuery({ queryKey: ['reports', 'occupancy', scope, buildingId], queryFn: () => getOccupancy(buildingId) })
  const selected = revenue.data?.months.find(item => item.month === month)
  return <><SectionHeading>Báo cáo</SectionHeading>
    <TextField label="Tháng báo cáo" type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }} />
    {(revenue.isPending || occupancy.isPending) && <Spinner block label="Đang tải báo cáo" />}
    {(revenue.isError || occupancy.isError) && <><FormError>{revenue.error?.message ?? occupancy.error?.message}</FormError>
      <RoomsButton onClick={() => { void revenue.refetch(); void occupancy.refetch() }}>Thử lại</RoomsButton></>}
    {occupancy.data && <p>Lấp đầy hiện tại: {occupancy.data.occupied}/{occupancy.data.rooms} phòng ({occupancy.data.percent}%)</p>}
    {!!occupancy.data?.rooms && <ReportChart kind="ring" title="Tỷ lệ lấp đầy" slices={[
      { label: 'Đang thuê', value: occupancy.data.occupied },
      { label: 'Chưa cho thuê', value: occupancy.data.rooms - occupancy.data.occupied },
    ]} />}
    {revenue.data && <><h2>Doanh thu và lợi nhuận</h2>
      {selected && <p>Đã thu tháng {month}: {formatMoney(selected.revenue)}</p>}
      <ReportChart kind="series" title={`Doanh thu và lợi nhuận đến ${month} (đồng)`} category="month" rows={revenue.data.months}
        series={[{ key: 'revenue', label: 'Doanh thu', kind: 'bar' }, { key: 'profit', label: 'Lợi nhuận', kind: 'line' }]} format={formatMoney} />
      <div style={{ overflowX: 'auto' }}><table><caption>12 tháng đến {month}</caption>
        <thead><tr>{['Tháng', 'Doanh thu', 'Chi phí', 'Lợi nhuận'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{revenue.data.months.map(r => <tr key={r.month}><th scope="row">{r.month}</th>
          <td>{formatMoney(r.revenue)}</td><td>{formatMoney(r.costs)}</td><td>{formatMoney(r.profit)}</td></tr>)}</tbody></table></div>
      <h2>Công nợ và tiền cọc hiện tại</h2><Balances data={revenue.data} />
      {user?.role === 'BOSS' && <section><h2>So sánh theo tòa</h2>{revenue.data.comparison?.map(b => {
        const m = b.months.find(item => item.month === month)
        const o = occupancy.data?.comparison?.find(item => item.buildingId === b.buildingId)
        return <article key={b.buildingId}><h3>{b.name}</h3>{m && <p>Doanh thu {formatMoney(m.revenue)} · Lợi nhuận {formatMoney(m.profit)}</p>}
          {o && <p>Lấp đầy: {o.occupied}/{o.rooms} phòng ({o.percent}%)</p>}<Balances data={b} /></article>
      })}</section>}
    </>}
    {user?.role === 'BOSS' && <OverdueList key={scope + ':' + buildingId + ':' + month} scope={scope} buildingId={buildingId} month={month} />}
  </>
}
