import { useState, type FormEvent } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { ConfirmDialog, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { getContract } from '../../features/contracts/api'
import { invalidateContracts, useContractAction } from '../../features/contracts/actions'
import type { ContractDetail } from '../../features/contracts/types'
import { apiRequest } from '../../shared/api'
import { formatDate, formatMoney } from '../../shared/formatters'

export function RequestRenewalPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const scope = authScopeKey(user)
  const contractId = Number(id)
  const requestId = params.has('requestId') ? Number(params.get('requestId')) : undefined
  const valid = Number.isSafeInteger(contractId) && contractId > 0 && (requestId === undefined || (Number.isSafeInteger(requestId) && requestId > 0))
  const query = useQuery({ queryKey: ['contracts', 'detail', scope, contractId], queryFn: () => getContract(contractId), enabled: valid })
  if (!valid) return <FormError>Liên kết gia hạn không hợp lệ.</FormError>
  if (query.isError) return <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>Thử lại</RoomsButton></>
  if (!query.data) return <Spinner block label="Đang tải hợp đồng" />
  return <RenewalForm key={`${scope}:${contractId}:${requestId}`} contract={query.data} requestId={requestId} term={params.get('termMonths') ?? String(query.data.termMonths)} />
}

function RenewalForm({ contract, requestId, term }: { contract: ContractDetail; requestId?: number; term: string }) {
  const [months, setMonths] = useState(term)
  const [terms, setTerms] = useState(contract.terms ?? '')
  const [confirm, setConfirm] = useState(false)
  const action = useContractAction()
  const client = useQueryClient()
  const navigate = useNavigate()
  function submit(event: FormEvent) { event.preventDefault(); setConfirm(true) }
  async function save() {
    await action.run(async () => {
      const result = await apiRequest<{ id: number }>(`/contracts/${contract.id}/renew`, { method: 'POST',
        body: { requestId, termMonths: Number(months), ...(terms !== (contract.terms ?? '') ? { terms: terms.trim() || null } : {}) } })
      await Promise.all([invalidateContracts(client), client.invalidateQueries({ queryKey: ['requests'] })])
      navigate(`/ql/hop-dong/${result.id}`, { replace: true })
    })
    setConfirm(false)
  }
  return <><SectionHeading>Gia hạn hợp đồng {contract.code}</SectionHeading>
    <Link to={`/ql/hop-dong/${contract.id}`}>Chi tiết hợp đồng</Link>
    {requestId && <p>Yêu cầu #{requestId}</p>}
    {contract.renewalStartDate && <p>Ngày bắt đầu gia hạn: {formatDate(contract.renewalStartDate)}</p>}
    <p>Tiền cọc chuyển tiếp: {formatMoney(contract.deposit)}. Không thu cọc mới.</p>
    <p>Dịch vụ chuyển tiếp: {contract.services.map(s => s.name).join(', ') || 'Không có'}</p>
    {contract.nextContractId ? <FormError>Hợp đồng đã có bản gia hạn.</FormError> : contract.status !== 'ACTIVE' ? <FormError>Hợp đồng hiện tại chưa ở trạng thái đang thuê.</FormError> :
      <form onSubmit={submit}><label>Thời hạn (tháng)<input type="number" min="3" step="1" required value={months} onChange={e => setMonths(e.target.value)} /></label>
        <label>Điều khoản bổ sung<textarea value={terms} onChange={e => setTerms(e.target.value)} /></label>
        <RoomsButton type="submit" disabled={action.pending}>Tạo hợp đồng gia hạn</RoomsButton>
      </form>}
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={confirm} title="Tạo hợp đồng gia hạn?" description={`${contract.code} · ${months} tháng`} confirmLabel="Tạo gia hạn" pending={action.pending}
      onClose={() => { if (!action.pending) setConfirm(false) }} onConfirm={() => void save()} />
  </>
}
