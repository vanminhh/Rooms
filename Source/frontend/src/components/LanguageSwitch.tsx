import './Navigation.css'

export function LanguageSwitch({ value, onChange, viLabel, enLabel, groupLabel }: {
  value: 'vi' | 'en'
  onChange: (next: 'vi' | 'en') => void
  viLabel: string
  enLabel: string
  groupLabel: string
}) {
  return <div className="rooms-language-switch" role="group" aria-label={groupLabel}>
    <button type="button" aria-pressed={value === 'vi'} onClick={() => onChange('vi')}>{viLabel}</button>
    <button type="button" aria-pressed={value === 'en'} onClick={() => onChange('en')}>{enLabel}</button>
  </div>
}
