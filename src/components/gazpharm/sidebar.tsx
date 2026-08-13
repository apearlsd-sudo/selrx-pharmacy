// Sidebar emerald theme v2 - gazpharm-sidebar class applied to aside + SheetContent
'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Pill,
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Users,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Settings,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAppStore, type ViewName } from '@/store/app-store'
import { useIsMobile } from '@/hooks/use-mobile'
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

interface NavItem {
  label: string
  icon: React.ElementType
  view: ViewName
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    view: 'dashboard',
    roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER', 'CLERK'],
  },
  {
    label: 'POS Terminal',
    icon: ShoppingCart,
    view: 'pos',
    roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER'],
  },
  {
    label: 'Inventory',
    icon: Package,
    view: 'inventory',
    roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN'],
  },
  {
    label: 'Prescriptions',
    icon: FileText,
    view: 'prescriptions',
    roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN'],
  },
  {
    label: 'Customers',
    icon: Users,
    view: 'customers',
    roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER', 'CLERK'],
  },
  {
    label: 'Reports',
    icon: BarChart3,
    view: 'reports',
    roles: ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CASHIER', 'CLERK'],
  },
  {
    label: 'Settings',
    icon: Settings,
    view: 'settings',
    roles: ['SUPER_ADMIN'],
  },
]

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'PHARMACIST':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'TECHNICIAN':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
    case 'CASHIER':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
    case 'CLERK':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function SidebarNavContent({
  collapsed,
  onNavClick,
  onLogout,
}: {
  collapsed: boolean
  onNavClick?: () => void
  onLogout?: () => void
}) {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const user = useAppStore((s) => s.user)
  const hasPermission = useAppStore((s) => s.hasPermission)
  const logout = useAppStore((s) => s.logout)

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => hasPermission(item.roles)),
    [hasPermission]
  )

  const handleNavClick = useCallback(
    (view: ViewName) => {
      setCurrentView(view)
      onNavClick?.()
    },
    [setCurrentView, onNavClick]
  )

  const shiftActive = useAppStore((s) => s.shiftActive)
  const shiftStartedAt = useAppStore((s) => s.shiftStartedAt)

  const [logoutOpen, setLogoutOpen] = useState(false)

  const handleLogout = useCallback(() => {
    setLogoutOpen(true)
  }, [])

  const confirmLogout = useCallback(() => {
    setLogoutOpen(false)
    logout()
    onNavClick?.()
  }, [logout, onNavClick])

  return (
    <div className="flex h-full flex-col">
      {/* Branding */}
      <div
        className={`flex items-center gap-3 px-4 py-5 ${collapsed ? 'justify-center' : ''}`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
          <Pill className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight">
              SelRx
            </span>
            <span className="text-[10px] text-white/70 -mt-0.5">
              Pharmacy POS
            </span>
          </div>
        )}
      </div>

      <div className="gazpharm-separator mx-3 h-px" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visibleItems.map((item) => {
          const isActive = currentView === item.view
          const Icon = item.icon

          if (collapsed) {
            return (
              <Tooltip key={item.view}>
                <TooltipTrigger asChild>
                  <button
                    className={`gazpharm-nav-btn w-full h-10 rounded-lg ${isActive ? 'gazpharm-nav-active' : ''}`}
                    onClick={() => handleNavClick(item.view)}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          }

          return (
            <button
              key={item.view}
              className={`gazpharm-nav-btn w-full flex items-center justify-start gap-3 h-10 rounded-lg px-3 ${isActive ? 'gazpharm-nav-active' : ''}`}
              onClick={() => handleNavClick(item.view)}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </button>
          )
        })}
      </nav>

      {/* User Section */}
      <div className="gazpharm-separator mx-3 h-px" />
      <div className={`p-3 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
        {user && (
          <>
            {collapsed ? (
              <>
                <Avatar className="h-8 w-8">
                  <AvatarImage src="" alt={user.name} />
                  <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="gazpharm-nav-btn h-8 w-8 rounded-lg"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    Sign Out
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar className="h-9 w-9">
                  <AvatarImage src="" alt={user.name} />
                  <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${getRoleBadgeColor(user.role)}`}
                  >
                    {user.role.replace('_', ' ')}
                  </Badge>
                </div>
                <button
                  className="gazpharm-nav-btn h-8 w-8 rounded-lg shrink-0"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

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
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="h-4 w-4 text-amber-600 shrink-0 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs text-amber-800">
                Shift started at {shiftStartedAt ? new Date(shiftStartedAt).toLocaleTimeString() : '—'}. You can end it later after signing back in.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLogout} className="bg-red-600 hover:bg-red-700">
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function Sidebar() {
  const isMobile = useIsMobile()
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)

  if (!isAuthenticated) return null

  // Mobile: use Sheet (drawer)
  if (isMobile) {
    return (
      <div className="md:hidden">
        {/* Top bar with menu button */}
        <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 gazpharm-sidebar border-r-emerald-500/50">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarNavContent
                collapsed={false}
                onNavClick={() => {
                  // Sheet auto-closes on trigger click
                }}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600">
              <Pill className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
              SelRx
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Desktop: use fixed sidebar
  return (
    <div className="hidden md:block">
      <aside
        className={`gazpharm-sidebar fixed left-0 top-0 z-40 h-screen border-r border-emerald-500/50 transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-64' : 'w-[68px]'
        }`}
      >
        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-7 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-md"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <SidebarNavContent collapsed={!sidebarOpen} />
      </aside>
    </div>
  )
}
