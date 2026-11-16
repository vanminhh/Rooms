import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ConfirmDialog, FormError, RoomsButton, Spinner, TextField } from '../../components'
import { useAuth } from '../../app/auth-context'
import { ApiError } from '../../shared/api'
import { applyApiError } from '../../shared/form-errors'
import { useI18n } from '../../shared/i18n'
import { useValidationLanguage } from '../auth/useValidationLanguage'
import { bookViewing, getViewingTimes, invalidateViewings, type OwnViewingView } from '../viewings/api'
import { hourInstant, plusDays, todayHanoi, viewingTime } from '../viewings/time'
import { ViewingContacts } from '../viewings/ViewingContacts'
import { ViewingCalendar } from './ViewingCalendar'
import { viewingFormSchema, type ViewingFormValues } from './viewing-schema'
import './public.css'
import './booking-panel.css'

// Changing account or room discards the previous account's success/data; changing language preserves the form.
export function ViewingForm(props: { roomId: number; roomCode?: string }) {
  const { user } = useAuth()
  return <BookingForm key={`${props.roomId}:${user?.id ?? 'anonymous'}`} {...props} />
}
function BookingForm({ roomId, roomCode }: { roomId: number; roomCode?: string }) {
  const { user, status, retry } = useAuth()
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const sending = useRef(false)
  const successRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLElement>(null)
  const [sent, setSent] = useState<OwnViewingView | null>(null)
  const [successOpen, setSuccessOpen] = useState(false)
  const [overlap, setOverlap] = useState<{ values: ViewingFormValues; message: string } | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [formError, setFormError] = useState('')
  const [day, setDay] = useState('')
  const signedIn = user?.role === 'GUEST' || user?.role === 'TENANT'
  const needsEmail = user?.role === 'TENANT' && !user.email
  const from = todayHanoi(), to = plusDays(from, 30)
  const times = useQuery({
    queryKey: ['viewing-times', signedIn ? user.id : 'anonymous', roomId, from, to],
    queryFn: () => getViewingTimes(roomId, from, to, signedIn), enabled: status === 'ready',
    staleTime: signedIn ? 0 : 60_000, refetchInterval: 60_000,
  })
  const schema = useMemo(() => viewingFormSchema(t), [t])
  const { control, register, handleSubmit, trigger, setError, setValue, formState: { errors, isSubmitting } } = useForm<ViewingFormValues>({
    resolver: zodResolver(schema), defaultValues: { visitAt: '', note: '' },
  })
  const visitAt = useWatch({ control, name: 'visitAt' })
  const locked = isSubmitting || accepting || !!overlap
  useValidationLanguage(lang, errors, trigger)
  useEffect(() => { if (sent && !successOpen) successRef.current?.focus() }, [sent, successOpen])
  const days = times.data ?? []
  const hours = days.find(d => d.date === day)?.hours ?? []
  useEffect(() => {
    if (visitAt && times.data && !times.data.some(d => d.hours.includes(visitAt) && Date.parse(visitAt) > Date.now())) setValue('visitAt', '')
  }, [times.data, visitAt, setValue])

  async function submit(values: ViewingFormValues, acceptOverlap?: boolean) {
    if (!signedIn || needsEmail) return
    setFormError('')
    setOverlap(null)
    if (!hours.includes(values.visitAt) || Date.parse(values.visitAt) <= Date.now()) {
      setError('visitAt', { type: 'validate', message: t('viewing.chooseHour') }); return
    }
    try {
      const result = await bookViewing({ roomId, ...values, acceptOverlap })
      setSent(result)
      setSuccessOpen(true)
      await invalidateViewings(queryClient)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VIEWING_OVERLAP_WARNING') {
        setOverlap({ values: { ...values }, message: error.fields?.visitAt ?? error.message })
        return
      }
      setFormError(applyApiError(error, setError, ['visitAt', 'note'], lang))
      if (error instanceof ApiError && error.code === 'VIEWING_TIME_TAKEN') await times.refetch()
    }
  }
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current || overlap) return
    sending.current = true
    try { await handleSubmit(values => submit(values))(event) } finally { sending.current = false }
  }
  async function acceptWarning() {
    if (!overlap || sending.current) return
    sending.current = true
    setAccepting(true)
    try { await submit(overlap.values, true) } finally { sending.current = false; setAccepting(false) }
  }
  if (sent) return <>
  <section ref={successRef} tabIndex={-1} inert={successOpen} className="public-viewing public-viewing-success" role="status">
    <h3>{t('viewing.success')}</h3>
    <p>{t('viewing.room', { code: sent.roomCode })} · {viewingTime(sent, lang)}</p>
    <ViewingContacts contact={sent.contact} bossContact={sent.bossContact} />
    <Link className="rooms-button rooms-button--primary" to={`/toi/lich-hen/${sent.id}`}>{t('viewing.detailLink')}</Link>
  </section>
  <ConfirmDialog open={successOpen} title={t('viewing.successTitle')} description={<>
    <p>{t(sent.contact?.phone ? 'viewing.successContact' : 'viewing.successContactFallback')}</p>
    <p>{t('viewing.room', { code: sent.roomCode })} · {viewingTime(sent, lang)}</p>
    <ViewingContacts contact={sent.contact} bossContact={sent.bossContact} />
  </>} confirmLabel={t('viewing.successDetail')} cancelLabel={t('viewing.close')}
    onConfirm={() => navigate(`/toi/lich-hen/${sent.id}`)} onClose={() => setSuccessOpen(false)} />
  </>
  return <><section ref={formRef} tabIndex={-1} className="public-viewing" inert={!!overlap}>
    <h3>{t('viewing.title')}{roomCode ? ` · ${roomCode}` : ''}</h3>
    <p className="public-booking-form-intro">{t('viewing.intro')}</p>
    {status === 'error' ? <><FormError>{t('common.genericError')}</FormError><RoomsButton onClick={retry}>{t('common.retry')}</RoomsButton></>
      : times.isPending ? <Spinner block label={t('common.loading')} />
      : times.isError ? <><FormError>{times.error.message}</FormError><RoomsButton onClick={() => void times.refetch()}>{t('common.retry')}</RoomsButton></>
      : <>
        <ViewingCalendar days={days} selectedDay={day} disabled={locked} onSelectDay={next => { setDay(next); setValue('visitAt', '') }} />
        <form className="public-booking-form" noValidate onSubmit={onSubmit}>
          <fieldset className="viewing-hours" disabled={locked}><legend>{t('viewing.hour')}</legend>
            {!day ? <p>{t('viewing.chooseDay')}</p> : <>
              {!hours.length && <p>{t('viewing.noHours')}</p>}
              <div className="viewing-hours-grid">{Array.from({ length: 12 }, (_, i) => {
                const hour = i + 8, instant = hourInstant(day, hour)
                return <RoomsButton key={hour} type="button" variant="outline" disabled={!hours.includes(instant)}
                  aria-pressed={visitAt === instant} onClick={() => setValue('visitAt', instant, { shouldValidate: true })}>{String(hour).padStart(2, '0')}:00</RoomsButton>
              })}</div>
            </>}
            <FormError>{errors.visitAt?.message}</FormError>
          </fieldset>
          {status === 'ready' && !user ? <Link className="rooms-button rooms-button--primary" to={`/dang-nhap?next=${encodeURIComponent(`/phong/${roomId}`)}`}>{t('viewing.login')}</Link>
            : !signedIn ? <p>{t('viewing.staffGate')}</p>
            : needsEmail ? <><p>{t('viewing.tenantEmail')}</p><Link className="rooms-button rooms-button--outline" to="/toi/tai-khoan">{t('viewing.addEmail')}</Link></>
            : <>
              <TextField label={t('viewing.note')} placeholder={t('viewing.notePlaceholder')} disabled={locked} error={errors.note?.message} {...register('note')} />
              <FormError>{formError}</FormError>
              <RoomsButton type="submit" disabled={locked}>{t('viewing.submit')}{(isSubmitting || accepting) && <Spinner label={t('common.loading')} />}</RoomsButton>
            </>}
        </form>
      </>}
  </section>
  <ConfirmDialog open={!!overlap} returnFocusRef={formRef} title={t('viewing.overlapTitle')} description={overlap?.message ?? ''}
    confirmLabel={t('viewing.acceptOverlap')} cancelLabel={t('viewing.chooseAnotherTime')}
    onConfirm={() => void acceptWarning()} onClose={() => setOverlap(null)} />
  </>
}
