import { useAppStore } from '@/store/app-store'

/**
 * Returns auth headers for API requests — call inside client components.
 * Sends the JWT token for server-side verification.
 */
export function authHeaders(): Record<string, string> {
  const state = useAppStore.getState()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${state.authToken || ''}`,
    'x-workstation-id': state.currentWorkstationId || '',
  }
}
