import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { buildingIdQuery } from '../../features/buildings/api'
import { listRequests, requestStatuses, requestTypes, type RequestStatus } from '../../features/requests/api'
import { RequestCard } from '../../features/requests/RequestCard'
import './requests.css'

const columns: { title: string; statuses: RequestStatus[] }[] = [
  { title: 'Chờ xử lý', statuses: ['PENDING'] },
  { title: 'Đang xử lý', statuses: ['IN_PROGRESS', 'ESCALATED'] },
  { title: 'Hoàn thành', statuses: ['APPROVED', 'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED'] },
]
export function RequestsPage() {
  const { user } = useAuth()
  const { selectedBuildingId } = useBuildingSelection()
  const buildingId = buildingIdQuery(selectedBuildingId)
  const [params, setParams] = useSearchParams()
  const type = params.get('type') ?? ''
  const status = params.get('status') ?? ''
  const requestedPage = Number(params.get('page'))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const focus = Number(params.get('requestId'))
  const query = useQuery({
    queryKey: ['requests', authScopeKey(user), buildingId, type, status, page, focus],
    queryFn: async ({ signal }) => {
      const filters = { buildingId, type: Object.hasOwn(requestTypes, type) ? type : undefined, status: Object.hasOwn(requestStatuses, status) ? status : undefined }
      let result = await listRequests({ ...filters, page })
      // Dashboard links can target an older approved renewal. The staff API exposes only a paginated list.
      while (focus > 0 && !signal.aborted && !result.data.some(row => row.id === focus) && result.meta.page * result.meta.limit < result.meta.total) {
        result = await listRequests({ ...filters, page: result.meta.page + 1 })
      }
      return result
    },
  })
  function change(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.delete('requestId')
    next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }
  const data = query.data
  return <div className="requests-page"><SectionHeading>Yêu cầu</SectionHeading>
    <div className="requests-filters">
      <label>Loại yêu cầu<select value={type} onChange={e => change('type', e.target.value)}><option value="">Tất cả loại</option>
        {Object.entries(requestTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Trạng thái<select value={status} onChange={e => change('status', e.target.value)}><option value="">Tất cả trạng thái</option>
        {Object.entries(requestStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {query.isPending && <Spinner block label="Đang tải yêu cầu" />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>Thử lại</RoomsButton></>}
    {data && <>{focus > 0 && !data.data.some(row => row.id === focus) && <p>Yêu cầu đã đổi trạng thái hoặc nằm ngoài bộ lọc hiện tại.</p>}
      <div className="requests-board">{columns.map(column => {
        const rows = data.data.filter(row => column.statuses.includes(row.status))
        return <section key={column.title}><h2>{column.title}</h2>
          {rows.length ? rows.map(row => <RequestCard key={`${user?.id}:${row.id}:${row.status}`} row={row} boss={user?.role === 'BOSS'} expanded={row.id === focus} />) : <p>Chưa có yêu cầu trên trang này.</p>}
        </section>
      })}</div>
      <nav aria-label="Phân trang yêu cầu"><RoomsButton disabled={data.meta.page <= 1} onClick={() => change('page', String(data.meta.page - 1))}>Trang trước</RoomsButton>
        <span>Trang {data.meta.page} · {data.meta.total} yêu cầu</span>
        <RoomsButton disabled={data.meta.page * data.meta.limit >= data.meta.total} onClick={() => change('page', String(data.meta.page + 1))}>Trang sau</RoomsButton></nav>
    </>}
  </div>
}
