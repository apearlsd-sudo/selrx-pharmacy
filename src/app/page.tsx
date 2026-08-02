'use client'

import { useEffect, useCallback, Component, type ReactNode, useState } from 'react'
import { formatDateWeekday } from '@/lib/date-utils'
import { useAppStore, type ViewName } from '@/store/app-store'
import {
  LayoutDashboard,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  User,
  Package,
  ClipboardList,
  Users,
  UserCog,
  MonitorSmartphone,
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { UsersView } from '@/components/gazpharm/views/users-view'
import { HardwareView } from '@/components/gazpharm/views/hardware-view'
import { ReportsView } from '@/components/gazpharm/views/reports-view'
import { MasterDataView } from '@/components/gazpharm/views/master-data-view'
import { SalesHistoryView } from '@/components/gazpharm/views/sales-history-view'
import { GoodsReturnView } from '@/components/gazpharm/views/goods-return-view'
import { CompanySetupView } from '@/components/gazpharm/company-setup-view'
import { ProductSalesAnalytics } from '@/components/gazpharm/views/product-sales-analytics'
import { StockTakeSection } from '@/components/gazpharm/views/stock-take-section'
import { StockTakeReportViewWrapper } from '@/components/gazpharm/views/stock-take-report-view'
import { OtherSettingsView } from '@/components/gazpharm/views/other-settings-view'

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
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8">
          <p className="text-red-500 font-medium">Something went wrong loading this page.</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
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
  { name: 'pos', label: 'POS Terminal', icon: ShoppingCart, permission: 'pos:sell', badge: 'LIVE' },
  { name: 'inventory', label: 'Inventory', icon: Package, permission: 'inventory:view' },
  { name: 'master-data', label: 'Drug Catalog', icon: Database, permission: 'master-data:view' },
  { name: 'prescriptions', label: 'Prescriptions', icon: ClipboardList, permission: 'prescriptions:view' },
  { name: 'customers', label: 'Customers', icon: Users, permission: 'customers:view' },
  { name: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports:view' },
  { name: 'product-sales-analytics', label: 'Product Sales Analytics', icon: TrendingUp, permission: 'inventory:analytics' },
  { name: 'stock-take', label: 'Periodic Stock Taking', icon: ClipboardCheck, permission: 'inventory:stocktake' },
  { name: 'sales-history', label: 'Sales History', icon: History, permission: 'pos:history' },
  { name: 'returns', label: 'Goods Return', icon: RotateCcw, permission: 'pos:refund' },
  { name: 'hardware', label: 'Hardware', icon: MonitorSmartphone, permission: 'hardware:view' },
  { name: 'users', label: 'User Management', icon: UserCog, permission: 'users:view' },
  { name: 'settings', label: 'Other Settings', icon: Settings, permission: 'pos:sell' },
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
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
      <Clock className="h-3.5 w-3.5" />
      <span className="font-medium tabular-nums">{time}</span>
    </div>
  )
}

