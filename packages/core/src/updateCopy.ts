/**
 * The English wording of a new version of the browser UI waiting to take over (UI-PLAT-007), keyed by its path in the
 * translation files: the browser's English translation file must say the same (a test compares them).
 */
export const UPDATE_COPY = {
  'update.available': 'A new version of Ayni is available.',
  'update.reload': 'Reload',
} as const

export type UpdateCopyKey = keyof typeof UPDATE_COPY
