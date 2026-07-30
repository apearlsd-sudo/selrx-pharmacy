'use client'

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react'
import {
  ShoppingCart, TrendingUp, CalendarDays, Download, FileText,
  Users, UserCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'

const CHART_COLORS = ['#059669', '#14b8a6', '#10b981', '#34d399', '#6ee7b7', '#0d9488', '#0f766e', '#a7f3d0', '#0891b2', '#06b6d4']

interface UserSalesData {
  userId: string
  userName: string
  userEmail: string
  userRole: string
  transactionCount: number
  totalSales: number
  totalSubtotal: number
  totalDiscount: number
  averageSale: number
  totalItemsSold: number
}

interface SalesSummary {
  totalSales: number
  totalTransactions: number
  totalDiscount: number
  averageTransaction: number
  topSeller: UserSalesData | null
  dateRange: { from: string | null; to: string | null }
}

interface DailySale {
  date: string
  sales: number
  count: number
}

interface AllUser {
  id: string
  name: string
  role: string
}

export function ReportsView() {
  const [activeTab, setActiveTab] = useState('sales')
  const [isPending, startTransition] = useTransition()
  const [salesStats, setSalesStats] = useState<any>(null)
  const [inventory, setInventory] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [completedStockTakes, setCompletedStockTakes] = useState<any[]>([])
  const addToast = useAppStore((s) => s.addToast)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Per-user sales analytics state
  const [userSalesData, setUserSalesData] = useState<UserSalesData[]>([])
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null)
  const [dailySalesTrend, setDailySalesTrend] = useState<DailySale[]>([])
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [userSalesLoading, setUserSalesLoading] = useState(false)

  const fetchSalesData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, txRes, invRes, rxRes, stRes] = await Promise.all([
        fetch('/api/transactions?action=stats', { headers: authHeaders() }),
        fetch('/api/transactions', { headers: authHeaders() }),
        fetch('/api/inventory'),
        fetch('/api/prescriptions'),
        fetch('/api/stock-take', { headers: authHeaders() }),
      ])
      if (statsRes.ok) setSalesStats(await statsRes.json())
      if (txRes.ok) { const d = await txRes.json(); setTransactions(Array.isArray(d) ? d : d.transactions || []) }
      if (invRes.ok) setInventory(await invRes.json())
      if (rxRes.ok) { const d = await rxRes.json(); setPrescriptions(Array.isArray(d) ? d : d.prescriptions || []) }
      if (stRes.ok) {
        const allTakes = await stRes.json()
        setCompletedStockTakes(Array.isArray(allTakes) ? allTakes.filter((st: any) => st.status === 'COMPLETED') : [])
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load report data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  // Fetch per-user sales analytics
  const fetchUserSalesAnalytics = useCallback(async (userId?: string) => {
    setUserSalesLoading(true)
    try {
      const params = new URLSearchParams()
      if (userId && userId !== 'all') params.set('userId', userId)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      const res = await fetch(`/api/sales-history?${params.toString()}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSalesSummary(data.summary)
        setUserSalesData(data.salesByUser || [])
        setDailySalesTrend(data.dailySales || [])
        // Fetch all users list for the SUPER_ADMIN dropdown
        if (data.allUsers) setAllUsers(data.allUsers)
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load user sales analytics', variant: 'destructive' })
    } finally {
      setUserSalesLoading(false)
    }
  }, [addToast, dateFrom, dateTo])

  useEffect(() => { fetchSalesData() }, [fetchSalesData])

  // Fetch user analytics when tab activates or filters change
  useEffect(() => {
    if (activeTab === 'user-sales') {
      fetchUserSalesAnalytics(selectedUserId)
    }
  }, [activeTab, selectedUserId, fetchUserSalesAnalytics])

  // Re-fetch inventory data in reports when stock changes
  const prevInvVer = useRef(inventoryVersion)
  useEffect(() => {
    if (prevInvVer.current !== inventoryVersion) {
      prevInvVer.current = inventoryVersion
      fetch('/api/inventory').then(r => { if (r.ok) r.json().then(setInventory) }).catch(() => {})
    }
  }, [inventoryVersion])

  // Prepare chart data — memoized to avoid recomputing on every render
  const salesByCategory = useMemo(() => {
    return salesStats?.topProducts?.map((p: any, i: number) => ({
      name: p.productName?.split(' ').slice(0, 2).join(' ') || 'Unknown',
      revenue: p._sum?.subtotal || 0,
      units: p._sum?.quantity || 0,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    })) || []
  }, [salesStats])

  const dailySales = useMemo(() => {
    return transactions
      .filter((t: any) => t.status === 'COMPLETED')
      .reduce((acc: any, t: any) => {
        const date = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const existing = acc.find((d: any) => d.date === date)
        if (existing) { existing.sales += t.total; existing.count += 1 }
        else { acc.push({ date, sales: t.total, count: 1 }) }
        return acc
      }, [])
      .slice(-7)
  }, [transactions])

  const categoryData = useMemo(() => {
    return inventory.reduce((acc: any, item: any) => {
      const cat = item.product?.category?.replace(/_/g, ' ') || 'Other'
      const existing = acc.find((c: any) => c.category === cat)
      if (existing) existing.count++
      else acc.push({ category: cat, count: 1, fill: CHART_COLORS[acc.length % CHART_COLORS.length] })
      return acc
    }, [])
  }, [inventory])

  const lowStockItems = useMemo(() => {
    return inventory.filter((i: any) => i.quantity <= i.product?.reorderPoint)
  }, [inventory])

  const expiringSoon = useMemo(() => {
    return inventory.filter((i: any) => i.product?.expiryDate && new Date(i.product.expiryDate) <= new Date(Date.now() + 30 * 86400000))
  }, [inventory])

  const rxByStatus = useMemo(() => {
    return prescriptions.reduce((acc: any, rx: any) => {
      const existing = acc.find((s: any) => s.status === rx.status)
      if (existing) existing.count++
      else acc.push({ status: rx.status?.replace(/_/g, ' '), count: 1, fill: CHART_COLORS[acc.length % CHART_COLORS.length] })
      return acc
    }, [])
  }, [prescriptions])

  // Per-user sales chart data — memoized
  const userSalesChartData = useMemo(() => {
    return userSalesData.map((u, i) => ({
      name: u.userName?.split(' ')[0] || 'Unknown',
      sales: u.totalSales,
      transactions: u.transactionCount,
      items: u.totalItemsSold,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
  }, [userSalesData])

  // Daily sales trend for user analytics — memoized
  const userDailyChartData = useMemo(() => {
    return dailySalesTrend.map((d) => ({
      date: d.date,
      sales: d.sales,
      count: d.count,
    }))
  }, [dailySalesTrend])

  // CSV export for per-user analytics
  const exportUserSalesCSV = useCallback(() => {
    if (userSalesData.length === 0) {
      addToast({ title: 'No Data', description: 'No data to export', variant: 'destructive' })
      return
    }
    const headers = ['User', 'Email', 'Role', 'Transactions', 'Total Sales', 'Total Discount', 'Avg Sale', 'Items Sold']
    const rows = userSalesData.map(u => [
      u.userName, u.userEmail, u.userRole, u.transactionCount,
      u.totalSales.toFixed(2), u.totalDiscount.toFixed(2), u.averageSale.toFixed(2), u.totalItemsSold,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `user-sales-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'User sales report exported as CSV', variant: 'success' })
  }, [userSalesData, addToast])

  return (
    <div className="space-y-4">
      {/* Report Type Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => startTransition(() => setActiveTab(val))}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <TabsList className="flex-wrap">
            <TabsTrigger value="sales">Sales Summary</TabsTrigger>
            <TabsTrigger value="user-sales">User Sales</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            <TabsTrigger value="stocktake">Stock Take</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">From:</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
              <Label className="text-xs">To:</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
            </div>
            <Button variant="outline" size="sm" onClick={() => addToast({ title: 'Export', description: 'Report exported as CSV' })}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
          </div>
        </div>

        {/* Sales Summary Tab */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesStats?.today?.sales || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Today&apos;s Sales</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {loading ? <Skeleton className="h-8 w-12" /> : salesStats?.today?.count || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Transactions Today</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesStats?.thisWeek?.sales || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">This Week</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CalendarDays className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesStats?.thisMonth?.sales || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Sales Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Sales Trend (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-64 w-full" /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailySales}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Bar dataKey="sales" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Sales by Category (Pie) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Sales by Product</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-64 w-full" /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={salesByCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="revenue" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {salesByCategory.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    salesStats?.topProducts?.map((p: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{p.productName}</TableCell>
                        <TableCell className="text-right">{p._sum?.quantity || 0}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(p._sum?.subtotal || 0)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== Per-User Sales Analytics Tab ========== */}
        <TabsContent value="user-sales" className="space-y-4">
          {/* Header with user filter for SUPER_ADMIN */}
          {isSuperAdmin && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Filter by User:</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-48 h-8 text-sm">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} ({(u.role || '').replace('_', ' ')})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={exportUserSalesCSV}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>
          )}

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {userSalesLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesSummary?.totalSales || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSuperAdmin
                      ? (selectedUserId === 'all' ? 'Total Sales (All Users)' : 'User Total Sales')
                      : 'My Total Sales'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {userSalesLoading ? <Skeleton className="h-8 w-12" /> : salesSummary?.totalTransactions || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Total Transactions</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {userSalesLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesSummary?.averageTransaction || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Avg Transaction</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {userSalesLoading ? <Skeleton className="h-8 w-12" /> : userSalesData.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSuperAdmin ? 'Active Users' : 'Data Source'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales by User Bar Chart (SUPER_ADMIN only, when viewing all) */}
            {isSuperAdmin && selectedUserId === 'all' && userSalesChartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Sales by User</CardTitle>
                </CardHeader>
                <CardContent>
                  {userSalesLoading ? <Skeleton className="h-64 w-full" /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={userSalesChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                          {userSalesChartData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Daily Sales Trend Line Chart */}
            <Card className={!(isSuperAdmin && selectedUserId === 'all' && userSalesChartData.length > 0) ? 'lg:col-span-2' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {userSalesLoading ? <Skeleton className="h-64 w-full" /> : userDailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={userDailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(value: any, name: any) => name === 'sales' ? formatCurrency(value) : value} />
                      <Legend />
                      <Line type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="count" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No sales data available for the selected period
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-User Sales Breakdown Table (SUPER_ADMIN: all users; others: own row) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                {isSuperAdmin ? 'Sales Breakdown by User' : 'My Sales Performance'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isSuperAdmin && selectedUserId === 'all' && <TableHead>#</TableHead>}
                    <TableHead>User</TableHead>
                    {isSuperAdmin && selectedUserId === 'all' && <TableHead className="hidden sm:table-cell">Email</TableHead>}
                    {isSuperAdmin && selectedUserId === 'all' && <TableHead className="hidden md:table-cell">Role</TableHead>}
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Items Sold</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Avg Sale</TableHead>
                    {isSuperAdmin && selectedUserId === 'all' && (
                      <TableHead className="text-right hidden md:table-cell">Share %</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userSalesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: isSuperAdmin ? 8 : 4 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : userSalesData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                        No sales data found for the selected period
                      </TableCell>
                    </TableRow>
                  ) : (
                    userSalesData.map((u, i) => {
                      const totalAllSales = userSalesData.reduce((sum, x) => sum + x.totalSales, 0)
                      const sharePercent = totalAllSales > 0 ? ((u.totalSales / totalAllSales) * 100) : 0
                      return (
                        <TableRow key={u.userId} className={i === 0 && isSuperAdmin ? 'bg-emerald-50/50' : ''}>
                          {isSuperAdmin && selectedUserId === 'all' && (
                            <TableCell className="font-bold">
                              {i === 0 && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 inline mr-1" />}
                              {i + 1}
                            </TableCell>
                          )}
                          <TableCell className="font-medium text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-emerald-700">
                                  {u.userName?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                                </span>
                              </div>
                              <span>{u.userName}</span>
                              {i === 0 && isSuperAdmin && selectedUserId === 'all' && (
                                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5">Top Seller</Badge>
                              )}
                            </div>
                          </TableCell>
                          {isSuperAdmin && selectedUserId === 'all' && (
                            <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{u.userEmail}</TableCell>
                          )}
                          {isSuperAdmin && selectedUserId === 'all' && (
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px]">{(u.userRole || '').replace('_', ' ')}</Badge>
                            </TableCell>
                          )}
                          <TableCell className="text-right">{u.transactionCount}</TableCell>
                          <TableCell className="text-right">{u.totalItemsSold}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(u.totalSales)}</TableCell>
                          <TableCell className="text-right hidden sm:table-cell">{formatCurrency(u.averageSale)}</TableCell>
                          {isSuperAdmin && selectedUserId === 'all' && (
                            <TableCell className="text-right hidden md:table-cell font-medium">{sharePercent.toFixed(1)}%</TableCell>
                          )}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inventory.length}</p>
                  <p className="text-xs text-muted-foreground">Total SKUs</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <Badge className="bg-red-600 text-white">{lowStockItems.length}</Badge>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
                  <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Badge className="bg-amber-600 text-white">{expiringSoon.length}</Badge>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{expiringSoon.length}</p>
                  <p className="text-xs text-muted-foreground">Expiring (30 days)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Stock by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="count" nameKey="category" label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {categoryData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Reorder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-sm">{item.product?.name}</TableCell>
                        <TableCell className="text-right text-red-600 font-bold">{item.quantity}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{item.product?.reorderPoint}</TableCell>
                      </TableRow>
                    ))}
                    {lowStockItems.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">No low stock items</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Prescriptions Tab */}
        <TabsContent value="prescriptions" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-emerald-600">{prescriptions.length}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{prescriptions.length}</p>
                  <p className="text-xs text-muted-foreground">Total Prescriptions</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-green-600">{prescriptions.filter((r: any) => r.status === 'DISPENSED').length}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{prescriptions.filter((r: any) => r.status === 'DISPENSED').length}</p>
                  <p className="text-xs text-muted-foreground">Dispensed</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-600">{prescriptions.filter((r: any) => r.priority === 'STAT' || r.priority === 'URGENT').length}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{prescriptions.filter((r: any) => r.priority === 'STAT' || r.priority === 'URGENT').length}</p>
                  <p className="text-xs text-muted-foreground">Urgent/STAT</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Prescriptions by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={rxByStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {rxByStatus.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Recent Prescriptions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rx #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptions.slice(0, 8).map((rx: any) => (
                      <TableRow key={rx.id}>
                        <TableCell className="font-mono text-xs">{rx.rxNumber}</TableCell>
                        <TableCell className="text-sm">{rx.patientName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{rx.status?.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stock Take Reports Tab */}
        <TabsContent value="stocktake" className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : completedStockTakes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No completed stock takes</p>
                <p className="text-xs text-muted-foreground mt-1">Complete a stock take to generate reports showing expired goods and stock variance</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Completed Stock Takes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead className="hidden sm:table-cell">Date</TableHead>
                        <TableHead className="hidden md:table-cell">Counted By</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedStockTakes.map((st: any) => (
                        <TableRow key={st.id}>
                          <TableCell className="font-medium text-sm">{st.reference}</TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                            {st.completedAt ? new Date(st.completedAt).toLocaleDateString() : new Date(st.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-xs hidden md:table-cell">
                            {st.countedByUser?.name || '—'}
                          </TableCell>
                          <TableCell className="text-right">{st.items?.length || 0}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                useAppStore.getState().setStockTakeReportId(st.id)
                                useAppStore.getState().setCurrentView('stock-take-report')
                              }}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              View Report
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
