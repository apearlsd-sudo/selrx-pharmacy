'use client'

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react'
import {
  ShoppingCart, TrendingUp, CalendarDays, Download, FileText,
  Users, UserCircle, ArrowUpRight, ArrowDownRight,
  Trash2, Clock, ChevronLeft, ChevronRight, Search, PackageX,
  AlertTriangle, CheckCircle2, DollarSign, Package, Filter, Printer,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'
import { formatDate, formatDateTimeShort } from '@/lib/date-utils'
import { format } from 'date-fns'

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
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Expired goods state
  const [expiredGoods, setExpiredGoods] = useState<any[]>([])
  const [expiredSummary, setExpiredSummary] = useState<any>(null)
  const [expiredLoading, setExpiredLoading] = useState(false)
  const [processingExpired, setProcessingExpired] = useState(false)
  const [selectedExpiredIds, setSelectedExpiredIds] = useState<Set<string>>(new Set())

  // Product activity log state
  const [activityLog, setActivityLog] = useState<any[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotalPages, setActivityTotalPages] = useState(1)
  const [activityFilter, setActivityFilter] = useState<string>('all')
  const [activitySearch, setActivitySearch] = useState('')
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null)
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set())
  const [deletingLog, setDeletingLog] = useState(false)

  // Product delete state
  const [deleteProduct, setDeleteProduct] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Shift report state
  const [shiftReport, setShiftReport] = useState<any>(null)
  const [shiftLoading, setShiftLoading] = useState(false)
  const [shiftFilterUser, setShiftFilterUser] = useState('')
  const [shiftFilterFrom, setShiftFilterFrom] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString().split('T')[0]
  })
  const [shiftFilterTo, setShiftFilterTo] = useState(() => new Date().toISOString().split('T')[0])
  const dateFormat = useAppStore((s) => s.dateFormat)

  // Discrepancy analysis state
  const [discrepancy, setDiscrepancy] = useState<any>(null)
  const [discLoading, setDiscLoading] = useState(false)

  const fetchShiftReport = useCallback(async () => {
    setShiftLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', new Date(shiftFilterFrom).toISOString())
      params.set('to', new Date(shiftFilterTo + 'T23:59:59').toISOString())
      if (shiftFilterUser) params.set('userId', shiftFilterUser)
      const res = await fetch(`/api/shifts?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setShiftReport(data)
      } else {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load shift report')
      }
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to load shift report', variant: 'destructive' })
    }
    setShiftLoading(false)
  }, [shiftFilterFrom, shiftFilterTo, shiftFilterUser, addToast])

  // Auto-fetch shift report when tab is activated
  useEffect(() => {
    if (activeTab === 'shifts' && !shiftReport) fetchShiftReport()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when filters change
  useEffect(() => {
    if (activeTab === 'shifts') fetchShiftReport()
  }, [shiftFilterFrom, shiftFilterTo, shiftFilterUser]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDiscrepancy = useCallback(async (shiftId?: string) => {
    setDiscLoading(true)
    try {
      const params = new URLSearchParams()
      if (shiftId) params.set('shiftId', shiftId)
      const res = await fetch(`/api/shifts/discrepancy?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setDiscrepancy(data)
      } else {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load discrepancy analysis')
      }
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to load discrepancy', variant: 'destructive' })
    }
    setDiscLoading(false)
  }, [addToast])

  // Auto-fetch discrepancy when shift tab is active
  useEffect(() => {
    if (activeTab === 'shifts' && !discrepancy) fetchDiscrepancy()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleShiftExportCSV = useCallback(() => {
    if (!shiftReport) return
    const rows = [['Product', 'Qty Sold', 'Revenue'].join(',')]
    for (const item of shiftReport.itemsSold) {
      rows.push([`"${item.productName}"`, item.quantitySold, item.revenue.toFixed(2)].join(','))
    }
    rows.push([])
    rows.push(['Total Sales', '', shiftReport.summary.totalSales.toFixed(2)].join(','))
    rows.push(['Total Transactions', '', shiftReport.summary.totalTransactions].join(','))
    rows.push(['Total Items Sold', '', shiftReport.summary.totalItemsSold].join(','))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `shift-report-${shiftFilterFrom}.csv`; a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Shift report exported as CSV', variant: 'success' })
  }, [shiftReport, shiftFilterFrom, addToast])

  // Product list for delete functionality
  const [products, setProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState('')
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?limit=200')
      if (res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : data.products || [])
      }
    } catch { /* silent */ }
  }, [])

  // Fetch product activity log
  const fetchActivityLog = useCallback(async (page?: number, action?: string, search?: string) => {
    setActivityLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page || 1))
      params.set('limit', '30')
      if (action && action !== 'all') params.set('action', action)
      if (search) params.set('search', search)

      const res = await fetch(`/api/product-history/all?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setActivityLog(data.history || [])
        setActivityTotalPages(data.pagination?.pages || 1)
        setActivityPage(data.pagination?.page || 1)
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load activity log', variant: 'destructive' })
    } finally {
      setActivityLoading(false)
    }
  }, [addToast])

  // Load activity log when tab activates or filters change
  useEffect(() => {
    if (activeTab === 'product-activity') {
      fetchActivityLog(1, activityFilter, activitySearch)
      fetchProducts()
    }
  }, [activeTab, activityFilter, fetchActivityLog, fetchProducts])

  // Handle product delete
  const handleDeleteProduct = async () => {
    if (!deleteProduct) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${deleteProduct.id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': user?.role || 'SUPER_ADMIN' },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete product')
      }
      addToast({ title: 'Product Discontinued', description: `"${deleteProduct.name}" has been discontinued`, variant: 'success' })
      setDeleteProduct(null)
      fetchProducts()
      fetchActivityLog(activityPage, activityFilter, activitySearch)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  // Toggle single log entry selection
  const toggleLogSelection = useCallback((id: string) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Toggle select all on current page
  const toggleSelectAll = useCallback(() => {
    if (selectedLogIds.size === activityLog.length && activityLog.length > 0) {
      setSelectedLogIds(new Set())
    } else {
      setSelectedLogIds(new Set(activityLog.map((h: any) => h.id)))
    }
  }, [selectedLogIds, activityLog])

  // Delete selected log entries
  const handleDeleteSelectedLogs = async () => {
    if (selectedLogIds.size === 0) return
    setDeletingLog(true)
    try {
      const res = await fetch('/api/product-history/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedLogIds) }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      addToast({ title: 'Deleted', description: `${selectedLogIds.size} log entr${selectedLogIds.size === 1 ? 'y' : 'ies'} removed`, variant: 'success' })
      setSelectedLogIds(new Set())
      fetchActivityLog(activityPage, activityFilter, activitySearch)
    } catch {
      addToast({ title: 'Error', description: 'Failed to delete log entries', variant: 'destructive' })
    } finally {
      setDeletingLog(false)
    }
  }

  // Delete single log entry
  const handleDeleteSingleLog = async (id: string) => {
    setDeletingLog(true)
    try {
      const res = await fetch('/api/product-history/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      addToast({ title: 'Deleted', description: 'Log entry removed', variant: 'success' })
      setSelectedLogIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      fetchActivityLog(activityPage, activityFilter, activitySearch)
    } catch {
      addToast({ title: 'Error', description: 'Failed to delete log entry', variant: 'destructive' })
    } finally {
      setDeletingLog(false)
    }
  }

  // Delete all log entries
  const handleDeleteAllLogs = async () => {
    setDeletingLog(true)
    try {
      const res = await fetch('/api/product-history/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      addToast({ title: 'Cleared', description: 'All activity log entries removed', variant: 'success' })
      setSelectedLogIds(new Set())
      fetchActivityLog(1, activityFilter, activitySearch)
    } catch {
      addToast({ title: 'Error', description: 'Failed to clear log', variant: 'destructive' })
    } finally {
      setDeletingLog(false)
    }
  }

  // Fetch expired goods report
  const fetchExpiredGoods = useCallback(async () => {
    setExpiredLoading(true)
    try {
      const res = await fetch('/api/reports/expired-goods')
      if (res.ok) {
        const data = await res.json()
        setExpiredGoods(data.products || [])
        setExpiredSummary(data.summary || null)
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load expired goods report', variant: 'destructive' })
    } finally {
      setExpiredLoading(false)
    }
  }, [addToast])

  // Load expired goods when tab activates
  useEffect(() => {
    if (activeTab === 'expired-goods') {
      fetchExpiredGoods()
    }
  }, [activeTab, fetchExpiredGoods])

  // CSV export for expired goods
  const exportExpiredCSV = useCallback(() => {
    if (expiredGoods.length === 0) {
      addToast({ title: 'No Data', description: 'No expired goods to export', variant: 'destructive' })
      return
    }
    const headers = ['Product', 'NDC', 'Category', 'Dosage Form', 'Batch', 'Manufacturer', 'Cost Price', 'Selling Price', 'Stock Qty', 'Cost Value', 'Retail Value', 'Loss Value', 'Qty Sold', 'Sales Revenue', 'Expiry Date']
    const rows = expiredGoods.map((p: any) => [
      p.name, p.ndc || '', p.category?.replace(/_/g, ' ') || '', p.dosageForm || '',
      p.batchNumber || '', p.manufacturer || '',
      (p.costPrice ?? 0).toFixed(2), (p.sellingPrice ?? 0).toFixed(2),
      p.stockQty, (p.costValue ?? 0).toFixed(2), (p.retailValue ?? 0).toFixed(2),
      (p.lossValue ?? 0).toFixed(2), p.qtySold, (p.salesRevenue ?? 0).toFixed(2),
      p.expiryDate ? formatDate(p.expiryDate) : '',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expired-goods-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Expired goods report exported as CSV', variant: 'success' })
  }, [expiredGoods, addToast])

  // Toggle selection of expired goods
  const toggleExpiredSelection = useCallback((id: string) => {
    setSelectedExpiredIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Toggle select all unprocessed expired goods
  const toggleSelectAllExpired = useCallback(() => {
    const unprocessed = expiredGoods.filter((p: any) => !p.processed)
    if (selectedExpiredIds.size === unprocessed.length && unprocessed.length > 0) {
      setSelectedExpiredIds(new Set())
    } else {
      setSelectedExpiredIds(new Set(unprocessed.map((p: any) => p.id)))
    }
  }, [selectedExpiredIds, expiredGoods])

  // Process expired goods — remove from inventory
  const processExpiredGoods = useCallback(async (productIds?: string[]) => {
    setProcessingExpired(true)
    try {
      const body: any = {}
      if (productIds && productIds.length > 0) body.productIds = productIds

      const res = await fetch('/api/reports/expired-goods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || '',
          'x-user-role': user?.role || '',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to process expired goods')
      }
      const data = await res.json()
      const count = data.processedCount || 0
      const costOff = data.totalCostWrittenOff || 0
      if (count > 0) {
        addToast({
          title: 'Expired Goods Processed',
          description: `${count} item${count === 1 ? '' : 's'} removed from inventory. Cost written off: ${formatCurrency(costOff)}`,
          variant: 'success',
        })
        bumpInventoryVersion()
        setSelectedExpiredIds(new Set())
        // Refresh expired goods report
        fetchExpiredGoods()
      } else {
        addToast({ title: 'No Action', description: 'No expired goods with stock to process', variant: 'default' })
      }
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to process expired goods', variant: 'destructive' })
    } finally {
      setProcessingExpired(false)
    }
  }, [user, addToast, bumpInventoryVersion, fetchExpiredGoods])

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
        const date = formatDate(t.createdAt)
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

  // CSV export for sales summary
  const exportSalesSummaryCSV = useCallback(() => {
    if (!salesStats?.topProducts?.length && !dailySales?.length) {
      addToast({ title: 'No Data', description: 'No sales data to export', variant: 'destructive' })
      return
    }
    const lines: string[] = ['Sales Summary Report']
    lines.push(`Today's Sales,${(salesStats?.today?.sales || 0).toFixed(2)}`)
    lines.push(`Transactions Today,${salesStats?.today?.count || 0}`)
    lines.push(`This Week,${(salesStats?.thisWeek?.sales || 0).toFixed(2)}`)
    lines.push(`This Month,${(salesStats?.thisMonth?.sales || 0).toFixed(2)}`)
    lines.push('')
    lines.push('Daily Sales Trend (Last 7 Days)')
    lines.push('Date,Sales,Transactions')
    dailySales.forEach((d: any) => lines.push(`${d.date},${d.sales?.toFixed(2) || '0'},${d.count || 0}`))
    lines.push('')
    lines.push('Top Selling Products')
    lines.push('Product,Units Sold,Revenue')
    ;(salesStats?.topProducts || []).forEach((p: any) => {
      lines.push(`"${p.productName}",${p._sum?.quantity || 0},${(p._sum?.subtotal || 0).toFixed(2)}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-summary-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Sales summary exported as CSV', variant: 'success' })
  }, [salesStats, dailySales, addToast])

  // CSV export for inventory report
  const exportInventoryCSV = useCallback(() => {
    if (inventory.length === 0) {
      addToast({ title: 'No Data', description: 'No inventory data to export', variant: 'destructive' })
      return
    }
    const lines: string[] = ['Product,Category,Dosage Form,Stock Qty,Reorder Point,Cost Price,Selling Price,Status']
    inventory.forEach((item: any) => {
      const p = item.product || item
      lines.push(`"${p.name || ''}","${(p.category || '').replace(/,/g, ' ')}","${p.dosageForm || ''}",${item.quantity ?? p.quantity ?? 0},${p.reorderPoint || 0},${(p.costPrice || 0).toFixed(2)},${(p.sellingPrice || 0).toFixed(2)},${p.status || 'ACTIVE'}`)
    })
    if (lowStockItems.length > 0) {
      lines.push('')
      lines.push('Low Stock Alerts')
      lines.push('Product,Stock,Reorder Level')
      lowStockItems.forEach((item: any) => {
        lines.push(`"${item.product?.name || ''}",${item.quantity},${item.product?.reorderPoint || 0}`)
      })
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Inventory report exported as CSV', variant: 'success' })
  }, [inventory, lowStockItems, addToast])

  // CSV export for prescriptions report
  const exportPrescriptionsCSV = useCallback(() => {
    if (prescriptions.length === 0) {
      addToast({ title: 'No Data', description: 'No prescriptions to export', variant: 'destructive' })
      return
    }
    const lines: string[] = ['Rx #,Patient,Doctor,Status,Priority,Items,Created At,Dispensed At']
    prescriptions.forEach((rx: any) => {
      lines.push(`${rx.rxNumber || ''},"${rx.patientName || ''}","${rx.doctorName || ''}",${rx.status || ''},${rx.priority || ''},${rx.items?.length || 0},${rx.createdAt ? formatDate(rx.createdAt) : ''},${rx.dispensedAt ? formatDate(rx.dispensedAt) : ''}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prescriptions-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Prescriptions report exported as CSV', variant: 'success' })
  }, [prescriptions, addToast])

  // CSV export for product activity log
  const exportActivityCSV = useCallback(() => {
    if (activityLog.length === 0) {
      addToast({ title: 'No Data', description: 'No activity log to export', variant: 'destructive' })
      return
    }
    const lines: string[] = ['Product,Action,Changed Fields,Changed By,Date']
    activityLog.forEach((entry: any) => {
      lines.push(`"${entry.productName || ''}",${entry.action || ''},${entry.changedFields || ''},"${entry.changedByName || ''}",${entry.createdAt ? formatDateTimeShort(entry.createdAt) : ''}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `product-activity-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Activity log exported as CSV', variant: 'success' })
  }, [activityLog, addToast])

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
      (u.totalSales ?? 0).toFixed(2), (u.totalDiscount ?? 0).toFixed(2), (u.averageSale ?? 0).toFixed(2), u.totalItemsSold ?? 0,
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
            <TabsTrigger value="expired-goods">Expired Goods</TabsTrigger>
            <TabsTrigger value="product-activity">Product Activity</TabsTrigger>
            <TabsTrigger value="shifts">Shift Reports</TabsTrigger>
          </TabsList>
          <div className={activeTab !== 'shifts' ? 'flex items-center gap-2 flex-wrap' : 'hidden'}>
            <div className="flex items-center gap-2">
              <Label className="text-xs">From:</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
              <Label className="text-xs">To:</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
            </div>
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

          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportSalesSummaryCSV} disabled={loading}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </TabsContent>

        {/* ========== Per-User Sales Analytics Tab ========== */}
        <TabsContent value="user-sales" className="space-y-4">
          {/* Header with user filter for SUPER_ADMIN */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <>
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
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={exportUserSalesCSV} disabled={userSalesData.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>

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
                                  {(u.userName || '').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
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

          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportInventoryCSV} disabled={inventory.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </TabsContent>

        {/* Expired Goods Tab */}
        <TabsContent value="expired-goods" className="space-y-4">
          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportExpiredCSV} disabled={expiredGoods.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
              {(expiredSummary?.unprocessedItems || 0) > 0 && (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                  disabled={processingExpired}
                  onClick={() => processExpiredGoods(selectedExpiredIds.size > 0 ? Array.from(selectedExpiredIds) : undefined)}
                >
                  {processingExpired ? (
                    <span className="flex items-center gap-1"><span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</span>
                  ) : selectedExpiredIds.size > 0 ? (
                    <><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Remove Selected ({selectedExpiredIds.size})</>
                  ) : (
                    <><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Remove All Expired from Inventory</>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Selection toolbar */}
          {selectedExpiredIds.size > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
              <Checkbox
                checked={expiredGoods.filter((p: any) => !p.processed).every((p: any) => selectedExpiredIds.has(p.id))}
                onCheckedChange={toggleSelectAllExpired}
              />
              <span className="text-red-700 font-medium">{selectedExpiredIds.size} item{selectedExpiredIds.size === 1 ? '' : 's'} selected</span>
              <span className="text-red-500">— cost to write off: {formatCurrency(expiredGoods.filter((p: any) => selectedExpiredIds.has(p.id)).reduce((s: number, p: any) => s + p.costValue, 0))}</span>
              <Button variant="destructive" size="sm" className="h-7 text-xs ml-auto" disabled={processingExpired} onClick={() => processExpiredGoods(Array.from(selectedExpiredIds))}>
                {processingExpired ? 'Processing...' : 'Remove Selected'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedExpiredIds(new Set())}>Cancel</Button>
            </div>
          )}

          {expiredLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : expiredGoods.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <PackageX className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No expired goods found</p>
                <p className="text-xs text-muted-foreground mt-1">Products past their expiry date will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Expired</p>
                    <p className="text-xl font-bold mt-1">{expiredSummary?.totalItems || 0}</p>
                    <p className="text-[10px] text-muted-foreground">{expiredSummary?.processedItems || 0} processed, {expiredSummary?.unprocessedItems || 0} pending</p>
                  </CardContent>
                </Card>
                <Card className={(expiredSummary?.unprocessedItems || 0) > 0 ? 'border-red-200 bg-red-50/50' : ''}>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unprocessed (In Stock)</p>
                    <p className={`text-xl font-bold mt-1 ${(expiredSummary?.unprocessedItems || 0) > 0 ? 'text-red-600' : ''}`}>{expiredSummary?.unprocessedItems || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Stock qty: {expiredSummary?.totalStockQty || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cost Value at Risk</p>
                    <p className="text-xl font-bold mt-1 text-red-600">{formatCurrency(expiredSummary?.totalCostValue || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Potential Loss</p>
                    <p className="text-xl font-bold mt-1 text-red-600">{formatCurrency(expiredSummary?.totalLossValue || 0)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Additional KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Retail Value</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(expiredSummary?.totalRetailValue || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sold Before Expiry</p>
                    <p className="text-xl font-bold mt-1 text-emerald-600">{expiredSummary?.totalQtySold || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Revenue: {formatCurrency(expiredSummary?.totalSalesRevenue || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Already Processed</p>
                    <p className="text-xl font-bold mt-1 text-muted-foreground">{expiredSummary?.processedItems || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Removed from inventory</p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed table */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Expired Products Detail</CardTitle>
                    {(expiredSummary?.unprocessedItems || 0) > 0 && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={expiredGoods.filter((p: any) => !p.processed).every((p: any) => selectedExpiredIds.has(p.id)) && expiredGoods.filter((p: any) => !p.processed).length > 0}
                          onCheckedChange={toggleSelectAllExpired}
                        />
                        <span className="text-[10px] text-muted-foreground">Select all unprocessed</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {(expiredSummary?.unprocessedItems || 0) > 0 && <TableHead className="w-8"></TableHead>}
                          <TableHead>Product</TableHead>
                          <TableHead className="hidden md:table-cell">Batch</TableHead>
                          <TableHead className="hidden lg:table-cell">Category</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Cost Value</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Retail Value</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Loss</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Sold</TableHead>
                          <TableHead className="text-right hidden lg:table-cell">Revenue</TableHead>
                          <TableHead className="text-right">Expired</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expiredGoods.map((p: any) => (
                          <TableRow key={p.id} className={p.processed ? 'opacity-60' : ''}>
                            {(expiredSummary?.unprocessedItems || 0) > 0 && (
                              <TableCell>
                                <Checkbox
                                  checked={selectedExpiredIds.has(p.id)}
                                  disabled={p.processed}
                                  onCheckedChange={() => toggleExpiredSelection(p.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{p.name}</p>
                                {p.ndc && <p className="text-[10px] text-muted-foreground font-mono">{p.ndc}</p>}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.batchNumber || '—'}</TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Badge variant="outline" className="text-[10px]">{p.category?.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(p.costPrice)}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{formatCurrency(p.sellingPrice)}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-bold text-sm ${p.stockQty > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {p.stockQty}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs text-red-600 hidden sm:table-cell">{p.stockQty > 0 ? formatCurrency(p.costValue) : '—'}</TableCell>
                            <TableCell className="text-right text-xs hidden sm:table-cell">{p.stockQty > 0 ? formatCurrency(p.retailValue) : '—'}</TableCell>
                            <TableCell className="text-right text-xs text-red-600 hidden md:table-cell">{p.stockQty > 0 ? formatCurrency(p.lossValue) : '—'}</TableCell>
                            <TableCell className="text-right text-xs text-emerald-600 hidden md:table-cell">{p.qtySold > 0 ? p.qtySold : '—'}</TableCell>
                            <TableCell className="text-right text-xs text-emerald-600 hidden lg:table-cell">{p.salesRevenue > 0 ? formatCurrency(p.salesRevenue) : '—'}</TableCell>
                            <TableCell className="text-right text-xs text-gray-600 whitespace-nowrap">
                              {formatDate(p.expiryDate)}
                            </TableCell>
                            <TableCell className="text-center">
                              {p.processed ? (
                                <Badge className="bg-gray-100 text-gray-600 text-[10px] gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Removed
                                </Badge>
                              ) : p.stockQty > 0 ? (
                                <Badge className="bg-red-100 text-red-700 text-[10px] gap-1">
                                  <AlertTriangle className="h-3 w-3" /> In Stock
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600 text-[10px]">No Stock</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Totals footer */}
                  <div className="border-t px-4 py-2 bg-gray-50/80 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>Totals —</span>
                    <span>Items: <strong>{expiredSummary?.totalItems || 0}</strong></span>
                    <span>Cost Value: <strong className="text-red-600">{formatCurrency(expiredSummary?.totalCostValue || 0)}</strong></span>
                    <span>Retail Value: <strong>{formatCurrency(expiredSummary?.totalRetailValue || 0)}</strong></span>
                    <span>Loss: <strong className="text-red-600">{formatCurrency(expiredSummary?.totalLossValue || 0)}</strong></span>
                    <span>Sold: <strong className="text-emerald-600">{expiredSummary?.totalQtySold || 0}</strong> ({formatCurrency(expiredSummary?.totalSalesRevenue || 0)})</span>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
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

          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportPrescriptionsCSV} disabled={prescriptions.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
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
                            {st.completedAt ? formatDate(st.completedAt) : formatDate(st.createdAt)}
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

        {/* Product Activity Tab */}
        <TabsContent value="product-activity" className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-emerald-600">+</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{products.length}</p>
                  <p className="text-xs text-muted-foreground">Active Products</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityLog.length > 0 ? activityLog.filter((a: any) => a.action === 'UPDATED').length : '—'}</p>
                  <p className="text-xs text-muted-foreground">Edits (this page)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityLog.length > 0 ? activityLog.filter((a: any) => a.action === 'DELETED').length : '—'}</p>
                  <p className="text-xs text-muted-foreground">Deleted (this page)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activity by product name..."
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchActivityLog(1, activityFilter, activitySearch)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Filter action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="CREATED">Created</SelectItem>
                <SelectItem value="UPDATED">Edited</SelectItem>
                <SelectItem value="DELETED">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selection toolbar */}
          {selectedLogIds.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-xs font-medium text-red-700">{selectedLogIds.size} selected</span>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDeleteSelectedLogs}
                disabled={deletingLog}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {deletingLog ? 'Deleting...' : 'Delete Selected'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedLogIds(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          )}

          {/* Activity log table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">Product Activity Log</CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={exportActivityCSV}
                    disabled={activityLog.length === 0}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Export
                  </Button>
                  {activityLog.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={handleDeleteAllLogs}
                      disabled={deletingLog}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear All
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9">
                      <Checkbox
                        checked={activityLog.length > 0 && selectedLogIds.size === activityLog.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden sm:table-cell">Changed Fields</TableHead>
                    <TableHead className="hidden md:table-cell">By</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                    <TableHead className="w-9"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : activityLog.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <Clock className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Product changes (add, edit, delete) will appear here</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    activityLog.map((h: any) => {
                      const isExpanded = expandedActivity === h.id
                      const actionColor = h.action === 'CREATED'
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : h.action === 'DELETED'
                        ? 'text-red-700 bg-red-50 border-red-200'
                        : 'text-blue-700 bg-blue-50 border-blue-200'
                      const actionIcon = h.action === 'CREATED' ? '+' : h.action === 'DELETED' ? '-' : '~'
                      const prev = h.previousValues ? (typeof h.previousValues === 'string' ? JSON.parse(h.previousValues) : h.previousValues) : null
                      const next = h.newValues ? (typeof h.newValues === 'string' ? JSON.parse(h.newValues) : h.newValues) : null
                      const dateStr = h.createdAt ? formatDateTimeShort(h.createdAt) : ''

                      return (
                        <>
                          <TableRow
                            key={h.id}
                            className={`${selectedLogIds.has(h.id) ? 'bg-red-50/50' : 'hover:bg-gray-50'} cursor-pointer`}
                            onClick={() => setExpandedActivity(isExpanded ? null : h.id)}
                          >
                            <TableCell className="w-9" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedLogIds.has(h.id)}
                                onCheckedChange={() => toggleLogSelection(h.id)}
                              />
                            </TableCell>
                            <TableCell className="w-8 text-center">
                              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{h.productName}</p>
                                {h.productNdc && <p className="text-[10px] text-muted-foreground font-mono">{h.productNdc}</p>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${actionColor}`}>
                                {actionIcon} {h.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-xs text-gray-600">
                              {h.changedFields
                                ? (typeof h.changedFields === 'string' ? h.changedFields : h.changedFields.join(', '))
                                : '—'}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-gray-600">{h.userName}</TableCell>
                            <TableCell className="text-right text-xs text-gray-600 whitespace-nowrap">{dateStr}</TableCell>
                            <TableCell className="w-9" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteSingleLog(h.id)}
                                disabled={deletingLog}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {/* Expanded detail row */}
                          {isExpanded && (
                            <TableRow key={`${h.id}-detail`}>
                              <TableCell colSpan={8} className="bg-gray-50/80 px-6 py-3">
                                {h.action === 'UPDATED' && h.changedFields && (
                                  <div className="space-y-1.5">
                                    {(typeof h.changedFields === 'string' ? h.changedFields.split(', ') : (h.changedFields || [])).map((field: string, i: number) => (
                                      <div key={i} className="text-xs flex items-start gap-2 bg-white rounded px-3 py-2 border">
                                        <span className="font-medium text-gray-600 min-w-[100px]">{field}:</span>
                                        <span className="text-red-500 line-through">{prev?.[field] != null ? String(prev[field]) : '—'}</span>
                                        <span className="text-gray-400 mx-1">→</span>
                                        <span className="text-emerald-600 font-medium">{next?.[field] != null ? String(next[field]) : '—'}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {h.action === 'CREATED' && next && (
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <p>Created: <span className="font-medium text-foreground">{next.name}</span></p>
                                    {next.category && <p>Category: {next.category}</p>}
                                    {next.sellingPrice != null && <p>Price: {formatCurrency(next.sellingPrice)}</p>}
                                  </div>
                                )}
                                {h.action === 'DELETED' && (
                                  <div className="text-xs text-muted-foreground">
                                    Status changed to <span className="text-red-600 font-medium">DISCONTINUED</span>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {activityTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">Page {activityPage} of {activityTotalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={activityPage <= 1}
                      onClick={() => { setSelectedLogIds(new Set()); fetchActivityLog(activityPage - 1, activityFilter, activitySearch) }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={activityPage >= activityTotalPages}
                      onClick={() => { setSelectedLogIds(new Set()); fetchActivityLog(activityPage + 1, activityFilter, activitySearch) }}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delete Product Section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                Discontinue Product
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Search for a product and discontinue it. Discontinued products won't appear in active listings but transaction records are preserved.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products to discontinue..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
              </div>
              {productSearch && (
                <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg">
                  {products
                    .filter((p: any) =>
                      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                      (p.ndc && p.ndc.toLowerCase().includes(productSearch.toLowerCase()))
                    )
                    .slice(0, 10)
                    .map((p: any) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer"
                        onClick={() => setDeleteProduct({ id: p.id, name: p.name })}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          {p.ndc && <p className="text-[10px] text-muted-foreground font-mono">{p.ndc}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px]">{p.category?.replace(/_/g, ' ')}</Badge>
                      </div>
                    ))}
                  {products.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">No products found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Shift Reports Tab ── */}
        <TabsContent value="shifts" className="space-y-4">
          {shiftLoading && !shiftReport && (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground animate-pulse">Loading shift report...</div>
            </div>
          )}

          {shiftReport && !shiftLoading && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="border-emerald-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-emerald-700 mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Total Sales</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-800">{formatCurrency(shiftReport.summary.totalSales)}</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-blue-700 mb-1">
                      <ShoppingCart className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Transactions</span>
                    </div>
                    <p className="text-lg font-bold text-blue-800">{shiftReport.summary.totalTransactions}</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-amber-700 mb-1">
                      <Package className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Items Sold</span>
                    </div>
                    <p className="text-lg font-bold text-amber-800">{shiftReport.summary.totalItemsSold}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-gray-700 mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Products Sold</span>
                    </div>
                    <p className="text-lg font-bold text-gray-800">{shiftReport.summary.totalProductsSold}</p>
                  </CardContent>
                </Card>
              </div>

              {shiftReport.summary.totalDiscount > 0 && (
                <div className="text-xs text-muted-foreground bg-muted rounded p-2">
                  Total Discount Given: {formatCurrency(shiftReport.summary.totalDiscount)}
                </div>
              )}

              {/* Sales by User (admin only) */}
              {isSuperAdmin && shiftReport.salesByUser && shiftReport.salesByUser.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Sales by User</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">User</TableHead>
                          <TableHead className="text-xs text-center">Transactions</TableHead>
                          <TableHead className="text-xs text-right">Total Sales</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shiftReport.salesByUser.map((u: any) => (
                          <TableRow key={u.userId}>
                            <TableCell className="text-sm font-medium">{u.userName}</TableCell>
                            <TableCell className="text-sm text-center">{u.txnCount}</TableCell>
                            <TableCell className="text-sm text-right font-mono">{formatCurrency(u.sales)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Individual Drug Quantities Sold */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Individual Drug Quantities Sold</CardTitle>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleShiftExportCSV}>
                        <Download className="h-3 w-3 mr-1" /> CSV
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => window.print()}>
                        <Printer className="h-3 w-3 mr-1" /> Print
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {shiftReport.itemsSold.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No items sold in this period</p>
                  ) : (
                    <ScrollArea className="max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-10">#</TableHead>
                            <TableHead className="text-xs">Product Name</TableHead>
                            <TableHead className="text-xs text-center">Qty Sold</TableHead>
                            <TableHead className="text-xs text-right">Revenue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shiftReport.itemsSold.map((item: any, i: number) => (
                            <TableRow key={item.productId}>
                              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                              <TableCell className="text-sm text-center font-mono">{item.quantitySold}</TableCell>
                              <TableCell className="text-sm text-right font-mono">{formatCurrency(item.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Inventory Snapshot */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Current Inventory ({shiftReport.inventorySnapshot?.length || 0} items in stock)</CardTitle>
                </CardHeader>
                <CardContent>
                  {(!shiftReport.inventorySnapshot || shiftReport.inventorySnapshot.length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No items currently in stock</p>
                  ) : (
                    <ScrollArea className="max-h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-10">#</TableHead>
                            <TableHead className="text-xs">Product</TableHead>
                            <TableHead className="text-xs">Category</TableHead>
                            <TableHead className="text-xs text-center">In Stock</TableHead>
                            <TableHead className="text-xs text-right">Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shiftReport.inventorySnapshot.map((item: any, i: number) => (
                            <TableRow key={item.productId}>
                              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.category || '—'}</TableCell>
                              <TableCell className="text-sm text-center">
                                <Badge variant={item.currentStock <= 10 ? 'destructive' : item.currentStock <= 30 ? 'secondary' : 'default'} className="font-mono text-xs">
                                  {item.currentStock}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">{formatCurrency(item.sellingPrice)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Shift History */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Shift History</CardTitle>
                </CardHeader>
                <CardContent>
                  {shiftReport.shiftHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No shift history found</p>
                  ) : (
                    <ScrollArea className="max-h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs">Started</TableHead>
                            <TableHead className="text-xs">Ended</TableHead>
                            <TableHead className="text-xs text-center">Status</TableHead>
                            <TableHead className="text-xs text-center">Txns</TableHead>
                            <TableHead className="text-xs text-right">Sales</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shiftReport.shiftHistory.filter((s: any) => s.status === 'ENDED').map((s: any) => (
                            <TableRow
                              key={s.id}
                              className={`cursor-pointer hover:bg-muted/50 ${discrepancy?.currentShift?.id === s.id ? 'bg-amber-50' : ''}`}
                              onClick={() => fetchDiscrepancy(s.id)}
                            >
                              <TableCell className="text-sm font-medium">{s.userName}</TableCell>
                              <TableCell className="text-xs">
                                {s.startedAt ? format(new Date(s.startedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm') : '—'}
                              </TableCell>
                              <TableCell className="text-xs">
                                {s.endedAt ? format(new Date(s.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm') : '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={s.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px]">
                                  {s.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono">{s.totalTransactions}</TableCell>
                              <TableCell className="text-xs text-right font-mono">{formatCurrency(s.totalSales)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* ── Discrepancy Analysis ── */}
              <Card className={discrepancy?.hasData && discrepancy.summary.totalDiscrepancies > 0 ? 'border-amber-300' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Shift Discrepancy Analysis
                    </CardTitle>
                    <Button
                      size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => fetchDiscrepancy()}
                      disabled={discLoading}
                    >
                      {discLoading ? 'Analyzing...' : 'Refresh'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {discLoading && !discrepancy && (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-muted-foreground animate-pulse">Computing discrepancy analysis...</div>
                    </div>
                  )}

                  {!discLoading && discrepancy && !discrepancy.hasData && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">{discrepancy.message}</p>
                    </div>
                  )}

                  {discrepancy?.hasData && (
                    <>
                      {discrepancy.usingLiveInventory && (
                        <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                          Note: Using live inventory for the current shift (no snapshot was captured at shift end). Future shifts will have snapshots automatically.
                        </div>
                      )}

                      {/* Shift comparison header */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div className="rounded-lg border p-3 bg-muted/30">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Previous Shift</p>
                          <p className="text-sm font-semibold">{discrepancy.previousShift.userName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(discrepancy.previousShift.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm')}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{formatCurrency(discrepancy.previousShift.totalSales)} in {discrepancy.previousShift.totalTransactions} txns</p>
                        </div>
                        <div className="rounded-lg border p-3 bg-muted/30">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Current Shift</p>
                          <p className="text-sm font-semibold">{discrepancy.currentShift.userName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(discrepancy.currentShift.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm')}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{formatCurrency(discrepancy.currentShift.totalSales)} in {discrepancy.currentShift.totalTransactions} txns</p>
                        </div>
                      </div>

                      {/* Summary cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="rounded-lg border p-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground">Discrepancies</p>
                          <p className="text-base font-bold">{discrepancy.summary.totalDiscrepancies}</p>
                        </div>
                        <div className="rounded-lg border border-red-200 p-2.5 text-center">
                          <p className="text-[10px] text-red-600">Shortages</p>
                          <p className="text-base font-bold text-red-700">{discrepancy.summary.shortageCount}</p>
                          <p className="text-[10px] text-red-500 font-mono">{formatCurrency(discrepancy.summary.totalShortageCost)}</p>
                        </div>
                        <div className="rounded-lg border border-blue-200 p-2.5 text-center">
                          <p className="text-[10px] text-blue-600">Overs</p>
                          <p className="text-base font-bold text-blue-700">{discrepancy.summary.overCount}</p>
                          <p className="text-[10px] text-blue-500 font-mono">{formatCurrency(discrepancy.summary.totalOverCost)}</p>
                        </div>
                        <div className="rounded-lg border p-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground">Net Cost Impact</p>
                          <p className={`text-base font-bold ${discrepancy.summary.netCost > 0 ? 'text-red-700' : discrepancy.summary.netCost < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                            {formatCurrency(Math.abs(discrepancy.summary.netCost))}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{discrepancy.summary.netCost > 0 ? 'net loss' : discrepancy.summary.netCost < 0 ? 'net gain' : 'balanced'}</p>
                        </div>
                      </div>

                      {/* Discrepancy table */}
                      {discrepancy.discrepancies.length === 0 ? (
                        <div className="text-center py-6">
                          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                          <p className="text-sm font-medium text-emerald-700">No discrepancies found</p>
                          <p className="text-xs text-muted-foreground">Inventory matches expected values between these two shifts.</p>
                        </div>
                      ) : (
                        <ScrollArea className="max-h-[400px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-10">#</TableHead>
                                <TableHead className="text-xs">Product</TableHead>
                                <TableHead className="text-xs text-center">Prev Stock</TableHead>
                                <TableHead className="text-xs text-center">Qty Sold</TableHead>
                                <TableHead className="text-xs text-center">Expected</TableHead>
                                <TableHead className="text-xs text-center">Actual</TableHead>
                                <TableHead className="text-xs text-center">Diff</TableHead>
                                <TableHead className="text-xs text-right">Cost Impact</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {discrepancy.discrepancies.map((d: any, i: number) => (
                                <TableRow key={d.productId}>
                                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                  <TableCell className="text-sm font-medium">{d.productName}</TableCell>
                                  <TableCell className="text-xs text-center font-mono">{d.previousStock}</TableCell>
                                  <TableCell className="text-xs text-center font-mono">{d.qtySold}</TableCell>
                                  <TableCell className="text-xs text-center font-mono">{d.expectedStock}</TableCell>
                                  <TableCell className="text-xs text-center font-mono">{d.actualStock}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge
                                      variant={d.discrepancy > 0 ? 'destructive' : 'secondary'}
                                      className="text-[10px] font-mono"
                                    >
                                      {d.discrepancy > 0 ? `-${d.discrepancy}` : `+${Math.abs(d.discrepancy)}`}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className={`text-xs text-right font-mono font-medium ${d.discrepancy > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                    {formatCurrency(d.discrepancyCost)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => { if (!open) setDeleteProduct(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discontinue Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discontinue <strong>{deleteProduct?.name}</strong>? This will mark the product as discontinued. It will no longer appear in active listings but existing transaction records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteProduct}
              disabled={deleting}
            >
              {deleting ? 'Discontinuing...' : 'Discontinue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
