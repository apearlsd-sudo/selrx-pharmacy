#!/usr/bin/env node
/**
 * install-turso-adapter.mjs
 *
 * Installs @libsql/client and @prisma/adapter-libsql ONLY when
 * TURSO_DATABASE_URL is set (i.e., on Vercel).
 *
 * This prevents Turbopack from statically bundling the LibSQL adapter
 * during local development, which causes "URL 'undefined'" errors.
 *
 * Usage: Called automatically by `npm run build` on Vercel.
 */

import { execSync } from 'child_process'

if (process.env.TURSO_DATABASE_URL) {
  console.log('⚡ TURSO_DATABASE_URL detected — installing LibSQL adapter...')
  try {
    execSync('npm install @libsql/client @prisma/adapter-libsql --no-save', {
      stdio: 'inherit',
      timeout: 60000,
    })
    console.log('✅ LibSQL adapter installed')
  } catch (e) {
    console.error('❌ Failed to install LibSQL adapter:', e.message)
    process.exit(1)
  }
} else {
  console.log('ℹ️  No TURSO_DATABASE_URL — skipping LibSQL adapter install (using local SQLite)')
}
