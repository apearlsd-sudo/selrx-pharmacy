import { useAppStore } from '@/store/app-store'

/**
 * Returns auth headers for API requests — call inside client components.
 * Falls back to sensible defaults for SUPER_ADMIN when user is not set.
 */
export function authHeaders(): Record<string, string> {
  const state = useAppStore.getState()
  return {
    'Content-Type': 'application/json',
    'x-user-id': state.user?.id || '',
    'x-user-role': state.user?.role || 'SUPER_ADMIN',
    'x-user-permissions': (state.user?.permissions || []).join(','),
    'x-workstation-id': state.currentWorkstationId || '',
  }
}