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

// ── Legacy alias (kept for backward compat) ──
export const WAT_TZ = DEFAULT_TZ
