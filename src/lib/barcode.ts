/**
 * EAN-13 barcode generation utilities.
 *
 * - If a product has an NDC (10 or 11 digits), it's converted to EAN-13.
 * - Otherwise a random EAN-13 is generated.
 * - Users can override with manual entry.
 */

/**
 * Calculate EAN-13 check digit.
 * The check digit is the last digit of an EAN-13 barcode.
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
 *
 * NDC formats:
 *  - 5-4-2 (11 digits): e.g., 12345-6789-01 → pad to 12 digits with leading 0, calc check
 *  - 5-3-2 (10 digits): e.g., 12345-678-01 → pad to 12 digits with leading 00, calc check
 *  - 10-digit plain: pad to 12 digits with leading 00, calc check
 *  - 11-digit plain: pad to 12 digits with leading 0, calc check
 *  - 12-digit plain: just calc check digit
 *  - 13-digit plain: validate as-is if valid EAN-13
 *
 * Returns null if the NDC is too short or can't be converted.
 */
export function ndcToEAN13(ndc: string): string | null {
  // Strip non-digit characters
  const digits = ndc.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return null

  // If already a valid 13-digit EAN-13, return as-is
  if (digits.length === 13 && isValidEAN13(digits)) return digits

  // Pad to 12 digits
  const padded = digits.padStart(12, '0').slice(0, 12)
  const check = ean13CheckDigit(padded)
  return padded + check
}

/**
 * Generate a random EAN-13 barcode.
 * Uses a prefix range (200-299) that's reserved for internal use
 * and won't conflict with real product barcodes.
 */
export function generateRandomEAN13(): string {
  // Use 2xx prefix range (GS1 internal use)
  const prefix = '2' + String(Math.floor(Math.random() * 100)).padStart(2, '0')
  // Generate 10 more random digits
  let body = ''
  for (let i = 0; i < 10; i++) {
    body += String(Math.floor(Math.random() * 10))
  }
  const first12 = prefix + body
  const check = ean13CheckDigit(first12)
  return first12 + check
}

/**
 * Generate an EAN-13 barcode for a product.
 * Tries NDC first, falls back to random.
 */
export function generateBarcode(ndc?: string | null): string {
  if (ndc) {
    const fromNdc = ndcToEAN13(ndc)
    if (fromNdc) return fromNdc
  }
  return generateRandomEAN13()
}

/**
 * Ensure a barcode value is valid. If invalid or empty, generate one.
 */
export function ensureBarcode(barcode: string | null | undefined, ndc?: string | null): string {
  if (barcode && isValidEAN13(barcode)) return barcode
  return generateBarcode(ndc)
}
