import { SectionHeading } from '../../components'
import { useAuth } from '../../app/auth-context'

export function StaffHomePage() {
  const { user } = useAuth()
  return <>
    <SectionHeading>Việc hôm nay</SectionHeading>
    {user && <p>Xin chào, {user.fullName}</p>}
  </>
}
