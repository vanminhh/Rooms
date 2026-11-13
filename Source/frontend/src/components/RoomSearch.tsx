import type { ReactNode } from 'react'
import { RoomsButton } from './Button'

export type RoomSearchValues = { district: string; maxPrice: string }

export function RoomSearch({ districts, budgets, onSearch, districtLabel = 'Khu vực', budgetLabel = 'Ngân sách / tháng', submitLabel = 'Tìm phòng', // i18n-allow: Vietnamese kit defaults preserve existing callers.
  allDistrictsLabel = 'Tất cả quận', allBudgetsLabel = 'Tất cả mức giá', // i18n-allow: Vietnamese kit defaults preserve existing callers.
}: {
  districts: string[]
  budgets: { value: string; label: string }[]
  onSearch: (values: RoomSearchValues) => void
  districtLabel?: ReactNode
  budgetLabel?: ReactNode
  submitLabel?: ReactNode
  allDistrictsLabel?: string
  allBudgetsLabel?: string
}) {
  return <form className="rooms-search" onSubmit={event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    onSearch({ district: String(fields.get('district') ?? ''), maxPrice: String(fields.get('maxPrice') ?? '') })
  }}>
    <label><span>{districtLabel}</span><select name="district" defaultValue=""><option value="">{allDistrictsLabel}</option>{districts.map(district => <option key={district} value={district}>{district}</option>)}</select></label>
    <label><span>{budgetLabel}</span><select name="maxPrice" defaultValue=""><option value="">{allBudgetsLabel}</option>{budgets.map(budget => <option key={budget.value} value={budget.value}>{budget.label}</option>)}</select></label>
    <RoomsButton type="submit" variant="sand">{submitLabel} <span aria-hidden="true">→</span></RoomsButton>
  </form>
}
