import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { formatMoney } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import { getPublicRoom, publicQueryKeys } from './api'
import type { PublicRoomDetail } from './api'
import { CHAT_MAX_CHARS, CHAT_MAX_MESSAGES, chatErrorKey, roomIdsOfReply, sendChat, splitRoomLinks } from './chat'
import type { ChatMessage } from './chat'
import './chat-widget.css'

const GENERAL_SUGGESTIONS = ['chat.suggest.cheap', 'chat.suggest.areas', 'chat.suggest.pets', 'chat.suggest.booking'] as const
const ROOM_SUGGESTIONS = ['chat.suggest.roomCost', 'chat.suggest.roomUtilities', 'chat.suggest.roomBooking'] as const

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

// CHAT-01..10: public room-advice bubble. Nothing is fetched until the visitor sends a question,
// and the conversation lives only in this component (gone on reload, CHAT-07).
export function ChatWidget({ roomId, fallbackPhone }: { roomId?: number; fallbackPhone?: string | null }) {
  const { lang, t } = useI18n()
  const queryClient = useQueryClient()
  const panelId = useId()
  const toggleRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const chat = useMutation({
    mutationFn: (next: ChatMessage[]) => sendChat(next, roomId),
    // Clears the box only if it still holds the question just answered (the visitor may have typed the next one).
    onSuccess: ({ reply }, sent) => {
      setMessages([...sent, { role: 'assistant', content: reply }])
      setDraft(current => (current.trim() === sent[sent.length - 1].content ? '' : current))
    },
  })
  // A failed question stays in the box, so sending again is the retry; history keeps user/assistant turns.
  const full = messages.length + 1 > CHAT_MAX_MESSAGES
  const question = draft.trim()
  const canSend = !full && !chat.isPending && question.length > 0 && question.length <= CHAT_MAX_CHARS
  // CHAT-08: suggestions only before the first question; tapping one sends it as that question.
  const suggestions = messages.length > 0 || chat.isPending ? [] : roomId === undefined ? GENERAL_SUGGESTIONS : ROOM_SUGGESTIONS

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canSend) chat.mutate([...messages, { role: 'user', content: question }])
  }
  function close() {
    setOpen(false)
    toggleRef.current?.querySelector('button')?.focus()
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') close()
  }

  const errorKey = chat.isError ? chatErrorKey(chat.error) : null
  // CHAT-03/06: the phone of the room on screen (already loaded by its page), else the general contact.
  const roomPhone = roomId === undefined ? undefined : queryClient.getQueryData<PublicRoomDetail>([...publicQueryKeys.room(roomId), lang])?.contact?.phone
  const phone = roomPhone ?? fallbackPhone ?? null

  return <div className="chat-widget">
    {open && <section id={panelId} className={`chat-widget-panel${expanded ? ' chat-widget-panel--wide' : ''}`} aria-label={t('chat.title')} onKeyDown={onKeyDown}>
      <div className="chat-widget-head">
        <h2>{t('chat.title')}</h2>
        <div className="chat-widget-actions">
          {/* CHAT-09: bigger floating panel, the conversation stays. */}
          <RoomsButton variant="outline" magnetic={false} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'chat.shrink' : 'chat.expand')}</RoomsButton>
          <RoomsButton variant="outline" magnetic={false} onClick={close}>{t('chat.close')}</RoomsButton>
        </div>
      </div>
      <div className="chat-widget-body">
        <ol className="chat-widget-log" aria-live="polite">
          <li className="chat-widget-msg chat-widget-msg--assistant"><span className="rooms-visually-hidden">{t('chat.bot')}: </span>{t('chat.intro')}</li>
          {(chat.isPending ? chat.variables : messages).map((m, i) => <li key={i} className={`chat-widget-msg chat-widget-msg--${m.role}`}>
            <span className="rooms-visually-hidden">{t(m.role === 'user' ? 'chat.you' : 'chat.bot')}: </span>
            {splitRoomLinks(m.content).map((part, j) => part.href ? <a key={j} href={part.href}>{part.text}</a> : part.text)}
            {m.role === 'assistant' && roomIdsOfReply(m.content).map(id => <ChatRoomCard key={id} roomId={id} />)}
          </li>)}
        </ol>
        {suggestions.length > 0 && <ul className="chat-widget-suggest" aria-label={t('chat.suggest.label')}>
          {suggestions.map(key => <li key={key}>
            <RoomsButton variant="outline" magnetic={false} className="chat-widget-chip" onClick={() => chat.mutate([{ role: 'user', content: t(key) }])}>{t(key)}</RoomsButton>
          </li>)}
        </ul>}
        {chat.isPending && <Spinner label={t('chat.sending')} />}
      </div>
      <FormError>{errorKey && <>
        <p>{t(errorKey)}</p>
        {errorKey !== 'chat.failed' && phone && <p>{t('chat.phone', { phone })}</p>}
      </>}</FormError>
      {full
        ? <p className="chat-widget-note">{t('chat.full')}</p>
        : <form className="chat-widget-form" onSubmit={submit}>
          <TextField label={t('chat.label')} name="chatQuestion" value={draft} maxLength={CHAT_MAX_CHARS} autoComplete="off"
            onChange={event => setDraft(event.target.value)} />
          <RoomsButton type="submit" disabled={!canSend}>{t('chat.send')}</RoomsButton>
        </form>}
    </section>}
    {/* Always mounted, so Escape / close can give focus back to it (KIT-05). */}
    <span ref={toggleRef} className="chat-widget-toggle">
      <RoomsButton aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => (open ? close() : setOpen(true))}>{t('chat.open')}</RoomsButton>
    </span>
  </div>
}
