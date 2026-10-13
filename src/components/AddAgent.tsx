/** Add an agent by URL, DID or QR scanned on device (UI-AGENTS-001/003). */
import { ArrowLeft, Camera } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHub } from '../state/useHub.js'

type Detector = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> }

async function createDetector(): Promise<Detector | undefined> {
  const native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
  if (native) return new native({ formats: ['qr_code'] })
  try {
    const { readBarcodes } = await import('zxing-wasm/reader')
    return {
      detect: async (source) => {
        const blob =
          source instanceof Blob
            ? source
            : await new Promise<Blob>((resolve, reject) =>
                (source as HTMLCanvasElement).toBlob(
                  (b) => (b ? resolve(b) : reject(new Error('no frame'))),
                  'image/png'
                )
              )
        const results = await readBarcodes(blob, { formats: ['QRCode'] })
        return results.map((r) => ({ rawValue: r.text }))
      },
    }
  } catch {
    return undefined
  }
}

export function AddAgent() {
  const hub = useHub()
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const add = async (value: string) => {
    setError('')
    try {
      await hub.addAgent(value)
      hub.setView('list')
    } catch (e) {
      setError(t('add.error', { message: String((e as Error).message) }))
    }
  }
  useEffect(() => {
    if (!scanning) return
    let stop = false
    let stream: MediaStream | undefined
    const canvas = document.createElement('canvas')
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const detector = await createDetector()
        if (!detector) {
          setError(t('composer.micUnavailable'))
          return
        }
        while (!stop) {
          await new Promise((r) => setTimeout(r, 400))
          if (!video.videoWidth) continue
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')?.drawImage(video, 0, 0)
          const codes = await detector.detect(canvas).catch(() => [])
          const value = codes[0]?.rawValue
          if (value) {
            stop = true
            setScanning(false)
            await add(value)
          }
        }
      } catch {
        setError(t('add.cameraDenied'))
        setScanning(false)
      }
    })()
    return () => {
      stop = true
      for (const track of stream?.getTracks() ?? []) track.stop()
    }
  }, [scanning])
  return (
    <div className="panel">
      <button type="button" className="btn small back" onClick={() => hub.setView('list')}>
        <ArrowLeft size={16} /> {t('app.back')}
      </button>
      <h1>{t('add.title')}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add(input)
        }}
      >
        <label className="field">
          {t('add.input')}
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('add.placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="column-actions">
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            {t('add.go')}
          </button>
          <button type="button" className="btn" onClick={() => setScanning((v) => !v)}>
            <Camera size={16} /> {t('add.scan')}
          </button>
        </div>
      </form>
      {error ? (
        <div className="banner danger" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}
      {scanning ? (
        <div style={{ marginTop: 12 }}>
          <p className="muted">{t('add.scanning')}</p>
          <video ref={videoRef} style={{ width: '100%', maxWidth: 420, borderRadius: 12 }} muted playsInline>
            <track kind="captions" />
          </video>
        </div>
      ) : null}
    </div>
  )
}
