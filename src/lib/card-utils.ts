/**
 * Card utility library for SelRx POS.
 * Provides Luhn validation, card brand detection from IIN ranges,
 * input formatting helpers, and PCI-DSS compliant data handling.
 *
 * SECURITY NOTES:
 * - Full PAN (card number) is NEVER stored — only validated then discarded.
 * - CVV is NEVER stored — used only for validation then discarded.
 * - Only the last 4 digits and card brand are persisted for receipt/record purposes.
 * - All sensitive operations happen server-side; this file is shared for client-side formatting.
 */

// ── Card Brand Detection (IIN/PREFIX ranges) ──

export type CardBrand =
  | 'VISA'
  | 'MASTERCARD'
  | 'AMEX'
  | 'DISCOVER'
  | 'DINERS_CLUB'
  | 'JCB'
  | 'UNIONPAY'
  | 'ELECTRON'
  | 'MAESTRO'
  | 'INTERPAYMENT'
  | 'UNKNOWN'

export interface CardBrandInfo {
  brand: CardBrand
  label: string
  /** Maximum length for card number */
  maxLength: number
  /** Expected CVV length */
  cvvLength: number
  /** Icon/gap pattern: array of group lengths for display */
  groups: number[]
  /** CSS-friendly color class */
  color: string
}

/** IIN prefix ranges for brand detection */
const BRAND_RULES: { prefixes: (string | number)[]; info: CardBrandInfo }[] = [
  {
    prefixes: ['4'],
    info: {
      brand: 'VISA',
      label: 'Visa',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#1A1F71',
    },
  },
  {
    prefixes: ['51', '52', '53', '54', '55', '22', '23', '24', '25', '26', '27'],
    info: {
      brand: 'MASTERCARD',
      label: 'Mastercard',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#EB001B',
    },
  },
  {
    prefixes: ['34', '37'],
    info: {
      brand: 'AMEX',
      label: 'American Express',
      maxLength: 15,
      cvvLength: 4,
      groups: [4, 6, 5],
      color: '#006FCF',
    },
  },
  {
    prefixes: ['6011', '644', '645', '646', '647', '648', '649', '65'],
    info: {
      brand: 'DISCOVER',
      label: 'Discover',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#FF6000',
    },
  },
  {
    prefixes: ['300', '301', '302', '303', '304', '305', '36', '38', '39'],
    info: {
      brand: 'DINERS_CLUB',
      label: 'Diners Club',
      maxLength: 14,
      cvvLength: 3,
      groups: [4, 6, 4],
      color: '#0079BE',
    },
  },
  {
    prefixes: ['3528', '3529', '353', '354', '355', '356', '357', '358'],
    info: {
      brand: 'JCB',
      label: 'JCB',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#0E4C96',
    },
  },
  {
    prefixes: ['62'],
    info: {
      brand: 'UNIONPAY',
      label: 'UnionPay',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#D10429',
    },
  },
  {
    prefixes: ['4026', '417500', '4405', '4508', '4844', '4913', '4917'],
    info: {
      brand: 'ELECTRON',
      label: 'Visa Electron',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#1A1F71',
    },
  },
  {
    prefixes: ['5018', '5020', '5038', '5893', '6304', '6759', '6761', '6762', '6763'],
    info: {
      brand: 'MAESTRO',
      label: 'Maestro',
      maxLength: 19,
      cvvLength: 3,
      groups: [4, 4, 4, 4, 3],
      color: '#003A70',
    },
  },
  {
    prefixes: ['636'],
    info: {
      brand: 'INTERPAYMENT',
      label: 'InterPayment',
      maxLength: 16,
      cvvLength: 3,
      groups: [4, 4, 4, 4],
      color: '#4B0082',
    },
  },
]

const DEFAULT_BRAND_INFO: CardBrandInfo = {
  brand: 'UNKNOWN',
  label: 'Card',
  maxLength: 19,
  cvvLength: 3,
  groups: [4, 4, 4, 4, 3],
  color: '#6B7280',
}

/**
 * Detect card brand from the first few digits of the card number.
 * Returns brand info including expected lengths and formatting.
 */
export function detectCardBrand(cardNumber: string): CardBrandInfo {
  const digits = cardNumber.replace(/\D/g, '')
  if (digits.length < 1) return DEFAULT_BRAND_INFO

  // Sort by prefix length descending so more specific prefixes match first
  const sorted = [...BRAND_RULES].sort((a, b) => {
    const maxA = Math.max(...a.prefixes.map((p) => String(p).length))
    const maxB = Math.max(...b.prefixes.map((p) => String(p).length))
    return maxB - maxA
  })

  for (const rule of sorted) {
    for (const prefix of rule.prefixes) {
      const prefixStr = String(prefix)
      if (digits.startsWith(prefixStr)) {
        return rule.info
      }
    }
  }

  return DEFAULT_BRAND_INFO
}

