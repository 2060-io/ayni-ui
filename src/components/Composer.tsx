/** The composer (UI-CONV-003/013/014/015/018, UI-MEDIA-003..007): one line that grows to six, Enter rules, Stop, reply quote, attachments, voice notes. */
import { quoteLabel } from '@ayni.org/ayni-ui-core'
import { ArrowUp, Mic, Plus, Reply, Square, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub, useSnapshot } from '../state/useHub.js'

const isTouch = () => matchMedia('(pointer: coarse)').matches

interface Pending {
  id: string
  name: string
  kind: 'file' | 'voice'
  url?: string
}

export function Composer({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const snap = useSnapshot()
  const hub = useHub()
  const { t } = useTranslation()
  const session = snap.sessions.find((s) => s.sessionId === sessionId)
  const agent = snap.agents.find((a) => a.did === session?.agentDid)
  const uploadsRaw = agent?.descriptor.features.uploads
  const uploads = uploadsRaw || undefined
  const [text, setText] = useState(session?.draft ?? '')
  const [pending, setPending] = useState<Pending[]>([])
  const [recording, setRecording] = useState<{ recorder: MediaRecorder; started: number; chunks: Blob[] } | null>(null)
  const [review, setReview] = useState<{ blob: Blob; url: string; duration: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const running = hub.isRunning(sessionId)
  // against an agent that takes it, a message sent while it answers waits and is answered next (UI-CONV-025)
  const queues = hub.takesQueue(sessionId)
  const replyTo = snap.replyTo[sessionId]
  const prefill = snap.prefill[sessionId]

  // drafts per conversation (UI-SHELL-010)
  useEffect(() => {
    setText(session?.draft ?? '')
  }, [sessionId])
  // edit and resend, or a reply started from a message: the field takes the text and the focus
  useEffect(() => {
    if (prefill) setText(prefill.text)
    if (prefill || replyTo) areaRef.current?.focus()
  }, [prefill, replyTo])
  useEffect(() => {
    const timer = setTimeout(() => void hub.setDraft(sessionId, text), 400)
    return () => clearTimeout(timer)
  }, [text, sessionId, hub])
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    // one line by default, up to six, then the field scrolls; no scrollbar before that (UI-CONV-013)
    const max = 1.45 * 15 * 6 + 20
    el.style.height = 'auto'
    const needed = el.scrollHeight
    el.style.height = `${Math.min(needed, max)}px`
    el.style.overflowY = needed > max ? 'auto' : 'hidden'
  }, [text])
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - recording.started) / 1000)), 250)
    return () => clearInterval(timer)
  }, [recording])

  const closed = session?.state === 'closed'
  const hasContent = text.trim().length > 0 || pending.length > 0 || !!review
  const canSend = !disabled && (!running || queues) && snap.online && hasContent

  const send = async () => {
    if (!canSend) return
    try {
      const ids = pending.map((p) => p.id)
      if (review) {
        const type = review.blob.type || 'audio/webm'
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
        const up = await hub.upload(sessionId, review.blob, `voice-note.${ext}`)
        ids.push(up.attachmentId)
        URL.revokeObjectURL(review.url)
        setReview(null)
      }
      const body = text
      setText('')
      setPending([])
      if (closed) {
        // writing on a closed conversation wakes it up: the text goes out once the resumed session is bound
        await hub.resume(sessionId, body)
        return
      }
      await hub.send(sessionId, body, ids)
    } catch (e) {
      setError(String((e as Error).message))
      hub.notify('error', String((e as Error).message))
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch()) {
      e.preventDefault()
      void send()
    } else if (e.key === 'Escape' && replyTo) hub.setReply(sessionId, null)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (uploads && file.size > uploads.maxBytes) {
        setError(t('composer.tooLarge', { max: Math.round(uploads.maxBytes / 1048576) }))
        continue
      }
      if (
        uploads &&
        !uploads.types.some((p) => (p.endsWith('/*') ? file.type.startsWith(p.slice(0, -1)) : p === file.type))
      ) {
        setError(t('composer.notAccepted'))
        continue
      }
      try {
        const up = await hub.upload(sessionId, file, file.name)
        setPending((p) => [...p, { id: up.attachmentId, name: file.name, kind: 'file' }])
        setError('')
      } catch (e) {
        setError(
          String((e as Error).message) === 'too-large'
            ? t('composer.tooLarge', { max: Math.round((uploads?.maxBytes ?? 0) / 1048576) })
            : String((e as Error).message)
        )
      }
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('composer.micUnavailable'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      )
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop()
        const blob = new Blob(chunks, { type: recorder.mimeType })
        setReview({ blob, url: URL.createObjectURL(blob), duration: elapsed })
        setRecording(null)
      }
      recorder.start(250)
      setElapsed(0)
      setRecording({ recorder, started: Date.now(), chunks })
      setError('')
    } catch {
      setError(t('composer.micDenied'))
    }
  }

  return (
    <div>
      {error ? (
        <div className="banner warning">
          {error}
          <button type="button" className="btn small" onClick={() => setError('')}>
            {t('app.close')}
          </button>
        </div>
      ) : null}
      {replyTo ? (
        <div className="reply-strip">
          <Reply size={16} aria-hidden="true" />
          <span className="reply-body">
            <span className="reply-who">
              {t('conversation.replyingTo', {
                name: replyTo.role === 'user' ? t('conversation.you') : (agent?.name ?? ''),
              })}
            </span>
            <span className="reply-text">{quoteLabel(replyTo, (kind) => t(`conversation.media.${kind}`))}</span>
          </span>
          <button
            type="button"
            className="tool"
            aria-label={t('conversation.cancelReply')}
            onClick={() => hub.setReply(sessionId, null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {pending.length || review ? (
        <div className="chips">
          {pending.map((p) => (
            <span key={p.id} className="chip">
              {p.name}
              <button
                type="button"
                aria-label={t('composer.discard')}
                onClick={() => setPending((list) => list.filter((x) => x.id !== p.id))}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {review ? (
            <span className="chip">
              <audio controls src={review.url} style={{ height: 28 }}>
                <track kind="captions" />
              </audio>
              <button type="button" className="btn small" onClick={() => void startRecording()}>
                {t('composer.rerecord')}
              </button>
              <button type="button" aria-label={t('composer.discard')} onClick={() => setReview(null)}>
                <Trash2 size={14} />
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="composer">
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={uploads ? uploads.types.join(',') : undefined}
          onChange={(e) => void addFiles(e.target.files)}
        />
        {uploads ? (
          <button
            type="button"
            className="icon-btn round"
            aria-label={t('composer.attach')}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            <Plus size={22} />
          </button>
        ) : null}
        <textarea
          ref={areaRef}
          rows={1}
          placeholder={t('composer.placeholder')}
          aria-label={t('composer.placeholder')}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {recording ? (
          <span className="muted recording" aria-live="polite">{`${t('composer.recording')} ${elapsed}s`}</span>
        ) : null}
        {running ? (
          <button
            type="button"
            className="send danger"
            aria-label={t('composer.stop')}
            onClick={() => void hub.stop(sessionId)}
          >
            <Square size={14} />
          </button>
        ) : null}
        {/* while the agent answers, Send shows beside Stop once there is something to send */}
        {!running || (queues && hasContent) ? (
          <button
            type="button"
            className="send"
            aria-label={t('composer.send')}
            disabled={!canSend}
            onClick={() => void send()}
          >
            <ArrowUp size={18} />
          </button>
        ) : null}
        {agent?.descriptor.features.voiceNotes !== false && uploads ? (
          recording ? (
            <button
              type="button"
              className="icon-btn round danger"
              aria-label={t('composer.stopRecording')}
              onClick={() => recording.recorder.stop()}
            >
              <Square size={16} />
              <span className="sr-only">{t('composer.recording')}</span>
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn round"
              aria-label={t('composer.record')}
              disabled={disabled}
              onClick={() => void startRecording()}
            >
              <Mic size={20} />
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}
