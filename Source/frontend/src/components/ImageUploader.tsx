import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { RoomsButton } from './Button'
import { FormError, Spinner } from './FormFields'

export type ImageUploaderProps = {
  images: { id: number; url: string; alt: string }[]
  maxImages: number
  maxBytes: number
  accept: string // comma-separated MIME types, e.g. "image/jpeg,image/png"
  onUpload(file: File): Promise<void>
  onDelete(id: number): Promise<void>
  onReorder?(ids: number[]): Promise<void>
}

// Size and type are checked here, before onUpload, so a rejected file never starts an upload.
export function ImageUploader({ images, maxImages, maxBytes, accept, onUpload, onDelete, onReorder }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canAdd = images.length < maxImages
  const limitMb = maxBytes / 1_000_000

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Thao tác chưa thành công, thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !canAdd) return
    if (!accept.split(',').map(type => type.trim()).includes(file.type)) {
      setError('Ảnh không đúng định dạng cho phép.')
      return
    }
    if (file.size > maxBytes) {
      setError(`Ảnh vượt quá ${limitMb} MB, hãy chọn ảnh nhỏ hơn.`)
      return
    }
    void run(() => onUpload(file))
  }

  const move = (index: number, step: -1 | 1) => {
    if (!onReorder) return
    const ids = images.map(image => image.id)
    const other = index + step
    const swapped = [...ids]
    swapped[index] = ids[other]
    swapped[other] = ids[index]
    void run(() => onReorder(swapped))
  }

  return <div className="rooms-uploader">
    <div className="rooms-uploader-head">
      <p className="rooms-uploader-hint">{images.length}/{maxImages} ảnh · mỗi ảnh tối đa {limitMb} MB</p>
      <RoomsButton variant="outline" disabled={!canAdd || busy} onClick={() => inputRef.current?.click()}>Thêm ảnh</RoomsButton>
    </div>
    <input ref={inputRef} type="file" accept={accept} className="rooms-visually-hidden" tabIndex={-1} aria-label="Chọn ảnh tải lên" disabled={!canAdd || busy} onChange={pick} />
    {!canAdd && <p className="rooms-uploader-hint">Đã đủ {maxImages} ảnh. Xóa bớt ảnh để thêm ảnh mới.</p>}
    {busy && <Spinner label="Đang xử lý ảnh" />}
    <FormError>{error}</FormError>
    {images.length === 0
      ? <p className="rooms-empty">Chưa có ảnh. Bấm “Thêm ảnh” để tải ảnh lên.</p>
      : <ol className="rooms-uploader-list">
        {images.map((image, index) => <li key={image.id} className="rooms-uploader-item">
          <img src={image.url} alt={image.alt || `Ảnh ${index + 1}`} />
          <div className="rooms-uploader-actions">
            {onReorder && <>
              <RoomsButton variant="sand" aria-label={`Chuyển ảnh ${index + 1} lên trước`} disabled={busy || index === 0} onClick={() => move(index, -1)}>Lên</RoomsButton>
              <RoomsButton variant="sand" aria-label={`Chuyển ảnh ${index + 1} xuống sau`} disabled={busy || index === images.length - 1} onClick={() => move(index, 1)}>Xuống</RoomsButton>
            </>}
            <RoomsButton variant="outline" aria-label={`Xóa ảnh ${index + 1}`} disabled={busy} onClick={() => void run(() => onDelete(image.id))}>Xóa</RoomsButton>
          </div>
        </li>)}
      </ol>}
  </div>
}
