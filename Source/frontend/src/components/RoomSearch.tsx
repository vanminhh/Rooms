import type { ReactNode } from 'react'
import { RoomsButton } from './Button'

export type RoomSearchValues = { district: string; maxPrice: string }

export function RoomSearch({ districts, budgets, onSearch, districtLabel = 'Khu vực', budgetLabel = 'Ngân sách / tháng', submitLabel = 'Tìm phòng' }: {
  districts: string[]
  budgets: { value: string; label: string }[]
  onSearch: (values: RoomSearchValues) => void
  districtLabel?: ReactNode
  budgetLabel?: ReactNode
  submitLabel?: ReactNode
}) {
  return <form className="rooms-search" onSubmit={event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    onSearch({ district: String(fields.get('district') ?? ''), maxPrice: String(fields.get('maxPrice') ?? '') })
  }}>
    <label><span>{districtLabel}</span><select name="district" defaultValue=""><option value="">Tất cả quận</option>{districts.map(district => <option key={district} value={district}>{district}</option>)}</select></label>
    <label><span>{budgetLabel}</span><select name="maxPrice" defaultValue=""><option value="">Tất cả mức giá</option>{budgets.map(budget => <option key={budget.value} value={budget.value}>{budget.label}</option>)}</select></label>
    <RoomsButton type="submit" variant="sand">{submitLabel} <span aria-hidden="true">→</span></RoomsButton>
  </form>
}
