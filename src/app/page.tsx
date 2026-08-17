'use client'

import { useEffect, useCallback, Component, type ReactNode, useState } from 'react'
import { formatDateWeekday } from '@/lib/date-utils'
import { useAppStore, type ViewName } from '@/store/app-store'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  Package,
  ClipboardList,
  Users,
  BarChart3,
  Pill,
  Bell,
 Database,
  History,
  RotateCcw,
  TrendingUp,
  ClipboardCheck,
  Settings,
  Clock,
  AlertTriangle,
  PackageX,
  ShieldCheck,
  Clock as ClockIcon,
  Monitor,
  ChevronDown,
  FileText,
  Sun,
  Moon,
  LogIn,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { initCurrencyGetter, type CurrencyCode } from '@/lib/currency'
import { LoginScreen } from '@/components/gazpharm/login-screen'
import { DashboardView } from '@/components/gazpharm/views/dashboard-view'
import { POSView } from '@/components/gazpharm/views/pos-view'
import { InventoryView } from '@/components/gazpharm/views/inventory-view'
import { PrescriptionsView } from '@/components/gazpharm/views/prescriptions-view'
import { CustomersView } from '@/components/gazpharm/views/customers-view'
import { ReportsView } from '@/components/gazpharm/views/reports-view'
import { AdvancedReportsView } from '@/components/gazpharm/views/advanced-reports-view'
import { MasterDataView } from '@/components/gazpharm/views/master-data-view'
import { SalesHistoryView } from '@/components/gazpharm/views/sales-history-view'
import { GoodsReturnView } from '@/components/gazpharm/views/goods-return-view'
import { CompanySetupView } from '@/components/gazpharm/company-setup-view'
import { ProductSalesAnalytics } from '@/components/gazpharm/views/product-sales-analytics'
import { StockTakeSection } from '@/components/gazpharm/views/stock-take-section'
import { StockTakeReportViewWrapper } from '@/components/gazpharm/views/stock-take-report-view'
import { SettingsHubView } from '@/components/gazpharm/views/settings-hub-view'
import { DrugInteractionsView } from '@/components/gazpharm/views/drug-interactions-view'
import { PurchaseOrdersView } from '@/components/gazpharm/views/purchase-orders-view'
import { AuditLogView } from '@/components/gazpharm/views/audit-log-view'
import { LoginHistoryView } from '@/components/gazpharm/views/login-history-view'
import { AccessLogsView } from '@/components/gazpharm/views/access-logs-view'