// ── Notification Bell with live alerts ──────────────────────────────
function NotificationBell() {
  const [notifications, setNotifications] = useState<Array<{
    id: string; type: string; title: string; message: string; severity: string; productName: string; productId: string; meta: Record<string, unknown>
  }>>([])
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)

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

  const expiryNotifs = notifications.filter((n) => n.type === 'expiry')
  const stockNotifs = notifications.filter((n) => n.type === 'low-stock')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className={`h-4 w-4 ${count > 0 ? 'text-amber-500' : ''}`} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          {count > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 text-red-600 border-red-200">
              {count} alert{count !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <ScrollArea className="max-h-[360px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">Loading...</div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Bell className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-500">All clear</p>
              <p className="text-xs text-muted-foreground mt-0.5">No expiry or low stock alerts</p>
            </div>
          ) : (
            <div className="divide-y">
              {expiryNotifs.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-amber-50/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Near Expiry
                    </span>
                  </div>
                  {expiryNotifs.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${n.severity === 'danger' ? 'bg-red-100' : 'bg-amber-100'}`}>
                          <AlertTriangle className={`h-3.5 w-3.5 ${n.severity === 'danger' ? 'text-red-600' : 'text-amber-600'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-900 truncate">{n.productName}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                        </div>
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
                    <div key={n.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${n.severity === 'danger' ? 'bg-red-100' : 'bg-orange-100'}`}>
                          <PackageX className={`h-3.5 w-3.5 ${n.severity === 'danger' ? 'text-red-600' : 'text-orange-600'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-900 truncate">{n.productName}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                        </div>
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
  const hasPermission = useAppStore((s) => s.hasPermission)
  const toasts = useAppStore((s) => s.toasts)
  const addToast = useAppStore((s) => s.addToast)
  const removeToast = useAppStore((s) => s.removeToast)
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
        const { user: savedUser } = JSON.parse(sessionData)
        fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: savedUser.id }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Session invalid')
            return res.json()
          })
          .then((data) => {
            if (data.valid && data.user) {
              store.setUser(data.user)
              // Restore saved view, but redirect to POS if user lacks permission for it
              let targetView = savedView && savedView !== 'login' && savedView !== 'company-setup'
                ? savedView as ViewName
                : null
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
            } else {
              localStorage.removeItem('selrx_session')
              localStorage.removeItem('selrx_view')
            }
            sessionRestored = true
            finish()
          })
          .catch(() => {
            localStorage.removeItem('selrx_session')
            localStorage.removeItem('selrx_view')
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

  // Show loading screen while hydrating (prevents flash)
  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Pill className="h-6 w-6 text-white" />
          </div>
          <div className="h-5 w-20 rounded-md bg-gray-200 animate-pulse" />
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
      case 'users': return <UsersView />
      case 'hardware': return <HardwareView />
      case 'reports': return <ReportsView />
      case 'sales-history': return <SalesHistoryView />
      case 'returns': return <GoodsReturnView />
      case 'master-data': return <MasterDataView />
      case 'product-sales-analytics': return <ProductSalesAnalytics />
      case 'stock-take': return <ViewErrorBoundary><StockTakeSection /></ViewErrorBoundary>
      case 'stock-take-report': return <ViewErrorBoundary><StockTakeReportViewWrapper /></ViewErrorBoundary>
      case 'settings': return <OtherSettingsView />
      default: return <DashboardView />
    }
  }

  // Filter nav items based on user permissions
  const visibleNavItems = NAV_ITEMS.filter((item) => hasPermission([item.permission]))

  const currentLabel = NAV_ITEMS.find((n) => n.name === currentView)?.label || 'Dashboard'

  return (
    <div className="min-h-screen flex bg-gray-50/50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r shadow-sm transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-4 h-16 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Pill className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">SelRx</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Pharmacy POS System</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden h-7 w-7"
            onClick={toggleSidebar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav Items */}
        <ScrollArea className="flex-1 h-[calc(100vh-10rem)]">
          <div className="p-3 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5">
              Main
            </p>
            {visibleNavItems.slice(0, 2).map((item) => (
              <button
                key={item.name}
                className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  currentView === item.name
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => {
                  setCurrentView(item.name)
                  if (window.innerWidth < 1024) toggleSidebar()
                }}
              >
                <item.icon className={`h-4 w-4 ${currentView === item.name ? 'text-emerald-600' : ''}`} />
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-[10px] bg-emerald-600 text-white rounded-full px-1.5 py-0.5">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}

            {visibleNavItems.length > 2 && (
              <>
                <Separator className="my-2" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5">
                  Management
                </p>
              </>
            )}
            {visibleNavItems.slice(2).map((item) => (
              <button
                key={item.name}
                className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  currentView === item.name
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => {
                  setCurrentView(item.name)
                  if (window.innerWidth < 1024) toggleSidebar()
                }}
              >
                <item.icon className={`h-4 w-4 ${currentView === item.name ? 'text-emerald-600' : ''}`} />
                {item.label}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <User className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-muted-foreground uppercase">{user?.roleLabel || user?.role || 'STAFF'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b flex items-center gap-3 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <h1 className="text-lg font-bold text-gray-900">{company?.name || 'SelRx'}</h1>

          <div className="ml-auto flex items-center gap-2">
            {/* Live Clock */}
            <TopbarClock />
            {/* Notification Bell */}
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mr-1">
                <span className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-emerald-600" />
                </span>
                <div className="flex flex-col leading-none">
                  <span className="font-medium text-gray-700 text-xs">{user?.name}</span>
                  <span className="text-emerald-600 font-medium uppercase text-[10px]">{user?.roleLabel || user?.role}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                onClick={() => setLogoutOpen(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Logout</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 lg:p-6">
          {renderView()}
        </div>

        {/* Footer */}
        <footer className="border-t bg-white px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>SelRx Pharmacy Management System v1.0</span>
            <span>Powered by Next.js</span>
          </div>
        </footer>
      </main>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? Any unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLogoutOpen(false)
                logout()
                addToast({
                  title: 'Signed out',
                  description: 'You have been logged out successfully',
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

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-in slide-in-from-bottom-2 rounded-lg border px-4 py-3 shadow-lg flex items-start gap-3 bg-white ${
              toast.variant === 'destructive'
                ? 'border-red-200 bg-red-50'
                : toast.variant === 'success'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-gray-200'
            }`}
          >
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className={`text-sm font-medium ${
                  toast.variant === 'destructive'
                    ? 'text-red-800'
                    : toast.variant === 'success'
                    ? 'text-emerald-800'
                    : 'text-gray-900'
                }`}>
                  {toast.title}
                </p>
              )}
              {toast.description && (
                <p className={`text-xs mt-0.5 ${
                  toast.variant === 'destructive'
                    ? 'text-red-600'
                    : toast.variant === 'success'
                    ? 'text-emerald-600'
                    : 'text-gray-600'
                }`}>
                  {toast.description}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-md text-muted-foreground hover:text-gray-900 hover:bg-gray-100 shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
