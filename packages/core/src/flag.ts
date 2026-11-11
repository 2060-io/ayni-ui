/** The flag emoji of an ISO 3166-1 alpha-2 code, or an empty string when the code is not one. */
export function flagOf(countryCode?: string): string {
  const code = (countryCode ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
