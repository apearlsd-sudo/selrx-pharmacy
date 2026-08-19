'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, X, AlertTriangle, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface AlertItem {
  name: string
  expiryDate: string
  quantity: number
  batchQty: number
  daysLeft: number
  kind: 'expiry' | 'reorder'
  reorderPoint?: number
}

export function AlertBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AlertItem[]>([])
  const [status, setStatus] = useState('init')
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    load()
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function load() {
    setStatus('loading')
    try {
      console.log('[Bell] Fetching /api/alerts/debug ...')
      const res = await fetch('/api/alerts/debug')
      console.log('[Bell] Response status:', res.status, res.ok)
      if (!res.ok) { setStatus('http-' + res.status); return }

      const data = await res.json()
      console.log('[Bell] Data received:', JSON.stringify(data).slice(0, 500))

      const result: AlertItem[] = []
      const today = new Date(); today.setHours(0,0,0,0)

      // Process expiring batches
      const batches = data.expiringBatchSample || []
      console.log('[Bell] Batches:', batches.length)
      for (const b of batches) {
        const exp = new Date(b.expiryDate)
        exp.setHours(0,0,0,0)
        const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
        result.push({
          name: b.name || '?',
          expiryDate: b.expiryDate || '',
          quantity: Number(b.quantity || 0),
          batchQty: Number(b.batchQty || 0),
          daysLeft: days,
          kind: 'expiry',
        })
      }

      // Process reorder items
      const reorders = data.reorderSample || []
      console.log('[Bell] Reorders:', reorders.length)
      for (const r of reorders) {
        result.push({
          name: r.name || '?',
          expiryDate: '',
          quantity: Number(r.quantity || 0),
          batchQty: Number(r.quantity || 0),
          daysLeft: 999,
          kind: 'reorder',
          reorderPoint: Number(r.reorderPoint || 0),
        })
      }

      console.log('[Bell] Total items:', result.length)
      setItems(result)
      setStatus(result.length > 0 ? 'ok' : 'empty')
    } catch (err) {
      console.error('[Bell] ERROR:', err)
      setStatus('error:' + String(err).slice(0, 80))
    }
  }

  const expiring = items.filter(i => i.kind === 'expiry').sort((a,b) => a.daysLeft - b.daysLeft)
  const reorders = items.filter(i => i.kind === 'reorder')
  const count = items.length

  return (
    <div className="relative">
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-lg text-gray-500 hover:text-gray-700"
        onClick={() => { setOpen(!open); if (!open && items.length === 0) load() }}
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>

      {open && (
        <div ref={panelRef} className="absolute right-0 top-full mt-2 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Alerts</h3>
              {count > 0 && <Badge variant="secondary" className="h-5 text-[10px] px-1.5">{count}</Badge>}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Status line - always visible for diagnostics */}
          <div className="px-4 py-1 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-mono text-gray-400">status: {status} | items: {count}</p>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto">
            {count === 0 ? (
              <div className="flex flex-col items-center py-10 px-4 text-center">
                <Bell className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No alerts found</p>
                <p className="text-[10px] font-mono text-gray-300 mt-1">{status}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {expiring.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-red-50/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" /> Expiring Soon ({expiring.length})
                      </p>
                    </div>
                    {expiring.map((item, i) => (
                      <div key={'e'+i} className="px-4 py-3 hover:bg-gray-50">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[11px] font-semibold ${item.daysLeft <= 7 ? 'text-orange-600' : 'text-amber-600'}`}>
                            {item.daysLeft <= 0 ? 'Expired' : item.daysLeft + 'd left'}
                          </span>
                          <span className="text-[11px] text-gray-400">· Qty: {item.batchQty}</span>
                          <span className="text-[11px] text-gray-400">· Exp: {item.expiryDate?.slice(0,10)}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {reorders.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-amber-50/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                        <Package className="h-3 w-3" /> Reorder Needed ({reorders.length})
                      </p>
                    </div>
                    {reorders.map((item, i) => (
                      <div key={'r'+i} className="px-4 py-3 hover:bg-gray-50">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <span className="text-[11px] font-semibold text-amber-600">
                          Qty: {item.quantity} / Reorder at: {item.reorderPoint}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2">
            <p className="text-[9px] font-mono text-gray-300 text-center">source: /api/alerts/debug (no auth)</p>
          </div>
        </div>
      )}
    </div>
  )
}
