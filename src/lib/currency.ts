/**
 * Currency formatting utility for SelRx.
 * Supports West African currencies only.
 * Reads the active currency from Zustand store via a getter function
 * so all views share a single source of truth.
 */

export type CurrencyCode = 'GHS' | 'NGN' | 'XOF' | 'XOF_BF' | 'XOF_CI' | 'XOF_TG' | 'XOF_ML' | 'XOF_SN' | 'XOF_NE' | 'GMD' | 'SLL' | 'LRD' | 'CVE' | 'MRU' | 'GNF' | 'STD'

export interface CurrencyOption {
  code: CurrencyCode
  symbol: string
  name: string
  locale: string
  country: string
  /** ISO 4217 code for Intl.NumberFormat (differs from internal code for some XOF variants) */
  isoCode: string
}

/**
 * West African currencies.
 * XOF (West African CFA franc) is shared by 8 countries but stored with
 * country-specific internal codes so the user can pick by country.
 * The isoCode is always 'XOF' for formatting purposes.
 */
export const CURRENCIES: Record<CurrencyCode, CurrencyOption> = {
  // Ghana
  GHS: { code: 'GHS', symbol: '₵',  name: 'Ghana Cedi (GH₵)',       locale: 'en-GH', country: 'Ghana',           isoCode: 'GHS' },
  // Nigeria
  NGN: { code: 'NGN', symbol: '₦',  name: 'Nigerian Naira (₦)',     locale: 'en-NG', country: 'Nigeria',         isoCode: 'NGN' },
  // CFA Franc — Benin
  XOF_BF: { code: 'XOF_BF', symbol: 'CFA', name: 'CFA Franc — Benin', locale: 'fr-BJ', country: 'Benin', isoCode: 'XOF' },
  // CFA Franc — Burkina Faso
  XOF:   { code: 'XOF',   symbol: 'CFA', name: 'CFA Franc — Burkina Faso', locale: 'fr-BF', country: 'Burkina Faso', isoCode: 'XOF' },
  // CFA Franc — Côte d'Ivoire
  XOF_CI: { code: 'XOF_CI', symbol: 'CFA', name: 'CFA Franc — Côte d\'Ivoire', locale: 'fr-CI', country: "Cote d'Ivoire", isoCode: 'XOF' },
  // CFA Franc — Mali
  XOF_ML: { code: 'XOF_ML', symbol: 'CFA', name: 'CFA Franc — Mali', locale: 'fr-ML', country: 'Mali', isoCode: 'XOF' },
  // CFA Franc — Niger
  XOF_NE: { code: 'XOF_NE', symbol: 'CFA', name: 'CFA Franc — Niger', locale: 'fr-NE', country: 'Niger', isoCode: 'XOF' },
  // CFA Franc — Senegal
  XOF_SN: { code: 'XOF_SN', symbol: 'CFA', name: 'CFA Franc — Senegal', locale: 'fr-SN', country: 'Senegal', isoCode: 'XOF' },
  // CFA Franc — Togo
  XOF_TG: { code: 'XOF_TG', symbol: 'CFA', name: 'CFA Franc — Togo', locale: 'fr-TG', country: 'Togo', isoCode: 'XOF' },
  // The Gambia
  GMD: { code: 'GMD', symbol: 'D',  name: 'Gambian Dalasi (D)',      locale: 'en-GM', country: 'Gambia',           isoCode: 'GMD' },
  // Sierra Leone (new Leone — revalued 2022, 1 new = 1000 old)
  SLL: { code: 'SLL', symbol: 'Le', name: 'Sierra Leonean Leone (Le)', locale: 'en-SL', country: 'Sierra Leone', isoCode: 'SLE' },
  // Liberia
  LRD: { code: 'LRD', symbol: 'L$', name: 'Liberian Dollar (L$)',     locale: 'en-LR', country: 'Liberia',         isoCode: 'LRD' },
  // Cape Verde
  CVE: { code: 'CVE', symbol: '$',  name: 'Cape Verdean Escudo ($)',  locale: 'pt-CV', country: 'Cape Verde',      isoCode: 'CVE' },
  // Mauritania
  MRU: { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya (UM)', locale: 'ar-MR', country: 'Mauritania',     isoCode: 'MRU' },
  // Guinea
  GNF: { code: 'GNF', symbol: 'FG', name: 'Guinean Franc (FG)',      locale: 'fr-GN', country: 'Guinea',         isoCode: 'GNF' },
  // São Tomé and Príncipe
  STD: { code: 'STD', symbol: 'Db', name: 'São Tomé Dobra (Db)',     locale: 'pt-ST', country: 'Sao Tome and Principe', isoCode: 'STN' },
}

export const CURRENCY_LIST: CurrencyOption[] = [
  CURRENCIES.GHS,
  CURRENCIES.NGN,
  CURRENCIES.XOF,
  CURRENCIES.XOF_BF,
  CURRENCIES.XOF_CI,
  CURRENCIES.XOF_ML,
  CURRENCIES.XOF_NE,
  CURRENCIES.XOF_SN,
  CURRENCIES.XOF_TG,
  CURRENCIES.GMD,
  CURRENCIES.SLL,
  CURRENCIES.LRD,
  CURRENCIES.CVE,
  CURRENCIES.MRU,
  CURRENCIES.GNF,
  CURRENCIES.STD,
]

/** West African countries with their default currency codes */
export const WEST_AFRICAN_COUNTRIES: { name: string; currencyCode: CurrencyCode }[] = [
  { name: 'Ghana',                 currencyCode: 'GHS' },
  { name: 'Nigeria',               currencyCode: 'NGN' },
  { name: 'Benin',                 currencyCode: 'XOF_BF' },
  { name: 'Burkina Faso',          currencyCode: 'XOF' },
  { name: "Cote d'Ivoire",         currencyCode: 'XOF_CI' },
  { name: 'Mali',                  currencyCode: 'XOF_ML' },
  { name: 'Niger',                 currencyCode: 'XOF_NE' },
  { name: 'Senegal',               currencyCode: 'XOF_SN' },
  { name: 'Togo',                  currencyCode: 'XOF_TG' },
  { name: 'Gambia',                currencyCode: 'GMD' },
  { name: 'Sierra Leone',          currencyCode: 'SLL' },
  { name: 'Liberia',               currencyCode: 'LRD' },
  { name: 'Guinea',                currencyCode: 'GNF' },
  { name: 'Cape Verde',            currencyCode: 'CVE' },
  { name: 'Mauritania',            currencyCode: 'MRU' },
  { name: 'Sao Tome and Principe', currencyCode: 'STD' },
]

/**
 * Map a country name to its default currency code.
 * Returns undefined if country is not in the West African list.
 */
export function currencyForCountry(country: string): CurrencyCode | undefined {
  return WEST_AFRICAN_COUNTRIES.find((c) => c.name === country)?.currencyCode
}

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
  const code: CurrencyCode = _getCurrencyCode ? _getCurrencyCode() : 'GHS'
  const cur = CURRENCIES[code]
  // For CFA franc, manually format with symbol since Intl may not handle XOF well in all envs
  if (cur.isoCode === 'XOF') {
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
    return `${formatted} CFA`
  }
  try {
    return new Intl.NumberFormat(cur.locale, {
      style: 'currency',
      currency: cur.isoCode,
    }).format(amount)
  } catch {
    // Fallback: symbol + number
    return `${cur.symbol}${amount.toLocaleString()}`
  }
}

/**
 * Get the currency symbol for the active currency.
 */
export function currencySymbol(): string {
  const code: CurrencyCode = _getCurrencyCode ? _getCurrencyCode() : 'GHS'
  return CURRENCIES[code].symbol
}

/**
 * Get the full CurrencyOption for the active currency.
 */
export function activeCurrency(): CurrencyOption {
  const code: CurrencyCode = _getCurrencyCode ? _getCurrencyCode() : 'GHS'
  return CURRENCIES[code]
}
