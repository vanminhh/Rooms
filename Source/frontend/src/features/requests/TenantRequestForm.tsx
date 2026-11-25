import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { FormError, RoomsButton } from '../../components'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { apiRequest } from '../../shared/api'
import { useI18n } from '../../shared/i18n'
import { getMyContract } from '../contracts/api'
import type { VehicleType } from '../contracts/types'
import { ROOM_IMAGE_MAX_BYTES, ROOM_IMAGE_TYPES, uploadToCloudinary, type SignedUpload } from '../rooms/upload'
import { useMyRequests, type TenantRequest } from './tenant-api'

type Kind = TenantRequest['type']
const contractActions: Kind[] = ['MOVE_OUT', 'RENEW', 'OCCUPANT_CHANGE', 'VEHICLE_CHANGE']
const vehicles: VehicleType[] = ['MOTORBIKE', 'E_BIKE', 'BICYCLE', 'CAR', 'OTHER']

export function RequestActions({ contractId, invoiceId }: { contractId: number; invoiceId?: number }) {
  const { t } = useI18n()
  const { query } = useMyRequests()
  const [opened, setOpened] = useState<Kind>()
  const actions: Kind[] = invoiceId ? ['PAYMENT_ISSUE'] : contractActions
  function pending(type: Kind) {
    return query.data?.some(row => row.contractId === contractId && row.status === 'PENDING' &&
      (row.type === type && (!invoiceId || row.payload.invoiceId === invoiceId) ||
       ['MOVE_OUT', 'RENEW'].includes(type) && ['MOVE_OUT', 'RENEW'].includes(row.type)))
  }
  return <section>
    <div className="contracts-actions">{actions.map(type => <RoomsButton key={type} disabled={!query.isSuccess || pending(type)} onClick={() => setOpened(opened === type ? undefined : type)}>{t(`req.${type}`)}</RoomsButton>)}</div>
    {actions.some(pending) && <p>{t('req.pending')}</p>}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></>}
    {opened && !pending(opened) && <TenantRequestForm key={opened} type={opened} contractId={contractId} invoiceId={invoiceId} />}
  </section>
}

