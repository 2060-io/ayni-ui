/** The composer (UI-CONV-003/013/014/015, UI-MEDIA-003..007): grows to eight lines, Enter rules, Stop, attachments, voice notes. */
import { Mic, Paperclip, Send, Square, Trash2, X } from 'lucide-react'
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

  // drafts per conversation (UI-SHELL-010)
  useEffect(() => {
    setText(session?.draft ?? '')
  }, [sessionId])
  useEffect(() => {
    const timer = setTimeout(() => void hub.setDraft(sessionId, text), 400)
    return () => clearTimeout(timer)
  }, [text, sessionId, hub])
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 1.4 * 15 * 8 + 20)}px`
  }, [text])
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - recording.started) / 1000)), 250)
    return () => clearInterval(timer)
  }, [recording])

  const closed = session?.state === 'closed'
  const canSend = !disabled && !running && snap.online && (text.trim().length > 0 || pending.length > 0 || !!review)

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
    }
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
            className="icon-btn"
            aria-label={t('composer.attach')}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={20} />
          </button>
        ) : null}
        {agent?.descriptor.features.voiceNotes !== false && uploads ? (
          recording ? (
            <button
              type="button"
              className="icon-btn danger"
              aria-label={t('composer.stopRecording')}
              onClick={() => recording.recorder.stop()}
            >
              <Square size={18} />
              <span className="sr-only">{t('composer.recording')}</span>
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label={t('composer.record')}
              disabled={disabled}
              onClick={() => void startRecording()}
            >
              <Mic size={20} />
            </button>
          )
        ) : null}
        {recording ? (
          <span className="muted" aria-live="polite">{`${t('composer.recording')} ${elapsed}s`}</span>
        ) : null}
        <textarea
          ref={areaRef}
          rows={1}
          placeholder={closed ? t('composer.placeholderReconnect') : t('composer.placeholder')}
          aria-label={t('composer.placeholder')}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {running ? (
          <button
            type="button"
            className="icon-btn danger"
            aria-label={t('composer.stop')}
            onClick={() => void hub.stop(sessionId)}
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn primary"
            aria-label={t('composer.send')}
            disabled={!canSend}
            onClick={() => void send()}
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
