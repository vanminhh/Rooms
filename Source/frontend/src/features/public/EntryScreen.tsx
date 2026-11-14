import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ElevatedCard, RoomsButton } from '../../components'
import { useI18n } from '../../shared/i18n'
import './entry-screen.css'

// Mounted only by the home page. The destination's existing guard owns access checks.
export function EntryScreen() {
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()
  const { t } = useI18n()

  if (!open) return null

  function choose(path: '/' | '/thue' | '/ql') {
    setOpen(false)
    if (path !== '/') navigate(path)
  }

  return <div className="rooms-dialog-backdrop public-entry">
    <ElevatedCard className="public-entry-card" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <h2 id="entry-title">{t('entry.title')}</h2>
      <div className="public-entry-choices">
        <RoomsButton onClick={() => choose('/')}>{t('entry.findRoom')}</RoomsButton>
        <RoomsButton variant="outline" onClick={() => choose('/thue')}>{t('entry.tenant')}</RoomsButton>
        <RoomsButton variant="outline" onClick={() => choose('/ql')}>{t('entry.staff')}</RoomsButton>
      </div>
    </ElevatedCard>
  </div>
}
