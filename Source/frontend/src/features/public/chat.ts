import { ApiError, apiRequest } from '../../shared/api'

// CHAT-01, A-28: the BE takes 1–20 alternating messages of at most 500 characters.
export const CHAT_MAX_MESSAGES = 20
export const CHAT_MAX_CHARS = 500

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function sendChat(messages: ChatMessage[], roomId?: number): Promise<{ reply: string }> {
  return apiRequest<{ reply: string }>('/public/chat', { method: 'POST', body: roomId === undefined ? { messages } : { messages, roomId } })
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
