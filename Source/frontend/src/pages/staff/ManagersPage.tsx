import { useEffect, useRef, useState } from 'react'
import { RoomsButton, SectionHeading } from '../../components'
import { ManagerForm } from '../../features/managers/ManagerForm'
import type { IssuedPassword } from '../../features/managers/ManagerForm'
import { ManagerList } from '../../features/managers/ManagerList'
import '../../features/managers/managers.css'

// The temporary password is shown once; closing or leaving the page drops it from memory (AUTH-08).
function IssuedPasswordNotice({ issued, onClose }: { issued: IssuedPassword; onClose(): void }) {
  const ref = useRef<HTMLElement>(null)
  // Focus moves here because the form's submit button unmounts when the account is created.
  useEffect(() => { ref.current?.focus() }, [])
  return <section ref={ref} tabIndex={-1} className="managers-issued" aria-label="Mật khẩu tạm">
    <p>Đã tạo tài khoản cho <strong>{issued.fullName}</strong>. Mật khẩu tạm:</p>
    <p className="managers-password">{issued.password}</p>
    <p>Mật khẩu chỉ hiển thị một lần. Ghi lại hoặc gửi cho quản lý trước khi đóng; quản lý phải đổi mật khẩu ở lần đăng nhập đầu.</p>
    <RoomsButton variant="sand" onClick={onClose}>Đã ghi lại, đóng</RoomsButton>
  </section>
}

// Boss-only staff page (AUTH-08); the route guard blocks managers who type the URL (AUTH-06).
export function ManagersPage() {
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<IssuedPassword | null>(null)

  return <>
    <SectionHeading>Nhân sự</SectionHeading>
    <div className="managers-toolbar">
      <RoomsButton disabled={creating} onClick={() => { setIssued(null); setCreating(true) }}>Thêm quản lý</RoomsButton>
    </div>
    {creating && <ManagerForm onCreated={next => { setCreating(false); setIssued(next) }} onCancel={() => setCreating(false)} />}
    {issued && <IssuedPasswordNotice issued={issued} onClose={() => setIssued(null)} />}
    <ManagerList />
  </>
}
