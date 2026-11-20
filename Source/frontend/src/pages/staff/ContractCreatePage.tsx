import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { ConfirmDialog, ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, TextField } from '../../components'
import { useBuildingSelection } from '../../features/buildings/building-selection'
import { listServices } from '../../features/buildings/api'
import { SelectField, TextAreaField } from '../../features/buildings/fields'
import { getRoom, listRooms, type RoomView } from '../../features/rooms/api'
import { createContract, getContractDates } from '../../features/contracts/api'
import { allPages, createContractSchema, type CreateContractValues } from '../../features/contracts/forms'
import type { CreateContractInput } from '../../features/contracts/types'
import type { ViewingContractPrefill } from '../../features/contracts/prefill'
import { todayHanoi } from '../../features/pricing/labels'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import { formatDate, formatMoney } from '../../shared/formatters'
import '../../features/contracts/contracts.css'

const fields = ['signer.fullName', 'signer.phone', 'signer.email', 'signer.dateOfBirth', 'signer.idNumber', 'startDate', 'termMonths', 'deposit', 'serviceIds', 'terms'] as const
type Confirmation = { input: CreateContractInput; title: string; description: string }

function CreateForm({ room, viewing, scope, onLock }: { room: RoomView; viewing?: ViewingContractPrefill; scope: string; onLock(locked: boolean): void }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  useEffect(() => { onLock(pending || !!confirmation); return () => onLock(false) }, [pending, confirmation, onLock])
  const { register, control, setValue, handleSubmit, setError: setFieldError, formState: { errors } } = useForm<CreateContractValues>({
    resolver: zodResolver(createContractSchema),
    mode: 'onChange',
    defaultValues: { signer: { fullName: viewing?.signer.fullName ?? '', phone: viewing?.signer.phone ?? '', email: viewing?.signer.email ?? '', dateOfBirth: '', idNumber: '' },
      startDate: todayHanoi(), termMonths: 3, deposit: room.price ?? 0, serviceIds: [], terms: '' },
  })
  const [startDate, termMonths, deposit, selectedServices] = useWatch({ control, name: ['startDate', 'termMonths', 'deposit', 'serviceIds'] })
  const dates = useQuery({ queryKey: ['contracts', 'dates', scope, startDate, termMonths], queryFn: () => getContractDates(startDate, termMonths),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number.isInteger(termMonths) && termMonths >= 3 })
  const dateErrors = dates.error instanceof ApiError ? dates.error.fields : undefined
  const services = useQuery({ queryKey: ['contract-service-options', scope, room.buildingId],
    queryFn: () => allPages(page => listServices({ buildingId: room.buildingId, page, limit: 100 })) })

  async function send(input: CreateContractInput) {
    if (busy.current) return
    busy.current = true
    setPending(true); setError('')
    try {
      const result = await createContract(input)
      await Promise.all(['contracts', 'rooms', 'viewings', 'dashboard'].map(key => client.invalidateQueries({ queryKey: [key] })))
      navigate(`/ql/hop-dong/${result.id}`, { replace: true })
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PHONE_TAKEN' && Number(cause.fields?.guestAccountId) > 0) {
        setConfirmation({ input: { ...input, confirmedGuestAccountId: Number(cause.fields!.guestAccountId) }, title: 'Xác nhận tài khoản người ký',
          description: `Số điện thoại thuộc tài khoản ${cause.fields?.guestAccountName ?? ''} (${cause.fields?.guestAccountEmail || 'chưa có email'}). Hãy xác nhận với người ký đây là tài khoản của họ trước khi tiếp tục.` })
      } else if (cause instanceof ApiError && cause.fields?.confirmDifferentViewingOwner) {
        setConfirmation({ input: { ...input, confirmDifferentViewingOwner: true }, title: 'Người ký khác người đặt lịch', description: cause.fields.confirmDifferentViewingOwner })
      } else {
        setConfirmation(null)
        setError(applyApiError(cause, setFieldError, fields))
      }
    } finally { busy.current = false; setPending(false) }
  }

  return <ElevatedCard className="contracts-card">
    <h2>Phòng {room.code}</h2>
    {viewing && <p>Thông tin từ lịch xem #{viewing.viewingId}. Kiểm tra lại người ký trước khi tạo hợp đồng.</p>}
    <p>Tiền phòng: {room.price === null ? 'Chưa có giá được duyệt' : formatMoney(room.price)}</p>
    <form className="contracts-form" noValidate onSubmit={event => { void handleSubmit(values => send({ roomId: room.id, ...values,
      signer: { ...values.signer, email: values.signer.email || undefined, dateOfBirth: values.signer.dateOfBirth || undefined, idNumber: values.signer.idNumber || undefined },
      ...(viewing ? { viewingId: viewing.viewingId } : {}) }))(event) }}>
      <fieldset className="contracts-fieldset" disabled={pending || !!confirmation}>
        <legend>Người ký hợp đồng</legend>
        <div className="contracts-form-grid">
          <TextField label="Họ và tên" {...register('signer.fullName')} error={errors.signer?.fullName?.message} autoComplete="name" />
          <TextField label="Số điện thoại" {...register('signer.phone')} error={errors.signer?.phone?.message} type="tel" autoComplete="tel" />
          <TextField label="Email (không bắt buộc)" {...register('signer.email')} error={errors.signer?.email?.message} type="email" />
          <TextField label="Ngày sinh (không bắt buộc)" {...register('signer.dateOfBirth')} error={errors.signer?.dateOfBirth?.message} type="date" />
          <TextField label="Số CCCD (không bắt buộc)" {...register('signer.idNumber')} error={errors.signer?.idNumber?.message} inputMode="numeric" autoComplete="off" />
        </div>
      </fieldset>
      <fieldset className="contracts-fieldset" disabled={pending || !!confirmation}>
        <legend>Thời hạn và tiền cọc</legend>
        <div className="contracts-form-grid">
          <TextField label="Ngày vào ở" {...register('startDate')} error={errors.startDate?.message ?? dateErrors?.startDate} type="date" min={todayHanoi()} />
          <TextField label="Thời hạn (tháng)" {...register('termMonths', { valueAsNumber: true })} error={errors.termMonths?.message ?? dateErrors?.termMonths} type="number" min="3" step="1" />
          <TextField label="Tiền cọc (đồng)" {...register('deposit', { valueAsNumber: true })} error={errors.deposit?.message} type="number" min="0" step="1" />
        </div>
        {Number.isInteger(deposit) && deposit >= 0 && <p>Tiền cọc: {formatMoney(deposit)}</p>}
        {dates.isFetching && <Spinner label="Đang tính ngày kết thúc" />}
        {dates.isSuccess && !dates.isFetching && <p>Ngày kết thúc: <strong>{formatDate(dates.data.endDate)}</strong></p>}
        {dates.isError && <FormError>{dates.error.message}</FormError>}
      </fieldset>
      <fieldset className="contracts-fieldset" disabled={pending || !!confirmation}>
        <legend>Dịch vụ tính theo phòng hoặc người</legend>
        {services.isPending && <Spinner label="Đang tải dịch vụ" />}
        {services.isError && <><FormError>{services.error.message}</FormError><RoomsButton type="button" onClick={() => void services.refetch()}>Thử lại dịch vụ</RoomsButton></>}
        {services.data?.filter(service => service.isActive && service.unit !== 'VEHICLE').map(service => <label className="contracts-check" key={service.id}>
          <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={event => setValue('serviceIds', event.target.checked ? [...selectedServices, service.id] : selectedServices.filter(id => id !== service.id), { shouldDirty: true })} />
          {service.name} ({service.unit === 'PERSON' ? 'theo người' : 'theo phòng'})
        </label>)}
        {errors.serviceIds && <FormError>{errors.serviceIds.message}</FormError>}
        <TextAreaField label="Điều khoản bổ sung (không bắt buộc)" {...register('terms')} error={errors.terms?.message} />
      </fieldset>
      {error && <FormError>{error}</FormError>}
      <RoomsButton type="submit" disabled={pending || !!confirmation || room.price === null || !dates.isSuccess || dates.isFetching || !services.isSuccess}>{pending ? 'Đang tạo hợp đồng' : 'Tạo hợp đồng'}</RoomsButton>
    </form>
    <ConfirmDialog open={!!confirmation} title={confirmation?.title ?? ''} description={confirmation?.description} confirmLabel="Đã xác nhận, tiếp tục" pending={pending}
      onClose={() => { if (!busy.current) setConfirmation(null) }} onConfirm={() => { if (confirmation) void send(confirmation.input) }} />
  </ElevatedCard>
}

