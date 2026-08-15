// ── Date Utilities — reads timezone/format from Zustand store ──────────

import { useAppStore, type DateFormatOption, type TimeFormatOption } from '@/store/app-store'

/** Default timezone (used if store is unavailable, e.g. SSR) */
export const DEFAULT_TZ = 'Africa/Lagos'

// ── Internal helpers: read settings from store (safe for non-React code) ──

function getTimezone(): string {
  try { return useAppStore.getState().timezone } catch { return DEFAULT_TZ }
}

function getDateFormat(): DateFormatOption {
  try { return useAppStore.getState().dateFormat } catch { return 'dd/mm/yyyy' }
}

function getTimeFormat(): TimeFormatOption {
  try { return useAppStore.getState().timeFormat } catch { return '24h' }
}

// ── Locale/options mapping ─────────────────────────────────────────────

/** Returns the Intl locale and date options for the current dateFormat setting */
function dateLocaleAndOptions(fmt?: DateFormatOption): { locale: string; options: Intl.DateTimeFormatOptions } {
  const f = fmt || getDateFormat()
  switch (f) {
    case 'mm/dd/yyyy':
      return { locale: 'en-US', options: { month: '2-digit', day: '2-digit', year: 'numeric' } }
    case 'yyyy-mm-dd':
      return { locale: 'en-CA', options: { year: 'numeric', month: '2-digit', day: '2-digit' } }
    case 'dd Mon yyyy':
      return { locale: 'en-GB', options: { day: '2-digit', month: 'short', year: 'numeric' } }
    case 'Mon dd, yyyy':
      return { locale: 'en-US', options: { month: 'short', day: 'numeric', year: 'numeric' } }
    case 'dd/mm/yyyy':
    default:
      return { locale: 'en-GB', options: { day: '2-digit', month: '2-digit', year: 'numeric' } }
  }
}

function timeOptions(fmt?: TimeFormatOption): Intl.DateTimeFormatOptions {
  const f = fmt || getTimeFormat()
  return { hour: '2-digit', minute: '2-digit', hour12: f === '12h' }
}

// ── Public formatters ────────────────────────────────────────────────────

/** Format a date/time string using the user's selected date format + timezone */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const tz = getTimezone()
  const { locale, options } = dateLocaleAndOptions()
  return d.toLocaleDateString(locale, { ...options, timeZone: tz })
}

/** Format a date/time string to date + time */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const tz = getTimezone()
  const { locale, options } = dateLocaleAndOptions()
  const date = d.toLocaleDateString(locale, { ...options, timeZone: tz })
  const time = d.toLocaleTimeString(locale, { ...timeOptions(), timeZone: tz })
  return `${date} ${time}`
}

/** Format with short month name */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const tz = getTimezone()
  const { locale, options } = dateLocaleAndOptions('dd Mon yyyy')
  return d.toLocaleDateString(locale, { ...options, timeZone: tz })
}

/** Format with short month + time */
export function formatDateTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const tz = getTimezone()
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz })
  const time = d.toLocaleTimeString('en-GB', { ...timeOptions(), timeZone: tz })
  return `${date} ${time}`
}

/** Format with weekday */
export function formatDateWeekday(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const tz = getTimezone()
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: tz })
}

/** Get today's date as YYYY-MM-DD in the user's selected timezone */
export function getTodayWAT(): string {
  const tz = getTimezone()
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

/** Get the UTC offset in hours for the current timezone (e.g. +1 for WAT) */
export function getTimezoneOffsetHours(): number {
  const tz = getTimezone()
  const now = new Date()
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = now.toLocaleString('en-US', { timeZone: tz })
  return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / (1000 * 60 * 60))
}

/**
 * Lightweight days-to-expiry using a pre-computed today string.
 * Use this inside .map() loops — call getTodayWAT() once before the loop.
 */
