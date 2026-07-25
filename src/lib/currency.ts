/**
 * Currency formatting utility for GAZPharm.
 * Supports USD ($), Ghana Cedi (₵), and Nigerian Naira (₦).
 * Reads the active currency from Zustand store via a getter function
 * so all views share a single source of truth.
 */

export type CurrencyCode = 'USD' | 'GHS' | 'NGN'

export interface CurrencyOption {
  code: CurrencyCode
  symbol: string
  name: string
  locale: string
}

export const CURRENCIES: Record<CurrencyCode, CurrencyOption> = {
  USD: { code: 'USD', symbol: '$',  name: 'US Dollar',     locale: 'en-US' },
  GHS: { code: 'GHS', symbol: '₵',  name: 'Ghana Cedi',    locale: 'en-GH' },
  NGN: { code: 'NGN', symbol: '₦',  name: 'Nigerian Naira', locale: 'en-NG' },
}

export const CURRENCY_LIST: CurrencyOption[] = [
  CURRENCIES.USD,
  CURRENCIES.GHS,
  CURRENCIES.NGN,
]

// We allow a lazy-injected getter so the utility doesn't
// directly depend on Zustand (avoids circular imports).
let _getCurrencyCode: (() => CurrencyCode) | null = null

/**
 * Called once from the app shell to wire the store getter.
 */
export function initCurrencyGetter(getter: () => CurrencyCode): void {
  _getCurrencyCode = getter
}

/**
 * Format an amount using the currently selected currency.
 */
export function formatCurrency(amount: number): string {
  const code: CurrencyCode = _getCurrencyCode ? _getCurrencyCode() : 'USD'
  const cur = CURRENCIES[code]
  return new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
  }).format(amount)
}

/**
 * Get the currency symbol for the active currency.
 */
export function currencySymbol(): string {
  const code: CurrencyCode = _getCurrencyCode ? _getCurrencyCode() : 'USD'
  return CURRENCIES[code].symbol
}

/**
 * Get the full CurrencyOption for the active currency.
 */
export function activeCurrency(): CurrencyOption {
  const code: CurrencyCode = _getCurrencyCode ? _getCurrencyCode() : 'USD'
  return CURRENCIES[code]
}
