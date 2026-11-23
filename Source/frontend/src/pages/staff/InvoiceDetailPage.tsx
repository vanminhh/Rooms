import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { authScopeKey, useAuth } from '../../app/auth-context'
import { ElevatedCard, FormError, RoomsButton, SectionHeading, Spinner, StatusBadge } from '../../components'
import { CopyButton } from '../../features/contracts/ContractDocuments'
import { getInvoice } from '../../features/invoices/api'
import { IssueAction, PaymentAction, ReissueAction, RemindAction } from '../../features/invoices/InvoiceActions'
import { invoiceLabel, invoiceTypeLabels, paymentMethodLabels } from '../../features/invoices/status'
import type { InvoiceDetail } from '../../features/invoices/types'
import { formatDate, formatMoney } from '../../shared/formatters'
import '../../features/invoices/invoices.css'

// BIL-07, BIL-09: the lines and the total exactly as the BE sends them (UI-06).
export function InvoiceLines({ invoice }: { invoice: Pick<InvoiceDetail, 'lines' | 'total'> }) {
  return <div className="invoices-table-wrap"><table className="invoices-lines">
    <thead><tr><th>Khoản</th><th className="invoices-num">Số lượng</th><th className="invoices-num">Đơn giá</th><th className="invoices-num">Thành tiền</th></tr></thead>
    <tbody>{invoice.lines.map((line, index) => <tr key={index}><td>{line.label}</td><td className="invoices-num">{line.quantity}</td>
      <td className="invoices-num">{formatMoney(line.unitPrice)}</td><td className="invoices-num">{formatMoney(line.amount)}</td></tr>)}</tbody>
    <tfoot><tr><th colSpan={3}>Tổng cộng</th><th className="invoices-num">{formatMoney(invoice.total)}</th></tr></tfoot>
  </table></div>
}

function Detail({ invoice }: { invoice: InvoiceDetail }) {
  const status = invoiceLabel(invoice)
  return <div className="invoices-detail">
    <ElevatedCard className="invoices-card">
      <div className="invoices-card-head"><h2>{invoice.code} · {invoiceTypeLabels[invoice.type]}</h2><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
      <dl className="invoices-facts">
        <div><dt>Hợp đồng</dt><dd><Link to={`/ql/hop-dong/${invoice.contract.id}`}>{invoice.contract.code}</Link></dd></div>
        <div><dt>Phòng</dt><dd>{invoice.contract.room.code} · {invoice.contract.building.name}</dd></div>
        {invoice.contract.tenant && <div><dt>Người thuê</dt><dd>{invoice.contract.tenant.fullName} · {invoice.contract.tenant.phone}</dd></div>}
        {invoice.periodStart && invoice.periodEnd && <div><dt>Kỳ</dt><dd>{formatDate(invoice.periodStart)}–{formatDate(invoice.periodEnd)}</dd></div>}
        <div><dt>Ngày phát hành</dt><dd>{invoice.issueDate ? formatDate(invoice.issueDate) : '—'}</dd></div>
        <div><dt>Hạn thanh toán</dt><dd>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</dd></div>
      </dl>
      {invoice.status === 'CANCELLED' && <p>Đã hủy: {invoice.cancelReason}{invoice.replacedById && <> · <Link to={`/ql/hoa-don/${invoice.replacedById}`}>Đã được lập lại thành TT{invoice.replacedById}</Link></>}</p>}
      {invoice.replacesId && <p><Link to={`/ql/hoa-don/${invoice.replacesId}`}>Lập lại từ TT{invoice.replacesId}</Link></p>}
      {invoice.payment && <p>Đã thu {formatMoney(invoice.payment.amount)} bằng {paymentMethodLabels[invoice.payment.method]} lúc {new Date(invoice.payment.paidAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p>}
    </ElevatedCard>
    <ElevatedCard className="invoices-card"><h2>Các khoản</h2>{invoice.lines.length ? <InvoiceLines invoice={invoice} /> : <p>Hóa đơn nháp, chờ chỉ số.</p>}</ElevatedCard>
    {invoice.meterReadings.length > 0 && <ElevatedCard className="invoices-card"><h2>Chỉ số chốt</h2>
      <dl className="invoices-facts">{invoice.meterReadings.map(reading => <div key={reading.id}>
        <dt>{reading.kind === 'ELECTRIC' ? 'Điện' : 'Nước'} · {formatDate(reading.readOn)}</dt>
        <dd>{reading.value}{reading.isMeterReplaced && ` (thay đồng hồ, số cuối đồng hồ cũ ${reading.oldMeterFinal})`}</dd>
        {reading.photoUrl && <img className="invoices-photo" src={reading.photoUrl} alt={`Ảnh đồng hồ ${reading.kind === 'ELECTRIC' ? 'điện' : 'nước'} ngày ${formatDate(reading.readOn)}`} />}
      </div>)}</dl></ElevatedCard>}
    {invoice.status === 'UNPAID' && invoice.vietqr && <ElevatedCard className="invoices-card"><h2>VietQR</h2>
      {invoice.qrImageUrl && <img className="invoices-qr" src={invoice.qrImageUrl} alt={`Mã VietQR thanh toán ${invoice.code}`} />}
      <p>Tài khoản: {invoice.vietqr.accountNo} · {invoice.vietqr.accountName}</p>
      <p>Nội dung chuyển khoản: <strong>{invoice.vietqr.content}</strong></p><CopyButton value={invoice.vietqr.content} />
    </ElevatedCard>}
    {invoice.status === 'DRAFT' && <IssueAction invoice={invoice} />}
    {invoice.status === 'UNPAID' && <><PaymentAction invoice={invoice} /><RemindAction invoice={invoice} /></>}
    {invoice.type === 'MONTHLY' && (invoice.status === 'DRAFT' || invoice.status === 'UNPAID') && <ReissueAction invoice={invoice} />}
  </div>
}

function InvoiceView({ id, scope }: { id: number; scope: string }) {
  const query = useQuery({ queryKey: ['invoices', 'detail', scope, id], queryFn: () => getInvoice(id) })
  if (query.isPending) return <Spinner block label="Đang tải hóa đơn" />
  if (query.isError) return <div className="invoices-state"><FormError>{query.error.message}</FormError><RoomsButton type="button" onClick={() => void query.refetch()}>Thử lại</RoomsButton></div>
  return <Detail invoice={query.data} />
}

// BE-P4-18..22 · BIL-08, BIL-10..12, UI-04, UI-06.
export function InvoiceDetailPage() {
  const { user } = useAuth()
  const { id } = useParams()
  const scope = authScopeKey(user)
  return <>
    <SectionHeading>Chi tiết hóa đơn</SectionHeading>
    <Link to="/ql/hoa-don">Danh sách hóa đơn</Link>
    {Number.isInteger(Number(id)) && Number(id) >= 1 ? <InvoiceView key={`${scope}:${id}`} id={Number(id)} scope={scope} /> : <FormError>Không tìm thấy hóa đơn.</FormError>}
  </>
}
