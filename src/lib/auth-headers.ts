import { useAppStore } from '@/store/app-store'

/**
 * Returns auth headers for API requests — call inside client components.
 * Falls back to sensible defaults for SUPER_ADMIN when user is not set.
 */
export function authHeaders(): Record<string, string> {
  const user = useAppStore.getState().user
  return {
    'Content-Type': 'application/json',
    'x-user-id': user?.id || '',
    'x-user-role': user?.role || 'SUPER_ADMIN',
    'x-user-permissions': (user?.permissions || []).join(','),
  }
}
