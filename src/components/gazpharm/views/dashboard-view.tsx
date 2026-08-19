'use client'

import { useEffect, useState, useRef } from 'react'
import {
  DollarSign,
  FileText,
  AlertTriangle,
  Users,
  TrendingUp,
  Package,
  ShoppingCart,
  LayoutDashboard,
  Wallet,
  BoxesIcon,
  Settings2,
  ChevronUp,
  ChevronDown,
  BarChart3,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

interface DashboardData {
  expiringCount?: number
  reorderCount?: number
  today: {
    sales: number
    count: number
  }
  weeklyTrend: {
    date: string
    sales: number
    count: number
  }[]
  lowStockAlerts: {
    count: number
    items: {
      productId: string
      productName: string
      quantity: number
      reorderPoint: number
    }[]
  }
  pendingPrescriptions: number
  topProducts: {
    productId: string
    productName: string
    _sum: {
      quantity: number | null
      subtotal: number | null
    }
  }[]
  recentTransactions: {
    id: string
    transactionNo: string
    total: number
    paymentMethod: string
    status: string
    createdAt: string
    customer?: {
      id: string
      firstName: string
      lastName: string
    } | null
    user: {
      id: string
      name: string
    }
    items?: {
      id: string
      quantity: number
      productName: string
    }[]
  }[]
  totalCustomers?: number
  inventoryValue?: number
  totalProducts?: number
}

import { formatCurrency } from '@/lib/currency'
import { formatDateTime, formatDateWeekday } from '@/lib/date-utils'

function formatDate(dateStr: string): string {
  return formatDateTime(dateStr)
}

function formatChartDate(dateStr: string): string {
  return formatDateWeekday(dateStr)
}

const DEFAULT_WIDGETS = ['today-sales', 'pending-rx', 'low-stock', 'expiry-alerts', 'reorder-alerts', 'customers', 'inventory-value', 'total-products', 'sales-chart', 'recent-transactions', 'top-products']

const WIDGET_CONFIG = [
  { id: 'today-sales', label: "Today's Sales", icon: DollarSign },
  { id: 'pending-rx', label: 'Pending Prescriptions', icon: FileText },
  { id: 'low-stock', label: 'Low Stock Alerts', icon: AlertTriangle },
  { id: 'expiry-alerts', label: 'Expiring Soon', icon: AlertTriangle },
  { id: 'reorder-alerts', label: 'Reorder Needed', icon: Package },
  { id: 'customers', label: 'Registered Customers', icon: Users },
  { id: 'inventory-value', label: 'Inventory Value', icon: Wallet },
  { id: 'total-products', label: 'Total Products', icon: BoxesIcon },
  { id: 'sales-chart', label: 'Sales Trend Chart', icon: BarChart3 },
  { id: 'recent-transactions', label: 'Recent Transactions', icon: Receipt },
  { id: 'top-products', label: 'Top Selling Products', icon: TrendingUp },
]

const STAT_WIDGET_IDS = ['today-sales', 'pending-rx', 'low-stock', 'expiry-alerts', 'reorder-alerts', 'customers', 'inventory-value', 'total-products']

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">{status}</Badge>
    case 'VOIDED':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">{status}</Badge>
    case 'PENDING':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">{status}</Badge>
    case 'REFUNDED':
      return <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-800">{status}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function StatSkeleton() {
  return (
    <Card className="gap-4 overflow-hidden card-hover">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <Skeleton className="mt-3 h-8 w-20" />
        <Skeleton className="mt-1.5 h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)
  const visibleWidgets = useAppStore((s) => s.visibleWidgets)
  const setVisibleWidgets = useAppStore((s) => s.setVisibleWidgets)
  const toggleWidget = useAppStore((s) => s.toggleWidget)
  const moveWidget = useAppStore((s) => s.moveWidget)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard', { headers: authHeaders() })
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      const json = await res.json()
      // Defensive: ensure all expected arrays exist
      setData({
        today: json.today || { sales: 0, count: 0 },
        weeklyTrend: json.weeklyTrend || [],
        lowStockAlerts: json.lowStockAlerts || { count: 0, items: [] },
        pendingPrescriptions: json.pendingPrescriptions || 0,
        topProducts: json.topProducts || [],
        recentTransactions: json.recentTransactions || [],
        totalCustomers: json.totalCustomers ?? undefined,
        inventoryValue: json.inventoryValue ?? undefined,
        totalProducts: json.totalProducts ?? undefined,
        expiringCount: json.expiringCount ?? 0,
        reorderCount: json.reorderCount ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDashboard() }, [])

  // Hydrate widget customization from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selrx_dashboard_widgets')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setVisibleWidgets(parsed)
        }
      }
    } catch { /* ignore */ }
  }, [])

  // Re-fetch dashboard when inventory changes (low stock alerts, etc.)
  const prevInvVer = useRef(inventoryVersion)
  useEffect(() => {
    if (prevInvVer.current !== inventoryVersion) {
      prevInvVer.current = inventoryVersion
      fetchDashboard()
    }
  }, [inventoryVersion])

  if (loading) return <DashboardSkeleton />

  if (error || !data) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6">
          <p className="text-red-600 dark:text-red-400">Error loading dashboard: {error}</p>
        </CardContent>
      </Card>
    )
  }

  const stats = [
    {
      title: "Today's Sales",
      value: formatCurrency(data.today.sales),
      subtitle: data.today.count + ' transactions',
      icon: DollarSign,
      bgClass: 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Pending Prescriptions',
      value: data.pendingPrescriptions.toString(),
      subtitle: 'Awaiting processing',
      icon: FileText,
      bgClass: 'bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Low Stock Alerts',
      value: data.lowStockAlerts.count.toString(),
      subtitle: data.lowStockAlerts.items.length + ' critical items',
      icon: AlertTriangle,
      bgClass: 'bg-red-50 dark:bg-red-900/30 dark:bg-red-950/30 text-red-600 dark:text-red-400',
    },
    {
      title: 'Expiring Soon',
      value: (data.expiringCount ?? 0).toString(),
      subtitle: 'Products nearing expiry',
      icon: AlertTriangle,
      bgClass: 'bg-orange-50 dark:bg-orange-900/30 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400',
    },
    {
      title: 'Reorder Needed',
      value: (data.reorderCount ?? 0).toString(),
      subtitle: 'Below reorder point',
      icon: Package,
      bgClass: 'bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Registered Customers',
      value: (data.totalCustomers ?? 0).toString(),
      subtitle: 'Total registered',
      icon: Users,
      bgClass: 'bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400',
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(data.inventoryValue ?? 0),
      subtitle: 'At cost price',
      icon: Wallet,
      bgClass: 'bg-violet-50 dark:bg-violet-900/30 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
    },
    {
      title: 'Total Products',
      value: (data.totalProducts ?? 0).toString(),
      subtitle: 'Active products',
      icon: BoxesIcon,
      bgClass: 'bg-sky-50 dark:bg-sky-900/30 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400',
    },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Overview of your pharmacy performance"
        action={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setCustomizeOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            Customize
          </Button>
        }
      />

      {/* Stats Row */}
      {(() => {
        const visibleStatIds = visibleWidgets.filter(id => STAT_WIDGET_IDS.includes(id))
        const statsMap: Record<string, typeof stats[number]> = {}
        stats.forEach((s, i) => { statsMap[STAT_WIDGET_IDS[i]] = s })
        const orderedStats = visibleStatIds.map(id => statsMap[id]).filter(Boolean)
        if (orderedStats.length === 0) return null
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {orderedStats.map((stat) => (
              <Card key={stat.title} className="gap-3 card-hover overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.title}</p>
                    <div className={'rounded-lg p-2 ' + stat.bgClass + ' shadow-sm'}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-2 text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{stat.value}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{stat.subtitle}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      })()}

      {/* Chart + Recent Transactions */}
      {(() => {
        const showChart = visibleWidgets.includes('sales-chart')
        const showTransactions = visibleWidgets.includes('recent-transactions')
        if (!showChart && !showTransactions) return null
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {showChart && (
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <CardTitle className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">Sales Trend</CardTitle>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto">Last 7 days</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[160px] sm:h-[180px] lg:h-[190px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.weeklyTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatChartDate}
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={(v: number) => '$' + v}
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), 'Sales']}
                          labelFormatter={(label) => formatChartDate(label as string)}
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                          }}
                          itemStyle={{ color: 'var(--foreground)' }}
                          labelStyle={{ color: 'var(--foreground)' }}
                        />
                        <Bar
                          dataKey="sales"
                          fill="#059669"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={48}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {showTransactions && (
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <CardTitle className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">Recent Transactions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="max-h-[220px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Txn #</TableHead>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Items</TableHead>
                          <TableHead className="text-xs">Total</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Payment</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recentTransactions.length === 0 ? (
                          <tr><td colSpan={7} className="p-0">
                            <EmptyState icon={ShoppingCart} title="No transactions today" description="Transactions will appear here as sales are made throughout the day." />
                          </td></tr>
                        ) : (
                          data.recentTransactions.map((txn) => (
                            <TableRow key={txn.id}>
                              <TableCell className="font-mono text-xs">
                                {(txn.transactionNo || '').slice(-8)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {txn.customer
                                  ? txn.customer.firstName + ' ' + txn.customer.lastName
                                  : 'Walk-in'}
                              </TableCell>
                              <TableCell className="text-xs hidden sm:table-cell">
                                {txn.items?.length ?? 0}
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                {formatCurrency(txn.total)}
                              </TableCell>
                              <TableCell className="text-xs hidden md:table-cell">
                                {(txn.paymentMethod || '').replace(/_/g, ' ')}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={txn.status} />
                              </TableCell>
                              <TableCell className="text-xs text-gray-600 dark:text-gray-400 hidden md:table-cell">
                                {formatDate(txn.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )
      })()}

      {/* Top Products */}
      {visibleWidgets.includes('top-products') && (
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 flex items-center justify-center">
                <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">Top Selling Products</CardTitle>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto">This month</span>
            </div>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No sales data yet" description="Top selling products will appear here once you have sales." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {data.topProducts.map((product, index) => (
                  <div
                    key={product.productId}
                    className="rounded-lg border border-gray-200/80 dark:border-gray-700 bg-card p-3 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-950/30 h-5 w-5 rounded-md flex items-center justify-center">
                        {index + 1}
                      </span>
                      <Package className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="mt-1.5 text-xs font-medium leading-tight line-clamp-2 text-gray-800 dark:text-gray-200">
                      {product.productName}
                    </p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Qty sold{' '}
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {product._sum.quantity ?? 0}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Revenue{' '}
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(product._sum.subtotal ?? 0)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Widget Customization Dialog */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Customize Dashboard</DialogTitle>
            <DialogDescription>
              Toggle widgets on or off and drag to reorder them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {WIDGET_CONFIG.map((widget, index) => {
              const isVisible = visibleWidgets.includes(widget.id)
              const WidgetIcon = widget.icon
              return (
                <div
                  key={widget.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => moveWidget(widget.id, 'up')}
                      disabled={index === 0}
                      aria-label={'Move ' + widget.label + ' up'}
                    >
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => moveWidget(widget.id, 'down')}
                      disabled={index === WIDGET_CONFIG.length - 1}
                      aria-label={'Move ' + widget.label + ' down'}
                    >
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <WidgetIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium flex-1 min-w-0">{widget.label}</span>
                  <Switch
                    checked={isVisible}
                    onCheckedChange={() => toggleWidget(widget.id)}
                    aria-label={'Toggle ' + widget.label}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setVisibleWidgets([...DEFAULT_WIDGETS])}
            >
              Reset to Default
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
