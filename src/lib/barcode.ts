/**
 * Barcode generation utilities.
 *
 * Supports two modes:
 * 1. Company-prefixed CODE128 barcodes (e.g., "GP" + random digits) — default when companyPrefix is provided
 * 2. EAN-13 barcodes from NDC — legacy mode for NDC-only products
 */

/**
 * Calculate EAN-13 check digit.
 */
function ean13CheckDigit(first12: string): number {
  const digits = first12.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Validate that a string is a valid EAN-13 (13 digits with correct check digit).
 */
export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const check = ean13CheckDigit(code.slice(0, 12))
  return check === parseInt(code[12], 10)
}

/**
 * Convert an NDC string to EAN-13.
 */
export function ndcToEAN13(ndc: string): string | null {
  const digits = ndc.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return null
  if (digits.length === 13 && isValidEAN13(digits)) return digits
  const padded = digits.padStart(12, '0').slice(0, 12)
  const check = ean13CheckDigit(padded)
  return padded + check
}

/**
 * Generate a random EAN-13 barcode.
 * Uses prefix range 200-299 (GS1 internal use).
 */
export function generateRandomEAN13(): string {
  const prefix = '2' + String(Math.floor(Math.random() * 100)).padStart(2, '0')
  let body = ''
  for (let i = 0; i < 10; i++) {
    body += String(Math.floor(Math.random() * 10))
  }
  const first12 = prefix + body
  const check = ean13CheckDigit(first12)
  return first12 + check
}

/**
 * Extract 2-letter uppercase initials from a company name.
 */
export function extractCompanyInitials(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'XX'
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/**
 * Generate a company-prefixed CODE128 barcode string.
 * Format: PREFIX (2 letters) + 8 random alphanumeric chars = ~10 chars
 * CODE128 supports alphanumeric, so letters in prefix are fine.
 */
function generateCompanyBarcode(prefix: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let suffix = ''
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${prefix}${suffix}`
}

/**
 * Generate a barcode for a product.
 *
 * - If companyPrefix is provided (2+ letter initials), generates a CODE128-compatible barcode: PREFIX + random alphanumeric
 * - If NDC is provided and can convert to EAN-13, returns EAN-13
 * - Otherwise generates random EAN-13
 */
export function generateBarcode(ndc?: string | null, companyPrefix?: string | null): string {
  // Company-prefixed barcode takes priority
  if (companyPrefix && companyPrefix.length >= 2) {
    return generateCompanyBarcode(companyPrefix.toUpperCase())
  }
  // NDC-based EAN-13
  if (ndc) {
    const fromNdc = ndcToEAN13(ndc)
    if (fromNdc) return fromNdc
  }
  // Random EAN-13 fallback
  return generateRandomEAN13()
}

/**
 * Ensure a barcode value is valid. If invalid or empty, generate one.
 */
export function ensureBarcode(barcode: string | null | undefined, ndc?: string | null, companyPrefix?: string | null): string {
  if (barcode && barcode.length >= 4) return barcode
  return generateBarcode(ndc, companyPrefix)
}

// ── Company prefix cache ──────────────────────────────────────────────

let _cachedPrefix: string | null = null
let _prefixFetchPromise: Promise<string> | null = null

/**
 * Fetch the company name and return 2-letter initials.
 * Results are cached for the session.
 */
export async function getCompanyPrefix(): Promise<string> {
  if (_cachedPrefix) return _cachedPrefix
  if (_prefixFetchPromise) return _prefixFetchPromise

  _prefixFetchPromise = (async () => {
    try {
      const res = await fetch('/api/company-branding')
      if (res.ok) {
        const data = await res.json()
        if (data.name) {
          _cachedPrefix = extractCompanyInitials(data.name)
          return _cachedPrefix
        }
      }
    } catch {
      // ignore
    }
    return 'XX'
  })()

  return _prefixFetchPromise
}
