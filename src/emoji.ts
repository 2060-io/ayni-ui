/**
 * The emoji set of the reaction picker (UI-CONV-017): bundled, so it works offline and under the
 * CSP; searched by English name. The quick bar shows the first six of QUICK.
 */
export interface EmojiEntry {
  e: string
  name: string
}

export interface EmojiCategory {
  id: 'smileys' | 'gestures' | 'hearts' | 'objects' | 'symbols'
  items: EmojiEntry[]
}

export const QUICK: EmojiEntry[] = [
  { e: '❤️', name: 'heart' },
  { e: '👍', name: 'thumbs up' },
  { e: '👎', name: 'thumbs down' },
  { e: '😂', name: 'laughing' },
  { e: '😮', name: 'surprised' },
  { e: '😢', name: 'sad' },
]

const smileys: EmojiEntry[] = [
  { e: '😀', name: 'grinning' },
  { e: '😃', name: 'smiley' },
  { e: '😄', name: 'smile' },
  { e: '😁', name: 'grin' },
  { e: '😆', name: 'laughing squint' },
  { e: '😅', name: 'sweat smile' },
  { e: '🤣', name: 'rolling on the floor' },
  { e: '😂', name: 'tears of joy' },
  { e: '🙂', name: 'slightly smiling' },
  { e: '🙃', name: 'upside down' },
  { e: '😉', name: 'wink' },
  { e: '😊', name: 'blush' },
  { e: '😇', name: 'innocent' },
  { e: '🥰', name: 'in love' },
  { e: '😍', name: 'heart eyes' },
  { e: '🤩', name: 'star struck' },
  { e: '😘', name: 'kiss' },
  { e: '😋', name: 'yum' },
  { e: '😜', name: 'winking tongue' },
  { e: '🤪', name: 'zany' },
  { e: '🤔', name: 'thinking' },
  { e: '🤨', name: 'raised eyebrow' },
  { e: '😐', name: 'neutral' },
  { e: '😑', name: 'expressionless' },
  { e: '😶', name: 'no mouth' },
  { e: '🙄', name: 'eye roll' },
  { e: '😏', name: 'smirk' },
  { e: '😴', name: 'sleeping' },
  { e: '🤒', name: 'sick' },
  { e: '🤯', name: 'mind blown' },
  { e: '🥳', name: 'party face' },
  { e: '😎', name: 'sunglasses' },
  { e: '🤓', name: 'nerd' },
  { e: '😕', name: 'confused' },
  { e: '😮', name: 'open mouth' },
  { e: '😯', name: 'hushed' },
  { e: '😳', name: 'flushed' },
  { e: '🥺', name: 'pleading' },
  { e: '😢', name: 'crying' },
  { e: '😭', name: 'loudly crying' },
  { e: '😱', name: 'screaming' },
  { e: '😤', name: 'huffing' },
  { e: '😡', name: 'angry' },
  { e: '🤬', name: 'cursing' },
  { e: '🤗', name: 'hugging' },
  { e: '🫡', name: 'saluting' },
  { e: '🤫', name: 'shushing' },
  { e: '🫠', name: 'melting' },
]

const gestures: EmojiEntry[] = [
  { e: '👍', name: 'thumbs up' },
  { e: '👎', name: 'thumbs down' },
  { e: '👏', name: 'clapping' },
  { e: '🙌', name: 'raised hands' },
  { e: '🙏', name: 'thanks please' },
  { e: '👋', name: 'waving' },
  { e: '🤝', name: 'handshake' },
  { e: '✌️', name: 'victory' },
  { e: '🤞', name: 'fingers crossed' },
  { e: '👌', name: 'ok hand' },
  { e: '🤙', name: 'call me' },
  { e: '💪', name: 'flexed biceps' },
  { e: '👀', name: 'eyes' },
  { e: '🫶', name: 'heart hands' },
  { e: '🤷', name: 'shrug' },
  { e: '🤦', name: 'facepalm' },
]

const hearts: EmojiEntry[] = [
  { e: '❤️', name: 'red heart' },
  { e: '🧡', name: 'orange heart' },
  { e: '💛', name: 'yellow heart' },
  { e: '💚', name: 'green heart' },
  { e: '💙', name: 'blue heart' },
  { e: '💜', name: 'purple heart' },
  { e: '🖤', name: 'black heart' },
  { e: '🤍', name: 'white heart' },
  { e: '💔', name: 'broken heart' },
  { e: '💯', name: 'hundred' },
  { e: '🔥', name: 'fire' },
  { e: '⭐', name: 'star' },
  { e: '✨', name: 'sparkles' },
  { e: '🎉', name: 'party popper' },
  { e: '🎊', name: 'confetti' },
  { e: '🚀', name: 'rocket' },
]

const objects: EmojiEntry[] = [
  { e: '☕', name: 'coffee' },
  { e: '🍕', name: 'pizza' },
  { e: '🍰', name: 'cake' },
  { e: '🎂', name: 'birthday' },
  { e: '🍺', name: 'beer' },
  { e: '🏆', name: 'trophy' },
  { e: '🎁', name: 'gift' },
  { e: '📎', name: 'paperclip' },
  { e: '📌', name: 'pushpin' },
  { e: '📅', name: 'calendar' },
  { e: '💡', name: 'idea bulb' },
  { e: '🔒', name: 'locked' },
  { e: '🔑', name: 'key' },
  { e: '📷', name: 'camera' },
  { e: '💻', name: 'laptop' },
  { e: '📱', name: 'phone' },
  { e: '✈️', name: 'airplane' },
  { e: '🚗', name: 'car' },
  { e: '🏠', name: 'house' },
  { e: '🌍', name: 'globe' },
  { e: '☀️', name: 'sun' },
  { e: '🌧️', name: 'rain' },
  { e: '⛄', name: 'snowman' },
  { e: '🐶', name: 'dog' },
  { e: '🐱', name: 'cat' },
  { e: '🦆', name: 'duck' },
  { e: '🐢', name: 'turtle' },
  { e: '🌸', name: 'blossom' },
]

const symbols: EmojiEntry[] = [
  { e: '✅', name: 'check mark' },
  { e: '❌', name: 'cross mark' },
  { e: '❓', name: 'question' },
  { e: '❗', name: 'exclamation' },
  { e: '⚠️', name: 'warning' },
  { e: '⏳', name: 'hourglass' },
  { e: '⏰', name: 'alarm clock' },
  { e: '🔔', name: 'bell' },
  { e: '💬', name: 'speech balloon' },
  { e: '🆗', name: 'ok' },
  { e: '🆕', name: 'new' },
  { e: '🔁', name: 'repeat' },
  { e: '➕', name: 'plus' },
  { e: '➖', name: 'minus' },
  { e: '♻️', name: 'recycle' },
  { e: '🏳️', name: 'white flag' },
]

export const CATEGORIES: EmojiCategory[] = [
  { id: 'smileys', items: smileys },
  { id: 'gestures', items: gestures },
  { id: 'hearts', items: hearts },
  { id: 'objects', items: objects },
  { id: 'symbols', items: symbols },
]

const ALL: EmojiEntry[] = [...QUICK, ...CATEGORIES.flatMap((c) => c.items)].filter(
  (entry, i, list) => list.findIndex((x) => x.e === entry.e) === i
)

export function nameOf(emoji: string): string {
  return ALL.find((x) => x.e === emoji)?.name ?? emoji
}

export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return ALL.filter((x) => x.name.includes(q)).slice(0, 48)
}
