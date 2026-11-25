import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { FormError, RoomsButton, Spinner } from '../../components'
import { useI18n } from '../../shared/i18n'
import { apiRequest } from '../../shared/api'
import { formatDate } from '../../shared/formatters'
import { listMyNotifications } from '../notifications/api'
import { LazyReportChart } from '../reports/LazyReportChart'
import { useMyRequests } from './tenant-api'

interface Period { periodNo: number; periodStart: string | null; electricKwh: number | null; waterM3: number | null }
export function TenantOperationsOverview({ scope, contractId }: { scope: string; contractId?: number }) {
  const { t } = useI18n()
  const { query: requests } = useMyRequests()
  const inbox = useQuery({ queryKey: ['notifications', 'me', scope], queryFn: listMyNotifications })
  const usage = useQuery({ queryKey: ['my-consumption', scope, contractId], enabled: !!contractId,
    queryFn: () => apiRequest<Period[]>('/me/consumption?contractId=' + contractId + '&periods=6') })
  const rows = usage.data?.map(p => ({ ...p, label: p.periodStart ? formatDate(p.periodStart) : String(p.periodNo) })) ?? []
  return <section className="contracts-list">
    {inbox.data && <Link to="/thue/thong-bao">{t('inbox.unread', { count: inbox.data.unreadCount })}</Link>}
    {requests.data && <Link to="/thue/yeu-cau">{t('req.open', { count: requests.data.filter(r => ['PENDING', 'IN_PROGRESS', 'ESCALATED'].includes(r.status) || (r.type === 'INCIDENT' && r.status === 'RESOLVED')).length })}</Link>}
    {[inbox, requests, usage].map((q, i) => q.isError && <div key={i}><FormError>{q.error.message}</FormError><RoomsButton onClick={() => void q.refetch()}>{t('contracts.retry')}</RoomsButton></div>)}
    {(inbox.isPending || requests.isPending || !!contractId && usage.isPending) && <Spinner label={t('contracts.loading')} />}
    {usage.isSuccess && !rows.length && <p>{t('req.noPeriods')}</p>}
    {rows.length > 0 && (['electricKwh','waterM3'] as const).map(key => {
      const label = t(key === 'electricKwh' ? 'req.electric' : 'req.water')
      return <LazyReportChart key={key} kind="series" title={label} rows={rows} category="label" series={[{ key, label, kind: 'bar' }]} format={value => value.toLocaleString('vi-VN')} />
    })}
  </section>
}
