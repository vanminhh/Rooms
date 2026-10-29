import { SectionHeading } from '../../components'
import { useAuth } from '../../app/auth-context'

export function TenantHomePage() {
  const { user } = useAuth()
  return <>
    <SectionHeading>Tổng quan</SectionHeading>
    {user && <p>Xin chào, {user.fullName}</p>}
  </>
}
