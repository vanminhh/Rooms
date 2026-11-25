import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useI18n } from '../../shared/i18n'
import { formatMoney, formatDate } from '../../shared/formatters'
import { listMyContracts } from '../../features/contracts/api'
import { allPages } from '../../features/contracts/forms'
import { requestTypes } from '../../features/requests/api'
import { changeRequest, saveReview, useMyRequests, type TenantRequest } from '../../features/requests/tenant-api'
import { TenantRequestForm } from '../../features/requests/TenantRequestForm'

const hanoiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
function IncidentReview({ row, refresh }: { row: TenantRequest; refresh: () => Promise<void> }) {
  const { t } = useI18n()
  const [rating, setRating] = useState(row.reviewRating ?? 5)
  const [comment, setComment] = useState(row.reviewComment ?? '')
  const save = useMutation({ mutationFn: () => saveReview(row, rating, comment), onSuccess: refresh })
  const editable = !row.reviewAt || Date.parse(hanoiDate.format(new Date())) - Date.parse(hanoiDate.format(new Date(row.reviewAt))) < 7 * 86400000
  return <section>{row.reviewHiddenAt && <p>{t('req.hidden')}</p>}
    {editable ? <form onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <label>{t('req.rating')}<select value={rating} onChange={e => setRating(Number(e.target.value))}>{[1,2,3,4,5].map(v => <option key={v} value={v}>{v} ★</option>)}</select></label>
      {!row.reviewHiddenAt && <label>{t('req.comment')}<textarea value={comment} onChange={e => setComment(e.target.value)} /></label>}
      <RoomsButton type="submit" disabled={save.isPending}>{t('req.save')}</RoomsButton>
    </form> : <p>{row.reviewRating} ★ {row.reviewComment}</p>}
    {save.isError && <FormError>{save.error.message}</FormError>}
  </section>
}

function Details({ row }: { row: TenantRequest }) {
  const { t } = useI18n()
  const { key } = useMyRequests()
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: key })
  const action = useMutation({ mutationFn: (name: 'cancel' | 'confirm' | 'reopen') => changeRequest(row.id, name), onSuccess: refresh })
  const history: [TenantRequest['status'], string | null][] = [['PENDING', row.createdAt], ['ESCALATED', row.escalatedAt], ['RESOLVED', row.resolvedAt], ['CLOSED', row.closedAt]]
  return <article><h2>{row.title}</h2><p>{t(`req.${row.type}`)} · {t(`req.${row.status}`)}</p>
    {row.type === 'RENEW' && row.payload.contractId && <Link to={'/thue/hop-dong/' + row.payload.contractId}>{t('nav.contracts')}</Link>}
    {row.description && <p>{row.description}</p>}{row.decisionNote && <p>{row.decisionNote}</p>}
    {row.photos?.map(photo => <img key={photo.publicId} src={photo.url} alt={t('req.photos')} loading="lazy" width="120" />)}
    {row.cost != null && <p>{t('req.cost')}: {formatMoney(row.cost)}</p>}
    {row.payload?.plannedMoveOutDate && <p>{t('req.end')}: {formatDate(row.payload.plannedMoveOutDate)}</p>}
    {row.payload?.endDate && <p>{t('req.early', { date: formatDate(row.payload.endDate) })}</p>}
    {row.payload?.remainingRent != null && <p>{t('req.remaining')}: {formatMoney(row.payload.remainingRent)}</p>}
    <h3>{t('req.timeline')}</h3><ol>{history.filter(([,date]) => date).map(([status,date]) => <li key={status}>{t(`req.${status}`)} · {formatDate(hanoiDate.format(new Date(date!)))}</li>)}
      {!history.some(([status,date]) => status === row.status && date) && <li>{t(`req.${row.status}`)}</li>}</ol>
    {row.status === 'PENDING' && <RoomsButton disabled={action.isPending} onClick={() => action.mutate('cancel')}>{t('req.cancel')}</RoomsButton>}
    {row.type === 'INCIDENT' && row.status === 'RESOLVED' && <div className="contracts-actions">
      <RoomsButton disabled={action.isPending} onClick={() => action.mutate('confirm')}>{t('req.confirm')}</RoomsButton>
      <RoomsButton disabled={action.isPending} onClick={() => action.mutate('reopen')}>{t('req.reopen')}</RoomsButton></div>}
    {action.isError && <FormError>{action.error.message}</FormError>}
    {row.type === 'INCIDENT' && row.status === 'CLOSED' && <IncidentReview key={row.reviewUpdatedAt ?? row.reviewAt ?? row.id} row={row} refresh={refresh} />}
  </article>
}

function NewIncident() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [selected, setSelected] = useState(0)
  const contracts = useQuery({ queryKey: ['my-contracts', 'overview', authScopeKey(user)], queryFn: () => allPages(page => listMyContracts(page, 100)) })
  const active = contracts.data?.filter(c => c.status === 'ACTIVE') ?? []
  const id = active.find(c => c.id === selected)?.id ?? active[0]?.id
  return <section>{contracts.isPending && <Spinner label={t('contracts.loading')} />}
    {contracts.isError && <><FormError>{contracts.error.message}</FormError><RoomsButton onClick={() => void contracts.refetch()}>{t('contracts.retry')}</RoomsButton></>}
    {contracts.isSuccess && !id && <p>{t('req.noneActive')}</p>}
    {id && <><label>{t('contracts.chooseRoom')}<select value={id} onChange={e => setSelected(Number(e.target.value))}>{active.map(c => <option key={c.id} value={c.id}>{c.building.name} · {c.room.code}</option>)}</select></label>
      <TenantRequestForm key={id} type="INCIDENT" contractId={id} /></>}
  </section>
}
export function TenantRequestsPage() {
  const { t } = useI18n()
  const { id } = useParams()
  const { query } = useMyRequests()
  const [filter, setFilter] = useState('')
  const [create, setCreate] = useState(false)
  const rows = query.data?.filter(row => !filter || row.type === filter) ?? []
  const detail = query.data?.find(row => row.id === Number(id))
  return <><SectionHeading>{t(id ? 'nav.requestDetail' : 'nav.requests')}</SectionHeading>
    {id && <Link to="/thue/yeu-cau">{t('nav.requests')}</Link>}
    {query.isPending && <Spinner label={t('contracts.loading')} />}
    {query.isError && <><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></>}
    {query.isSuccess && (id ? detail ? <Details key={id} row={detail} /> : <FormError>{t('req.missing')}</FormError> : <>
      <RoomsButton onClick={() => setCreate(!create)}>{t('req.INCIDENT')}</RoomsButton>{create && <NewIncident />}
      <select value={filter} aria-label={t('req.all')} onChange={e => setFilter(e.target.value)}><option value="">{t('req.all')}</option>
        {(Object.keys(requestTypes) as TenantRequest['type'][]).map(type => <option key={type} value={type}>{t(`req.${type}`)}</option>)}</select>
      {!rows.length && <p>{t('req.empty')}</p>}<ul>{rows.map(row => <li key={row.id}><Link to={'/thue/yeu-cau/' + row.id}>{row.title}</Link> · {t(`req.${row.status}`)}</li>)}</ul>
    </>)}
  </>
}
