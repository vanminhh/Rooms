import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, Spinner, TextField } from '../../components'
import { listServices } from '../buildings/api'
import type { ServiceView } from '../buildings/api'
import { SelectField } from '../buildings/fields'
import { todayHanoi } from '../pricing/labels'
import { applyApiError } from '../../shared/form-errors'
import { createContractVehicle, getOccupantIdPhotos, listContractServices, listContractVehicles, listOccupants, updateContractServices, updateContractVehicle } from './api'
import { invalidateContracts, useContractAction } from './actions'
import { allPages } from './forms'
import { DocumentAccess } from './ContractDocuments'
import { OccupantInformation, VehicleInformation } from './ContractInformation'
import { OccupantForm } from './OccupantForm'
import type { ContractDetail, OccupantView, SelectedContractService, VehicleType, VehicleView } from './types'

const writable = (contract: ContractDetail) => contract.status === 'HOLD' || contract.status === 'ACTIVE'
export function StaffOccupants({ contract, scope }: { contract: ContractDetail; scope: string }) {
  const query = useQuery({ queryKey: ['contracts', 'occupants', scope, contract.id], queryFn: () => listOccupants(contract.id) })
  const [editing, setEditing] = useState<OccupantView | null>(null)
  return <ElevatedCard className="contracts-card"><h2>Người ở</h2>
    {query.isPending && <Spinner label="Đang tải người ở" />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>Thử lại</RoomsButton></>}
    {query.data?.map(occupant => <section className="contracts-registration" key={occupant.id}>
      <OccupantInformation occupant={occupant} />
      {(occupant.hasIdFront || occupant.hasIdBack) && <DocumentAccess label="Xem ảnh CCCD" load={async () => {
        const photos = await getOccupantIdPhotos(contract.id, occupant.id)
        return [...(photos.front ? [{ label: 'Mặt trước', document: photos.front }] : []), ...(photos.back ? [{ label: 'Mặt sau', document: photos.back }] : [])]
      }} />}
      {writable(contract) && <RoomsButton type="button" variant="outline" onClick={() => setEditing(occupant)}>Sửa người ở</RoomsButton>}
    </section>)}
    {writable(contract) && <>
      <h3>{editing ? `Sửa ${editing.fullName}` : 'Thêm người ở cùng'}</h3>
      {editing && <p>CCCD mới để trống sẽ giữ số đã lưu. Ngày ra để trống nghĩa là vẫn đang ở.</p>}
      <OccupantForm key={editing?.id ?? 'new'} contractId={contract.id} current={editing ?? undefined} onSaved={() => setEditing(null)} />
      {editing && <RoomsButton type="button" variant="outline" onClick={() => setEditing(null)}>Đóng chỉnh sửa</RoomsButton>}
    </>}
  </ElevatedCard>
}

const types: Record<VehicleType, string> = { MOTORBIKE: 'Xe máy', E_BIKE: 'Xe điện', BICYCLE: 'Xe đạp', CAR: 'Ô tô', OTHER: 'Khác' }
const vehicleSchema = z.object({ plate: z.string().trim().min(1, 'Vui lòng nhập biển số xe').max(30, 'Biển số xe quá dài'), type: z.enum(['MOTORBIKE', 'E_BIKE', 'BICYCLE', 'CAR', 'OTHER']),
  serviceId: z.number().int().min(1, 'Vui lòng chọn dịch vụ gửi xe'), registeredAt: z.string().min(1, 'Vui lòng nhập ngày đăng ký') })