export function daysToExpiryFrom(expiryDate: string | null | undefined, todayStr: string): number | null {
  if (!expiryDate) return null
  const expDateStr = expiryDate.split('T')[0]
  const exp = new Date(expDateStr + 'T12:00:00')
  const now = new Date(todayStr + 'T12:00:00')
  return Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/** Get days to expiry. Returns null if no expiry date. */
export function getDaysToExpiry(expiryDate: string | null | undefined): number | null {
  return daysToExpiryFrom(expiryDate, getTodayWAT())
}

/**
 * Format a date (ISO string) for display in a text input field according to user's dateFormat.
 * E.g. '2026-08-15' → '15/08/2026' (dd/mm/yyyy) or '08/15/2026' (mm/dd/yyyy)
 */
export function formatDateInput(isoStr: string | null | undefined): string {
  if (!isoStr) return ''
  const d = new Date((isoStr.split('T')[0]) + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  const f = getDateFormat()
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear())
  switch (f) {
    case 'mm/dd/yyyy': return `${month}/${day}/${year}`
    case 'yyyy-mm-dd':  return `${year}-${month}-${day}`
    case 'dd Mon yyyy': {
      const mon = d.toLocaleDateString('en-GB', { month: 'short' })
      return `${day} ${mon} ${year}`
    }
    case 'Mon dd, yyyy': {
      const mon = d.toLocaleDateString('en-US', { month: 'short' })
      return `${mon} ${day}, ${year}`
    }
    case 'dd/mm/yyyy':
    default: return `${day}/${month}/${year}`
  }
}

/**
 * Parse a user-typed date string (in the user's dateFormat) back to YYYY-MM-DD.
 * Returns null if unparseable.
 */
export function parseDateInput(raw: string): string | null {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()
  const f = getDateFormat()
  // Try to parse based on format
  let day: number, month: number, year: number
  if (f === 'yyyy-mm-dd') {
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) return null
    year = +m[1]; month = +m[2]; day = +m[3]
  } else if (f === 'mm/dd/yyyy') {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!m) return null
    month = +m[1]; day = +m[2]; year = +m[3]
  } else if (f === 'dd/mm/yyyy') {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!m) return null
    day = +m[1]; month = +m[2]; year = +m[3]
  } else if (f === 'dd Mon yyyy') {
    const m = s.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/)
    if (!m) return null
    day = +m[1]; year = +m[3]
    const d = new Date(`${m[2]} 1, ${year}`)
    month = d.getMonth() + 1
    if (isNaN(month)) return null
  } else if (f === 'Mon dd, yyyy') {
    const m = s.match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})$/)
    if (!m) return null
    year = +m[3]; day = +m[2]
    const d = new Date(`${m[1]} 1, ${year}`)
    month = d.getMonth() + 1
    if (isNaN(month)) return null
  } else {
    return null
  }
  // Validate
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Get the placeholder text for a date input based on user's dateFormat.
 */
export function getDatePlaceholder(): string {
  const f = getDateFormat()
  switch (f) {
    case 'mm/dd/yyyy': return 'mm/dd/yyyy'
    case 'yyyy-mm-dd':  return 'yyyy-mm-dd'
    case 'dd Mon yyyy': return 'dd Mon yyyy'
    case 'Mon dd, yyyy': return 'Mon dd, yyyy'
    case 'dd/mm/yyyy':
    default: return 'dd/mm/yyyy'
  }
}

/**
 * Auto-format a date input value as the user types, inserting separators.
 * Works for dd/mm/yyyy, mm/dd/yyyy, and yyyy-mm-dd.
 * For month-name formats (dd Mon, Mon dd), returns the raw digits (user types full format).
 */
export function autoFormatDateInput(raw: string): string {
  const f = getDateFormat()
  let digits = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (f === 'yyyy-mm-dd') {
    let formatted = ''
    for (let i = 0; i < digits.length; i++) {
      if (i === 4 || i === 6) formatted += '-'
      formatted += digits[i]
    }
    return formatted
  }
  // dd/mm/yyyy and mm/dd/yyyy — same separator pattern
  if (f === 'dd/mm/yyyy' || f === 'mm/dd/yyyy') {
    let formatted = ''
    for (let i = 0; i < digits.length; i++) {
      if (i === 2 || i === 4) formatted += '/'
      formatted += digits[i]
    }
    return formatted
  }
  // For month-name formats, don't auto-format (user types alpha chars)
  return raw
}

/** Get the max length for a date input based on format */
export function getDateInputMaxLength(): number {
  const f = getDateFormat()
  switch (f) {
    case 'yyyy-mm-dd':  return 10
    case 'dd Mon yyyy': return 11  // '02 Aug 2026'
    case 'Mon dd, yyyy': return 12 // 'Aug 02, 2026'
    case 'dd/mm/yyyy':
    case 'mm/dd/yyyy':
    default: return 10
  }
}

// ── Legacy alias (kept for backward compat) ──
export const WAT_TZ = DEFAULT_TZ