export function TenantRequestForm({ type, contractId, invoiceId }: { type: Kind; contractId: number; invoiceId?: number }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const [vehicleMode, setVehicleMode] = useState('add')
  const [photoError, setPhotoError] = useState<'req.limit' | 'req.file' | ''>('')
  const member = type === 'OCCUPANT_CHANGE'
  const mode = member ? 'remove' : vehicleMode
  const change = member || type === 'VEHICLE_CHANGE'
  const contract = useQuery({ queryKey: ['my-contracts', 'detail', authScopeKey(user), contractId], queryFn: () => getMyContract(contractId), enabled: change })
  const withPhotos = type === 'INCIDENT' || type === 'PAYMENT_ISSUE'
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const value = (key: string) => String(form.get(key) ?? '').trim()
      let payload: Record<string, unknown> = {}
      if (type === 'MOVE_OUT') payload = { plannedMoveOutDate: value('date') }
      if (type === 'RENEW') payload = { termMonths: Number(value('months')) }
      if (type === 'PAYMENT_ISSUE') payload = { invoiceId, amount: Number(value('amount')), transferredAt: value('time') + '+07:00' }
      if (change) {
        if (mode === 'remove') payload = { remove: [member ? { occupantId: Number(value('item')), moveOutDate: value('date') } : { vehicleId: Number(value('item')), removedAt: value('date') }] }
        else payload = { add: [{ type: value('vehicle'), plate: value('plate'), serviceId: Number(value('service')) }] }
      }
      const files = form.getAll('photos').filter((v): v is File => typeof v !== 'string' && !!v.name)
      if (files.length > 5) throw new Error(t('req.limit'))
      if (files.some(f => !ROOM_IMAGE_TYPES.includes(f.type) || f.size > ROOM_IMAGE_MAX_BYTES)) throw new Error(t('req.file'))
      const photos = await Promise.all(files.map(async file => {
        const signed = await apiRequest<SignedUpload>('/files/sign', { method: 'POST', body: { purpose: 'REQUEST_PHOTO', contractId } })
        try { return await uploadToCloudinary(signed, file) }
        catch { throw new Error(t('req.uploadFailed')) }
      }))
      return apiRequest<TenantRequest>('/me/requests', { method: 'POST', body: { contractId, type, title: value('title') || t(`req.${type}`), description: value('description'), payload, photos } })
    },
    onSuccess: async row => {
      await client.invalidateQueries({ queryKey: ['my-requests', authScopeKey(user)] })
      void navigate('/thue/yeu-cau/' + row.id)
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!photoError && !mutation.isPending) mutation.mutate(new FormData(event.currentTarget))
  }
  return <form className="contracts-form" onSubmit={submit}><fieldset disabled={mutation.isPending} className="contracts-fieldset tenant-request-fields">
    <legend>{t(`req.${type}`)}</legend>
    {type === 'INCIDENT' && <label>{t('req.title')}<input name="title" required maxLength={150} pattern=".*\S.*" /></label>}
    {type === 'VEHICLE_CHANGE' && <label>{t(`req.${type}`)}<select value={mode} onChange={e => setVehicleMode(e.target.value)}><option value="add">{t('req.add')}</option><option value="remove">{t('req.remove')}</option></select></label>}
    {change && mode === 'remove' && <select name="item" required aria-label={t('req.remove')} defaultValue=""><option value="">{t('req.choose')}</option>
      {member ? contract.data?.occupants.filter(v => !v.moveOutDate && !v.isSigner).map(v => <option key={v.id} value={v.id}>{v.fullName}</option>) : contract.data?.vehicles.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select>}
    {member && <Link to={'/thue/hop-dong/' + contractId + '#them-nguoi-o'}>{t('contracts.addOccupant')}</Link>}
    {type === 'VEHICLE_CHANGE' && mode === 'add' && <>
      <label>{t('req.plate')}<input name="plate" required /></label>
      <label>{t('req.vehicle')}<select name="vehicle">{vehicles.map(v => <option key={v} value={v}>{t(`contracts.vehicle.${v}`)}</option>)}</select></label>
      <label>{t('req.service')}<select name="service" required defaultValue=""><option value="">{t('req.choose')}</option>{contract.data?.parkingServices?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
    </>}
    {(type === 'MOVE_OUT' || member || change && mode === 'remove') && <label>{t(type === 'MOVE_OUT' ? 'req.end' : 'req.date')}<input name="date" type="date" required /></label>}
    {type === 'RENEW' && <label>{t('req.months')}<input name="months" type="number" step="1" min="3" required /></label>}
    {type === 'PAYMENT_ISSUE' && <>
      <label>{t('req.amount')}<input type="number" min="1" step="1" name="amount" required /></label>
      <label>{t('req.time')}<input type="datetime-local" name="time" required /></label></>}
    <label>{t('req.description')}<textarea name="description" /></label>
    {withPhotos && <label>{t('req.photos')}<input name="photos" type="file" multiple accept={ROOM_IMAGE_TYPES.join(',')} required={type === 'PAYMENT_ISSUE'} onChange={e => {
      const files = Array.from(e.target.files ?? [])
      setPhotoError(files.length > 5 ? 'req.limit' : files.some(f => !ROOM_IMAGE_TYPES.includes(f.type) || f.size > ROOM_IMAGE_MAX_BYTES) ? 'req.file' : '')
    }} /></label>}
    {photoError && <FormError>{t(photoError)}</FormError>}
    {contract.isError && change && <FormError>{contract.error.message}</FormError>}
    {mutation.isError && <FormError>{mutation.error.message}</FormError>}
    <RoomsButton type="submit" disabled={!!photoError || change && !contract.isSuccess}>{t('req.submit')}</RoomsButton>
  </fieldset></form>
}