// ── Global fetch interceptor: auto-attach JWT to all /api/ requests ──
if (typeof window !== 'undefined') {
  const origFetch = window.fetch
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.startsWith('/api/') || url.includes('/api/')) {
      const token = useAppStore.getState().authToken
      if (token) {
        const headers = new Headers(init?.headers)
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`)
        }
        return origFetch.call(this, input, { ...init, headers }).then((res) => {
          // Auto-logout on 401 (expired/invalid token)
          if (res.status === 401 && useAppStore.getState().isAuthenticated) {
            const store = useAppStore.getState()
            store.addToast({ title: 'Session Expired', description: 'Please log in again', variant: 'destructive' })
            store.logout()
          }
          return res
        })
      }
    }
    return origFetch.call(this, input, init)
  }
}


// ── Error Boundary to prevent client-side crash from taking down the whole app ──
interface ErrorBoundaryProps { children: ReactNode; fallback?: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: Error | null }
class ViewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 animate-fade-in">
          <div className="h-14 w-14 rounded-2xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Something went wrong</p>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

interface NavItem {
  name: ViewName
  label: string
  icon: typeof LayoutDashboard
  permission: string
  badge?: string
}

// Permission key mapping — which granular permission grants access to which view
const NAV_ITEMS: NavItem[] = [
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { name: 'pos', label: 'POS Terminal', icon: ShoppingCart, permission: 'pos:sell', badge: undefined },
  { name: 'master-data', label: 'Drug Catalogue', icon: Database, permission: 'master-data:view' },
  { name: 'inventory', label: 'Inventory', icon: Package, permission: 'inventory:view' },
  { name: 'prescriptions', label: 'Prescriptions', icon: ClipboardList, permission: 'prescriptions:view' },
  { name: 'customers', label: 'Customers', icon: Users, permission: 'customers:view' },
  { name: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports:view' },
  { name: 'advanced-reports', label: 'Advanced Reports', icon: TrendingUp, permission: 'reports:view' },
  { name: 'product-sales-analytics', label: 'Sales Analytics', icon: TrendingUp, permission: 'inventory:analytics' },
  { name: 'stock-take', label: 'Stock Taking', icon: ClipboardCheck, permission: 'inventory:stocktake' },
  { name: 'sales-history', label: 'Sales History', icon: History, permission: 'pos:history' },
  { name: 'returns', label: 'Goods Return', icon: RotateCcw, permission: 'pos:refund' },
  { name: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, permission: 'inventory:manage' },
  { name: 'drug-interactions', label: 'Drug Interactions', icon: ShieldCheck, permission: 'prescriptions:view' },
  { name: 'access-logs', label: 'Access Logs', icon: FileText, permission: 'audit:view' },
  { name: 'settings', label: 'Settings', icon: Settings, permission: 'pos:sell' },
]

// ── Live Clock for Topbar ──────────────────────────────────────────────
function TopbarClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const { timezone, timeFormat } = useAppStore.getState()
      setTime(
        formatDateWeekday(now.toISOString()) +
        '  ' +
        now.toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: timeFormat === '12h' })
      )
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="hidden sm:flex items-center gap-1 text-[11px] mr-1" style={{ color: '#fff' }}>
      <Clock className="h-3 w-3" />
      <span className="font-medium tabular-nums">{time}</span>
    </div>
  )
}

// ── Workstation Selector for Topbar ──────────────────────────────
function WorkstationSelector() {
  const currentWorkstationId = useAppStore((s) => s.currentWorkstationId)
  const setCurrentWorkstationId = useAppStore((s) => s.setCurrentWorkstationId)
  const [workstations, setWorkstations] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    fetch('/api/workstations').then(r => r.ok ? r.json() : { workstations: [] }).then(d => {
      setWorkstations((d.workstations || []).filter((w: { isActive: boolean }) => w.isActive))
    }).catch(() => {})
  }, [])

  if (workstations.length === 0) return null

  return (
    <Select value={currentWorkstationId || '_none'} onValueChange={(v) => setCurrentWorkstationId(v === '_none' ? null : v)}>
      <SelectTrigger className="h-7 w-[120px] text-[11px] border-gray-200 dark:border-gray-700 bg-gray-50/50">
        <div className="flex items-center gap-1.5 truncate">
          <Monitor className="h-3 w-3 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Select terminal" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none" className="text-xs">
          <span className="text-muted-foreground">No Workstation</span>
        </SelectItem>
        {workstations.map((ws) => (
          <SelectItem key={ws.id} value={ws.id} className="text-xs">{ws.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Notification Bell with live alerts ──────────────────────────────
function NotificationBell() {
  const [notifications, setNotifications] = useState<Array<{
    id: string; type: string; title: string; message: string; severity: string; productName: string; productId: string; meta: Record<string, unknown>
  }>>([])
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)

  // Load dismissed keys from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dismissed-notifications')
      if (stored) setDismissedKeys(new Set(JSON.parse(stored) as string[]))
    } catch { /* ignore */ }
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('dismissed-notifications', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setCount(data.count || 0)
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling every 60s
  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, 60000)
    return () => clearInterval(id)
  }, [fetchNotifications])

  // Refresh when popover opens or inventory changes
  useEffect(() => {
    fetchNotifications()
  }, [open, inventoryVersion, fetchNotifications])

  const visibleNotifications = notifications.filter((n) => !dismissedKeys.has(n.id))
  const visibleCount = visibleNotifications.length
  const expiryNotifs = visibleNotifications.filter((n) => n.type === 'expiry')
  const stockNotifs = visibleNotifications.filter((n) => n.type === 'low-stock')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className={`h-3.5 w-3.5 ${visibleCount > 0 ? 'text-amber-500' : ''}`} />
          {visibleCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {visibleCount > 99 ? '99+' : visibleCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
          {visibleCount > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200">
              {visibleCount} alert{visibleCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <ScrollArea className="max-h-[360px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">Loading...</div>
          ) : visibleCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Bell className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">All clear</p>
              <p className="text-xs text-muted-foreground mt-0.5">No expiry or low stock alerts</p>
            </div>
          ) : (
            <div className="divide-y">
              {expiryNotifs.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Near Expiry
                    </span>
                  </div>
                  {expiryNotifs.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${n.severity === 'danger' ? 'bg-red-100' : 'bg-amber-100'}`}>
                          <AlertTriangle className={`h-3.5 w-3.5 ${n.severity === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{n.productName}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismissNotification(n.id) }}
                          className="shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                          aria-label="Dismiss notification"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {stockNotifs.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-orange-50/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-700 flex items-center gap-1">
                      <PackageX className="h-3 w-3" /> Low Stock
                    </span>
                  </div>
                  {stockNotifs.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${n.severity === 'danger' ? 'bg-red-100' : 'bg-orange-100'}`}>
                          <PackageX className={`h-3.5 w-3.5 ${n.severity === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-orange-600'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{n.productName}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismissNotification(n.id) }}
                          className="shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                          aria-label="Dismiss notification"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default function Home() {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const user = useAppStore((s) => s.user)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const logout = useAppStore((s) => s.logout)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [endShiftLoading, setEndShiftLoading] = useState(false)
  const [endShiftOpen, setEndShiftOpen] = useState(false)
  const [endShiftCash, setEndShiftCash] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const shiftActive = useAppStore((s) => s.shiftActive)
  const shiftStartedAt = useAppStore((s) => s.shiftStartedAt)
  const currentShiftId = useAppStore((s) => s.currentShiftId)
  const setShift = useAppStore((s) => s.setShift)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const addToast = useAppStore((s) => s.addToast)
  const currency = useAppStore((s) => s.currency)
  const setCurrency = useAppStore((s) => s.setCurrency)

  const isCompanySetup = useAppStore((s) => s.isCompanySetup)
  const setIsCompanySetup = useAppStore((s) => s.setIsCompanySetup)
  const setCompany = useAppStore((s) => s.setCompany)
  const company = useAppStore((s) => s.company)
  const isHydrated = useAppStore((s) => s.isHydrated)
  const setHydrated = useAppStore((s) => s.setHydrated)

  // Wire the currency getter once so the shared formatCurrency works
  useEffect(() => {
    initCurrencyGetter(() => useAppStore.getState().currency)
  }, [])

  // Register service worker for offline support
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {/* SW registration failed silently */});
    }
  }, [])

  // Track online/offline status
  useEffect(() => {
    setIsOnline(navigator.onLine)
    if (!navigator.onLine) setIsOfflineMode(true)
    const handleOnline = () => {
      setIsOnline(true)
      setIsOfflineMode(false)
      // Re-validate session with server now that we're back online
      const store = useAppStore.getState()
      const sessionData = localStorage.getItem('selrx_session')
      if (sessionData && store.authToken) {
        const { user: savedUser } = JSON.parse(sessionData)
        fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${store.authToken}` },
          body: JSON.stringify({ userId: savedUser.id }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Session invalid')
            return res.json()
          })
          .then((data) => {
            if (data.valid && data.user) store.setUser(data.user)
          })
          .catch(() => {})
        // Re-sync inventory cache
        prefetchInventoryForOffline(store.authToken)
      }
    }
    const handleOffline = () => { setIsOnline(false); setIsOfflineMode(true) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Pre-fetch full product catalog for offline POS access
  // Caches in localStorage so POS can search/filter without network
  const prefetchInventoryForOffline = useCallback((token: string | null) => {
    if (!token) return
    fetch('/api/products?limit=1000', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (json?.products) {
          localStorage.setItem('selrx_offline_inventory', JSON.stringify(json.products))
          localStorage.setItem('selrx_offline_inventory_at', String(Date.now()))
        }
      })
      .catch(() => {})
  }, [])

  // Single hydration effect: restores company + session from localStorage
  // This runs BEFORE any conditional rendering, preventing flash
  useEffect(() => {
    if (typeof window === 'undefined') return

    const store = useAppStore.getState()
    let companyRestored = false
    let sessionRestored = false
    const finish = () => {
      // Mark hydrated once both checks complete
      if (companyRestored && sessionRestored) {
        store.setHydrated()
      }
    }

    // 1. Restore company from localStorage (fast, synchronous read)
    try {
      const companyData = localStorage.getItem('selrx_company')
      if (companyData) {
        const savedCompany = JSON.parse(companyData)
        store.setCompany(savedCompany)
        if (savedCompany.currency) {
          store.setCurrency(savedCompany.currency as CurrencyCode)
        }
        if (savedCompany.timezone) {
          store.setTimezone(savedCompany.timezone)
        }
        companyRestored = true
      } else {
        // No cached company — check server
        fetch('/api/company-setup')
          .then((res) => res.json())
          .then((data) => {
            if (data.isSetup && data.company) {
              store.setCompany(data.company)
              if (data.company.currency) {
                store.setCurrency(data.company.currency as CurrencyCode)
              }
              if (data.company.timezone) {
                store.setTimezone(data.company.timezone)
              }
            } else {
              store.setCurrentView('company-setup')
              store.setIsCompanySetup(true)
            }
            companyRestored = true
            finish()
          })
          .catch(() => {
            store.setIsCompanySetup(true)
            companyRestored = true
            finish()
          })
      }

      // Restore receipt settings from localStorage (independent of company)
      try {
        const receiptData = localStorage.getItem('selrx_receipt_settings')
        if (receiptData) {
          const rs = JSON.parse(receiptData)
          if (typeof rs.autoPrintReceipt === 'boolean') store.setAutoPrintReceipt(rs.autoPrintReceipt)
          if (typeof rs.showReceiptModal === 'boolean') store.setShowReceiptModal(rs.showReceiptModal)
          if (rs.fontFamily && ['mono', 'sans', 'serif'].includes(rs.fontFamily)) store.setFontFamily(rs.fontFamily)
          if (rs.fontSize && ['small', 'medium', 'large'].includes(rs.fontSize)) store.setFontSize(rs.fontSize)
          if (typeof rs.boldHeader === 'boolean') store.setBoldHeader(rs.boldHeader)
          if (typeof rs.boldItems === 'boolean') store.setBoldItems(rs.boldItems)
          if (typeof rs.boldTotals === 'boolean') store.setBoldTotals(rs.boldTotals)
          if (typeof rs.receiptHeader === 'string') store.setReceiptHeader(rs.receiptHeader)
          if (typeof rs.receiptFooter === 'string') store.setReceiptFooter(rs.receiptFooter)
        }
      } catch { /* corrupted receipt settings — ignore */ }

      // Restore regional settings from localStorage (timezone, date/time format)
      try {
        const regionalData = localStorage.getItem('selrx_regional_settings')
        if (regionalData) {
          const rs = JSON.parse(regionalData)
          if (rs.timezone) store.setTimezone(rs.timezone)
          if (rs.dateFormat) store.setDateFormat(rs.dateFormat)
          if (rs.timeFormat) store.setTimeFormat(rs.timeFormat)
        }
      } catch { /* corrupted regional settings — ignore */ }

      // Only finish company restoration synchronously if we had cached data
      if (companyRestored) finish()
    } catch {
      store.setIsCompanySetup(true)
      companyRestored = true
      finish()
    }

    // 2. Restore session from localStorage (validates with server)
    try {
      const sessionData = localStorage.getItem('selrx_session')
      const savedView = localStorage.getItem('selrx_view')

      if (sessionData) {
        const { user: savedUser, token: savedToken } = JSON.parse(sessionData)
        if (savedToken) store.setAuthToken(savedToken)
        fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
          body: JSON.stringify({ userId: savedUser.id }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Session invalid')
            return res.json()
          })
          .then((data) => {
            if (data.valid && data.user) {
              store.setUser(data.user)
              // Check for active shift — skip localStorage shift data
              // because it may belong to a different user on the same browser.
              // Only the server check (using the authenticated user's ID) is authoritative.
              try {
                fetch('/api/shifts?action=active', {
                  headers: { Authorization: `Bearer ${savedToken}` },
                }).then((r) => r.json()).then((r) => {
                  if (!r.active) {
                    store.setShift(null)
                    if (r.autoClosed) {
                      store.addToast({ title: 'Old Shift Auto-Closed', description: 'A shift from a previous session was automatically closed.', variant: 'default' })
                    }
                  }
                  else store.setShift({ id: r.shift.id, startedAt: r.shift.startedAt })
                }).catch(() => {})
              } catch { /* silent */ }
              // Restore workstation selection from localStorage
              try {
                const savedWsId = localStorage.getItem('selrx_workstation')
                if (savedWsId) store.setCurrentWorkstationId(savedWsId)
              } catch { /* silent */ }
              // Restore saved view, but redirect to POS if user lacks permission for it
              let targetView = savedView && savedView !== 'login' && savedView !== 'company-setup'
                ? savedView as ViewName
                : null
              // Migrate removed view names to settings
              const rawView = savedView as string
              if (rawView === 'workstations' || rawView === 'sync-settings' || rawView === 'users') {
                targetView = 'settings'
                localStorage.setItem('selrx_view', 'settings')
              }
              if (targetView) {
                const perm = NAV_ITEMS.find((n) => n.name === targetView)?.permission
                const perms = data.user.permissions || []
                if (perm && data.user.role !== 'SUPER_ADMIN' && !perms.includes(perm)) {
                  targetView = perms.includes('pos:sell') ? 'pos' : 'dashboard'
                }
              }
              if (targetView) {
                store.setCurrentView(targetView)
              }
              // Pre-fetch full inventory for offline use
              try {
                fetch('/api/products?limit=1000', { headers: { Authorization: `Bearer ${savedToken}` } })
                  .then((r) => r.ok ? r.json() : null)
                  .then((json) => {
                    if (json?.products) {
                      localStorage.setItem('selrx_offline_inventory', JSON.stringify(json.products))
                      localStorage.setItem('selrx_offline_inventory_at', String(Date.now()))
                    }
                  })
                  .catch(() => {})
              } catch { /* silent */ }
            } else {
              localStorage.removeItem('selrx_session')
              localStorage.removeItem('selrx_view')
            }
            sessionRestored = true
            finish()
          })
          .catch(() => {
            // If we're offline and have a cached session, trust it
            if (!navigator.onLine && sessionData) {
              try {
                const { user: savedUser } = JSON.parse(sessionData)
                store.setUser(savedUser)
                // Restore saved view with permission check
                let targetView = savedView && savedView !== 'login' && savedView !== 'company-setup'
                  ? savedView as ViewName
                  : null
                const rawView = savedView as string
                if (rawView === 'workstations' || rawView === 'sync-settings' || rawView === 'users') {
                  targetView = 'settings'
                }
                if (targetView) {
                  const perm = NAV_ITEMS.find((n) => n.name === targetView)?.permission
                  const perms = savedUser.permissions || []
                  if (perm && savedUser.role !== 'SUPER_ADMIN' && !perms.includes(perm)) {
                    targetView = perms.includes('pos:sell') ? 'pos' : 'dashboard'
                  }
                }
                if (targetView) store.setCurrentView(targetView)
                // Restore workstation
                try {
                  const savedWsId = localStorage.getItem('selrx_workstation')
                  if (savedWsId) store.setCurrentWorkstationId(savedWsId)
                } catch { /* silent */ }
              } catch { /* parse error — clear session */
                localStorage.removeItem('selrx_session')
                localStorage.removeItem('selrx_view')
              }
            } else {
              // Online but session invalid — clear it
              localStorage.removeItem('selrx_session')
              localStorage.removeItem('selrx_view')
            }
            sessionRestored = true
            finish()
          })
      } else {
        sessionRestored = true
        finish()
      }
    } catch {
      localStorage.removeItem('selrx_session')
      localStorage.removeItem('selrx_view')
      sessionRestored = true
      finish()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { theme, setTheme } = useTheme()

  // Show loading screen while hydrating (prevents flash)
  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh-light bg-grid-subtle relative">
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-300/30">
            <Pill className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2">
            <div className="h-5 w-28 rounded-lg bg-emerald-100/80 animate-pulse" />
            <div className="h-3 w-20 rounded-md bg-emerald-50 dark:bg-emerald-900/30/60 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // Show company setup if not yet configured (only on first setup, not on reload)
  if (!isCompanySetup) {
    return <CompanySetupView />
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />
  }

  const renderView = () => {
    // Find the permission required for the current view
    const navItem = NAV_ITEMS.find((n) => n.name === currentView)
    if (navItem && !hasPermission([navItem.permission])) {
      // User doesn't have permission — redirect to POS (most users can access)
      const fallback = hasPermission(['pos:sell']) ? 'pos' : 'dashboard'
      setTimeout(() => setCurrentView(fallback as ViewName), 0)
      return null
    }

    switch (currentView) {
      case 'dashboard': return <DashboardView />
      case 'pos': return <POSView />
      case 'inventory': return <InventoryView />
      case 'prescriptions': return <PrescriptionsView />
      case 'customers': return <CustomersView />
      case 'reports': return <ReportsView />
      case 'advanced-reports': return <AdvancedReportsView />
      case 'sales-history': return <SalesHistoryView />
      case 'returns': return <GoodsReturnView />
      case 'drug-interactions': return <DrugInteractionsView />
      case 'purchase-orders': return <PurchaseOrdersView />
      case 'access-logs': return <AccessLogsView />
      case 'audit-logs': return <AccessLogsView initialTab="audit" />
      case 'login-history': return <AccessLogsView initialTab="login" />
      case 'master-data': return <MasterDataView />
      case 'product-sales-analytics': return <ProductSalesAnalytics />
      case 'stock-take': return <ViewErrorBoundary><StockTakeSection /></ViewErrorBoundary>
      case 'stock-take-report': return <ViewErrorBoundary><StockTakeReportViewWrapper /></ViewErrorBoundary>
      case 'settings': return <SettingsHubView />
      default: return <DashboardView />
    }
  }

  // Filter nav items based on user permissions
  const visibleNavItems = NAV_ITEMS.filter((item) => hasPermission([item.permission]))

  const currentLabel = NAV_ITEMS.find((n) => n.name === currentView)?.label || 'Dashboard'

  return (
    <div className="min-h-screen flex bg-mesh-light bg-grid-subtle relative">
      {/* Sidebar */}
      <aside
        style={{ background: 'linear-gradient(to bottom right, #022c22, #064e3b, #134e4a)' }}
        className={`fixed inset-y-0 left-0 z-40 w-44 xl:w-64 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center gap-2.5 px-3 xl:px-4 xl:gap-3 h-12 xl:h-16 border-b border-white/20 relative overflow-hidden">
          <div className="flex items-center gap-2 xl:gap-2.5">
            <div className="h-7 w-7 xl:h-8 xl:w-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Pill className="h-4 w-4 xl:h-5 xl:w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xs xl:text-sm font-bold text-white leading-tight tracking-tight">SelRx</h1>
              <p className="text-[9px] xl:text-[10px] text-white/70 leading-tight font-medium">Pharmacy POS<span className="hidden xl:inline"> System</span></p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden h-7 w-7 text-white/80 hover:text-white hover:bg-white/20"
            onClick={toggleSidebar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav Items */}
        <ScrollArea className="flex-1 h-[calc(100vh-8.5rem)] xl:h-[calc(100vh-10rem)]">
          <div className="space-y-0.5">
            {visibleNavItems.map((item) => (
              <button
                key={item.name}
                style={{
                  color: currentView === item.name ? '#000' : '#fff',
                  background: currentView === item.name ? '#fff' : 'transparent',
                  boxShadow: 'inset 0 -1.5px 0 0 rgba(255,255,255,0.2)',
                  borderRadius: '0',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                }}
                className="flex items-center gap-2 xl:gap-3 w-full px-3 xl:px-6 text-xs xl:text-sm font-medium transition-all duration-200"
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 4px 0 rgba(0,50,30,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.position = 'relative'; e.currentTarget.style.zIndex = '10'; e.currentTarget.style.paddingLeft = '32px'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = currentView === item.name ? 'none' : 'inset 0 -1.5px 0 0 rgba(255,255,255,0.2)'; e.currentTarget.style.background = currentView === item.name ? '#fff' : 'transparent'; e.currentTarget.style.color = currentView === item.name ? '#000' : '#fff'; e.currentTarget.style.zIndex = 'auto'; e.currentTarget.style.paddingLeft = ''; e.currentTarget.style.paddingTop = '8px'; e.currentTarget.style.paddingBottom = '8px'; }}
                onClick={() => {
                  setCurrentView(item.name)
                  if (window.innerWidth < 1024) toggleSidebar()
                }}
              >
                <span className="flex items-center justify-center h-5 w-5 xl:h-6 xl:w-6 rounded-md" style={{ background: '#10b981' }}>
                  <item.icon className="h-3 w-3 xl:h-3.5 xl:w-3.5" style={{ color: '#000' }} />
                </span>
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-[9px] font-bold bg-white text-emerald-700 rounded-full px-1.5 py-0.5">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}


          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="border-t border-white/20 p-2 xl:p-3">
          <div className="flex items-center gap-2 rounded-lg xl:rounded-xl px-2.5 xl:px-3 py-2 xl:py-2.5">
            <div className="h-6 w-6 xl:h-8 xl:w-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-[10px] xl:text-xs font-bold">{(user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] xl:text-[10px] text-white/80 font-medium uppercase">{user?.roleLabel || user?.role || 'STAFF'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 xl:h-7 xl:w-7 text-white/80 hover:text-red-200 hover:bg-white/20"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut className="h-3 w-3 xl:h-3.5 xl:w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={toggleSidebar}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-44 xl:ml-64 h-screen flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header style={{ background: 'linear-gradient(to bottom right, #022c22, #064e3b, #134e4a)', opacity: 0.95 }} className="sticky top-0 z-20 h-10 xl:h-14 border-b border-white/10 flex items-center gap-2 xl:gap-3 px-3 xl:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8 xl:h-9 xl:w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={toggleSidebar}
          >
            <Menu className="h-4 w-4 xl:h-5 xl:w-5" />
          </Button>

          <div className="flex items-center gap-2">
            <h1 style={{ color: '#fff' }} className="text-xs xl:text-sm font-bold leading-tight">{company?.name || 'SelRx'}</h1>
            <Separator orientation="vertical" className="h-3.5 xl:h-4 bg-white/20" />
            <span style={{ color: 'rgba(255,255,255,0.7)' }} className="text-[11px] xl:text-xs font-medium">{currentLabel}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Live Clock */}
            <TopbarClock />
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>
            {/* Workstation Selector */}
            <WorkstationSelector />
            {/* Notification Bell */}
            <NotificationBell />
            {shiftActive && shiftStartedAt && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] border-orange-400/50 bg-orange-500/80 text-white hover:bg-orange-500 hover:border-orange-400">
                    <ClockIcon className="h-3 w-3" />
                    <span className="hidden md:inline">Active</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Shift in progress</p>
                    <p className="text-[11px] text-muted-foreground">Started: {shiftStartedAt ? new Date(shiftStartedAt).toLocaleTimeString() : '—'}</p>
                    <Button
                      size="sm"
                      className="w-full h-7 text-[11px] bg-red-600 hover:bg-red-700"
                      onClick={() => setEndShiftOpen(true)}
                    >
                      End Shift
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <div className="hidden sm:flex items-center gap-2">
              <Separator orientation="vertical" className="h-5 bg-white/20" />
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shadow-sm">
                  <span className="text-white text-[10px] font-bold">{(user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.8)' }} className="font-medium uppercase text-[9px]">{user?.roleLabel || user?.role}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/60 hover:text-red-300 hover:bg-white/10"
                onClick={() => setLogoutOpen(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </header>

        {!isOnline && (
          <div className="bg-amber-500 dark:bg-amber-600 text-white text-center text-xs py-1 px-4 font-medium">
            You are offline — some features may be limited
          </div>
        )}

        {/* Page Content */}
        <div key={currentView} className="flex-1 p-2 lg:p-3 animate-fade-in overflow-y-auto">
          {renderView()}
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-3 lg:px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm">
                <Pill className="h-3 w-3 text-white" />
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-gray-700 dark:text-gray-300">SelRx</span>
                <span className="text-gray-300">·</span>
                <span className="text-muted-foreground">Pharmacy Management System</span>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* End Shift Confirmation Dialog */}
      <AlertDialog open={endShiftOpen} onOpenChange={(open) => { if (!open) { setEndShiftOpen(false); setEndShiftCash('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Count the physical cash in the drawer and enter the amount below to reconcile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Physical Cash at Hand</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={endShiftCash}
                onChange={(e) => setEndShiftCash(e.target.value)}
                className="mt-1"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">Leave empty to skip cash reconciliation</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={endShiftLoading}
              onClick={async () => {
                if (!currentShiftId || !user) return
                setEndShiftLoading(true)
                try {
                  const body: Record<string, unknown> = { action: 'end', shiftId: currentShiftId }
                  if (endShiftCash !== '') body.cashAtEnd = parseFloat(endShiftCash)
                  const res = await fetch('/api/shifts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-name': user.name, 'x-user-role': user.role },
                    body: JSON.stringify(body),
                  })
                  if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
                  const result = await res.json()
                  setShift(null)
                  setEndShiftOpen(false)
                  setEndShiftCash('')
                  const cashMsg = result.cashDiscrepancy !== null && result.cashDiscrepancy !== undefined
                    ? ` | Cash diff: ${result.cashDiscrepancy >= 0 ? '-' : '+'}${Math.abs(result.cashDiscrepancy).toFixed(2)}`
                    : ''
                  addToast({ title: 'Shift Ended', description: `Sales: ${result.totalSales.toFixed(2)} | ${result.totalTransactions} txns | ${result.totalItemsSold} items${cashMsg}`, variant: 'success' })
                } catch (err: any) {
                  addToast({ title: 'Error', description: err.message, variant: 'destructive' })
                }
                setEndShiftLoading(false)
              }}
            >
              {endShiftLoading ? 'Ending...' : 'End Shift'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
              {shiftActive
                ? 'You have an active shift. It will continue running and resume when you sign back in.'
                : 'Are you sure you want to sign out?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {shiftActive && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 rounded-lg">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-800">
                Shift started at {shiftStartedAt ? new Date(shiftStartedAt).toLocaleTimeString() : '—'}. You can end it later after signing back in.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLogoutOpen(false)
                logout()
                addToast({
                  title: 'Signed out',
                  description: shiftActive ? 'Your shift is still running. Sign back in to continue.' : 'You have been logged out successfully',
                  variant: 'success',
                })
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>




    </div>
  )
}