function VehicleForm({ contract, services, current, onSaved }: { contract: ContractDetail; services: ServiceView[]; current?: VehicleView; onSaved(): void }) {
  const client = useQueryClient()
  const action = useContractAction()
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof vehicleSchema>>({ resolver: zodResolver(vehicleSchema),
    defaultValues: { plate: current?.plate ?? '', type: current?.type ?? 'MOTORBIKE', serviceId: current?.serviceId ?? 0, registeredAt: current?.registeredAt ?? todayHanoi() } })
  return <form className="contracts-form" noValidate onSubmit={handleSubmit(values => void action.run(async () => {
    if (current) await updateContractVehicle(contract.id, current.id, { ...values, serviceId: values.serviceId === current.serviceId ? undefined : values.serviceId })
    else await createContractVehicle(contract.id, values)
    await invalidateContracts(client); onSaved()
  }, cause => applyApiError(cause, setError, ['plate', 'type', 'serviceId', 'registeredAt'])))}>
    <fieldset className="contracts-fieldset" disabled={action.pending}>
      <TextField label="Biển số xe" {...register('plate')} error={errors.plate?.message} />
      <SelectField label="Loại xe" {...register('type')} error={errors.type?.message}>{(Object.keys(types) as VehicleType[]).map(type => <option key={type} value={type}>{types[type]}</option>)}</SelectField>
      <SelectField label="Dịch vụ gửi xe" {...register('serviceId', { valueAsNumber: true })} error={errors.serviceId?.message}><option value="0">Chọn dịch vụ</option>
        {services.filter(service => service.unit === 'VEHICLE' && (service.isActive || service.id === current?.serviceId)).map(service => <option key={service.id} value={service.id}>{service.name}{!service.isActive ? ' (ngừng hoạt động)' : ''}</option>)}
      </SelectField>
      <TextField label="Ngày đăng ký" {...register('registeredAt')} type="date" error={errors.registeredAt?.message} />
      <RoomsButton type="submit" disabled={action.pending}>{action.pending ? 'Đang lưu xe' : 'Lưu đăng ký xe'}</RoomsButton>
    </fieldset>
    {action.error && <FormError>{action.error}</FormError>}
  </form>
}

export function StaffVehicles({ contract, scope }: { contract: ContractDetail; scope: string }) {
  const client = useQueryClient()
  const action = useContractAction()
  const query = useQuery({ queryKey: ['contracts', 'vehicles', scope, contract.id], queryFn: () => listContractVehicles(contract.id) })
  const services = useQuery({ queryKey: ['contract-service-options', scope, contract.building.id], queryFn: () => allPages(page => listServices({ buildingId: contract.building.id, page, limit: 100 })) })
  const [editing, setEditing] = useState<VehicleView | 'new' | null>(null)
  const [stopping, setStopping] = useState<VehicleView | null>(null)
  const [removedAt, setRemovedAt] = useState(todayHanoi())
  return <ElevatedCard className="contracts-card"><h2>Xe đăng ký</h2>
    {query.isPending && <Spinner label="Đang tải xe" />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>Thử lại</RoomsButton></>}
    {query.data?.length === 0 && <p>Chưa có xe đăng ký.</p>}
    {query.data?.map(vehicle => <section className="contracts-registration" key={vehicle.id}><VehicleInformation vehicle={vehicle} />
      {writable(contract) && vehicle.isActive && <div className="contracts-actions"><RoomsButton type="button" variant="outline" onClick={() => setEditing(vehicle)}>Sửa xe</RoomsButton>
        <RoomsButton type="button" variant="outline" onClick={() => { setRemovedAt(todayHanoi()); setStopping(vehicle) }}>Ngừng gửi xe</RoomsButton></div>}
    </section>)}
    {writable(contract) && <RoomsButton type="button" variant="outline" onClick={() => setEditing('new')}>Đăng ký xe</RoomsButton>}
    {editing && services.isSuccess && <><VehicleForm key={typeof editing === 'object' ? editing.id : 'new'} contract={contract} services={services.data} current={typeof editing === 'object' ? editing : undefined} onSaved={() => setEditing(null)} />
      <RoomsButton type="button" variant="outline" onClick={() => setEditing(null)}>Đóng chỉnh sửa xe</RoomsButton></>}
    {editing && services.isPending && <Spinner label="Đang tải dịch vụ gửi xe" />}
    {editing && services.isError && <><FormError>{services.error.message}</FormError><RoomsButton onClick={() => void services.refetch()}>Thử lại dịch vụ</RoomsButton></>}
    {action.error && <FormError>{action.error}</FormError>}
    <ConfirmDialog open={!!stopping} title="Ngừng đăng ký xe?" description={<><p>Giữ lịch sử xe {stopping?.plate} và kết thúc đăng ký tại ngày sau.</p>
      <TextField label="Ngày ngừng gửi xe" type="date" value={removedAt} onChange={event => setRemovedAt(event.target.value)} disabled={action.pending} /></>}
      confirmLabel="Ngừng gửi xe" pending={action.pending} onClose={() => { if (!action.pending) setStopping(null) }} onConfirm={() => { if (stopping) void action.run(async () => {
        await updateContractVehicle(contract.id, stopping.id, { isActive: false, removedAt }); setStopping(null); await invalidateContracts(client)
      }) }} />
  </ElevatedCard>
}

