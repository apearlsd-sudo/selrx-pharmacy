'use client'

import { useEffect } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore, type ViewName } from '@/store/app-store'
import { initCurrencyGetter, CURRENCIES, type CurrencyCode } from '@/lib/currency'
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface NavItem {
  name: ViewName
  label: string
  icon: typeof LayoutDashboard
  roles: string[]
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER', 'CLERK'] },
  { name: 'pos', label: 'POS Terminal', icon: ShoppingCart, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER'], badge: 'LIVE' },
  { name: 'inventory', label: 'Inventory', icon: Package, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN'] },
  { name: 'master-data', label: 'Drug Catalog', icon: Database, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN'] },
  { name: 'prescriptions', label: 'Prescriptions', icon: ClipboardList, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN'] },
  { name: 'customers', label: 'Customers', icon: Users, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER', 'CLERK'] },
  { name: 'reports', label: 'Reports', icon: BarChart3, roles: ['SUPER_ADMIN', 'PHARMACIST'] },
  { name: 'sales-history', label: 'Sales History', icon: History, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN'] },
  { name: 'returns', label: 'Goods Return', icon: RotateCcw, roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER'] },
  { name: 'hardware', label: 'Hardware', icon: MonitorSmartphone, roles: ['SUPER_ADMIN', 'PHARMACIST'] },
  { name: 'users', label: 'User Management', icon: UserCog, roles: ['SUPER_ADMIN'] },
]

export default function Home() {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const user = useAppStore((s) => s.user)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const logout = useAppStore((s) => s.logout)
  const toasts = useAppStore((s) => s.toasts)
  const removeToast = useAppStore((s) => s.removeToast)
  const currency = useAppStore((s) => s.currency)
  const setCurrency = useAppStore((s) => s.setCurrency)

  // Wire the currency getter once so the shared formatCurrency works
  useEffect(() => {
    initCurrencyGetter(() => useAppStore.getState().currency)
  }, [])

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />
  }

  const renderView = () => {
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
      default: return <DashboardView />
    }
  }

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
              <h1 className="text-sm font-bold text-gray-900 leading-tight">GAZPharm</h1>
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
            {NAV_ITEMS.slice(0, 2).map((item) => (
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

            <Separator className="my-2" />

            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5">
              Management
            </p>
            {NAV_ITEMS.slice(2).map((item) => (
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
              <p className="text-[10px] text-muted-foreground uppercase">{user?.role || 'STAFF'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600"
              onClick={logout}
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

          <h2 className="text-sm font-semibold text-gray-900">{currentLabel}</h2>

          <div className="ml-auto flex items-center gap-2">
            {/* Currency Selector */}
            <Select value={currency} onValueChange={(val) => setCurrency(val as CurrencyCode)}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <span className="font-medium">{CURRENCIES[currency].symbol}</span>
                <span className="text-muted-foreground">{currency}</span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-medium">{CURRENCIES[code].symbol}</span>
                    <span className="ml-1.5">{CURRENCIES[code].name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-emerald-500 rounded-full" />
            </Button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <User className="h-3 w-3 text-emerald-600" />
              </span>
              <span className="font-medium text-gray-700">{user?.name}</span>
              <span className="text-emerald-600 font-medium uppercase text-[10px]">{user?.role}</span>
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
            <span>GAZPharm Pharmacy Management System v1.0</span>
            <span>Powered by Next.js</span>
          </div>
        </footer>
      </main>

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
                    : 'text-gray-500'
                }`}>
                  {toast.description}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-muted-foreground hover:text-gray-900 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
