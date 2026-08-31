'use client'

import { useEffect, useState } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/format-date'

/**
 * HeaderClock — live date + time display for the global top bar.
 *
 * Renders today's date as dd/mm/yyyy and the current time as HH:mm (24h),
 * updating every second. Mounted once in the global header so it's
 * visible on every authenticated page.
 *
 * Implementation notes:
 * - Initial render uses an empty string for both fields so server-rendered
 *   HTML matches the first client render (avoids hydration mismatch
 *   warnings — the clock only appears after mount on the client).
 * - setInterval(1000) keeps the time fresh to the second.
 * - The icon + layout matches the existing header chips (currency, language)
 *   so the clock doesn't look out of place.
 */
export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    // Set immediately on mount so the clock isn't blank for a full second.
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // While `now` is null (server render + first client paint), render the
  // same structural shell with empty values to keep hydration consistent.
  return (
    <div className="hidden md:flex items-center gap-2 px-2.5 h-8 rounded-md border bg-muted/30 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground tabular-nums">
          {now ? formatDate(now) : '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}
        </span>
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground tabular-nums">
          {now ? formatTime(now) : '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}
        </span>
      </span>
    </div>
  )
}
