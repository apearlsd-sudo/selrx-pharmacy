import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/security'

/**
 * Next.js middleware — runs on every request.
 *
 * 1. Verifies JWT on /api/* routes (except login, company-setup, and health)
 * 2. Attaches verified user info to request headers for downstream routes
 * 3. Rejects unauthenticated/unauthorized requests with 401
 */

// Routes that don't require authentication
// NOTE: /api/setup/ and /api/auth/session were removed — they now require JWT.
//       Setup routes should only run during initial deployment (protected by SETUP_TOKEN on company-setup).
//       Session validation must use the middleware-injected x-user-id, not client-sent userId.
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/company-setup',
  '/api/health',
  '/api/audit-logs/debug',
  // Static assets and Next.js internals
  '/_next/',
  '/favicon.ico',
  '/icons/',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip non-API routes and public paths
  if (!pathname.startsWith('/api/') || isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Extract JWT from Authorization header — required for ALL API requests
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Attach verified claims as headers for downstream route handlers
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-user-id', payload.userId)
    requestHeaders.set('x-user-role', payload.role)
    requestHeaders.set('x-user-email', payload.email)
    requestHeaders.set('x-user-permissions', payload.permissions.join(','))

    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}

export const config = {
  matcher: ['/api/:path*'],
}
