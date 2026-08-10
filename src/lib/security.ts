/**
 * Security utilities — password hashing, JWT issuance/verification,
 * AES-256-GCM encryption for sensitive fields, and rate limiting.
 */

import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

// ── Password Hashing ──

const BCRYPT_ROUNDS = 12

/** Hash a plaintext password using bcrypt */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

/** Compare a plaintext password against a bcrypt hash.
 *  Supports transparent migration: if the stored hash is NOT bcrypt
 *  (i.e. legacy plaintext), it returns true and signals rehash needed.
 *  Uses timing-safe comparison for legacy plaintext to prevent timing attacks. */
export async function verifyPassword(plain: string, stored: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  // If stored value looks like a bcrypt hash ($2a$/$2b$), verify normally
  if (stored.startsWith('$2')) {
    const valid = await bcrypt.compare(plain, stored)
    return { valid, needsRehash: false }
  }
  // Legacy plaintext comparison — use timing-safe comparison
  const a = Buffer.from(plain, 'utf-8')
  const b = Buffer.from(stored, 'utf-8')
  if (a.length !== b.length) {
    return { valid: false, needsRehash: true }
  }
  const valid = crypto.timingSafeEqual(a, b)
  return { valid, needsRehash: true }
}

// ── JWT ──

const JWT_ALG = 'HS256'
const JWT_EXPIRY = '8h' // 8-hour session (covers a full shift)

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return new TextEncoder().encode(secret)
}

export interface JwtPayload {
  userId: string
  email: string
  role: string
  permissions: string[]
  workstationId?: string
}

/** Sign a JWT with user claims */
export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret())
}

/** Verify a JWT and return its claims, or null if invalid/expired */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
      permissions: (payload.permissions as string[]) || [],
      workstationId: payload.workstationId as string | undefined,
    }
  } catch {
    return null
  }
}

// ── AES-256-GCM Encryption (for sensitive data at rest) ──

const AES_ALGO = 'AES-256-GCM'

function getAesKey(): Uint8Array {
  const key = process.env.AES_ENCRYPTION_KEY
  if (!key) throw new Error('AES_ENCRYPTION_KEY environment variable is not set')
  // Key must be exactly 32 bytes (256 bits) for AES-256
  const raw = new TextEncoder().encode(key)
  if (raw.length !== 32) {
    console.error(
      `[security] AES_ENCRYPTION_KEY is ${raw.length} bytes but must be exactly 32 bytes (256 bits). ` +
      `Deriving via SHA-256 — this may break decryption of data encrypted with a different-length key. ` +
      `Set AES_ENCRYPTION_KEY to a 32-character string to avoid this warning.`
    )
    // Derive a 32-byte key using SHA-256 if the provided key is wrong length
    // NOTE: This is a compatibility fallback. In production, always use a 32-byte key.
    return crypto.subtle.digest('SHA-256', raw).then(b => new Uint8Array(b)) as unknown as Uint8Array
  }
  return raw
}

/** Encrypt a plaintext string using AES-256-GCM. Returns base64-encoded iv:ciphertext:tag. */
export async function aesEncrypt(plaintext: string): Promise<string> {
  const key = await getAesKeyAsync()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    key,
    encoded
  )

  // Combine iv + ciphertext
  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipherBuffer), iv.length)

  return Buffer.from(combined).toString('base64')
}

/** Decrypt an AES-256-GCM encrypted string (base64-encoded iv:ciphertext:tag). */
export async function aesDecrypt(encrypted: string): Promise<string> {
  const key = await getAesKeyAsync()
  const combined = Uint8Array.from(Buffer.from(encrypted, 'base64'))

  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

/** Async version of getAesKey using Web Crypto API */
async function getAesKeyAsync(): Promise<CryptoKey> {
  const rawKey = getAesKey()
  return crypto.subtle.importKey('raw', rawKey, { name: AES_ALGO }, false, ['encrypt', 'decrypt'])
}

// ── Rate Limiting (in-memory, per-endpoint) ──

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt <= now) rateLimitStore.delete(key)
    }
  }, 5 * 60 * 1000)
}

/**
 * Check rate limit for a given key.
 * @returns true if the request should be allowed, false if rate limited.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

/** Get remaining retry-after seconds for a rate-limited key */
export function getRetryAfter(key: string): number {
  const entry = rateLimitStore.get(key)
  if (!entry) return 0
  return Math.ceil((entry.resetAt - Date.now()) / 1000)
}

// ── Table name whitelist (for sync server) ──

export const ALLOWED_SYNC_TABLES = [
  'Product', 'Inventory', 'Batch', 'Customer', 'User',
  'Transaction', 'TransactionItem', 'Return', 'Prescription',
  'Company', 'Manufacturer', 'Vendor', 'Category',
  'StockTake', 'StockTakeItem', 'AuditLog', 'ProductHistory',
  'HardwareLog', 'Shift', 'ShiftInventory', 'Workstation',
  '_CategoryToProduct', 'SystemRole',
] as const

export function isAllowedTable(name: string): boolean {
  return (ALLOWED_SYNC_TABLES as readonly string[]).includes(name)
}

/** Validate and return a table name, or throw if not whitelisted */
export function validateTableName(name: string): string {
  // Only allow alphanumeric + underscore, no SQL injection possible
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`)
  }
  if (!isAllowedTable(name)) {
    throw new Error(`Table not allowed for sync: ${name}`)
  }
  return name
}
