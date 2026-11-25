import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { getContract, getContractScan } from '../../features/contracts/api'
import { ContractSummaryCard } from '../../features/contracts/ContractSummaryCard'
import { ContractInformation } from '../../features/contracts/ContractInformation'
import { DocumentAccess } from '../../features/contracts/ContractDocuments'
import { DepositCard } from '../../features/contracts/DepositCard'
import { CancelContractForm, DepositPaymentForm, MoveInForm, ResetPasswordAction, SignContractForm, TemporaryPassword } from '../../features/contracts/StaffContractActions'
import { StaffOccupants, StaffServices, StaffVehicles } from '../../features/contracts/StaffContractRegistrations'
import { SettlementCard } from '../../features/contracts/SettlementCard'
import '../../features/contracts/contracts.css'

export function ContractDetailPage() {
  const { user } = useAuth()
  const { id } = useParams()
  const scope = authScopeKey(user)
  if (!Number.isInteger(Number(id)) || Number(id) < 1) return <FormError>Không tìm thấy hợp đồng.</FormError>
  return <ContractDetail key={`${scope}:${id}`} id={Number(id)} scope={scope} />
}

function ContractDetail({ id, scope }: { id: number; scope: string }) {
  const query = useQuery({ queryKey: ['contracts', 'detail', scope, id], queryFn: () => getContract(id) })
  const [password, setPassword] = useState<string | null>(null)
  const contract = query.data
  return <>
    <SectionHeading>Chi tiết hợp đồng</SectionHeading>
    <Link to="/ql/hop-dong">Danh sách hợp đồng</Link>
    {query.isPending && <Spinner block label="Đang tải hợp đồng" />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>Thử lại</RoomsButton></>}
    {contract && query.isSuccess && <div className="contracts-list">
      <ContractSummaryCard contract={contract} />
      {contract.status === 'ACTIVE' && !contract.nextContractId
        ? <Link to={`/ql/hop-dong/${id}/gia-han`}>Gia hạn</Link>
        : <div><RoomsButton disabled>Gia hạn</RoomsButton> {contract.nextContractId
          ? <Link to={`/ql/hop-dong/${contract.nextContractId}`}>Đã có hợp đồng gia hạn</Link>
          : 'Chỉ có thể gia hạn hợp đồng đang thuê.'}</div>}
      <div className="contracts-actions"><Link to={`/ql/hop-dong/${id}/in`}>In / Lưu PDF</Link>
        {contract.signedAt && <DocumentAccess label="Xem bản hợp đồng đã ký" load={async () => [{ label: contract.code, document: await getContractScan(id) }]} />}
        {contract.signedAt && <ResetPasswordAction contractId={id} onPassword={setPassword} />}
      </div>
      {password && <TemporaryPassword password={password} />}
      <ContractInformation contract={contract} />
      {contract.status === 'HOLD' && !contract.signedAt && <SignContractForm contract={contract} onPassword={setPassword} />}
      {contract.previousContractId
        ? <p>Tiền cọc chuyển tiếp từ <Link to={`/ql/hop-dong/${contract.previousContractId}`}>hợp đồng trước</Link>. Không thu cọc mới.</p>
        : <DepositCard invoice={contract.depositInvoice} />}
      {contract.status === 'HOLD' && !contract.previousContractId && contract.signedAt && contract.depositInvoice?.status === 'UNPAID' && <DepositPaymentForm contract={contract} />}
      {contract.status === 'HOLD' && !contract.previousContractId && contract.signedAt && <MoveInForm contract={contract} />}
      {contract.status === 'HOLD' && <CancelContractForm contract={contract} />}
      <StaffOccupants contract={contract} scope={scope} />
      <StaffVehicles contract={contract} scope={scope} />
      <StaffServices contract={contract} scope={scope} />
      <SettlementCard contract={contract} />
    </div>}
  </>
}
