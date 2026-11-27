import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { formatMoney } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import { getPublicRoom, publicQueryKeys } from './api'
import type { PublicRoomDetail } from './api'
import {
  CHAT_IMAGE_TYPES, CHAT_MAX_CHARS, CHAT_MAX_MESSAGES, chatErrorKey, imageSrc, isAbortError, pickImageError, prepareImage,
  roomIdsOfReply, sendChat, splitRoomLinks,
} from './chat'
import type { ChatImage, ChatMessage } from './chat'
import './chat-widget.css'

const GENERAL_SUGGESTIONS = ['chat.suggest.cheap', 'chat.suggest.areas', 'chat.suggest.pets', 'chat.suggest.booking'] as const
const ROOM_SUGGESTIONS = ['chat.suggest.roomCost', 'chat.suggest.roomUtilities', 'chat.suggest.roomBooking'] as const
type ImageErrorKey = 'chat.imageType' | 'chat.imageTooBig' | 'chat.imageBad'

// CHAT-10: a room the bot linked, from the same public query the room page uses (shared cache). No card if it fails.
function ChatRoomCard({ roomId }: { roomId: number }) {
  const { lang, t } = useI18n()
  const room = useQuery({ queryKey: [...publicQueryKeys.room(roomId), lang], queryFn: () => getPublicRoom(roomId), retry: false })
  if (!room.data) return null
  const { code, price, images, building } = room.data
  return <Link className="chat-widget-room" to={`/phong/${roomId}`}>
    {images[0]
      ? <img src={images[0].url} alt={t('room.imageAlt', { code, building: building.name })} loading="lazy" />
      : <span className="chat-widget-room-nophoto">{t('room.noPhoto')}</span>}
    <span className="chat-widget-room-text">
      <strong>{t('room.name', { code })}</strong>
      <span>{building.name}</span>
      <span>{formatMoney(price)}</span>
    </span>
  </Link>
}

// CHAT-09: title-bar style icons; the accessible name is the button's aria-label.
const icon = (path: string) => <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"
  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
const ICON_EXPAND = icon('M3 3h10v10H3z')
const ICON_RESTORE = icon('M5 3h8v8M3 5h8v8H3z')
const ICON_CLOSE = icon('M3.5 3.5l9 9M12.5 3.5l-9 9')
const ICON_SEND = icon('M2.5 8L13.5 2.5 10 13.5 7.5 8.5zM7.5 8.5L13.5 2.5')
const ICON_STOP = <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" /></svg>

/*
 * The attach control is a small folder that opens on hover, adapted from:
 * From Uiverse.io by Cobp - https://uiverse.io/Cobp/mighty-pig-13
 * MIT License, Copyright (c) Cobp (Fabio Cobb)
 * Rewritten from Tailwind to chat-widget.css, scaled to a button and recoloured with kit tokens.
 */
function AttachFolder() {
  return <span className="chat-folder" aria-hidden="true">
    <span className="chat-folder-back" />
    <span className="chat-folder-paper chat-folder-paper--1" />
    <span className="chat-folder-paper chat-folder-paper--2" />
    <span className="chat-folder-paper chat-folder-paper--3" />
    <span className="chat-folder-front" />
  </span>
}

