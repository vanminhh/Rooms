import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../app/auth-context'

// Leave the page before clearing the user, so the guard does not add /dang-nhap?next=...
export function useSignOut(): { signOut: () => Promise<void>; signingOut: boolean } {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    navigate('/', { replace: true })
    await logout()
  }

  return { signOut, signingOut }
}
