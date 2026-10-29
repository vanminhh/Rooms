import { Link } from 'react-router'
import { SectionHeading } from '../../components'

export function NotFoundPage() {
  return <>
    <SectionHeading>Không tìm thấy trang</SectionHeading>
    <p><Link to="/">Về trang chủ</Link></p>
  </>
}
