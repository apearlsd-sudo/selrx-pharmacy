'use client'

import { DateInput } from './date-input'
import { X } from 'lucide-react'

interface DateFilterBarProps {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  className?: string
}

/**
 * Compact inline date range filter: [From] – [To] [×clear]
 * Designed to sit alongside other filter controls in a flex row.
 */
export function DateFilterBar({ from, to, onFromChange, onToChange, className = '' }: DateFilterBarProps) {
  const hasFilter = !!from || !!to
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">From</span>
      <DateInput
        value={from}
        onChange={onFromChange}
        max={to || undefined}
        className="h-9 w-[110px] text-xs border-[0.5px] border-gray-300/60 bg-gray-50/50"
      />
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">To</span>
      <DateInput
        value={to}
        onChange={onToChange}
        min={from || undefined}
        className="h-9 w-[110px] text-xs border-[0.5px] border-gray-300/60 bg-gray-50/50"
      />
      {hasFilter && (
        <button
          type="button"
          onClick={() => { onFromChange(''); onToChange('') }}
          className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear date filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
