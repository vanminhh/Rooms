import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { apiRequestPage, listPath } from '../../shared/api'
import '../../features/contracts/contracts.css'

interface Entry {
  id: string; createdAt: string; action: string; entity: string; entityId: number; ip: string | null
  actor: { id: number; fullName: string } | null; before: unknown; after: unknown
}
const empty = { entity: '', entityId: '', actorId: '', from: '', to: '' }
export function AuditPage() {
  const { user } = useAuth()
  const [draft, setDraft] = useState(empty)
  const [filters, setFilters] = useState(empty)
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['audit-logs', authScopeKey(user), filters, page],
    queryFn: () => apiRequestPage<Entry>(listPath('/audit-logs', { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v.trim())), page })) })
  function apply(e: FormEvent) { e.preventDefault(); setFilters({ ...draft, entity: draft.entity.trim() }); setPage(1) }
  return <><SectionHeading>Nhật ký thao tác</SectionHeading>
    <form className="contracts-form" onSubmit={apply}><div className="contracts-form-grid">
      {([['entity', 'Loại đối tượng', 'text'], ['entityId', 'Mã đối tượng', 'number'], ['actorId', 'Mã người thao tác', 'number'],
        ['from', 'Từ ngày', 'date'], ['to', 'Đến ngày', 'date']] as const).map(([key, label, type]) =>
        <TextField key={key} name={key} label={label} type={type} min={key === 'entityId' ? 0 : key === 'actorId' ? 1 : key === 'to' ? draft.from : undefined}
          maxLength={key === 'entity' ? 50 : undefined} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />)}
    </div><div className="contracts-actions"><RoomsButton type="submit">Lọc nhật ký</RoomsButton>
      <RoomsButton type="button" variant="outline" onClick={() => { setDraft(empty); setFilters(empty); setPage(1) }}>Xóa bộ lọc</RoomsButton></div></form>
    {q.isPending && <Spinner block label="Đang tải nhật ký" />}
    {q.isError && <><FormError>{q.error.message}</FormError><RoomsButton onClick={() => void q.refetch()}>Thử lại</RoomsButton></>}
    {q.data && <>{q.data.data.length === 0 && <p>Không có thao tác phù hợp.</p>}
      {q.data.data.map(row => <details key={row.id} className="contracts-card"><summary>
        {new Date(row.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {row.action} · {row.actor?.fullName ?? 'Hệ thống'}
      </summary><p>{row.entity} #{row.entityId} · Nhật ký #{row.id}{row.ip && ' · IP ' + row.ip}</p>
        <h3>Trước thay đổi</h3><pre className="contracts-terms">{JSON.stringify(row.before, null, 2)}</pre>
        <h3>Sau thay đổi</h3><pre className="contracts-terms">{JSON.stringify(row.after, null, 2)}</pre>
      </details>)}
      {q.data.meta.total > q.data.meta.limit && <nav aria-label="Phân trang nhật ký" className="contracts-actions">
        <RoomsButton disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
        <span>Trang {page}</span><RoomsButton disabled={page * q.data.meta.limit >= q.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
      </nav>}</>}
  </>
}
