// ── West African Date Utilities ──────────────────────────────────────
// All dates formatted in dd/mm/yyyy using West Africa Time (WAT, UTC+1)

export const WAT_TZ = 'Africa/Lagos' // West Africa Time — UTC+1

/** Format a date/time string to dd/mm/yyyy */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { timeZone: WAT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Format a date/time string to dd/mm/yyyy HH:MM */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-GB', { timeZone: WAT_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: WAT_TZ, hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

/** Format with short month name: 02 Aug 2025 */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { timeZone: WAT_TZ, day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format with short month + time: 02 Aug 2025 14:30 */
export function formatDateTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-GB', { timeZone: WAT_TZ, day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: WAT_TZ, hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

/** Format with weekday: Mon, 02 Aug 2025 */
export function formatDateWeekday(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { timeZone: WAT_TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

/** Get today's date as YYYY-MM-DD in WAT timezone */
export function getTodayWAT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: WAT_TZ })
}

/** Get days to expiry (timezone-aware, WAT). Returns null if no expiry date. */
export function getDaysToExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null
  const expDateStr = expiryDate.split('T')[0]
  const todayStr = getTodayWAT()
  const exp = new Date(expDateStr + 'T12:00:00')
  const now = new Date(todayStr + 'T12:00:00')
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
