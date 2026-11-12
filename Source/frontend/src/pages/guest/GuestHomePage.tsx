import { SectionHeading } from '../../components'

// /toi (VIEW-20). The list of viewings comes with EX-7; until then only the empty state is shown.
// The link is a plain anchor styled as the kit button: GuestLayout keeps internal anchors inside the SPA.
export function GuestHomePage() {
  return <>
    <SectionHeading>Lịch hẹn của tôi</SectionHeading>
    <p>Bạn chưa có lịch hẹn xem phòng nào.</p>
    <a className="rooms-button rooms-button--primary" href="/phong">Tìm phòng</a>
  </>
}
