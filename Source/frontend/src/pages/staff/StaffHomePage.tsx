import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useAuth } from '../../app/auth-context'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { getDashboard } from '../../features/dashboard/api'
import type { DashboardView } from '../../features/dashboard/api'
import { viewingTime } from '../../features/viewings/time'
import '../../features/dashboard/dashboard.css'

// NOTI-06 / VIEW-07: every NEW viewing counts (Q-P6-2); the list shows at most 5 of them.
function NewViewingsCard({ data }: { data: DashboardView['newViewings'] }) {
  return <section className="dashboard-card">
    <h3>Lịch hẹn mới</h3>
    {data.count === 0
      ? <p className="rooms-empty">Chưa có việc nào hôm nay</p>
      : <>
        <p>{data.count} lịch hẹn mới</p>
        <ul>{data.items.map(item => <li key={item.id}>{item.guestName} · {item.roomCode} · {viewingTime(item, 'vi')}{item.overdue ? ' · Quá giờ, chưa xác nhận' : ''}{item.overlap ? ' · Trùng giờ' : ''}</li>)}</ul>
      </>}
    <Link to="/ql/lich-hen">Xem tất cả lịch hẹn</Link>
  </section>
}

function PendingPricesCard({ data }: { data: NonNullable<DashboardView['pendingPrices']> }) {
  return <section className="dashboard-card">
    <h3>Giá chờ duyệt</h3>
    <p>{data.count} đề xuất chờ duyệt ({data.rooms} giá phòng, {data.ratePlans} đơn giá)</p>
    <Link to="/ql/duyet-gia">Sang trang duyệt giá</Link>
  </section>
}

export function StaffHomePage() {
  const { user } = useAuth()
  const { selectedBuildingId } = useBuildingSelection()
  const dashboard = useQuery({
    queryKey: ['dashboard', selectedBuildingId],
    queryFn: () => getDashboard(selectedBuildingId),
  })

  return <>
    <SectionHeading>Việc hôm nay</SectionHeading>
    {user && <p>Xin chào, {user.fullName}</p>}
    {dashboard.isPending
      ? <Spinner block label="Đang xử lý" />
      : dashboard.isError
        ? <div className="dashboard-state">
          <FormError>{dashboard.error.message}</FormError>
          <RoomsButton variant="sand" onClick={() => void dashboard.refetch()}>Thử lại</RoomsButton>
        </div>
        : <div className="dashboard-cards">
          <NewViewingsCard data={dashboard.data.newViewings} />
          {dashboard.data.overlappingViewings?.count > 0 && <section className="dashboard-card">
            <h3>Lịch hẹn trùng giờ</h3><p>{dashboard.data.overlappingViewings.count} lịch cần sắp xếp lại</p>
            <ul>{dashboard.data.overlappingViewings.items.map(item => <li key={item.id}>{item.guestName} · {item.roomCode} · {viewingTime(item, 'vi')} · {item.statusLabel}</li>)}</ul>
            <Link to="/ql/lich-hen">Xem tất cả lịch hẹn</Link>
          </section>}
          {dashboard.data.pendingPrices !== null && <PendingPricesCard data={dashboard.data.pendingPrices} />}
        </div>}
  </>
}
