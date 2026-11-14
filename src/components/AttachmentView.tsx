/** Attachments by reference through the agent (D13, UI-MEDIA-001/002/007): fetched with the token, shown as revocable object URLs. */
import type { AttachmentActivity } from '@ayni.org/ayni-agui-profile'
import { noteLength, playedBars, WAVEFORM_LEVELS, waveformBars, waveformOf } from '@ayni.org/ayni-ui-core'
import { Download, FileText, Pause, Play } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub } from '../state/useHub.js'

function useObjectUrl(sessionId: string, attachmentId: string | undefined, enabled: boolean): string | undefined {
  const hub = useHub()
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!attachmentId || !enabled) return
    let revoked = false
    let created: string | undefined
    hub
      .attachmentBlob(sessionId, attachmentId)
      .then((blob) => {
        if (revoked) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => setUrl(undefined))
    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [sessionId, attachmentId, enabled, hub])
  return url
}

export function AttachmentView({
  sessionId,
  attachment,
  mine: _mine,
}: {
  sessionId: string
  attachment: AttachmentActivity
  mine: boolean
}) {
  const { t } = useTranslation()
  const [full, setFull] = useState(false)
  const thumb = useObjectUrl(sessionId, attachment.thumbnailId ?? attachment.attachmentId, attachment.type === 'image')
  const fullUrl = useObjectUrl(
    sessionId,
    attachment.attachmentId,
    attachment.type === 'image' ? full : attachment.type === 'voice' || attachment.type === 'video'
  )
  const [fileUrl, setFileUrl] = useState<string>()
  const hub = useHub()
  if (attachment.type === 'image') {
    return (
      <figure className="attachment image">
        {full && fullUrl ? (
          <img
            className="img-full"
            src={fullUrl}
            alt={attachment.textRepr}
            onClick={() => setFull(false)}
            onKeyDown={(e) => e.key === 'Enter' && setFull(false)}
          />
        ) : thumb ? (
          <button
            type="button"
            style={{ display: 'block' }}
            onClick={() => setFull(true)}
            aria-label={attachment.textRepr}
          >
            <img
              className="img-thumb"
              src={thumb}
              alt={attachment.textRepr}
              width={attachment.width}
              height={attachment.height}
            />
          </button>
        ) : (
          <span className="muted">{attachment.textRepr}</span>
        )}
        {attachment.textRepr && !/^\[image/.test(attachment.textRepr) ? (
          <figcaption className="meta">{attachment.textRepr}</figcaption>
        ) : null}
      </figure>
    )
  }
  if (attachment.type === 'voice') {
    return (
      <div className="attachment voice-note">
        <VoicePlayer url={fullUrl} attachment={attachment} />
        <div className="transcription">
          {t('conversation.transcription')}: {attachment.textRepr}
        </div>
      </div>
    )
  }
  if (attachment.type === 'video') {
    return (
      <div className="attachment video">
        {fullUrl ? (
          <video controls src={fullUrl} style={{ maxWidth: '100%' }} aria-label={attachment.textRepr}>
            <track kind="captions" />
          </video>
        ) : (
          <span className="muted">{t('app.loading')}</span>
        )}
      </div>
    )
  }
  return (
    <div className="attachment file">
      <div className="row-between" style={{ gap: 10 }}>
        <FileText size={18} aria-hidden="true" />
        <span>
          {attachment.filename ?? attachment.textRepr}{' '}
          {attachment.size ? <span className="meta">({Math.round(attachment.size / 1024)} kB)</span> : null}
        </span>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            if (fileUrl) URL.revokeObjectURL(fileUrl)
            const blob = await hub.attachmentBlob(sessionId, attachment.attachmentId)
            const url = URL.createObjectURL(blob)
            setFileUrl(url)
            const a = document.createElement('a')
            a.href = url
            a.download = attachment.filename ?? 'file'
            a.rel = 'noopener'
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 10_000)
          }}
        >
          <Download size={14} /> {t('conversation.download')}
        </button>
      </div>
    </div>
  )
}

/**
 * The player of a voice note (UI-MEDIA-007/008): play and pause, the length of the note before it is played, and
 * the shape of its sound as bars, the played part marked; a touch on the bars moves to that moment. A note that
 * carries no waveform shows a plain line, one that carries no length shows it once the audio is read.
 */
function VoicePlayer({ url, attachment }: { url?: string; attachment: AttachmentActivity }) {
  const { t } = useTranslation()
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [read, setRead] = useState<number>()
  // what the recorder measured, else what the audio says of itself (a recording often gives no length there)
  const length = attachment.duration ?? read ?? 0
  const bars = useMemo(() => {
    const waveform = waveformOf(attachment)
    return waveform ? waveformBars(waveform, WAVEFORM_LEVELS) : undefined
  }, [attachment])
  const fraction = length > 0 ? Math.min(1, position / length) : 0
  const played = bars ? playedBars(bars.length, fraction) : 0

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }
  const moveTo = (share: number) => {
    const el = audio.current
    if (!el || !(length > 0)) return
    el.currentTime = Math.min(length, Math.max(0, share * length))
    setPosition(el.currentTime)
  }
  const onSeek = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width > 0) moveTo((event.clientX - box.left) / box.width)
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    moveTo(fraction + (event.key === 'ArrowRight' ? 0.05 : -0.05))
  }

  return (
    <div className="voice-player">
      <button
        type="button"
        className="icon-btn round voice-play"
        aria-label={playing ? t('conversation.pauseVoice') : t('conversation.playVoice')}
        disabled={!url}
        onClick={toggle}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div
        className="voice-wave"
        role="slider"
        tabIndex={0}
        aria-label={t('conversation.voicePosition')}
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${noteLength(position * 1000)} / ${noteLength(length * 1000)}`}
        onClick={onSeek}
        onKeyDown={onKey}
      >
        {bars ? (
          bars.map((level, index) => (
            <span
              // a bar is its place in the note
              key={index}
              className={index < played ? 'voice-bar played' : 'voice-bar'}
              style={{ height: `${Math.max(8, level)}%` }}
            />
          ))
        ) : (
          <span className="voice-line">
            <span style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        )}
      </div>
      <span className="meta voice-time">{noteLength((playing || position > 0 ? position : length) * 1000)}</span>
      {url ? (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          aria-label={attachment.textRepr}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setPosition(0)
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration
            if (Number.isFinite(seconds) && seconds > 0) setRead(seconds)
          }}
        >
          <track kind="captions" />
        </audio>
      ) : null}
    </div>
  )
}