// CHAT-01..12: public room-advice bubble. Nothing is fetched until the visitor sends a question,
// and the conversation lives only in this component (gone on reload, CHAT-07).
export function ChatWidget({ roomId, fallbackPhone }: { roomId?: number; fallbackPhone?: string | null }) {
  const { lang, t } = useI18n()
  const queryClient = useQueryClient()
  const panelId = useId()
  const toggleRef = useRef<HTMLSpanElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [image, setImage] = useState<ChatImage | null>(null)
  const [imageError, setImageError] = useState<ImageErrorKey | null>(null)
  const chat = useMutation({
    mutationFn: ({ next, image: sentImage }: { next: ChatMessage[]; image: ChatImage | null }) => {
      abortRef.current = new AbortController()
      return sendChat(next, roomId, sentImage ?? undefined, abortRef.current.signal)
    },
    // Clears the box only if it still holds the question just answered (the visitor may have typed the next one).
    onSuccess: ({ reply }, { next, image: sentImage }) => {
      setMessages([...next, { role: 'assistant', content: reply }])
      setDraft(current => (current.trim() === next[next.length - 1].content ? '' : current))
      setImage(current => (current === sentImage ? null : current))
    },
    // CHAT-12: Stop is not an error; a tapped suggestion goes into the empty box so it can be edited or sent again.
    onError: (error, { next }) => {
      if (!isAbortError(error)) return
      setDraft(current => (current.trim() ? current : next[next.length - 1].content))
      chat.reset()
    },
  })
  // A failed question stays in the box, so sending again is the retry; history keeps user/assistant turns.
  const full = messages.length + 1 > CHAT_MAX_MESSAGES
  const question = draft.trim()
  const canSend = !full && !chat.isPending && question.length > 0 && question.length <= CHAT_MAX_CHARS
  // CHAT-08: suggestions only before the first question; tapping one sends it as that question.
  const suggestions = messages.length > 0 || chat.isPending ? [] : roomId === undefined ? GENERAL_SUGGESTIONS : ROOM_SUGGESTIONS

  function ask(text: string) {
    chat.mutate({ next: [...messages, { role: 'user', content: text, ...(image ? { imageUrl: imageSrc(image) } : {}) }], image })
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (canSend) ask(question)
  }
  // CHAT-11: type and 5 MB are checked here; a picked image replaces the previous one (one per question).
  async function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const error = pickImageError(file)
    setImageError(error)
    if (error) return
    try {
      setImage(await prepareImage(file))
    } catch {
      setImageError('chat.imageBad')
    }
  }
  function close() {
    setOpen(false)
    toggleRef.current?.querySelector('button')?.focus()
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') close()
  }

  const errorKey = chat.isError && !isAbortError(chat.error) ? chatErrorKey(chat.error) : null
  // CHAT-03/06: the phone of the room on screen (already loaded by its page), else the general contact.
  const roomPhone = roomId === undefined ? undefined : queryClient.getQueryData<PublicRoomDetail>([...publicQueryKeys.room(roomId), lang])?.contact?.phone
  const phone = roomPhone ?? fallbackPhone ?? null

  return <div className="chat-widget">
    {open && <section id={panelId} className={`chat-widget-panel${expanded ? ' chat-widget-panel--wide' : ''}`} aria-label={t('chat.title')} onKeyDown={onKeyDown}>
      <div className="chat-widget-head">
        <h2>{t('chat.title')}</h2>
        <div className="chat-widget-actions">
          {/* CHAT-09: bigger floating panel, the conversation stays. */}
          <RoomsButton variant="outline" magnetic={false} className="chat-widget-icon" aria-label={t(expanded ? 'chat.shrink' : 'chat.expand')}
            onClick={() => setExpanded(value => !value)}>{expanded ? ICON_RESTORE : ICON_EXPAND}</RoomsButton>
          <RoomsButton variant="outline" magnetic={false} className="chat-widget-icon" aria-label={t('chat.close')} onClick={close}>{ICON_CLOSE}</RoomsButton>
        </div>
      </div>
      <div className="chat-widget-body">
        <ol className="chat-widget-log" aria-live="polite">
          <li className="chat-widget-msg chat-widget-msg--assistant"><span className="rooms-visually-hidden">{t('chat.bot')}: </span>{t('chat.intro')}</li>
          {(chat.isPending ? chat.variables.next : messages).map((m, i) => <li key={i} className={`chat-widget-msg chat-widget-msg--${m.role}`}>
            <span className="rooms-visually-hidden">{t(m.role === 'user' ? 'chat.you' : 'chat.bot')}: </span>
            {m.imageUrl && <img className="chat-widget-msg-image" src={m.imageUrl} alt={t('chat.imageAlt')} />}
            {splitRoomLinks(m.content).map((part, j) => part.href ? <a key={j} href={part.href}>{part.text}</a> : part.text)}
            {m.role === 'assistant' && roomIdsOfReply(m.content).map(id => <ChatRoomCard key={id} roomId={id} />)}
          </li>)}
        </ol>
        {suggestions.length > 0 && <ul className="chat-widget-suggest" aria-label={t('chat.suggest.label')}>
          {suggestions.map(key => <li key={key}>
            <RoomsButton variant="outline" magnetic={false} className="chat-widget-chip" onClick={() => ask(t(key))}>{t(key)}</RoomsButton>
          </li>)}
        </ul>}
        {chat.isPending && <Spinner label={t('chat.sending')} />}
      </div>
      <FormError>{(errorKey || imageError) && <>
        {imageError && <p>{t(imageError)}</p>}
        {errorKey && <p>{t(errorKey)}</p>}
        {errorKey && errorKey !== 'chat.failed' && phone && <p>{t('chat.phone', { phone })}</p>}
      </>}</FormError>
      {full
        ? <p className="chat-widget-note">{t('chat.full')}</p>
        : <form className="chat-widget-form" onSubmit={submit}>
          {image && <div className="chat-widget-attached">
            <img src={imageSrc(image)} alt={t('chat.imageAlt')} />
            <RoomsButton variant="outline" magnetic={false} className="chat-widget-icon" aria-label={t('chat.removeImage')}
              disabled={chat.isPending} onClick={() => setImage(null)}>{ICON_CLOSE}</RoomsButton>
          </div>}
          <div className="chat-widget-pill">
            <input ref={fileRef} type="file" accept={CHAT_IMAGE_TYPES.join(',')} hidden onChange={pickImage} />
            <RoomsButton variant="outline" magnetic={false} className="chat-widget-attach" aria-label={t('chat.attach')}
              disabled={chat.isPending} onClick={() => fileRef.current?.click()}><AttachFolder /></RoomsButton>
            <TextField label={t('chat.label')} name="chatQuestion" value={draft} maxLength={CHAT_MAX_CHARS} autoComplete="off"
              placeholder={t('chat.placeholder')} onChange={event => setDraft(event.target.value)} />
            {chat.isPending
              ? <RoomsButton magnetic={false} className="chat-widget-round chat-widget-round--stop" aria-label={t('chat.stop')}
                onClick={() => abortRef.current?.abort()}>{ICON_STOP}</RoomsButton>
              : <RoomsButton type="submit" magnetic={false} className="chat-widget-round" aria-label={t('chat.send')} disabled={!canSend}>{ICON_SEND}</RoomsButton>}
          </div>
        </form>}
    </section>}
    {/* Always mounted, so Escape / close can give focus back to it (KIT-05). */}
    <span ref={toggleRef} className="chat-widget-toggle">
      <RoomsButton aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => (open ? close() : setOpen(true))}>{t('chat.open')}</RoomsButton>
    </span>
  </div>
}
