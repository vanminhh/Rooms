import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth, authScopeKey } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner } from '../../components'
import { useI18n } from '../../shared/i18n'
import { t as translate } from '../../shared/i18n/core'
import { ApiError } from '../../shared/api'
import type { ContractPrintData } from './types'
import './contracts.css'

export function ContractPrintView({ load, tenant = false }: { load(id: number): Promise<ContractPrintData>; tenant?: boolean }) {
  const { id: raw } = useParams()
  const id = Number(raw)
  const { user } = useAuth()
  const { t } = useI18n()
  const valid = Number.isInteger(id) && id > 0
  const query = useQuery({ queryKey: [tenant ? 'my-contracts' : 'contracts', 'print', authScopeKey(user), id], queryFn: () => load(id), enabled: valid, gcTime: 0 })
  return <section className="contracts-print">
    <div className="contracts-print-toolbar"><SectionHeading>{t('contracts.printTitle')}</SectionHeading>
      <Link to={`${tenant ? '/thue' : '/ql'}/hop-dong/${id}`}>{t('contracts.details')}</Link>
      {query.isSuccess && <RoomsButton type="button" onClick={() => window.print()}>{t('contracts.print')}</RoomsButton>}
    </div>
    {!valid || (query.isError && query.error instanceof ApiError && query.error.status === 404) ? <FormError>{t('contracts.notFound')}</FormError> : <>
      {query.isPending && <Spinner block label={t('contracts.loading')} />}
      {query.isError && <div className="contracts-print-toolbar"><FormError>{query.error.message}</FormError><RoomsButton onClick={() => void query.refetch()}>{t('contracts.retry')}</RoomsButton></div>}
      {query.isSuccess && <ElevatedCard className="contracts-print-paper">
        {query.data.isDraft && <p className="contracts-draft" lang="vi">{translate('contracts.printDraft', undefined, 'vi')}</p>}
        <pre lang="vi">{query.data.content}</pre>
      </ElevatedCard>}
    </>}
  </section>
}
