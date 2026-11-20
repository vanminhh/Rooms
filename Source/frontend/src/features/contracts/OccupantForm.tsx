import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormError, RoomsButton, TextField } from '../../components'
import { useI18n } from '../../shared/i18n'
import type { I18nValue } from '../../shared/i18n'
import { applyApiError } from '../../shared/form-errors'
import { todayHanoi } from '../pricing/labels'
import { useValidationLanguage } from '../auth/useValidationLanguage'
import { createOccupant, createMyOccupant, updateOccupant } from './api'
import { invalidateContracts, useContractAction } from './actions'
import { PrivateUploadField } from './ContractDocuments'
import type { ContractAsset, OccupantView } from './types'

const schema = (t: I18nValue['t']) => z.object({
  fullName: z.string().trim().min(1, t('contracts.validation.name')).max(100, t('contracts.validation.name')),
  phone: z.string().trim().regex(/^(?:0[0-9]{9})?$/, t('contracts.validation.phone')),
  dateOfBirth: z.string(), idNumber: z.string().regex(/^(?:[0-9]{12})?$/, t('contracts.validation.id')),
  moveInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('contracts.validation.date')), moveOutDate: z.string(),
})
type Values = z.infer<ReturnType<typeof schema>>

export function OccupantForm({ contractId, tenant = false, current, onSaved }: { contractId: number; tenant?: boolean; current?: OccupantView; onSaved?(): void }) {
  const { t, lang } = useI18n()
  const client = useQueryClient()
  const action = useContractAction()
  const [front, setFront] = useState<ContractAsset | null>(null)
  const [back, setBack] = useState<ContractAsset | null>(null)
  const [frontBusy, setFrontBusy] = useState(false)
  const [backBusy, setBackBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadsVersion, setUploadsVersion] = useState(0)
  const { register, trigger, handleSubmit, reset, setError, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema(t)),
    defaultValues: { fullName: current?.fullName ?? '', phone: current?.phone ?? '', dateOfBirth: current?.dateOfBirth ?? '', idNumber: '', moveInDate: current?.moveInDate ?? todayHanoi(), moveOutDate: current?.moveOutDate ?? '' } })
  useValidationLanguage(lang, errors, trigger)
  return <form className="contracts-form" noValidate onSubmit={handleSubmit(values => void action.run(async () => {
    if (frontBusy || backBusy) return
    setSaved(false)
    const input = { fullName: values.fullName, phone: values.phone || null, dateOfBirth: values.dateOfBirth || null, idNumber: values.idNumber || undefined,
      moveInDate: values.moveInDate, ...(tenant ? {} : { moveOutDate: values.moveOutDate || null }), idFront: front ?? undefined, idBack: back ?? undefined }
    if (tenant) await createMyOccupant(contractId, input)
    else if (current) await updateOccupant(contractId, current.id, input)
    else await createOccupant(contractId, input)
    reset(); setFront(null); setBack(null); setUploadsVersion(version => version + 1); setSaved(true)
    await invalidateContracts(client); onSaved?.()
  }, cause => applyApiError(cause, setError, ['fullName', 'phone', 'dateOfBirth', 'idNumber', 'moveInDate', 'moveOutDate'], lang)))}>
    <fieldset className="contracts-fieldset" disabled={action.pending}>
      <div className="contracts-form-grid">
        <TextField label={t('contracts.fullName')} {...register('fullName')} error={errors.fullName?.message} autoComplete="off" />
        <TextField label={t('contracts.phoneOptional')} {...register('phone')} type="tel" error={errors.phone?.message} />
        <TextField label={t('contracts.birthOptional')} {...register('dateOfBirth')} type="date" error={errors.dateOfBirth?.message} />
        <TextField label={t('contracts.idOptional')} {...register('idNumber')} inputMode="numeric" autoComplete="off" error={errors.idNumber?.message} />
        <TextField label={t('contracts.moveInDate')} {...register('moveInDate')} type="date" error={errors.moveInDate?.message} />
        {!tenant && <TextField label={t('contracts.moveOutDate')} {...register('moveOutDate')} type="date" error={errors.moveOutDate?.message} />}
      </div>
      <PrivateUploadField key={`front-${uploadsVersion}`} contractId={contractId} purpose="ID_PHOTO" tenant={tenant} label={t('contracts.frontOptional')} value={front} onChange={setFront} onBusy={setFrontBusy} />
      <PrivateUploadField key={`back-${uploadsVersion}`} contractId={contractId} purpose="ID_PHOTO" tenant={tenant} label={t('contracts.backOptional')} value={back} onChange={setBack} onBusy={setBackBusy} />
      <RoomsButton type="submit" disabled={action.pending || frontBusy || backBusy}>{action.pending ? t('contracts.saving') : current ? t('contracts.saveOccupant') : t('contracts.addOccupant')}</RoomsButton>
    </fieldset>
    {saved && <p role="status">{t('contracts.occupantAdded')}</p>}
    {action.error && <FormError>{action.error}</FormError>}
  </form>
}
