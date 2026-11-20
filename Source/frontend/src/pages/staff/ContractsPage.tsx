import { useState } from 'react'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { useBuildingSelection, type BuildingSelection } from '../../features/buildings/building-selection'
import { SelectField } from '../../features/buildings/fields'
import { listContracts } from '../../features/contracts/api'
import { ContractSummaryCard } from '../../features/contracts/ContractSummaryCard'
import { contractStatusLabels, type ContractStatus } from '../../shared/status-labels'
import '../../features/contracts/contracts.css'

function ContractList({ selection, scope }: { selection: BuildingSelection; scope: string }) {
  const [status, setStatus] = useState<ContractStatus | ''>('')
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['contracts', 'list', scope, selection, status, keyword, page],
    queryFn: () => listContracts({ buildingId: selection, status: status || undefined, q: keyword || undefined, page, limit: 20 }),
  })
  return <>
    <form className="contracts-toolbar" onSubmit={event => { event.preventDefault(); setKeyword(draft.trim()); setPage(1) }}>
      <TextField label="Tên người thuê, số điện thoại hoặc mã phòng" name="q" value={draft} onChange={event => setDraft(event.target.value)} />
      <SelectField label="Trạng thái hợp đồng" value={status} onChange={event => { setStatus(event.target.value as ContractStatus | ''); setPage(1) }}>
        <option value="">Tất cả trạng thái</option>
        {(Object.keys(contractStatusLabels) as ContractStatus[]).map(value => <option key={value} value={value}>{contractStatusLabels[value]}</option>)}
      </SelectField>
      <RoomsButton type="submit">Tìm kiếm</RoomsButton>
      <Link className="rooms-button rooms-button--outline" to="/ql/hop-dong/moi">Tạo hợp đồng</Link>
    </form>
    {query.isPending && <Spinner block label="Đang tải hợp đồng" />}
    {query.isError && <div className="contracts-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>Thử lại</RoomsButton></div>}
    {query.isSuccess && query.data.data.length === 0 && <ElevatedCard><p>Chưa có hợp đồng phù hợp.</p><Link to="/ql/hop-dong/moi">Tạo hợp đồng</Link></ElevatedCard>}
    {query.isSuccess && query.data.data.length > 0 && <div className="contracts-list">
      {query.data.data.map(contract => <ContractSummaryCard key={contract.id} contract={contract} detailHref={`/ql/hop-dong/${contract.id}`} />)}
    </div>}
    {query.isSuccess && (page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="contracts-actions" aria-label="Phân trang hợp đồng">
      <RoomsButton type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton>
      <span>Trang {page}</span>
      <RoomsButton type="button" variant="outline" disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
    </nav>}
  </>
}

export function ContractsPage() {
  const { selectedBuildingId } = useBuildingSelection()
  const { user } = useAuth()
  const scope = authScopeKey(user)
  return <>
    <SectionHeading>Hợp đồng</SectionHeading>
    <ContractList key={`${scope}:${selectedBuildingId}`} selection={selectedBuildingId} scope={scope} />
  </>
}
