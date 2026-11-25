import { lazy, Suspense, type ComponentProps } from 'react'

const Chart = lazy(() => import('./ReportChart').then(module => ({ default: module.ReportChart })))

export function LazyReportChart(props: ComponentProps<typeof Chart>) {
  return <Suspense fallback={<p role="status">{props.title}…</p>}><Chart {...props} /></Suspense>
}
