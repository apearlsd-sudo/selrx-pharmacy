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
} from 'lucide-react'
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
}

import { formatCurrency } from '@/lib/currency'
import { formatDateTime, formatDateWeekday } from '@/lib/date-utils'

function formatDate(dateStr: string): string {
  return formatDateTime(dateStr)
}

function formatChartDate(dateStr: string): string {
  return formatDateWeekday(dateStr)
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">{status}</Badge>
    case 'VOIDED':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">{status}</Badge>
    case 'PENDING':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">{status}</Badge>
    case 'REFUNDED':
      return <Badge className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100">{status}</Badge>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDashboard() }, [])

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
          <p className="text-red-600">Error loading dashboard: {error}</p>
        </CardContent>
      </Card>
    )
  }

  const stats = [
    {
      title: "Today's Sales",
      value: formatCurrency(data.today.sales),
      subtitle: `${data.today.count} transactions`,
      icon: DollarSign,
      bgClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: 'Pending Prescriptions',
      value: data.pendingPrescriptions.toString(),
      subtitle: 'Awaiting processing',
      icon: FileText,
      bgClass: 'bg-amber-50 text-amber-600',
    },
    {
      title: 'Low Stock Alerts',
      value: data.lowStockAlerts.count.toString(),
      subtitle: `${data.lowStockAlerts.items.length} critical items`,
      icon: AlertTriangle,
      bgClass: 'bg-red-50 text-red-600',
    },
    {
      title: 'Active Customers',
      value: (() => {
        const uniqueCustomers = new Set(
          data.recentTransactions
            .filter((t) => t.customer)
            .map((t) => t.customer!.id)
        )
        return uniqueCustomers.size.toString()
      })(),
      subtitle: 'Recent transactions',
      icon: Users,
      bgClass: 'bg-teal-50 text-teal-600',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader icon={LayoutDashboard} title="Dashboard" description="Overview of your pharmacy performance" />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {stats.map((stat) => (
          <Card key={stat.title} className="gap-4 card-hover overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                <div className={`rounded-xl p-2.5 ${stat.bgClass} shadow-sm`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <CardTitle className="text-base font-semibold text-gray-800">Sales Trend</CardTitle>
              <span className="text-xs text-gray-400 ml-auto">Last 7 days</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartDate}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    fontSize={12}
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

        {/* Recent Transactions */}
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <ShoppingCart className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <CardTitle className="text-base font-semibold text-gray-800">Recent Transactions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Txn #</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Items</TableHead>
                    <TableHead className="text-xs">Total</TableHead>
                    <TableHead className="text-xs">Payment</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
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
                            ? `${txn.customer.firstName} ${txn.customer.lastName}`
                            : 'Walk-in'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {txn.items?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {formatCurrency(txn.total)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(txn.paymentMethod || '').replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={txn.status} />
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
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
      </div>

      {/* Top Products */}
      <Card className="card-hover">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Package className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <CardTitle className="text-base font-semibold text-gray-800">Top Selling Products</CardTitle>
            <span className="text-xs text-gray-400 ml-auto">This month</span>
          </div>
        </CardHeader>
        <CardContent>
          {data.topProducts.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No sales data yet" description="Top selling products will appear here once you have sales." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {data.topProducts.map((product, index) => (
                <div
                  key={product.productId}
                  className="rounded-xl border border-gray-200/80 bg-card p-4 hover:shadow-md hover:border-emerald-200 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 h-6 w-6 rounded-lg flex items-center justify-center">
                      {index + 1}
                    </span>
                    <Package className="h-4 w-4 text-gray-300" />
                  </div>
                  <p className="mt-2 text-sm font-medium leading-tight line-clamp-2 text-gray-800">
                    {product.productName}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs text-gray-400">
                      Qty sold{' '}
                      <span className="font-semibold text-gray-700">
                        {product._sum.quantity ?? 0}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400">
                      Revenue{' '}
                      <span className="font-semibold text-emerald-600">
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
    </div>
  )
}
