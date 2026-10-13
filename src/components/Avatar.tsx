export function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  if (src)
    return (
      <img
        className="avatar"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size }}>
      {initials || '?'}
    </span>
  )
}
