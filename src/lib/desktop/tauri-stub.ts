/**
 * src/lib/desktop/tauri-stub.ts
 *
 * No-op stub for @tauri-apps/api/core used during web builds.
 * When running inside Tauri, the real package is available and the alias
 * in next.config.ts is NOT active, so the real invoke is used instead.
 *
 * If any bridge function is accidentally called on web, this throws a
 * clear error instead of crashing with "module not found".
 */

export const invoke = async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => {
  throw new Error(
    '[Tauri Bridge] This function is only available in the Tauri desktop app. ' +
    'Check isDesktop() before calling any tauri-bridge function.'
  )
}
