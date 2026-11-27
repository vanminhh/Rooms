import { ApiError, apiRequest } from '../../shared/api'

// CHAT-01, A-29: the BE takes 1–20 alternating messages of at most 500 characters.
export const CHAT_MAX_MESSAGES = 20
export const CHAT_MAX_CHARS = 500

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Shown in this tab only (CHAT-11); never sent again with later questions. */
  imageUrl?: string
}

// CHAT-11: one image per question; the browser shrinks it before it is sent.
export interface ChatImage { mediaType: 'image/jpeg'; data: string }
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CHAT_IMAGE_FILE_MAX = 5 * 1024 * 1024
const CHAT_IMAGE_EDGE = 1568

export function pickImageError(file: { type: string; size: number }): 'chat.imageType' | 'chat.imageTooBig' | null {
  if (!CHAT_IMAGE_TYPES.includes(file.type)) return 'chat.imageType'
  return file.size > CHAT_IMAGE_FILE_MAX ? 'chat.imageTooBig' : null
}

// Long edge at most 1568 px, JPEG 0.85: a few hundred kB, well under the BE cap of 1.5 MB.
export async function prepareImage(file: Blob): Promise<ChatImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, CHAT_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

export const imageSrc = (image: ChatImage) => `data:${image.mediaType};base64,${image.data}`

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

// History goes as text only; the image (if any) belongs to the last question (CHAT-11).
export function sendChat(messages: ChatMessage[], roomId?: number, image?: ChatImage, signal?: AbortSignal): Promise<{ reply: string }> {
  const body = {
    messages: messages.map(({ role, content }) => ({ role, content })),
    ...(roomId === undefined ? {} : { roomId }),
    ...(image ? { image } : {}),
  }
  return apiRequest<{ reply: string }>('/public/chat', { method: 'POST', body, signal })
}

// '/phong/12' -> 12, so the bot knows which room page the visitor is on (CHAT-01).
export function roomIdOfPath(pathname: string): number | undefined {
  const match = /^\/phong\/(\d{1,10})\/?$/.exec(pathname)
  const id = match ? Number(match[1]) : 0
  return id >= 1 && id <= 2147483647 ? id : undefined
}

// CHAT-03 / CHAT-06: busy and limit messages also point to the building's phone.
export function chatErrorKey(error: unknown): 'chat.busy' | 'chat.limit' | 'chat.failed' {
  if (error instanceof ApiError && error.code === 'CHAT_UNAVAILABLE') return 'chat.busy'
  if (error instanceof ApiError && error.code === 'TOO_MANY_REQUESTS') return 'chat.limit'
  return 'chat.failed'
}

// Room links in a reply ("/phong/12") become clickable; everything else stays plain text.
export function splitRoomLinks(text: string): { text: string; href?: string }[] {
  return text.split(/(\/phong\/\d+)/).filter(Boolean).map(part => (/^\/phong\/\d+$/.test(part) ? { text: part, href: part } : { text: part }))
}

// CHAT-10: the distinct rooms a reply links to, in order, at most 3 (one card each).
export function roomIdsOfReply(text: string): number[] {
  const ids = splitRoomLinks(text).flatMap(part => (part.href ? [roomIdOfPath(part.href)] : [])).filter((id): id is number => id !== undefined)
  return [...new Set(ids)].slice(0, 3)
}
