import { ContractPrintView } from '../../features/contracts/ContractPrintView'
import { getMyContractPrint } from '../../features/contracts/api'

export function TenantContractPrintPage() {
  return <ContractPrintView load={getMyContractPrint} tenant />
}
