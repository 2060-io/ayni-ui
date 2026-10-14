/** Attachments by reference through the agent (D13, UI-MEDIA-001/002/007): fetched with the token, shown as revocable object URLs. */
import type { AttachmentActivity } from '@2060.io/hologram-agui-profile'
import { Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
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
        {fullUrl ? (
          <audio controls src={fullUrl} aria-label={attachment.textRepr}>
            <track kind="captions" />
          </audio>
        ) : (
          <span className="muted">{t('app.loading')}</span>
        )}
        {attachment.duration ? <span className="meta">{Math.round(attachment.duration)} s</span> : null}
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