export function ContractCreatePage() {
  const { user } = useAuth()
  const scope = authScopeKey(user)
  const { selectedBuildingId } = useBuildingSelection()
  const { state } = useLocation()
  const candidate = state?.viewing as ViewingContractPrefill | undefined
  const viewing = candidate && Number.isInteger(candidate.roomId) && Number.isInteger(candidate.viewingId) && typeof candidate.signer?.fullName === 'string' && typeof candidate.signer?.phone === 'string' ? candidate : undefined
  return <CreatePage key={`${scope}:${selectedBuildingId}`} scope={scope} selection={selectedBuildingId} viewing={viewing} />
}

function CreatePage({ scope, selection, viewing }: { scope: string; selection: ReturnType<typeof useBuildingSelection>['selectedBuildingId']; viewing?: ViewingContractPrefill }) {
  const [roomId, setRoomId] = useState(viewing?.roomId ?? 0)
  const [locked, setLocked] = useState(false)
  const rooms = useQuery({ queryKey: ['contract-room-options', scope, selection], queryFn: () => allPages(page => listRooms({ buildingId: selection, page, limit: 100 })) })
  const room = useQuery({ queryKey: ['contract-create-room', scope, roomId], queryFn: () => getRoom(roomId), enabled: roomId > 0, staleTime: 0, refetchOnMount: 'always' })
  return <>
    <SectionHeading>Tạo hợp đồng</SectionHeading>
    <Link to="/ql/hop-dong">Danh sách hợp đồng</Link>
    {rooms.isPending && <Spinner block label="Đang tải phòng" />}
    {rooms.isError && <><FormError>{rooms.error.message}</FormError><RoomsButton onClick={() => void rooms.refetch()}>Thử lại</RoomsButton></>}
    <SelectField label="Chọn phòng" name="roomId" value={roomId} disabled={locked} onChange={event => setRoomId(Number(event.target.value))}>
      <option value="0">Chọn phòng</option>
      {viewing && !rooms.data?.some(item => item.id === viewing.roomId) && <option value={viewing.roomId}>{viewing.roomCode}</option>}
      {rooms.data?.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.code}</option>)}
    </SelectField>
    {roomId > 0 && !room.isFetchedAfterMount && !room.isError && <Spinner block label="Đang kiểm tra phòng" />}
    {room.isError && <FormError>{room.error.message}</FormError>}
    {room.isSuccess && room.isFetchedAfterMount && <CreateForm key={roomId} room={room.data} scope={scope} onLock={setLocked} viewing={roomId === viewing?.roomId ? viewing : undefined} />}
  </>
}
