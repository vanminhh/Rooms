import { SectionHeading } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { RatePlanList } from '../../features/pricing/RatePlanList'

// Staff rate page (FE-P2-10): rate plans of one building. "Tất cả tòa" or no pick has no single building to propose for (FE8B-5).
export function PricesPage() {
  const { selectedBuildingId } = useBuildingSelection()

  return <>
    <SectionHeading>Đơn giá</SectionHeading>
    {typeof selectedBuildingId === 'number'
      ? <RatePlanList key={selectedBuildingId} buildingId={selectedBuildingId} />
      : <p className="pricing-hint">Chọn một tòa ở thanh chọn tòa để xem và đề xuất đơn giá.</p>}
  </>
}
