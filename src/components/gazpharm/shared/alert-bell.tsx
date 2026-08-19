'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, AlertTriangle, Package, Clock, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { authHeaders } from '@/lib/auth-headers'
import { formatDate } from '@/lib/date-utils'
import { useAppStore } from '@/store/app-store'

// ── Types ──────────────────────────────────────────────────────────────

interface ExpiringProduct {
  productId: string
  productName: string
  expiryDate: string | null
  quantity: number
  batchQty: number | null
  daysToExpiry: number
  batchNumber?: string | null
}

interface ReorderProduct {
  productId: string
  productName: string
  quantity: number
  reorderPoint: number
}

interface Notification {
  id: string
  title: string
  message: string
  type: string
  status: string
  createdAt: string
}

// ── Component ──────────────────────────────────────────────────────────

export function AlertBell() {
  const [open, setOpen] = useState(false)
  const [expiringProducts, setExpiringProducts] = useState<ExpiringProduct[]>([])
  const [reorderProducts, setReorderProducts] = useState<ReorderProduct[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)

  const totalUnread = notifications.filter((n) => n.status === 'UNREAD').length + expiringProducts.length + reorderProducts.length

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const headers = authHeaders()

      const [expiringRes, reorderRes, notifRes] = await Promise.allSettled([
        fetch('/api/alerts?type=expiringSoon&limit=10', { headers }),
        fetch('/api/alerts?type=belowReorder&limit=10', { headers }),
        fetch('/api/notifications?status=UNREAD&limit=10', { headers }),
      ])

      const debugParts: string[] = []

      if (expiringRes.status === 'fulfilled' && expiringRes.value.ok) {
        const json = await expiringRes.value.json()
        const items = json.items || json.expiringSoon || []
        setExpiringProducts(items)
        debugParts.push('Expiring: ' + items.length)
      } else if (expiringRes.status === 'fulfilled') {
        debugParts.push('Expiring HTTP ' + expiringRes.value.status)
      } else {
        debugParts.push('Expiring failed')
      }

      if (reorderRes.status === 'fulfilled' && reorderRes.value.ok) {
        const json = await reorderRes.value.json()
        const items = json.items || json.belowReorder || []
        setReorderProducts(items)
        debugParts.push('Reorder: ' + items.length)
      } else if (reorderRes.status === 'fulfilled') {
        debugParts.push('Reorder HTTP ' + reorderRes.value.status)
      } else {
        debugParts.push('Reorder failed')
      }

      if (notifRes.status === 'fulfilled' && notifRes.value.ok) {
        const json = await notifRes.value.json()
        setNotifications(json.notifications || json.items || json || [])
      }

      setDebugInfo(debugParts.join(' | '))
    } catch (err) {
      console.error('[AlertBell] Failed to fetch alerts:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchAlerts()
    setInitialized(true)
  }, [])

  // Re-fetch when inventory changes
  useEffect(() => {
    if (initialized) fetchAlerts()
  }, [inventoryVersion, fetchAlerts, initialized])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Escape key to close
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  return (
    <div className="relative">
      {/* Bell Button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg shadow-gray-200/50 dark:shadow-black/30 animate-fade-in overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
              {totalUnread > 0 && (
                <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-medium">
                  {totalUnread}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {totalUnread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={async () => {
                    try {
                      await fetch('/api/notifications?status=UNREAD&limit=10', {
                        method: 'PATCH',
                        headers: authHeaders(),
                      })
                    } catch { /* ignore */ }
                    setNotifications((prev) =>
                      prev.map((n) => ({ ...n, status: 'READ' }))
                    )
                  }}
                >
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : expiringProducts.length === 0 && reorderProducts.length === 0 && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <Bell className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No alerts found</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {debugInfo.includes('HTTP')
                    ? 'Error fetching alerts'
                    : 'No products expiring within 14 days or at reorder level'}
                </p>
                <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2 font-mono">{debugInfo}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {/* Expiring Products Section */}
                {expiringProducts.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-red-50/50 dark:bg-red-950/20">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" />
                        Expiring Soon
                      </p>
                    </div>
                    {expiringProducts.map((item) => {
                      const isExpired = item.daysToExpiry <= 0
                      const isUrgent = item.daysToExpiry <= 30 && item.daysToExpiry > 0
                      return (
                        <button
                          key={'exp-' + item.productId}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isExpired
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                                : isUrgent
                                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                                  : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                            }`}>
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {item.productName}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[11px] font-semibold ${
                                  isExpired
                                    ? 'text-red-600 dark:text-red-400'
                                    : isUrgent
                                      ? 'text-orange-600 dark:text-orange-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                }`}>
                                  {isExpired
                                    ? 'Expired'
                                    : item.daysToExpiry + ' day' + (item.daysToExpiry !== 1 ? 's' : '') + ' left'
                                  }
                                </span>
                                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                  · Batch qty: {item.batchQty ?? item.quantity}
                                </span>
                                {item.expiryDate && (
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                    · Exp: {formatDate(item.expiryDate)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}

                {/* Reorder Alerts Section */}
                {reorderProducts.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-amber-50/50 dark:bg-amber-950/20">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Package className="h-3 w-3" />
                        Reorder Needed
                      </p>
                    </div>
                    {reorderProducts.map((item) => (
                      <button
                        key={'reorder-' + item.productId}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {item.productName}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                Qty: {item.quantity} / Reorder at: {item.reorderPoint}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Notifications Section */}
                {notifications.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/40">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Recent
                      </p>
                    </div>
                    {notifications.map((notif) => {
                      const iconClass = notif.type === 'PAYMENT' ? CreditCard : Clock
                      const IconComp = iconClass
                      const isUnread = notif.status === 'UNREAD'
                      return (
                        <button
                          key={notif.id}
                          type="button"
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            isUnread
                              ? 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/30'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center shrink-0">
                              <IconComp className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                                  {notif.title}
                                </p>
                                {isUnread && (
                                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                {notif.message}
                              </p>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                {formatDate(notif.createdAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => {
                setOpen(false)
                useAppStore.getState().setCurrentView('inventory')
              }}
            >
              View all in Inventory
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
