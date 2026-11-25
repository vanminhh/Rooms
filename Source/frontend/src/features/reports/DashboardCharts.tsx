import { useQuery } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner } from '../../components'
import { todayHanoi } from '../pricing/labels'
import { formatMoney } from '../../shared/formatters'
import { getRevenue, getOccupancy } from './api'
import { LazyReportChart as ReportChart } from './LazyReportChart'

export function DashboardCharts({ scope, buildingId }: { scope: string; buildingId?: number }) {
  const month = todayHanoi().slice(0, 7)
  const revenue = useQuery({ queryKey: ['reports', 'revenue', scope, buildingId, month], queryFn: () => getRevenue(buildingId, month) })
  const occupancy = useQuery({ queryKey: ['reports', 'occupancy', scope, buildingId], queryFn: () => getOccupancy(buildingId) })
  const o = occupancy.data
  const m = revenue.data?.months?.find(row => row.month === month)
  return <section className="dashboard-card"><h3>Lấp đầy và công nợ</h3>
    {(revenue.isPending || occupancy.isPending) && <Spinner label="Đang tải số liệu" />}
    {(revenue.isError || occupancy.isError) && <><FormError>{revenue.error?.message ?? occupancy.error?.message}</FormError>
      <RoomsButton onClick={() => { void revenue.refetch(); void occupancy.refetch() }}>Tải lại số liệu</RoomsButton></>}
    {o && <><p>{o.occupied}/{o.rooms} phòng đang thuê ({o.percent}%)</p>{o.rooms > 0 && <ReportChart kind="ring" title="Lấp đầy hiện tại"
      slices={[{ label: 'Đang thuê', value: o.occupied }, { label: 'Chưa cho thuê', value: o.rooms - o.occupied }]} />}</>}
    {m && revenue.data && <><ReportChart kind="series" title="Đã thu và còn phải thu" category="label" format={formatMoney}
      rows={[{ label: month, collected: m.revenue, outstanding: revenue.data.outstanding }]}
      series={[{ key: 'collected', label: 'Đã thu trong tháng', kind: 'bar' }, { key: 'outstanding', label: 'Còn phải thu hiện tại', kind: 'bar' }]} />
      <p>Đã thu tháng {month}: {formatMoney(m.revenue)} · Còn phải thu hiện tại: {formatMoney(revenue.data.outstanding)}</p></>}
  </section>
}
