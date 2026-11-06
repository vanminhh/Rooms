import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { ApprovalCard } from '../../features/pricing/ApprovalCard'
import type { ApprovalItem } from '../../features/pricing/ApprovalCard'
import { listRatePlans, listRoomPrices } from '../../features/pricing/api'
import '../../features/pricing/pricing.css'

// /ql/duyet-gia (FE-P2-11, Boss): PENDING room prices and rate plans of the selected scope, oldest first (PRC-03).
export function ApprovalsPage() {
  const queryClient = useQueryClient()
  const { selectedBuildingId } = useBuildingSelection()
  // shortcut: the first 20 proposals of each kind (FE8B-16); no next-page control yet.
  const rooms = useQuery({
    queryKey: ['room-prices', 'approvals', selectedBuildingId],
    queryFn: () => listRoomPrices({ buildingId: selectedBuildingId, status: 'PENDING', page: 1, limit: 20, sort: 'createdAt' }),
  })
  const rates = useQuery({
    queryKey: ['rate-plans', 'approvals', selectedBuildingId],
    queryFn: () => listRatePlans({ buildingId: selectedBuildingId, status: 'PENDING', page: 1, limit: 20, sort: 'createdAt' }),
  })
  const failed = rooms.error ?? rates.error
  const items: ApprovalItem[] = [
    ...(rooms.data?.data ?? []).map(row => ({ type: 'room' as const, row })),
    ...(rates.data?.data ?? []).map(row => ({ type: 'rate' as const, row })),
  ].sort((a, b) => a.row.createdAt.localeCompare(b.row.createdAt))
  const live = items.filter(item => !item.row.expired)
  const overdue = items.filter(item => item.row.expired)

  // After a decision the proposal leaves PENDING: refresh the lists and the room grid that shows the price.
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['room-prices'] })
    void queryClient.invalidateQueries({ queryKey: ['rate-plans'] })
    void queryClient.invalidateQueries({ queryKey: ['rooms'] })
  }

  return <>
    <SectionHeading>Duyệt giá</SectionHeading>
    <p className="pricing-hint">Đối chiếu trước khi giá mới có hiệu lực.</p>
    {failed
      ? <div className="pricing-state">
        <FormError>{failed.message}</FormError>
        <RoomsButton variant="sand" onClick={() => { void rooms.refetch(); void rates.refetch() }}>Thử lại</RoomsButton>
      </div>
      : rooms.isPending || rates.isPending
        ? <Spinner block label="Đang xử lý" />
        : <>
          {items.length > 0 && <p className="pricing-hint">{live.length} đề xuất chờ duyệt (chỉ còn hạn)</p>}
          {items.length === 0 && <p className="rooms-empty">Chưa có đề xuất nào chờ duyệt</p>}
          <div className="pricing-list">
            {live.map(item => <ApprovalCard key={`${item.type}-${item.row.id}`} item={item} onDone={refresh} />)}
          </div>
          {overdue.length > 0 && <div className="pricing-group">
            <h3>Đề xuất quá hạn</h3>
            <p className="pricing-hint">Không thể duyệt khi ngày áp dụng đã qua. Bạn vẫn có thể từ chối kèm ghi chú.</p>
            <div className="pricing-list">
              {overdue.map(item => <ApprovalCard key={`${item.type}-${item.row.id}`} item={item} onDone={refresh} />)}
            </div>
          </div>}
        </>}
  </>
}
