'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  formatDateInput,
  parseDateInput,
  autoFormatDateInput,
  getDatePlaceholder,
  getDateInputMaxLength,
} from '@/lib/date-utils'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'

type DateType = Date | undefined

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
 * A date input with calendar picker that respects the user's global date format preference.
 * - value/onChange work in ISO format (yyyy-mm-dd)
 * - Display auto-formats according to dateFormat (dd/mm/yyyy, mm/dd/yyyy, etc.)
 * - Auto-inserts separators as user types
 * - Calendar icon opens a popover calendar for point-and-click selection
 */
export function DateInput({ value, onChange, className, max, min }: DateInputProps) {
  const [open, setOpen] = useState(false)
  const [localText, setLocalText] = useState('')
  const isTyping = useRef(false)

  // When the parent value changes externally (not from typing), sync display
  useEffect(() => {
    if (!isTyping.current) {
      setLocalText(value ? formatDateInput(value) : '')
    }
  }, [value])

  // Parse ISO → Date object for calendar (noon to avoid DST issues)
  const selectedDate: DateType = value ? (() => {
    const d = new Date(value + 'T12:00:00')
    return isNaN(d.getTime()) ? undefined : d
  })() : undefined

  // Min/max as Date objects for calendar
  const minDate: DateType = min ? new Date(min + 'T12:00:00') : undefined
  const maxDate: DateType = max ? new Date(max + 'T12:00:00') : undefined

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      isTyping.current = true
      const raw = e.target.value
      const formatted = autoFormatDateInput(raw)
      setLocalText(formatted)

      // Only propagate to parent when we have a complete valid date
      const iso = parseDateInput(formatted)
      if (iso) {
        onChange(iso)
      }
      // Reset typing flag after a tick so the effect can re-sync if needed
      setTimeout(() => { isTyping.current = false }, 0)
    },
    [onChange],
  )

  const handleBlur = useCallback(() => {
    isTyping.current = false
    // If the user left an incomplete date, revert to the parent value
    const iso = parseDateInput(localText)
    if (!iso && value) {
      setLocalText(formatDateInput(value))
    } else if (!iso) {
      setLocalText('')
    }
  }, [localText, value])

  const handleSelect = useCallback(
    (date: DateType) => {
      setOpen(false)
      if (!date) { onChange(''); setLocalText(''); return }
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const iso = `${y}-${m}-${d}`
      onChange(iso)
      setLocalText(formatDateInput(iso))
    },
    [onChange],
  )

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={localText}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        placeholder={getDatePlaceholder()}
        maxLength={getDateInputMaxLength()}
        className={`${className || ''} pr-7`}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
            tabIndex={-1}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selectedDate}
            onSelect={handleSelect}
            disabled={(d) => {
              if (minDate && d < minDate) return true
              if (maxDate && d > maxDate) return true
              return false
            }}
            defaultMonth={selectedDate}
            fromYear={minDate ? minDate.getFullYear() : 2000}
            toYear={maxDate ? maxDate.getFullYear() : 2035}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
