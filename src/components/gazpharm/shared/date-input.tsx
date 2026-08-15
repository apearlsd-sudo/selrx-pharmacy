'use client'

import { useCallback } from 'react'
import {
  formatDateInput,
  parseDateInput,
  autoFormatDateInput,
  getDatePlaceholder,
  getDateInputMaxLength,
} from '@/lib/date-utils'

interface DateInputProps {
  /** ISO date string (yyyy-mm-dd) for the current value */
  value: string
  /** Called with ISO date string (yyyy-mm-dd) or empty string */
  onChange: (iso: string) => void
  className?: string
  max?: string   /** ISO date string */
  min?: string   /** ISO date string */
}

/**
 * A text-based date input that respects the user's global date format preference.
 * - value/onChange work in ISO format (yyyy-mm-dd)
 * - Display auto-formats according to dateFormat (dd/mm/yyyy, mm/dd/yyyy, etc.)
 * - Auto-inserts separators as user types
 */
export function DateInput({ value, onChange, className, max, min }: DateInputProps) {
  // Convert ISO → display format
  const displayValue = value ? formatDateInput(value) : ''

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const formatted = autoFormatDateInput(raw)
      // Try to parse; if valid, pass ISO; otherwise pass formatted string so user can keep typing
      const iso = parseDateInput(formatted)
      onChange(iso || '')
    },
    [onChange],
  )

  // Convert ISO min/max to display for native validation (limited but helpful)
  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      placeholder={getDatePlaceholder()}
      maxLength={getDateInputMaxLength()}
      className={className}
      data-date-iso={value || undefined}
    />
  )
}
