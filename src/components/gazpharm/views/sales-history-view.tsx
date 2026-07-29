'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingCart, TrendingUp,
  Users, CalendarDays, Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Receipt,
  Clock,
  UserCircle,
  Eye,
  ArrowUpDown,
  Loader2,
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

const CHART_COLORS = ['#059669', '#14b8a6', '#10b981', '#34d399', '#6ee7b7', '#0d9488', '#0f766e', '#a7f3d0', '#047857', '#065f46']

import { formatCurrency } from '@/lib/currency'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Status badge color helper
function statusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-emerald-100 text-emerald-700 text-xs border-emerald-200">Completed</Badge>
    case 'PENDING':
      return <Badge className="bg-amber-100 text-amber-700 text-xs border-amber-200">Pending</Badge>
    case 'VOIDED':
      return <Badge className="bg-red-100 text-red-700 text-xs border-red-200">Voided</Badge>
    case 'REFUNDED':
      return <Badge className="bg-gray-100 text-gray-700 text-xs border-gray-200">Refunded</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
}

// Payment method badge
function paymentBadge(method: string) {
  const colors: Record<string, string> = {
    CASH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    CREDIT_CARD: 'bg-blue-100 text-blue-700 border-blue-200',
    DEBIT_CARD: 'bg-purple-100 text-purple-700 border-purple-200',
    INSURANCE: 'bg-teal-100 text-teal-700 border-teal-200',
    FSA_HSA: 'bg-amber-100 text-amber-700 border-amber-200',
    SPLIT: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  }
  return (
    <Badge className={`text-xs border ${colors[method] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {method?.replace(/_/g, ' ')}
    </Badge>
  )
}

export function SalesHistoryView() {
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<string>('totalSales')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [detailTxn, setDetailTxn] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const fetchSalesHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (selectedUserId && selectedUserId !== 'all') params.set('userId', selectedUserId)
      params.set('page', currentPage.toString())
      params.set('limit', '20')

      const res = await fetch(`/api/sales-history?${params.toString()}`, { headers: authHeaders() })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      } else {
        addToast({ title: 'Error', description: 'Failed to load sales history', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Network error loading sales data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selectedUserId, currentPage, addToast])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [dateFrom, dateTo, selectedUserId])

  // Sort salesByUser
  const sortedUserSales = (data?.salesByUser || []).sort((a: any, b: any) => {
    const aVal = a[sortField] || 0
    const bVal = b[sortField] || 0
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  // User performance chart data
  const userChart = (data?.salesByUser || []).slice(0, 8).map((u: any, i: number) => ({
    name: u.userName?.split(' ')[0] || 'Unknown',
    sales: u.totalSales,
    transactions: u.transactionCount,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  // Daily trend chart
  const dailyChartData = (data?.dailySales || []).map((d: any) => ({
    date: d.date,
    sales: d.sales,
    count: d.count,
  }))

  // Handle sort click
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-gray-400" />
    return <ArrowUpDown className={`h-3 w-3 ml-1 ${sortDir === 'desc' ? 'text-emerald-600' : 'text-amber-600'}`} />
  }

  // Set today as date range preset
  const setPresetRange = (preset: string) => {
    const now = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    switch (preset) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        setDateFrom(fmt(start))
        setDateTo(fmt(now))
        break
      }
      case 'week': {
        const start = new Date(now)
        start.setDate(start.getDate() - 7)
        setDateFrom(fmt(start))
        setDateTo(fmt(now))
        break
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        setDateFrom(fmt(start))
        setDateTo(fmt(now))
        break
      }
      case 'quarter': {
        const start = new Date(now)
        start.setMonth(start.getMonth() - 3)
        setDateFrom(fmt(start))
        setDateTo(fmt(now))
        break
      }
      case 'all': {
        setDateFrom('')
        setDateTo('')
        break
      }
    }
  }

  // CSV Export handler
  const handleExportCSV = useCallback(async () => {
    setExporting(true)
    try {
      // Fetch ALL transactions for current filters (no pagination)
      const params = new URLSearchParams()
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (selectedUserId && selectedUserId !== 'all') params.set('userId', selectedUserId)
      params.set('limit', '9999')

      const res = await fetch(`/api/sales-history?${params.toString()}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Export failed')
      const json = await res.json()
      const txns = json.transactions || []

      // Build CSV content
      const headers = [
        'Transaction #', 'Date', 'Time', 'Cashier', 'Cashier Role',
        'Customer', 'Payment Method', 'Items Count',
        'Subtotal', 'Tax', 'Discount', 'Total', 'Status'
      ]
      const rows = txns.map((txn: any) => [
        txn.transactionNo || '',
        txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
        txn.createdAt ? new Date(txn.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
        txn.user?.name || 'Unknown',
        txn.user?.role || '',
        txn.customer ? `${txn.customer.firstName} ${txn.customer.lastName}` : 'Walk-in',
        (txn.paymentMethod || '').replace(/_/g, ' '),
        txn.items?.length || 0,
        txn.subtotal ?? 0,
        txn.tax ?? 0,
        txn.discount ?? 0,
        txn.total ?? 0,
        txn.status || '',
      ])

      const escapeCSV = (val: string | number) => {
        const str = String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map((row: (string | number)[]) => row.map(escapeCSV).join(',')),
      ].join('\n')

      // Trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const dateRange = dateFrom || dateTo
        ? `_${dateFrom || 'start'}_to_${dateTo || 'end'}`
        : '_all_time'
      link.download = `sales_history${dateRange}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      addToast({ title: 'Export Complete', description: `${txns.length} transactions exported as CSV`, variant: 'success' })
    } catch {
      addToast({ title: 'Export Failed', description: 'Could not export sales data', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }, [dateFrom, dateTo, selectedUserId, addToast])

  const summary = data?.summary || {}
  const transactions = data?.transactions || []
  const pagination = data?.pagination || { page: 1, pages: 1 }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sales History</h2>
          <p className="text-sm text-muted-foreground">Track and analyze sales performance across all users</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={exporting || loading}
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1.5" />
          )}
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filters:</span>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-xs whitespace-nowrap">From:</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 w-32 text-xs"
              />
              <Label className="text-xs whitespace-nowrap">To:</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 w-32 text-xs"
              />
            </div>

            {/* Quick date presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: 'Today', val: 'today' },
                { label: '7 Days', val: 'week' },
                { label: 'This Month', val: 'month' },
                { label: '3 Months', val: 'quarter' },
                { label: 'All Time', val: 'all' },
              ].map((preset) => (
                <Button
                  key={preset.val}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2.5"
                  onClick={() => setPresetRange(preset.val)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* User filter — admin only */}
            {isSuperAdmin && (
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-xs whitespace-nowrap">User:</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {(data?.allUsers || []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-gray-900 truncate">
                {loading ? <Skeleton className="h-7 w-24" /> : formatCurrency(summary.totalSales || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Total Sales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-gray-900">
                {loading ? <Skeleton className="h-7 w-12" /> : summary.totalTransactions || 0}
              </div>
              <p className="text-xs text-muted-foreground">Total Transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-gray-900">
                {loading ? <Skeleton className="h-7 w-20" /> : formatCurrency(summary.averageTransaction || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Avg. Transaction</p>
            </div>
          </CardContent>
        </Card>
        {isSuperAdmin && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Trophy className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">
                {loading ? <Skeleton className="h-5 w-32" /> : summary.topSeller?.userName || 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                Top Seller {summary.topSeller ? formatCurrency(summary.topSeller.totalSales) : ''}
              </p>
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="by-user">By User</TabsTrigger>}
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {isSuperAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales by User - Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Sales by User</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : userChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={userChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: any, name: string) => {
                        if (name === 'sales') return formatCurrency(value)
                        return value
                      }} />
                      <Bar dataKey="sales" name="Sales ($)" radius={[4, 4, 0, 0]}>
                        {userChart.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No sales data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sales Trend - Line Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : dailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                      <Tooltip formatter={(value: any, name: string) => {
                        if (name === 'sales') return formatCurrency(value)
                        return value
                      }} />
                      <Line
                        type="monotone"
                        dataKey="sales"
                        stroke="#059669"
                        strokeWidth={2}
                        dot={{ fill: '#059669', r: 3 }}
                        activeDot={{ r: 5 }}
                        name="Sales ($)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}

          {/* Top Sellers Summary Table — SUPER_ADMIN only */}
          {isSuperAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                Top Sellers Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Items Sold</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Avg. Sale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : sortedUserSales.length > 0 ? (
                    sortedUserSales.slice(0, 10).map((u: any, i: number) => (
                      <TableRow key={u.userId} className={i === 0 ? 'bg-emerald-50/50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {i < 3 ? (
                              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'
                              }`}>
                                {i + 1}
                              </span>
                            ) : (
                              <span className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium text-muted-foreground bg-gray-100">
                                {i + 1}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                              <UserCircle className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{u.userName}</p>
                              <p className="text-[10px] text-muted-foreground">{u.userEmail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{u.userRole}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{u.transactionCount}</TableCell>
                        <TableCell className="text-right font-medium">{u.totalItemsSold}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700">
                          {formatCurrency(u.totalSales)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(u.averageSale)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                        No sales data available for the selected period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* By User Tab - Detailed user cards */}
        <TabsContent value="by-user" className="space-y-4 mt-4">
          {/* User performance pie chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Sales Distribution by User</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : sortedUserSales.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={sortedUserSales.slice(0, 8).map((u: any, i: number) => ({
                          name: u.userName?.split(' ')[0] || 'Unknown',
                          value: u.totalSales,
                          fill: CHART_COLORS[i % CHART_COLORS.length],
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {sortedUserSales.slice(0, 8).map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick stats cards per user */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" />
                  User Performance Cards
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-4 flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-6 w-20" />
                      </div>
                    ))
                  ) : sortedUserSales.length > 0 ? (
                    sortedUserSales.map((u: any) => {
                      const totalSales = data?.summary?.totalSales || 1
                      const pct = ((u.totalSales / totalSales) * 100).toFixed(1)
                      return (
                        <div key={u.userId} className="p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-emerald-700">
                              {u.userName?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium truncate">{u.userName}</p>
                              <Badge variant="outline" className="text-[10px]">{u.userRole}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{u.transactionCount} transactions</span>
                              <span>{u.totalItemsSold} items sold</span>
                              <span>{pct}% of total</span>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-1.5 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-emerald-700">{formatCurrency(u.totalSales)}</p>
                            <p className="text-[10px] text-muted-foreground">Avg: {formatCurrency(u.averageSale)}</p>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No user sales data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Transactions Tab - Detailed list */}
        <TabsContent value="transactions" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-600" />
                Transaction Details
                {data && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({pagination.total} transactions)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction #</TableHead>
                      <TableHead>Date &amp; Time</TableHead>
                      <TableHead>Cashier</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 11 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : transactions.length > 0 ? (
                      transactions.map((txn: any) => (
                        <TableRow key={txn.id} className="hover:bg-gray-50/50">
                          <TableCell className="font-mono text-xs">{txn.transactionNo}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-xs font-medium">{formatDate(txn.createdAt)}</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(txn.createdAt)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <UserCircle className="h-3.5 w-3.5 text-emerald-600" />
                              </div>
                              <div>
                                <p className="text-xs font-medium">{txn.user?.name || 'Unknown'}</p>
                                <p className="text-[10px] text-muted-foreground">{txn.user?.role || ''}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {txn.customer
                              ? `${txn.customer.firstName} ${txn.customer.lastName}`
                              : 'Walk-in'}
                          </TableCell>
                          <TableCell>{paymentBadge(txn.paymentMethod)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-[10px]">
                              {txn.items?.length || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(txn.subtotal)}</TableCell>
                          <TableCell className="text-right text-xs text-amber-600">
                            {txn.discount > 0 ? `-${formatCurrency(txn.discount)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {formatCurrency(txn.total)}
                          </TableCell>
                          <TableCell>{statusBadge(txn.status)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => { setDetailTxn(txn); setDetailOpen(true) }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-sm">
                          No transactions found for the selected filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.pages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pagination.page <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                      let pageNum: number
                      if (pagination.pages <= 5) {
                        pageNum = i + 1
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1
                      } else if (pagination.page >= pagination.pages - 2) {
                        pageNum = pagination.pages - 4 + i
                      } else {
                        pageNum = pagination.page - 2 + i
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={pagination.page === pageNum ? 'default' : 'outline'}
                          size="icon"
                          className={`h-7 w-7 text-xs ${pagination.page === pageNum ? 'bg-emerald-600 text-white' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pagination.page >= pagination.pages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : dailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke="#059669"
                        fill="#d1fae5"
                        strokeWidth={2}
                        name="Sales ($)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transaction Count Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-teal-600" />
                  Transaction Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : dailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Transactions" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sales by User Comparison — SUPER_ADMIN only */}
          {isSuperAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">User Sales Comparison (Ranked)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : sortedUserSales.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(sortedUserSales.length * 40, 200)}>
                  <BarChart data={sortedUserSales.map((u: any) => ({
                    name: u.userName,
                    sales: u.totalSales,
                    avgSale: u.averageSale,
                    transactions: u.transactionCount,
                  }))} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                    <Tooltip formatter={(value: any, name: string) => {
                      if (name === 'sales' || name === 'avgSale') return formatCurrency(value)
                      return value
                    }} />
                    <Bar dataKey="sales" name="Total Sales" fill="#059669" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Transaction Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Transaction Details</DialogTitle>
          </DialogHeader>
          {detailTxn && (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Transaction #</p>
                  <p className="font-mono text-xs font-medium">{detailTxn.transactionNo}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                  <div className="mt-0.5">{statusBadge(detailTxn.status)}</div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Date</p>
                  <p className="text-xs">{formatDate(detailTxn.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Payment</p>
                  <div className="mt-0.5">{paymentBadge(detailTxn.paymentMethod)}</div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Cashier</p>
                  <p className="text-xs">{detailTxn.user?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Customer</p>
                  <p className="text-xs">
                    {detailTxn.customer
                      ? `${detailTxn.customer.firstName} ${detailTxn.customer.lastName}`
                      : 'Walk-in'}
                  </p>
                </div>
              </div>

              {/* Items table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Price</TableHead>
                      <TableHead className="text-xs text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailTxn.items || []).map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{item.productName}</TableCell>
                        <TableCell className="text-xs text-right">{item.quantity}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{formatCurrency(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(detailTxn.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(detailTxn.tax || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-amber-600">-{formatCurrency(detailTxn.discount || 0)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5 text-base">
                  <span>Total</span>
                  <span className="text-emerald-700">{formatCurrency(detailTxn.total)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-0.5">
                  <span>Paid</span>
                  <span>{formatCurrency(detailTxn.paymentAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Change</span>
                  <span>{formatCurrency(detailTxn.changeAmount || 0)}</span>
                </div>
              </div>

              {detailTxn.notes && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Notes</p>
                  <p className="text-xs">{detailTxn.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
