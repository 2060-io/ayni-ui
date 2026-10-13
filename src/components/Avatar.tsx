import { useState } from 'react'

/** The agent's logo, initials as fallback (UI-SHELL-002); a logo that fails to load falls back too. */
export function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  if (src && !failed) {
    return (
      <img
        className="avatar"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size }}>
      {initials || '?'}
    </span>
  )
}
