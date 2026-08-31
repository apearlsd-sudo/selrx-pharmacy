/**
 * Mobile Money utility library for SelRx POS.
 * Provides phone number validation, provider detection,
 * reference generation, and masking for mobile money payments.
 *
 * SECURITY NOTES:
 * - Full phone number is NEVER stored — only masked format persisted.
 * - Phone number is validated then only the masked version is retained.
 * - Simulated processing mimics real-world mobile money API behavior.
 * - Ready for integration with real providers (Paystack, Flutterwave, Hubtel, etc.)
 */

// ── Mobile Money Provider Detection ──

export type MobileMoneyProvider =
  | 'MTN_MOMO'
  | 'VODAFONE_CASH'
  | 'AIRTEL_MONEY'
  | 'TIGO_CASH'
  | 'UNKNOWN'

export interface MobileMoneyProviderInfo {
  provider: MobileMoneyProvider
  label: string
  color: string        // Brand color for UI theming
  logoInitials: string // Short text for logo placeholder
  prefixPatterns: string[]  // Phone number prefixes
  shortcode: string    // USSD shortcode
}

/** Provider rules sorted by specificity (longer prefixes first) */
const PROVIDER_RULES: MobileMoneyProviderInfo[] = [
  {
    provider: 'MTN_MOMO',
    label: 'MTN Mobile Money',
    color: '#FFC300',
    logoInitials: 'MTN',
    prefixPatterns: ['+23324', '+23325', '+23354', '+23355', '024', '025', '054', '055'],
    shortcode: '*170#',
  },
  {
    provider: 'VODAFONE_CASH',
    label: 'Vodafone Cash',
    color: '#E60000',
    logoInitials: 'VDF',
    prefixPatterns: ['+23320', '+23350', '020', '050'],
    shortcode: '*110#',
  },
  {
    provider: 'AIRTEL_MONEY',
    label: 'AirtelTigo Money',
    color: '#ED1C24',
    logoInitials: 'ATM',
    prefixPatterns: ['+23326', '+23327', '+23356', '+23357', '026', '027', '056', '057'],
    shortcode: '*500#',
  },
  {
    provider: 'TIGO_CASH',
    label: 'Tigo Cash',
    color: '#00A651',
    logoInitials: 'TGO',
    prefixPatterns: ['+23327', '+23357', '027', '057'],
    shortcode: '*100#',
  },
]

const DEFAULT_PROVIDER: MobileMoneyProviderInfo = {
  provider: 'UNKNOWN',
  label: 'Mobile Money',
  color: '#6B7280',
  logoInitials: 'MM',
  prefixPatterns: [],
  shortcode: '',
}

/**
 * Get all available mobile money providers for UI selection.
 */
export function getAvailableProviders(): MobileMoneyProviderInfo[] {
  return PROVIDER_RULES.filter((p) => p.provider !== 'UNKNOWN')
}

/**
 * Auto-detect mobile money provider from phone number.
 * Supports Ghana phone number formats: +233XX..., 0XX...
 */
export function detectProvider(phoneNumber: string): MobileMoneyProviderInfo {
  const digits = phoneNumber.replace(/[\s\-()]/g, '')
  if (!digits) return DEFAULT_PROVIDER

  // Sort by prefix length descending for more specific match
  const sorted = [...PROVIDER_RULES].sort(
    (a, b) =>
      Math.max(...b.prefixPatterns.map((p) => p.length)) -
      Math.max(...a.prefixPatterns.map((p) => p.length))
  )

  for (const rule of sorted) {
    for (const prefix of rule.prefixPatterns) {
      if (digits.startsWith(prefix)) {
        return rule
      }
    }
  }

  return DEFAULT_PROVIDER
}

// ── Phone Number Formatting & Validation ──

/**
 * Format a phone number for display.
 * Converts +233XXXXXXXX to 0XXX XXX XXXX format.
 */
export function formatPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^\d+]/g, '')

  // If starts with +233, convert to 0XX format
  if (digits.startsWith('+233')) {
    const local = '0' + digits.slice(4)
    return formatLocalPhone(local)
  }

  // If starts with 233 (without +), convert to 0XX format
  if (digits.startsWith('233') && digits.length >= 12) {
    const local = '0' + digits.slice(3)
    return formatLocalPhone(local)
  }

  return formatLocalPhone(digits)
}

function formatLocalPhone(digits: string): string {
  const d = digits.replace(/\D/g, '')
  if (d.length <= 3) return d
  if (d.length <= 6) return d.slice(0, 3) + ' ' + d.slice(3)
  return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 10)
}

/**
 * Validate a Ghana mobile money phone number.
 * Accepts formats: +233XXXXXXXX, 0XXXXXXXXX, 233XXXXXXXX
 */
export function validatePhoneNumber(phoneNumber: string): { valid: boolean; error: string; normalized: string } {
  const digits = phoneNumber.replace(/[^\d+]/g, '')

  if (!digits || digits.length === 0) {
    return { valid: false, error: 'Phone number is required', normalized: '' }
  }

  let normalized = digits

  // Normalize to 0XX format
  if (digits.startsWith('+233') && digits.length >= 13) {
    normalized = '0' + digits.slice(4)
  } else if (digits.startsWith('233') && digits.length >= 12) {
    normalized = '0' + digits.slice(3)
  }

  // After normalization, should be 10 digits starting with 0
  const clean = normalized.replace(/\D/g, '')

  if (clean.length !== 10) {
    return { valid: false, error: 'Enter a valid 10-digit Ghana phone number (0XX XXX XXXX)', normalized: clean }
  }

  if (!clean.startsWith('0')) {
    return { valid: false, error: 'Phone number must start with 0', normalized: clean }
  }

  // Check if the provider can be detected
  const provider = detectProvider(clean)
  if (provider.provider === 'UNKNOWN') {
    return { valid: false, error: 'Unrecognized mobile network. Use MTN, Vodafone, AirtelTigo, or Tigo number.', normalized: clean }
  }

  return { valid: true, error: '', normalized: clean }
}

/**
 * Mask phone number for storage/receipt display.
 * Shows only the first 4 and last 2 digits.
 * e.g., 0245 *** 89
 */
export function maskPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '')
  if (digits.length < 6) return digits
  return digits.slice(0, 4) + ' *** ' + digits.slice(-2)
}

// ── Reference Generation ──

/**
 * Generate a unique reference number for mobile money transactions.
 * Format: MOMO-YYYYMMDD-XXXXXX
 */
export function generateMomoRef(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `MOMO-${date}-${random}`
}

// ── Transaction Reference (for customer's SMS/prompt) ──

/**
 * Generate a short transaction ID shown to the customer on their phone.
 * Format: 6-digit numeric code
 */
export function generateMomoTxnId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
