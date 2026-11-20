import { useEffect, useRef, useState } from 'react'
import { FormError, RoomsButton, Spinner } from '../../components'
import { ApiError } from '../../shared/api'
import { useI18n } from '../../shared/i18n'
import { UPLOAD_FILE_TYPES, signUpload, signMyIdPhotoUpload, uploadToCloudinary, type PrivateUploadPurpose } from '../rooms/upload'
import type { ContractAsset, SignedDocument } from './types'

export function CopyButton({ value }: { value: string }) {
  const { t } = useI18n()
  const [message, setMessage] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(value); setMessage(t('contracts.copied')) }
    catch { setMessage(t('contracts.copyFailed')) }
  }
  return <><RoomsButton type="button" variant="outline" onClick={() => void copy()}>{t('contracts.copy')}</RoomsButton>{message && <span role="status">{message}</span>}</>
}

// URLs stay in this mounted viewer, never in QueryClient/storage. Closing invalidates a late response.
export function DocumentAccess({ label, load }: { label: string; load: () => Promise<{ label: string; document: SignedDocument }[]> }) {
  const { t } = useI18n()
  const [documents, setDocuments] = useState<{ label: string; document: SignedDocument }[]>([])
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const revision = useRef(0)
  const inFlight = useRef(false)
  useEffect(() => () => { revision.current++ }, [])
  useEffect(() => {
    if (!documents.length) return
    const remaining = Math.min(300_000, ...documents.map(item => Date.parse(item.document.expiresAt) - Date.now()))
    const timer = setTimeout(() => { setDocuments([]); setMessage(t('contracts.expired')) }, Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [documents, t])
  async function open() {
    if (inFlight.current) return
    inFlight.current = true; setPending(true); setDocuments([]); setMessage('')
    const current = ++revision.current
    try {
      const result = await load()
      if (current !== revision.current) return
      const valid = result.filter(item => Number.isFinite(Date.parse(item.document.expiresAt)) && Date.parse(item.document.expiresAt) > Date.now())
      setDocuments(valid)
      if (!valid.length) setMessage(t('contracts.noDocument'))
    } catch (cause) { if (current === revision.current) setMessage(cause instanceof ApiError ? cause.message : t('common.apiGeneric')) }
    finally { inFlight.current = false; if (current === revision.current) setPending(false) }
  }
  return <div className="contracts-private-document">
    <RoomsButton type="button" variant="outline" disabled={pending} onClick={() => void open()}>{pending ? t('contracts.loadingDocument') : label}</RoomsButton>
    {documents.length > 0 && <div className="contracts-actions">{documents.map(item => <a key={item.label} href={item.document.url} target="_blank" rel="noopener noreferrer">{item.label} · {t('contracts.openDocument')}</a>)}
      <RoomsButton type="button" variant="outline" onClick={() => { revision.current++; setDocuments([]) }}>{t('contracts.closeDocument')}</RoomsButton></div>}
    {message && <p role="status">{message}</p>}
  </div>
}

export function PrivateUploadField({ contractId, purpose, label, value, onChange, onBusy, tenant = false }: {
  contractId: number; purpose: PrivateUploadPurpose; label: string; value?: ContractAsset | null;
  onChange(value: ContractAsset | null): void; onBusy?(busy: boolean): void; tenant?: boolean;
}) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const revision = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => { revision.current++ }, [])
  async function upload(file: File) {
    const current = ++revision.current
    onChange(null); setError('')
    if (!UPLOAD_FILE_TYPES[purpose].includes(file.type)) { setError(t(purpose === 'ID_PHOTO' ? 'contracts.idFileType' : 'contracts.scanFileType')); return }
    setPending(true); onBusy?.(true)
    try {
      const signed = tenant ? await signMyIdPhotoUpload(contractId) : await signUpload(contractId, purpose)
      const asset = await uploadToCloudinary(signed, file)
      if (current === revision.current) onChange(asset)
    } catch (cause) { if (current === revision.current) setError(cause instanceof ApiError ? cause.message : t('contracts.uploadFailed')) }
    finally { if (current === revision.current) { setPending(false); onBusy?.(false) } }
  }
  return <div className="rooms-field">
    <label className="rooms-field-label">{label}<input ref={fileInput} className="rooms-field-input" type="file" accept={UPLOAD_FILE_TYPES[purpose].join(',')} disabled={pending} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file) }} /></label>
    {pending && <Spinner label={t('contracts.uploading')} />}
    {value && <><p role="status">{t('contracts.uploaded')}</p><RoomsButton type="button" variant="outline" onClick={() => { revision.current++; onChange(null); if (fileInput.current) fileInput.current.value = '' }}>{t('contracts.removeUpload')}</RoomsButton></>}
    {error && <FormError>{error}</FormError>}
  </div>
}
