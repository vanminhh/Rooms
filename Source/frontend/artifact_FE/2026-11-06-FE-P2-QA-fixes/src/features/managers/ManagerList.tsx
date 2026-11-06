import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormError, RoomsButton, Spinner } from '../../components'
import { listManagers, updateManager } from './api'
import type { ManagerBuilding } from './api'
import './managers.css'

const PAGE_SIZE = 20

// AUTH-08: a locked manager keeps his buildings, so they stay listed with a "(đã khóa)" mark.
function buildingsText(buildings: ManagerBuilding[]): string {
  if (buildings.length === 0) return 'Chưa được giao tòa nào'
  return buildings.map(building => `${building.name} (${building.code})${building.isActive ? '' : ', đã khóa'}`).join('; ')
}

// Boss's manager list with lock/unlock (AUTH-08). Each list state is shown (UI-03).
export function ManagerList() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['managers', 'list', page],
    queryFn: () => listManagers({ page, limit: PAGE_SIZE }),
  })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => updateManager(id, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['managers'] })
      void queryClient.invalidateQueries({ queryKey: ['buildings'] })
    },
  })

  return <>
    {query.isPending && <Spinner block label="Đang tải danh sách quản lý" />}
    {query.isError && <div className="managers-state">
      <FormError>{query.error.message}</FormError>
      <RoomsButton variant="sand" onClick={() => void query.refetch()}>Thử lại</RoomsButton>
    </div>}
    {query.isSuccess && query.data.data.length === 0 && <p className="rooms-empty">
      Chưa có tài khoản quản lý nào. Bấm “Thêm quản lý” để tạo tài khoản đầu tiên.
    </p>}
    {toggle.isError && <FormError>{toggle.error.message}</FormError>}
    {query.isSuccess && query.data.data.length > 0 && <>
      <ul className="managers-list">
        {query.data.data.map(manager => <li key={manager.id} className="managers-item">
          <div>
            <p className="managers-item-title">{manager.fullName} <span>· {manager.phone}</span></p>
            <p className="managers-item-meta">{manager.email ?? 'Chưa có email'}</p>
            <p className="managers-item-meta">
              {manager.isActive ? 'Đang hoạt động' : 'Đã khóa'}
              {manager.mustChangePassword ? ' · Cần đổi mật khẩu lần đầu' : ''}
            </p>
            <p className="managers-item-meta">Tòa: {buildingsText(manager.buildings)}</p>
          </div>
          <RoomsButton variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: manager.id, isActive: !manager.isActive })}>
            {manager.isActive ? `Khóa ${manager.fullName}` : `Mở khóa ${manager.fullName}`}
          </RoomsButton>
        </li>)}
      </ul>
      {(page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="managers-pager" aria-label="Phân trang quản lý">
        <RoomsButton variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
        <span>Trang {page}/{Math.max(1, Math.ceil(query.data.meta.total / query.data.meta.limit))}</span>
        <RoomsButton variant="outline" disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}
    </>}
  </>
}
