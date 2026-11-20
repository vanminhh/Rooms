import { ContractPrintView } from '../../features/contracts/ContractPrintView'
import { getContractPrint } from '../../features/contracts/api'

export function ContractPrintPage() {
  return <ContractPrintView load={getContractPrint} />
}
