import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FormError, ImageUploader, RoomsButton, Spinner } from '../../components'
import { attachRoomImage, deleteRoomImage, getRoom, reorderRoomImages } from './api'
import { ROOM_IMAGE_MAX_BYTES, ROOM_IMAGE_TYPES, assertRoomImageFile, signUpload, uploadToCloudinary } from './upload'

const MAX_ROOM_IMAGES = 10

// Gallery of one room (ROOM-07, UI-10). Images come from GET /rooms/:id, the same cache entry as the inspector.
export function RoomImages({ roomId }: { roomId: number }) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['rooms', 'detail', roomId], queryFn: () => getRoom(roomId) })

  // Every change refetches the rooms, so the gallery shows what the server kept, also after a 409.
  async function change(action: () => Promise<unknown>) {
    try {
      await action()
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['rooms'] })
    }
  }

  if (detail.isPending) return <Spinner label="Đang tải ảnh phòng" />
  if (detail.isError) return <div className="staff-room-state">
    <FormError>{detail.error.message}</FormError>
    <RoomsButton variant="sand" onClick={() => void detail.refetch()}>Thử lại</RoomsButton>
  </div>
  // A 200 with a payload that is not a RoomView must not crash the inspector: show an empty gallery instead.
  const images = Array.isArray(detail.data?.images) ? detail.data.images : []
  return <section aria-label="Ảnh phòng">
    <ImageUploader
      images={images.map(image => ({ id: image.id, url: image.url, alt: '' }))}
      maxImages={MAX_ROOM_IMAGES}
      maxBytes={ROOM_IMAGE_MAX_BYTES}
      accept={ROOM_IMAGE_TYPES.join(',')}
      onUpload={file => change(async () => {
        assertRoomImageFile(file)
        const signed = await signUpload(roomId)
        await attachRoomImage(roomId, await uploadToCloudinary(signed, file))
      })}
      onDelete={id => change(() => deleteRoomImage(roomId, id))}
      onReorder={ids => change(() => reorderRoomImages(roomId, ids))}
    />
  </section>
}
