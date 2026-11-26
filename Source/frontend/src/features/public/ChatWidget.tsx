import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { FormError, RoomsButton, Spinner, TextField } from '../../components'
import { useI18n } from '../../shared/i18n'
import { publicQueryKeys } from './api'
import type { PublicRoomDetail } from './api'
import { CHAT_MAX_CHARS, CHAT_MAX_MESSAGES, chatErrorKey, sendChat, splitRoomLinks } from './chat'
import type { ChatMessage } from './chat'
import './chat-widget.css'

// CHAT-01..07: public room-advice bubble. Nothing is fetched until the visitor sends a question,
// and the conversation lives only in this component (gone on reload, CHAT-07).
export function ChatWidget({ roomId, fallbackPhone }: { roomId?: number; fallbackPhone?: string | null }) {
  const { lang, t } = useI18n()
  const queryClient = useQueryClient()
  const panelId = useId()
  const toggleRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
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
    {open && <section id={panelId} className="chat-widget-panel" aria-label={t('chat.title')} onKeyDown={onKeyDown}>
      <div className="chat-widget-head">
        <h2>{t('chat.title')}</h2>
        <RoomsButton variant="outline" onClick={close}>{t('chat.close')}</RoomsButton>
      </div>
      <ol className="chat-widget-log" aria-live="polite">
        <li className="chat-widget-msg chat-widget-msg--assistant"><span className="rooms-visually-hidden">{t('chat.bot')}: </span>{t('chat.intro')}</li>
        {(chat.isPending ? chat.variables : messages).map((m, i) => <li key={i} className={`chat-widget-msg chat-widget-msg--${m.role}`}>
          <span className="rooms-visually-hidden">{t(m.role === 'user' ? 'chat.you' : 'chat.bot')}: </span>
          {splitRoomLinks(m.content).map((part, j) => part.href ? <a key={j} href={part.href}>{part.text}</a> : part.text)}
        </li>)}
      </ol>
      {chat.isPending && <Spinner label={t('chat.sending')} />}
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
