import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Reduce sample rate in production to control quota
  tracesSampleRate: 0.2,

  // Only capture a fraction of replays
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.5,

  // Don't capture in local dev
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Filter out noisy errors
  ignoreErrors: [
    'Network error',
    'Failed to fetch',
    'Loading chunk',
    'Script error',
    'Non-Error promise rejection',
  ],

  // Attach user info from our auth store
  initialScope: {
    tags: {
      app: 'selrx-pos',
    },
  },
})
