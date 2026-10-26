import { RoomsButton } from './Button'

export type RoomSearchValues = { district: string; maxPrice: string }

export function RoomSearch({ districts, budgets, onSearch }: {
  districts: string[]
  budgets: { value: string; label: string }[]
  onSearch: (values: RoomSearchValues) => void
}) {
  return <form className="rooms-search" onSubmit={event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    onSearch({ district: String(fields.get('district') ?? ''), maxPrice: String(fields.get('maxPrice') ?? '') })
  }}>
    <label><span>Khu vực</span><select name="district" defaultValue=""><option value="">Tất cả quận</option>{districts.map(district => <option key={district} value={district}>{district}</option>)}</select></label>
    <label><span>Ngân sách / tháng</span><select name="maxPrice" defaultValue=""><option value="">Tất cả mức giá</option>{budgets.map(budget => <option key={budget.value} value={budget.value}>{budget.label}</option>)}</select></label>
    <RoomsButton type="submit" variant="sand">Tìm phòng <span aria-hidden="true">↗</span></RoomsButton>
  </form>
}
