import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { SelectField } from '../../features/buildings/fields'
import { lookupVehicles } from '../../features/contracts/api'
import { VehicleInformation } from '../../features/contracts/ContractInformation'
import '../../features/contracts/contracts.css'

export function VehiclesPage() {
  const { user } = useAuth()
  return <VehicleLookup key={authScopeKey(user)} scope={authScopeKey(user)} />
}

function VehicleLookup({ scope }: { scope: string }) {
  const [draft, setDraft] = useState('')
  const [plate, setPlate] = useState('')
  const [active, setActive] = useState('true')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['vehicles', 'lookup', scope, plate, active, page],
    queryFn: () => lookupVehicles({ plate: plate || undefined, isActive: active === 'true', page, limit: 20 }) })
  return <>
    <SectionHeading>Tra cứu xe</SectionHeading>
    <form className="contracts-toolbar" onSubmit={event => { event.preventDefault(); setPlate(draft.trim()); setPage(1) }}>
      <TextField name="plate" label="Biển số hoặc một phần biển số" value={draft} onChange={event => setDraft(event.target.value)} />
      <SelectField label="Trạng thái gửi xe" value={active} onChange={event => { setActive(event.target.value); setPage(1) }}>
        <option value="true">Đang gửi</option><option value="false">Đã ngừng gửi</option>
      </SelectField><RoomsButton type="submit">Tra cứu</RoomsButton>
    </form>
    {query.isPending && <Spinner block label="Đang tra cứu xe" />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>Thử lại</RoomsButton></>}
    {query.isSuccess && query.data.data.length === 0 && <ElevatedCard><p>Không tìm thấy xe phù hợp.</p></ElevatedCard>}
    <div className="contracts-list">{query.data?.data.map(vehicle => <ElevatedCard key={vehicle.id} className="contracts-card"><VehicleInformation vehicle={vehicle} />
      <p>{vehicle.contract.building.name} · {vehicle.contract.room.code}</p><p>{vehicle.contract.tenant.fullName} · {vehicle.contract.tenant.phone}</p>
      <Link to={`/ql/hop-dong/${vehicle.contract.id}`}>{vehicle.contract.code}</Link>
    </ElevatedCard>)}</div>
    {query.isSuccess && (page > 1 || query.data.meta.total > query.data.meta.limit) && <nav className="contracts-actions" aria-label="Phân trang xe">
      <RoomsButton disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</RoomsButton><span>Trang {page}</span>
      <RoomsButton disabled={page * query.data.meta.limit >= query.data.meta.total} onClick={() => setPage(page + 1)}>Trang sau</RoomsButton>
    </nav>}
  </>
}