function ServiceEditor({ contractId, current, options }: { contractId: number; current: SelectedContractService[]; options: ServiceView[] }) {
  const client = useQueryClient()
  const action = useContractAction()
  const { control, setValue, handleSubmit, setError, formState: { errors } } = useForm<{ serviceIds: number[] }>({ resolver: zodResolver(z.object({ serviceIds: z.array(z.number().int().positive()) })), defaultValues: { serviceIds: current.map(service => service.id) } })
  const selected = useWatch({ control, name: 'serviceIds' })
  const choices = [...options.filter(service => service.unit !== 'VEHICLE' && service.isActive), ...current.filter(service => !options.some(option => option.id === service.id && option.isActive))]
  return <form className="contracts-form" onSubmit={handleSubmit(values => void action.run(async () => { await updateContractServices(contractId, values.serviceIds); await invalidateContracts(client) }, cause => applyApiError(cause, setError, ['serviceIds'])))}>
    <fieldset className="contracts-fieldset" disabled={action.pending}>
      {choices.map(service => <label className="contracts-check" key={service.id}><input type="checkbox" checked={selected.includes(service.id)} onChange={event => setValue('serviceIds', event.target.checked ? [...selected, service.id] : selected.filter(id => id !== service.id))} />
        {service.name} · {service.unit === 'PERSON' ? 'Theo người' : 'Theo phòng'}{!service.isActive ? ' (ngừng hoạt động; có thể bỏ chọn)' : ''}</label>)}
      <RoomsButton type="submit" disabled={action.pending}>{action.pending ? 'Đang lưu dịch vụ' : 'Lưu dịch vụ'}</RoomsButton>
    </fieldset>
    {errors.serviceIds && <FormError>{errors.serviceIds.message}</FormError>}{action.error && <FormError>{action.error}</FormError>}
  </form>
}
export function StaffServices({ contract, scope }: { contract: ContractDetail; scope: string }) {
  const selected = useQuery({ queryKey: ['contracts', 'services', scope, contract.id], queryFn: () => listContractServices(contract.id) })
  const options = useQuery({ queryKey: ['contract-service-options', scope, contract.building.id], queryFn: () => allPages(page => listServices({ buildingId: contract.building.id, page, limit: 100 })) })
  return <ElevatedCard className="contracts-card"><h2>Dịch vụ của hợp đồng</h2>
    {(selected.isPending || options.isPending) && <Spinner label="Đang tải dịch vụ" />}
    {(selected.isError || options.isError) && <><FormError>{selected.error?.message ?? options.error?.message}</FormError><RoomsButton onClick={() => { void selected.refetch(); void options.refetch() }}>Thử lại</RoomsButton></>}
    {selected.isSuccess && options.isSuccess && (writable(contract)
      ? <ServiceEditor key={selected.data.map(service => service.id).join(',')} contractId={contract.id} current={selected.data} options={options.data} />
      : <ul>{selected.data.map(service => <li key={service.id}>{service.name} · {service.unit === 'PERSON' ? 'Theo người' : 'Theo phòng'}</li>)}</ul>)}
  </ElevatedCard>
}
