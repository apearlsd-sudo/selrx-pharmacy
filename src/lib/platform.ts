/**
 * src/lib/platform.ts
 *
 * Runtime detection: determines whether the app is running inside
 * Tauri (desktop) or a standard browser (web/Vercel).
 *
 * Usage:
 *   import { isDesktop, isWeb } from '@/lib/platform'
 */

/**
 * True when running inside the Tauri WebView.
 * The `__TAURI_INTERNALS__` object is injected by Tauri v2.
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window
}

/** True when running in a standard browser (Vercel, localhost, etc.). */
export function isWeb(): boolean {
  return !isDesktop()
}

/**
 * The current platform as a string tag.
 * Useful for conditional logic and logging.
 */
export type Platform = 'tauri' | 'web'

export function getPlatform(): Platform {
  return isDesktop() ? 'tauri' : 'web'
}