// ── Luhn Algorithm ──

/**
 * Validate a card number using the Luhn algorithm.
 * This is the standard checksum used by all major card networks.
 */
export function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false

  let sum = 0
  let isEven = false

  // Iterate from right to left
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

// ── Input Formatting ──

/**
 * Format a card number with spaces for display.
 * Groups digits according to the detected brand's pattern.
 */
export function formatCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '')
  const brand = detectCardBrand(digits)
  const groups = brand.groups

  let formatted = ''
  let digitIndex = 0

  for (let g = 0; g < groups.length && digitIndex < digits.length; g++) {
    if (g > 0) formatted += ' '
    const groupLen = groups[g]
    for (let j = 0; j < groupLen && digitIndex < digits.length; j++) {
      formatted += digits[digitIndex]
      digitIndex++
    }
  }

  return formatted
}

/**
 * Format expiry date from "MMYY" or "MM/YY" to "MM/YY".
 */
export function formatExpiry(expiry: string): string {
  const digits = expiry.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  return digits.slice(0, 2) + '/' + digits.slice(2, 4)
}

/**
 * Get the last 4 digits of a card number.
 */
export function getLast4(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '')
  return digits.slice(-4)
}

/**
 * Mask a card number showing only the last 4 digits.
 * e.g., "**** **** **** 1234"
 */
export function maskCardNumber(cardNumber: string): string {
  const last4 = getLast4(cardNumber)
  return `**** **** **** ${last4}`
}

// ── Validation ──

export interface CardValidationResult {
  valid: boolean
  errors: string[]
  brand: CardBrandInfo
}

/**
 * Validate all card fields.
 * @param cardNumber - Raw card number (digits only or formatted)
 * @param expiry - Expiry in "MM/YY" or "MMYY" format
 * @param cvv - CVV/CVC code
 * @param cardholderName - Name on card
 * @returns Validation result with errors if any
 */
export function validateCard(
  cardNumber: string,
  expiry: string,
  cvv: string,
  cardholderName?: string
): CardValidationResult {
  const errors: string[] = []
  const digits = cardNumber.replace(/\D/g, '')
  const brand = detectCardBrand(digits)

  // Card number checks
  if (!digits || digits.length === 0) {
    errors.push('Card number is required')
  } else if (digits.length < 13) {
    errors.push('Card number is too short')
  } else if (digits.length > brand.maxLength) {
    errors.push(`Card number is too long for ${brand.label} (max ${brand.maxLength} digits)`)
  } else if (!luhnCheck(digits)) {
    errors.push('Invalid card number')
  }

  // Expiry checks
  const expiryDigits = expiry.replace(/\D/g, '')
  if (!expiryDigits || expiryDigits.length < 4) {
    errors.push('Expiry date is required (MM/YY)')
  } else {
    const month = parseInt(expiryDigits.slice(0, 2), 10)
    const year = parseInt('20' + expiryDigits.slice(2, 4), 10)

    if (month < 1 || month > 12) {
      errors.push('Invalid expiry month (must be 01-12)')
    } else {
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()

      // Card is expired if the expiry year is past, or same year but past month
      if (year < currentYear || (year === currentYear && month < currentMonth)) {
        errors.push('Card has expired')
      }
    }
  }

  // CVV checks
  if (!cvv || cvv.replace(/\D/g, '').length === 0) {
    errors.push('CVV/CVC is required')
  } else if (cvv.replace(/\D/g, '').length !== brand.cvvLength) {
    errors.push(`CVV must be ${brand.cvvLength} digits for ${brand.label}`)
  }

  // Cardholder name check
  if (cardholderName !== undefined && cardholderName !== undefined) {
    const name = (cardholderName || '').trim()
    if (name.length > 0 && name.length < 2) {
      errors.push('Cardholder name is too short')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    brand,
  }
}

/**
 * Generate a random authorization code (6-character alphanumeric).
 */
export function generateAuthCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Generate a unique reference number for the card transaction.
 * Format: CARD-YYYYMMDD-XXXXXX
 */
export function generateCardRef(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `CARD-${date}-${random}`
}

/**
 * Sanitize card number by keeping only digits.
 */
export function sanitizeCardNumber(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '')
}

/**
 * Sanitize CVV by keeping only digits.
 */
export function sanitizeCvv(cvv: string): string {
  return cvv.replace(/\D/g, '')
}

/**
 * Get the card brand display icon/emoji.
 */
export function getCardBrandIcon(brand: CardBrand): string {
  switch (brand) {
    case 'VISA': return 'V'
    case 'MASTERCARD': return 'M'
    case 'AMEX': return 'A'
    case 'DISCOVER': return 'D'
    case 'DINERS_CLUB': return 'DC'
    case 'JCB': return 'J'
    case 'UNIONPAY': return 'U'
    case 'ELECTRON': return 'VE'
    case 'MAESTRO': return 'M'
    default: return 'C'
  }
}
