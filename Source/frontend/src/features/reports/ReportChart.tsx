import { useId } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './report-chart.css'

const colors = ['var(--rooms-ink)', 'var(--rooms-gold)', 'var(--rooms-error)']
type Series = { key: string; label: string; kind: 'bar' | 'line' }
type ChartProps = { title: string } & (
  | { kind: 'ring'; slices: { label: string; value: number }[] }
  | { kind: 'series'; rows: Record<string, string | number>[]; category: string; series: Series[]; format: (value: number) => string }
)
const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })

export function ReportChart(props: ChartProps) {
  const caption = useId()
  const legend = props.kind === 'ring' ? props.slices : props.series
  return <figure className="report-chart" aria-labelledby={caption}>
    <figcaption id={caption}>{props.title}</figcaption>
    <ResponsiveContainer width="100%" height={props.kind === 'ring' ? 168 : 240} minWidth={0}>
      {props.kind === 'ring' ? <PieChart accessibilityLayer>
        <Pie data={props.slices} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="90%" isAnimationActive={false}>
          {props.slices.map((s, i) => <Cell key={s.label} fill={colors[i % colors.length]} />)}
        </Pie><Tooltip />
      </PieChart> : <ComposedChart data={props.rows} accessibilityLayer margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--rooms-line)" />
        <XAxis dataKey={props.category} minTickGap={16} tick={{ fill: 'var(--rooms-text)', fontSize: 12 }} />
        <YAxis width={52} tickFormatter={v => compact.format(Number(v))} tick={{ fill: 'var(--rooms-text)', fontSize: 12 }} />
        <Tooltip formatter={v => props.format(Number(v))} />
        {props.series.map((s, i) => s.kind === 'line'
          ? <Line key={s.key} dataKey={s.key} name={s.label} stroke={colors[i % colors.length]} strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
          : <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i % colors.length]} maxBarSize={48} isAnimationActive={false} />)}
      </ComposedChart>}
    </ResponsiveContainer>
    <ul aria-label={props.title}>{legend.map((s, i) => <li key={s.label}>
      <span aria-hidden="true" style={{ background: colors[i % colors.length] }} />{s.label}{'value' in s && ' · ' + s.value}
    </li>)}</ul>
  </figure>
}
