'use client'

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react'
import {
  ShoppingCart, TrendingUp, CalendarDays, Download, FileText,
  Users, UserCircle, ArrowUpRight, ArrowDownRight,
  Trash2, Clock, ChevronLeft, ChevronRight, Search, PackageX,
  AlertTriangle, CheckCircle2, DollarSign, Package, Filter, Printer, BarChart3,
  Camera, ArrowRightLeft, Wallet, ClipboardCheck, Target, Shield, Loader2, Plus,
  ArrowUp, ArrowDown, PieChart as PieChartIcon, RefreshCw, CalendarIcon,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency, currencySymbol } from '@/lib/currency'
import { formatDate, formatDateTimeShort } from '@/lib/date-utils'
import { format } from 'date-fns'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { DateInput } from '@/components/gazpharm/shared/date-input'

const CHART_COLORS = ['#059669', '#14b8a6', '#10b981', '#34d399', '#6ee7b7', '#0d9488', '#0f766e', '#a7f3d0', '#0891b2', '#06b6d4']

/** Format '2025-08' → 'Aug 2025' */
function formatMonthDisplay(ym: string): string {
  if (!ym || !ym.includes('-')) return ym
  const [y, m] = ym.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Parse '2025-08' → Date object (15th of month to avoid edge cases) */
function parseMonthToDate(ym: string): Date | undefined {
  if (!ym || !ym.includes('-')) return undefined
  const [y, m] = ym.split('-')
  const d = new Date(Number(y), Number(m) - 1, 15)
  return isNaN(d.getTime()) ? undefined : d
}

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
  const [deletingExpired, setDeletingExpired] = useState(false)
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

  // Daily shift snapshots state
  const [snapshotData, setSnapshotData] = useState<any>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [expandedShiftSnap, setExpandedShiftSnap] = useState<string | null>(null)
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().split('T')[0])

  // Staff Targets state
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [targetDateFrom, setTargetDateFrom] = useState(() => firstOfMonth.toISOString().split('T')[0])
  const [targetDateTo, setTargetDateTo] = useState(() => today.toISOString().split('T')[0])
  const [targetsData, setTargetsData] = useState<any>(null)
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [showTargetDialog, setShowTargetDialog] = useState(false)
  const [targetForm, setTargetForm] = useState({ userId: '', targetType: 'SALES_AMOUNT', targetValue: '' })
  const [targetSaving, setTargetSaving] = useState(false)

  // Insurance Claims state
  const [claims, setClaims] = useState<any[]>([])
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimsFilter, setClaimsFilter] = useState<string>('all')
  const [showClaimDialog, setShowClaimDialog] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<any>(null)
  const [claimAction, setClaimAction] = useState<string>('')
  const [claimApprovedAmount, setClaimApprovedAmount] = useState('')
  const [claimRejectionReason, setClaimRejectionReason] = useState('')
  const [claimNotes, setClaimNotes] = useState('')
  const [claimUpdating, setClaimUpdating] = useState(false)

  // Financial P&L state
  const [finDateFrom, setFinDateFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [finDateTo, setFinDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [finData, setFinData] = useState<any>(null)
  const [finLoading, setFinLoading] = useState(false)
  // Controlled substances state
  const [csLogs, setCsLogs] = useState<any[]>([])
  const [csInventory, setCsInventory] = useState<any[]>([])
  const [csLoading, setCsLoading] = useState(false)
  const [csDateFrom, setCsDateFrom] = useState('')
  const [csDateTo, setCsDateTo] = useState('')

  const fetchCsData = useCallback(async () => {
    setCsLoading(true)
    try {
      const params = new URLSearchParams()
      if (csDateFrom) params.set('from', csDateFrom)
      if (csDateTo) params.set('to', csDateTo)
      const [logsRes, invRes] = await Promise.all([
        fetch(`/api/controlled-substances?${params.toString()}`, { headers: authHeaders() }),
        fetch('/api/controlled-substances/inventory', { headers: authHeaders() }),
      ])
      if (logsRes.ok) {
        const data = await logsRes.json()
        setCsLogs(data.logs || [])
      }
      if (invRes.ok) {
        const data = await invRes.json()
        setCsInventory(data.items || [])
      }
    } catch { /* silent */ }
    setCsLoading(false)
  }, [csDateFrom, csDateTo])

  // Auto-fetch CS data when tab is active
  useEffect(() => {
    if (activeTab === 'controlled-substances') fetchCsData()
  }, [activeTab, fetchCsData])

  const fetchFinancialReport = useCallback(async () => {
    setFinLoading(true)
    try {
      const params = new URLSearchParams()
      if (finDateFrom) params.set('from', finDateFrom)
      if (finDateTo) params.set('to', finDateTo)
      const res = await fetch(`/api/reports/financial?${params}`, { headers: authHeaders() })
      if (res.ok) {
        setFinData(await res.json())
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load financial report', variant: 'destructive' })
    }
    setFinLoading(false)
  }, [finDateFrom, finDateTo, addToast])

  useEffect(() => {
    if (activeTab === 'financial') fetchFinancialReport()
  }, [activeTab, finDateFrom, finDateTo, fetchFinancialReport])

  const fetchShiftReport = useCallback(async () => {
    setShiftLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', new Date(shiftFilterFrom + 'T12:00:00').toISOString())
      params.set('to', new Date(shiftFilterTo + 'T12:00:00').toISOString())
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
    setDiscrepancy(null)
    try {
      const params = new URLSearchParams()
      if (shiftId) {
        params.set('shiftId', shiftId)
      } else {
        params.set('date', shiftFilterFrom)
      }
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
  }, [shiftFilterFrom, addToast])

  // Auto-fetch discrepancy when shift tab is active or date changes
  useEffect(() => {
    if (activeTab === 'shifts') fetchDiscrepancy()
  }, [activeTab, shiftFilterFrom]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Fetch daily shift snapshots for comparison & accounting
  const fetchSnapshots = useCallback(async (date?: string) => {
    const d = date || snapshotDate
    setSnapshotLoading(true)
    try {
      const params = new URLSearchParams({ date: d })
      const res = await fetch(`/api/shifts/snapshots?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSnapshotData(data)
      } else {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load snapshots')
      }
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to load shift snapshots', variant: 'destructive' })
    }
    setSnapshotLoading(false)
  }, [snapshotDate, addToast])

  // Auto-fetch snapshots when shift tab is active
  useEffect(() => {
    if (activeTab === 'shifts' && !snapshotData) fetchSnapshots()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch snapshots when snapshot date changes
  useEffect(() => {
    if (activeTab === 'shifts') {
      setSnapshotData(null)
      fetchSnapshots(snapshotDate)
    }
  }, [snapshotDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Export snapshots comparison CSV
  const handleSnapshotExportCSV = useCallback(() => {
    if (!snapshotData?.comparisonMatrix) return
    const shifts = snapshotData.shifts || []
    const hasPrev = !!snapshotData.previousDayBaseline
    const prevLabel = hasPrev ? `Prev Day End (${snapshotData.previousDayBaseline.userName})` : ''
    const headers = ['Product', 'Category', 'Cost Price', ...(hasPrev ? [prevLabel] : []), ...shifts.map((s: any) => `${s.userName} (${format(new Date(s.endedAt), 'HH:mm')})`), ...(hasPrev ? ['Day Change'] : []), 'Variance', 'Adjusted Variance', 'Expiry Note', 'Cost Impact']
    const rows = [headers.join(',')]
    for (const item of snapshotData.comparisonMatrix) {
      const displayVariance = item.expiryRelated ? item.adjustedVariance : item.variance
      const displayDayChange = item.expiryRelated ? item.adjustedDayChange : item.dayChange
      const expiryNote = item.expiryRelated
        ? (item.adjustedVariance === 0 && item.variance > 0 ? 'Fully explained by expiry' : `Partially explained by expiry (raw: ${item.variance})`)
        : ''
      const row = [
        `"${item.productName}"`,
        item.category || '',
        (item.costPrice || 0).toFixed(2),
        ...(hasPrev ? [item.prevDayQty || 0] : []),
        ...shifts.map((s: any) => item.quantities[s.shiftId] || 0),
        ...(hasPrev ? [displayDayChange || 0] : []),
        item.variance,
        displayVariance,
        `"${expiryNote}"`,
        displayVariance > 0 ? (displayVariance * item.costPrice).toFixed(2) : '0',
      ]
      rows.push(row.join(','))
    }
    // Add daily cash accounting rows
    rows.push([])
    rows.push(['DAILY CASH ACCOUNTING'])
    rows.push(['User', 'Started', 'Ended', 'Sales', 'Txns', 'Cash Start', 'Cash End', 'Expected', 'Discrepancy'].join(','))
    for (const s of shifts) {
      rows.push([
        `"${s.userName}"`,
        s.startedAt ? format(new Date(s.startedAt), 'yyyy-MM-dd HH:mm') : '',
        s.endedAt ? format(new Date(s.endedAt), 'yyyy-MM-dd HH:mm') : '',
        (s.totalSales || 0).toFixed(2),
        s.totalTransactions || 0,
        (s.cashAtStart ?? '').toString(),
        (s.cashAtEnd ?? '').toString(),
        (s.expectedCash ?? '').toString(),
        (s.cashDiscrepancy ?? '').toString(),
      ].join(','))
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `shift-snapshots-${snapshotDate}.csv`; a.click()
    URL.revokeObjectURL(url)
    addToast({ title: 'Exported', description: 'Snapshot comparison exported as CSV', variant: 'success' })
  }, [snapshotData, snapshotDate, addToast, format])

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

  // Fetch staff targets when tab activates
  const fetchTargets = useCallback(async () => {
    setTargetsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('progress', 'true')
      if (targetDateFrom) params.set('from', targetDateFrom)
      if (targetDateTo) params.set('to', targetDateTo)
      const res = await fetch(`/api/user-targets?${params.toString()}`, { headers: authHeaders() })
      if (res.ok) {
        setTargetsData(await res.json())
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load staff targets', variant: 'destructive' })
    } finally {
      setTargetsLoading(false)
    }
  }, [targetDateFrom, targetDateTo, addToast])

  useEffect(() => {
    if (activeTab === 'staff-targets') {
      fetchTargets()
    }
  }, [activeTab, fetchTargets])

  // Save a target
  const handleSaveTarget = async () => {
    if (!targetForm.userId || !targetForm.targetValue) return
    setTargetSaving(true)
    try {
      const res = await fetch('/api/user-targets', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetForm.userId,
          period: targetDateFrom ? targetDateFrom.slice(0, 7) : new Date().toISOString().slice(0, 7),
          targetType: targetForm.targetType,
          targetValue: parseFloat(targetForm.targetValue),
        }),
      })
      if (!res.ok) throw new Error('Failed to save target')
      setShowTargetDialog(false)
      setTargetForm({ userId: '', targetType: 'SALES_AMOUNT', targetValue: '' })
      fetchTargets()
      addToast({ title: 'Target Saved', variant: 'success' })
    } catch {
      addToast({ title: 'Error', description: 'Failed to save target', variant: 'destructive' })
    } finally {
      setTargetSaving(false)
    }
  }

  // Fetch insurance claims when tab activates
  const fetchClaims = useCallback(async (status?: string) => {
    setClaimsLoading(true)
    try {
      const params = new URLSearchParams()
      if (status && status !== 'all') params.set('status', status)
      const res = await fetch(`/api/insurance-claims?${params.toString()}`, { headers: authHeaders() })
      if (res.ok) {
        setClaims(await res.json())
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load insurance claims', variant: 'destructive' })
    } finally {
      setClaimsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (activeTab === 'insurance-claims') {
      fetchClaims(claimsFilter)
    }
  }, [activeTab, claimsFilter, fetchClaims])

  // Update claim status
  const handleUpdateClaim = async () => {
    if (!selectedClaim || !claimAction) return
    setClaimUpdating(true)
    try {
      const body: any = { id: selectedClaim.id, status: claimAction }
      if (claimAction === 'APPROVED' || claimAction === 'PARTIALLY_APPROVED') {
        body.approvedAmount = claimApprovedAmount || selectedClaim.totalAmount
      }
      if (claimAction === 'REJECTED') body.rejectionReason = claimRejectionReason
      if (claimNotes) body.notes = claimNotes
      const res = await fetch('/api/insurance-claims', {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update claim')
      setShowClaimDialog(false)
      setSelectedClaim(null)
      setClaimAction('')
      setClaimApprovedAmount('')
      setClaimRejectionReason('')
      setClaimNotes('')
      fetchClaims(claimsFilter)
      addToast({ title: 'Claim Updated', description: `Status set to ${claimAction}`, variant: 'success' })
    } catch {
      addToast({ title: 'Error', description: 'Failed to update claim', variant: 'destructive' })
    } finally {
      setClaimUpdating(false)
    }
  }

  // CSV export for expired goods
  const exportExpiredCSV = useCallback(() => {
    if (expiredGoods.length === 0) {
      addToast({ title: 'No Data', description: 'No expired goods to export', variant: 'destructive' })
      return
    }
    const headers = ['Product', 'Dosage Form', 'Batch', 'Category', 'Manufacturer', 'Cost Price', 'Quantity', 'Cost Value', 'Loss Value', 'Expiry Date', 'Date Removed', 'Status']
    const rows = expiredGoods.map((p: any) => [
      p.name, p.dosageForm || '', p.batchNumber || '', p.category?.replace(/_/g, ' ') || '',
      p.manufacturer || '', (p.costPrice ?? 0).toFixed(2),
      p.processed ? (p.removedQty || 0) : p.stockQty,
      (p.costValue ?? 0).toFixed(2), (p.lossValue ?? 0).toFixed(2),
      p.expiryDate ? formatDate(p.expiryDate) : '',
      p.processed ? (p.dateRemoved ? formatDate(p.dateRemoved) : (p.expiredAt ? formatDateTimeShort(p.expiredAt) : '')) : '',
      p.processed ? 'Removed' : (p.stockQty > 0 ? 'In Stock' : 'No Stock'),
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
    const allSelectable = expiredGoods.map((p: any) => p.id)
    const allSelected = allSelectable.length > 0 && allSelectable.every((id) => selectedExpiredIds.has(id))
    if (allSelected) {
      setSelectedExpiredIds(new Set())
    } else {
      setSelectedExpiredIds(new Set(allSelectable))
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

  // Delete expired goods records (discontinue products)
  const deleteExpiredGoods = useCallback(async (options: { batchIds?: string[]; all?: boolean }) => {
    setDeletingExpired(true)
    try {
      const res = await fetch('/api/reports/expired-goods', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '', 'x-user-role': user?.role || '' },
        body: JSON.stringify(options),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      const data = await res.json()
      addToast({ title: 'Deleted', description: data.message, variant: 'success' })
      setSelectedExpiredIds(new Set())
      bumpInventoryVersion()
      fetchExpiredGoods()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setDeletingExpired(false)
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
      const dateParams = new URLSearchParams()
      if (dateFrom) dateParams.set('from', dateFrom)
      if (dateTo) dateParams.set('to', dateTo)
      const qs = dateParams.toString() ? `?${dateParams.toString()}` : ''
      const [statsRes, txRes, invRes, rxRes, stRes] = await Promise.all([
        fetch(`/api/transactions?action=stats${qs}`, { headers: authHeaders() }),
        fetch(`/api/transactions${qs}`, { headers: authHeaders() }),
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
  }, [addToast, dateFrom, dateTo])

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

  // Also refetch sales data when switching to a date-filtered tab
  useEffect(() => {
    if (['sales', 'prescriptions'].includes(activeTab)) {
      fetchSalesData()
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="space-y-3 animate-fade-in">
      <PageHeader icon={BarChart3} title="Reports" description="Sales analytics, shift reports, and product activity" />

      {/* Report Type Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => startTransition(() => setActiveTab(val))}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <TabsList className="flex-wrap p-0 rounded-none gap-0" style={{ backgroundColor: '#a1d99b' }}>
            <TabsTrigger value="sales" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Sales Summary</TabsTrigger>
            <TabsTrigger value="user-sales" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">User Sales</TabsTrigger>
            <TabsTrigger value="inventory" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Inventory</TabsTrigger>
            <TabsTrigger value="prescriptions" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Prescriptions</TabsTrigger>
            <TabsTrigger value="stocktake" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Stock Take</TabsTrigger>
            <TabsTrigger value="expired-goods" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Expired Goods</TabsTrigger>
            <TabsTrigger value="product-activity" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Product Activity</TabsTrigger>
            <TabsTrigger value="shifts" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Shift Reports</TabsTrigger>
            <TabsTrigger value="staff-targets" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Staff Targets</TabsTrigger>
            <TabsTrigger value="insurance-claims" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Insurance Claims</TabsTrigger>
            <TabsTrigger value="financial" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Financial P&L</TabsTrigger>
            <TabsTrigger value="controlled-substances" className="rounded-none hover:bg-[#edf8e9] data-[state=active]:hover:bg-background transition-colors duration-[600ms] data-[state=active]:rounded-none data-[state=active]:h-full">Controlled Substances</TabsTrigger>
          </TabsList>
          <div className={['sales', 'user-sales', 'prescriptions'].includes(activeTab) ? 'flex items-center gap-2 flex-wrap' : 'hidden'}>
            <div className="flex items-center gap-2">
              <Label className="text-xs">From:</Label>
              <DateInput value={dateFrom} onChange={(iso) => setDateFrom(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80 focus:bg-white dark:bg-gray-900 dark:focus:bg-gray-900" />
              <Label className="text-xs">To:</Label>
              <DateInput value={dateTo} onChange={(iso) => setDateTo(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80 focus:bg-white dark:bg-gray-900 dark:focus:bg-gray-900" />
            </div>
          </div>
        </div>

        {/* Sales Summary Tab */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesStats?.today?.sales || 0)}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Today&apos;s Sales</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <ShoppingCart className="h-4.5 w-4.5 text-teal-600" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {loading ? <Skeleton className="h-8 w-12" /> : salesStats?.today?.count || 0}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Transactions Today</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-4.5 w-4.5 text-green-600" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesStats?.thisWeek?.sales || 0)}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">This Week</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                  <CalendarDays className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {loading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesStats?.thisMonth?.sales || 0)}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">This Month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Sales Trend */}
            <Card className="card-hover transition-all duration-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Daily Sales Trend (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-64 w-full" /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailySales}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => currencySymbol() + v} />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px' }} />
                      <Bar dataKey="sales" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Sales by Category (Pie) */}
            <Card className="card-hover transition-all duration-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sales by Product</CardTitle>
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
                      <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products Table */}
          <Card className="card-hover transition-all duration-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="table-header-standard">
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
            <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 dark:border-gray-700/80 text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:text-gray-200 hover:border-gray-300" onClick={exportSalesSummaryCSV} disabled={loading}>
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
            <Button variant="outline" size="sm" className="border-gray-200 dark:border-gray-700/80 text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:text-gray-200 hover:border-gray-300" onClick={exportUserSalesCSV} disabled={userSalesData.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {userSalesLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesSummary?.totalSales || 0)}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {isSuperAdmin
                      ? (selectedUserId === 'all' ? 'Total Sales (All Users)' : 'User Total Sales')
                      : 'My Total Sales'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <ShoppingCart className="h-4.5 w-4.5 text-teal-600" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {userSalesLoading ? <Skeleton className="h-8 w-12" /> : salesSummary?.totalTransactions || 0}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total Transactions</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center">
                  <TrendingUp className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {userSalesLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(salesSummary?.averageTransaction || 0)}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Avg Transaction</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Users className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {userSalesLoading ? <Skeleton className="h-8 w-12" /> : userSalesData.length}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
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
              <Card className="card-hover transition-all duration-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sales by User</CardTitle>
                </CardHeader>
                <CardContent>
                  {userSalesLoading ? <Skeleton className="h-64 w-full" /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={userSalesChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => currencySymbol() + v} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px' }} />
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
            <Card className={`${!(isSuperAdmin && selectedUserId === 'all' && userSalesChartData.length > 0) ? 'lg:col-span-2' : ''} card-hover transition-all duration-200`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Daily Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {userSalesLoading ? <Skeleton className="h-64 w-full" /> : userDailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={userDailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => currencySymbol() + v} />
                      <Tooltip formatter={(value: any, name: any) => name === 'sales' ? formatCurrency(value) : value} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px' }} />
                      <Legend />
                      <Line type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="count" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center"><EmptyState icon={TrendingUp} title="No sales data available" description="Select a different date range to see sales trends" /></div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-User Sales Breakdown Table (SUPER_ADMIN: all users; others: own row) */}
          <Card className="card-hover transition-all duration-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center"><Users className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /></div>
                {isSuperAdmin ? 'Sales Breakdown by User' : 'My Sales Performance'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="table-header-standard">
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
                      <TableCell colSpan={8} className="p-0"><EmptyState icon={Users} title="No sales data found" description="No transactions match the selected period" /></TableCell>
                    </TableRow>
                  ) : (
                    userSalesData.map((u, i) => {
                      const totalAllSales = userSalesData.reduce((sum, x) => sum + x.totalSales, 0)
                      const sharePercent = totalAllSales > 0 ? ((u.totalSales / totalAllSales) * 100) : 0
                      return (
                        <TableRow key={u.userId} className={i === 0 && isSuperAdmin ? 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20/50' : ''}>
                          {isSuperAdmin && selectedUserId === 'all' && (
                            <TableCell className="font-bold">
                              {i === 0 && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 inline mr-1" />}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{inventory.length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total SKUs</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <Badge className="bg-red-600 text-white">{lowStockItems.length}</Badge>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{lowStockItems.length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Low Stock Alerts</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Badge className="bg-amber-600 text-white">{expiringSoon.length}</Badge>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{expiringSoon.length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Expiring (30 days)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="card-hover transition-all duration-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Stock by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="count" nameKey="category" label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {categoryData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="table-header-standard">
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
                        <TableCell className="text-right text-red-600 dark:text-red-400 font-bold">{item.quantity}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{item.product?.reorderPoint}</TableCell>
                      </TableRow>
                    ))}
                    {lowStockItems.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="p-0"><EmptyState icon={Package} title="No low stock items" description="All products are above their reorder levels" /></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 dark:border-gray-700/80 text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:text-gray-200 hover:border-gray-300" onClick={exportInventoryCSV} disabled={inventory.length === 0}>
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
              {expiredGoods.length > 0 && (
                <Button
                  variant="outline" size="sm" className="h-8 text-xs border-gray-300 text-gray-600 hover:bg-gray-100"
                  disabled={deletingExpired}
                  onClick={() => deleteExpiredGoods({ all: true })}
                >
                  {deletingExpired ? 'Deleting...' : 'Clear All Records'}
                </Button>
              )}
            </div>
          </div>

          {/* Selection toolbar */}
          {selectedExpiredIds.size > 0 && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20 border border-red-200 rounded-lg px-4 py-2 text-sm">
              <Checkbox
                checked={expiredGoods.length > 0 && expiredGoods.every((p: any) => selectedExpiredIds.has(p.id))}
                onCheckedChange={toggleSelectAllExpired}
              />
              <span className="text-red-700 font-medium">{selectedExpiredIds.size} item{selectedExpiredIds.size === 1 ? '' : 's'} selected</span>
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="destructive" size="sm" className="h-7 text-xs bg-gray-700 hover:bg-gray-800" disabled={deletingExpired} onClick={() => deleteExpiredGoods({ batchIds: Array.from(selectedExpiredIds) })}>
                  {deletingExpired ? 'Deleting...' : `Delete Selected (${selectedExpiredIds.size})`}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedExpiredIds(new Set())}>Cancel</Button>
              </div>
            </div>
          )}

          {expiredLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : expiredGoods.length === 0 ? (
            <EmptyState icon={PackageX} title="No expired goods found" description="Products past their expiry date will appear here" />
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Expired</p>
                    <p className="text-lg sm:text-xl font-bold mt-1">{expiredSummary?.totalItems || 0}</p>
                    <p className="text-[10px] text-muted-foreground">{expiredSummary?.processedItems || 0} removed, {expiredSummary?.unprocessedItems || 0} pending</p>
                  </CardContent>
                </Card>
                <Card className={(expiredSummary?.unprocessedItems || 0) > 0 ? 'border-red-200 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20/50' : ''}>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unprocessed (In Stock)</p>
                    <p className={`text-lg sm:text-xl font-bold mt-1 ${(expiredSummary?.unprocessedItems || 0) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{expiredSummary?.unprocessedItems || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Stock qty: {expiredSummary?.totalStockQty || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Qty Removed</p>
                    <p className="text-lg sm:text-xl font-bold mt-1 text-orange-600">{expiredSummary?.totalRemovedQty || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Units written off</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cost Value at Risk</p>
                    <p className="text-lg sm:text-xl font-bold mt-1 text-red-600 dark:text-red-400">{formatCurrency(expiredSummary?.totalCostValue || 0)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Additional KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Retail Value</p>
                    <p className="text-lg sm:text-xl font-bold mt-1">{formatCurrency(expiredSummary?.totalRetailValue || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Potential Loss</p>
                    <p className="text-lg sm:text-xl font-bold mt-1 text-red-600 dark:text-red-400">{formatCurrency(expiredSummary?.totalLossValue || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sold Before Expiry</p>
                    <p className="text-lg sm:text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{expiredSummary?.totalQtySold || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Revenue: {formatCurrency(expiredSummary?.totalSalesRevenue || 0)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed table */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Expired Products Detail</CardTitle>
                    {expiredGoods.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={expiredGoods.every((p: any) => selectedExpiredIds.has(p.id)) && expiredGoods.length > 0}
                          onCheckedChange={toggleSelectAllExpired}
                        />
                        <span className="text-[10px] text-muted-foreground">Select all</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="table-header-standard">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="hidden md:table-cell">Batch</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="hidden lg:table-cell">Category</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Cost Value</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Loss</TableHead>
                          <TableHead className="text-right">Expiry Date</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Date Removed</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expiredGoods.map((p: any) => (
                          <TableRow key={p.id} className={p.processed ? 'opacity-60' : ''}>
                            <TableCell>
                              <Checkbox
                                checked={selectedExpiredIds.has(p.id)}
                                onCheckedChange={() => toggleExpiredSelection(p.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{p.name}</p>
                                {p.dosageForm && <p className="text-[10px] text-muted-foreground">{p.dosageForm}</p>}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">{p.batchNumber || '—'}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-bold text-lg ${p.processed ? 'text-orange-600' : p.stockQty > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                                {p.processed ? (p.removedQty || 0) : p.stockQty}
                              </span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Badge variant="outline" className="text-[10px]">{p.category?.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(p.costPrice)}</TableCell>
                            <TableCell className="text-right text-xs text-red-600 dark:text-red-400 hidden sm:table-cell">
                              {p.costValue > 0 ? formatCurrency(p.costValue) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs text-red-600 dark:text-red-400 hidden sm:table-cell">
                              {p.lossValue > 0 ? formatCurrency(p.lossValue) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs text-gray-600 whitespace-nowrap">
                              {formatDate(p.expiryDate)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                              {p.processed ? (p.dateRemoved ? formatDate(p.dateRemoved) : (p.expiredAt ? formatDateTimeShort(p.expiredAt) : '—')) : '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              {p.processed ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Badge className="bg-orange-100 text-orange-700 text-[10px] gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Removed
                                  </Badge>
                                  <Button
                                    variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:text-red-400"
                                    disabled={deletingExpired}
                                    onClick={() => deleteExpiredGoods({ batchIds: [p.id] })}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : p.stockQty > 0 ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Badge className="bg-red-100 text-red-700 text-[10px] gap-1">
                                    <AlertTriangle className="h-3 w-3" /> In Stock
                                  </Badge>
                                  <Button
                                    variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:text-red-400"
                                    disabled={deletingExpired}
                                    onClick={() => deleteExpiredGoods({ batchIds: [p.id] })}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
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
                  <div className="border-t px-4 py-2 bg-gray-50 dark:bg-gray-800/50/80 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>Totals —</span>
                    <span>Batches: <strong>{expiredSummary?.totalItems || 0}</strong></span>
                    <span>Qty Removed: <strong className="text-orange-600">{expiredSummary?.totalRemovedQty || 0}</strong></span>
                    <span>Cost Written Off: <strong className="text-red-600 dark:text-red-400">{formatCurrency(expiredSummary?.totalCostValue || 0)}</strong></span>
                    <span>Loss: <strong className="text-red-600 dark:text-red-400">{formatCurrency(expiredSummary?.totalLossValue || 0)}</strong></span>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Prescriptions Tab */}
        <TabsContent value="prescriptions" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{prescriptions.length}</span>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{prescriptions.length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total Prescriptions</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-green-600">{prescriptions.filter((r: any) => r.status === 'DISPENSED').length}</span>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{prescriptions.filter((r: any) => r.status === 'DISPENSED').length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Dispensed</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{prescriptions.filter((r: any) => r.priority === 'STAT' || r.priority === 'URGENT').length}</span>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{prescriptions.filter((r: any) => r.priority === 'STAT' || r.priority === 'URGENT').length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Urgent/STAT</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="card-hover transition-all duration-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Prescriptions by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={rxByStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {rxByStatus.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Recent Prescriptions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="table-header-standard">
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
            <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 dark:border-gray-700/80 text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:text-gray-200 hover:border-gray-300" onClick={exportPrescriptionsCSV} disabled={prescriptions.length === 0}>
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
            <EmptyState icon={FileText} title="No completed stock takes" description="Complete a stock take to generate reports showing expired goods and stock variance" />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Completed Stock Takes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table className="table-header-standard">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">+</span>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{products.length}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Active Products</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{activityLog.length > 0 ? activityLog.filter((a: any) => a.action === 'UPDATED').length : '—'}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Edits (this page)</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-4.5 w-4.5 text-red-500" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{activityLog.length > 0 ? activityLog.filter((a: any) => a.action === 'DELETED').length : '—'}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Deleted (this page)</p>
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
                className="pl-9 h-8 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80 focus:bg-white dark:bg-gray-900 dark:focus:bg-gray-900"
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
            <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20 border border-red-200 rounded-lg">
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
          <Card className="card-hover transition-all duration-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Product Activity Log</CardTitle>
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
                      className="h-7 text-xs text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30 dark:bg-red-900/20"
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
              <Table className="table-header-standard">
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
                      <TableCell colSpan={8} className="p-0"><EmptyState icon={Clock} title="No activity recorded yet" description="Product changes (add, edit, delete) will appear here" /></TableCell>
                    </TableRow>
                  ) : (
                    activityLog.map((h: any) => {
                      const isExpanded = expandedActivity === h.id
                      const actionColor = h.action === 'CREATED'
                        ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 border-emerald-200'
                        : h.action === 'DELETED'
                        ? 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20 border-red-200'
                        : 'text-blue-700 bg-blue-50 dark:bg-blue-900/30 border-blue-200'
                      const actionIcon = h.action === 'CREATED' ? '+' : h.action === 'DELETED' ? '-' : '~'
                      const prev = h.previousValues ? (typeof h.previousValues === 'string' ? JSON.parse(h.previousValues) : h.previousValues) : null
                      const next = h.newValues ? (typeof h.newValues === 'string' ? JSON.parse(h.newValues) : h.newValues) : null
                      const dateStr = h.createdAt ? formatDateTimeShort(h.createdAt) : ''

                      return (
                        <>
                          <TableRow
                            key={h.id}
                            className={`${selectedLogIds.has(h.id) ? 'bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800/50'} cursor-pointer`}
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
                                className="h-7 w-7 text-red-400 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30 dark:bg-red-900/20"
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
                              <TableCell colSpan={8} className="bg-gray-50 dark:bg-gray-800/50/80 px-6 py-3">
                                {h.action === 'UPDATED' && h.changedFields && (
                                  <div className="space-y-1.5">
                                    {(typeof h.changedFields === 'string' ? h.changedFields.split(', ') : (h.changedFields || [])).map((field: string, i: number) => (
                                      <div key={i} className="text-xs flex items-start gap-2 bg-white dark:bg-gray-900 rounded px-3 py-2 border">
                                        <span className="font-medium text-gray-600 min-w-[100px]">{field}:</span>
                                        <span className="text-red-500 line-through">{prev?.[field] != null ? String(prev[field]) : '—'}</span>
                                        <span className="text-gray-400 dark:text-gray-500 mx-1">→</span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{next?.[field] != null ? String(next[field]) : '—'}</span>
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
                                    Status changed to <span className="text-red-600 dark:text-red-400 font-medium">DISCONTINUED</span>
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
          <Card className="card-hover transition-all duration-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20 flex items-center justify-center"><Trash2 className="h-4.5 w-4.5 text-red-500" /></div>
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
                    className="pl-9 h-8 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80 focus:bg-white dark:bg-gray-900 dark:focus:bg-gray-900"
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
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800/50 border-b last:border-b-0 cursor-pointer"
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
                    <div className="py-4"><EmptyState icon={Search} title="No products found" description="Try a different search term" /></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Shift Reports Tab ── */}
        <TabsContent value="shifts" className="space-y-4 relative block w-full">
          {/* Shift-specific filters */}
          <div className="flex flex-wrap items-end gap-3 border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Shift Filters
            </div>
            <div className="flex-1 min-w-[130px]">
              <Label className="text-[11px]">From</Label>
              <DateInput value={shiftFilterFrom} onChange={(iso) => setShiftFilterFrom(iso)} className="h-8 text-xs" />
            </div>
            <div className="flex-1 min-w-[130px]">
              <Label className="text-[11px]">To</Label>
              <DateInput value={shiftFilterTo} onChange={(iso) => setShiftFilterTo(iso)} className="h-8 text-xs" />
            </div>
            {isSuperAdmin && shiftReport?.users && (
              <div className="flex-1 min-w-[150px]">
                <Label className="text-[11px]">User</Label>
                <select
                  value={shiftFilterUser}
                  onChange={(e) => setShiftFilterUser(e.target.value)}
                  className="w-full h-8 text-xs border rounded-md px-2 bg-white dark:bg-gray-900"
                >
                  <option value="">All Users</option>
                  {shiftReport.users.map((u: { id: string; name: string }) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={fetchShiftReport} disabled={shiftLoading} className="h-8">
              {shiftLoading ? 'Loading...' : 'Apply'}
            </Button>
          </div>

          {shiftLoading && !shiftReport && (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-muted-foreground animate-pulse">Loading shift report...</div>
            </div>
          )}

          {shiftReport && !shiftLoading && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
                <Card className="border-emerald-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-emerald-700 mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Total Sales</span>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-emerald-800">{formatCurrency(shiftReport.summary.totalSales)}</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-blue-700 mb-1">
                      <ShoppingCart className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Transactions</span>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-blue-800">{shiftReport.summary.totalTransactions}</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-amber-700 mb-1">
                      <Package className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Items Sold</span>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-amber-800">{shiftReport.summary.totalItemsSold}</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-200 dark:border-gray-700">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Products Sold</span>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200">{shiftReport.summary.totalProductsSold}</p>
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
                    <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sales by User</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table className="table-header-standard">
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
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Individual Drug Quantities Sold</CardTitle>
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
                    <EmptyState icon={Package} title="No items sold" description="No sales were recorded in this period" />
                  ) : (
                    <ScrollArea className="max-h-[400px]">
                      <Table className="table-header-standard">
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
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Current Inventory ({shiftReport.inventorySnapshot?.length || 0} items in stock)</CardTitle>
                </CardHeader>
                <CardContent>
                  {(!shiftReport.inventorySnapshot || shiftReport.inventorySnapshot.length === 0) ? (
                    <EmptyState icon={Package} title="No items in stock" description="The inventory is currently empty" />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="table-header-standard">
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
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Shift History */}
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">Shift History</CardTitle>
                </CardHeader>
                <CardContent>
                  {shiftReport.shiftHistory.length === 0 ? (
                    <EmptyState icon={Clock} title="No shift history found" description="No completed shifts in this period" />
                  ) : (
                    <ScrollArea className="max-h-[300px]">
                      <Table className="table-header-standard">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs">Started</TableHead>
                            <TableHead className="text-xs">Ended</TableHead>
                            <TableHead className="text-xs text-center">Status</TableHead>
                            <TableHead className="text-xs text-center">Txns</TableHead>
                            <TableHead className="text-xs text-right">Sales</TableHead>
                            <TableHead className="text-xs text-right">Cash Diff</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shiftReport.shiftHistory.filter((s: any) => s.status === 'ENDED').map((s: any) => (
                            <TableRow
                              key={s.id}
                              className={`cursor-pointer hover:bg-muted/50 ${discrepancy?.currentShift?.id === s.id ? 'bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/20' : ''}`}
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
                              <TableCell className={`text-xs text-right font-mono font-medium ${s.cashDiscrepancy == null ? 'text-muted-foreground' : s.cashDiscrepancy > 0 ? 'text-red-600 dark:text-red-400' : s.cashDiscrepancy < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {s.cashDiscrepancy != null ? `${s.cashDiscrepancy > 0 ? '-' : '+'}${formatCurrency(Math.abs(s.cashDiscrepancy))}` : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Daily Shift Snapshots & Cash Accounting ── */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Daily Shift Snapshots & Cash Accounting
                  {snapshotData?.shifts && (
                    <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                      {snapshotData.shifts.length} shift(s) · {snapshotData.dailySummary?.uniqueUsers || 0} user(s)
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <DateInput
                    value={snapshotDate}
                    onChange={(iso) => setSnapshotDate(iso)}
                    className="h-7 text-[11px] w-[130px]"
                  />
                  <Button
                    size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => fetchSnapshots()}
                    disabled={snapshotLoading}
                  >
                    {snapshotLoading ? 'Loading...' : 'Load'}
                  </Button>
                  {snapshotData?.comparisonMatrix && snapshotData.comparisonMatrix.length > 0 && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleSnapshotExportCSV}>
                      <Download className="h-3 w-3 mr-1" /> CSV
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {snapshotLoading && !snapshotData && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground animate-pulse">Loading shift snapshots...</div>
                </div>
              )}

              {snapshotData && snapshotData.shifts && snapshotData.shifts.length === 0 && (
                <div className="text-center py-8">
                  <Camera className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{snapshotData.message || 'No completed shifts found for this date'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Inventory snapshots are captured automatically when a user ends their shift.</p>
                </div>
              )}

              {snapshotData && snapshotData.shifts && snapshotData.shifts.length > 0 && (
                <>
                  {/* Daily Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20/50 p-2.5 text-center">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Total Day Sales</p>
                      <p className="text-base font-bold text-emerald-800">{formatCurrency(snapshotData.dailySummary.totalSales)}</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/30/50 p-2.5 text-center">
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Total Transactions</p>
                      <p className="text-base font-bold text-blue-800">{snapshotData.dailySummary.totalTransactions}</p>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5 text-center">
                      <p className="text-[10px] text-purple-600 font-medium">Physical Cash (Total)</p>
                      <p className="text-base font-bold text-purple-800">
                        {snapshotData.dailySummary.hasCashData
                          ? formatCurrency(snapshotData.dailySummary.totalCashAtEnd)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/20/50 p-2.5 text-center">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Cash Variance</p>
                      <p className={`text-base font-bold ${snapshotData.dailySummary.totalCashDiscrepancy > 0 ? 'text-red-700' : snapshotData.dailySummary.totalCashDiscrepancy < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                        {snapshotData.dailySummary.hasCashData
                          ? `${snapshotData.dailySummary.totalCashDiscrepancy > 0 ? '-' : '+'}${formatCurrency(Math.abs(snapshotData.dailySummary.totalCashDiscrepancy))}`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Cash Accounting Table */}
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Cash Accounting Per Shift</p>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="table-header-standard">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs">Started</TableHead>
                            <TableHead className="text-xs">Ended</TableHead>
                            <TableHead className="text-xs text-center">Txns</TableHead>
                            <TableHead className="text-xs text-right">Sales</TableHead>
                            <TableHead className="text-xs text-right">Cash Start</TableHead>
                            <TableHead className="text-xs text-right">Cash End</TableHead>
                            <TableHead className="text-xs text-right">Expected</TableHead>
                            <TableHead className="text-xs text-right">Variance</TableHead>
                            <TableHead className="text-xs text-center">Snapshot</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshotData.shifts.map((s: any) => (
                            <TableRow key={s.shiftId}>
                              <TableCell className="text-sm font-medium">{s.userName}</TableCell>
                              <TableCell className="text-[11px]">
                                {s.startedAt ? format(new Date(s.startedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm') : '—'}
                              </TableCell>
                              <TableCell className="text-[11px]">
                                {s.endedAt ? format(new Date(s.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm') : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono">{s.totalTransactions}</TableCell>
                              <TableCell className="text-xs text-right font-mono font-medium text-emerald-700">{formatCurrency(s.totalSales)}</TableCell>
                              <TableCell className="text-xs text-right font-mono">{s.cashAtStart != null ? formatCurrency(s.cashAtStart) : '—'}</TableCell>
                              <TableCell className="text-xs text-right font-mono">{s.cashAtEnd != null ? formatCurrency(s.cashAtEnd) : '—'}</TableCell>
                              <TableCell className="text-xs text-right font-mono">{s.expectedCash != null ? formatCurrency(s.expectedCash) : '—'}</TableCell>
                              <TableCell className={`text-xs text-right font-mono font-medium ${s.cashDiscrepancy == null ? 'text-muted-foreground' : s.cashDiscrepancy > 0 ? 'text-red-600 dark:text-red-400' : s.cashDiscrepancy < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {s.cashDiscrepancy != null ? `${s.cashDiscrepancy > 0 ? '-' : '+'}${formatCurrency(Math.abs(s.cashDiscrepancy))}` : '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  size="sm"
                                  variant={expandedShiftSnap === s.shiftId ? 'default' : 'outline'}
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setExpandedShiftSnap(expandedShiftSnap === s.shiftId ? null : s.shiftId)}
                                >
                                  {expandedShiftSnap === s.shiftId ? 'Hide' : `${s.snapshotItemCount} items`}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Expanded single shift snapshot */}
                  {expandedShiftSnap && snapshotData.snapshotMap?.[expandedShiftSnap] && (
                    <div className="mb-4 border rounded-lg p-3 bg-muted/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Inventory Snapshot — {snapshotData.shifts.find((s: any) => s.shiftId === expandedShiftSnap)?.userName}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {snapshotData.snapshotMap[expandedShiftSnap].length} products
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Value: {formatCurrency(snapshotData.shifts.find((s: any) => s.shiftId === expandedShiftSnap)?.snapshotTotalValue || 0)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Cost: {formatCurrency(snapshotData.shifts.find((s: any) => s.shiftId === expandedShiftSnap)?.snapshotTotalCost || 0)}
                          </Badge>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setExpandedShiftSnap(null)}>
                          Close
                        </Button>
                      </div>
                      <ScrollArea className="max-h-[300px]">
                        <Table className="table-header-standard">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-10">#</TableHead>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-xs">Category</TableHead>
                              <TableHead className="text-xs text-center">Qty</TableHead>
                              <TableHead className="text-xs text-right">Selling Price</TableHead>
                              <TableHead className="text-xs text-right">Cost Price</TableHead>
                              <TableHead className="text-xs text-right">Stock Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshotData.snapshotMap[expandedShiftSnap].map((item: any, i: number) => (
                              <TableRow key={item.productId}>
                                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{item.category || '—'}</TableCell>
                                <TableCell className="text-xs text-center font-mono">
                                  <Badge variant={item.quantity <= 10 ? 'destructive' : item.quantity <= 30 ? 'secondary' : 'default'} className="font-mono text-xs">
                                    {item.quantity}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono">{formatCurrency(item.sellingPrice)}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{formatCurrency(item.costPrice)}</TableCell>
                                <TableCell className="text-xs text-right font-mono font-medium">{formatCurrency((item.quantity || 0) * (item.sellingPrice || 0))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Snapshot Comparison Matrix (with previous day baseline + expiry handling) */}
                  {snapshotData.comparisonMatrix && snapshotData.comparisonMatrix.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Stock Snapshot Comparison Across Shifts
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {snapshotData.comparisonMatrix.length} products
                        </Badge>
                        {(() => {
                          const realVariances = snapshotData.comparisonMatrix.filter((c: any) => c.expiryRelated ? c.adjustedVariance > 0 : c.variance > 0)
                          return realVariances.length > 0 ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {realVariances.length} variance(s)
                            </Badge>
                          ) : null
                        })()}
                        {snapshotData.expiredSummary && snapshotData.expiredSummary.totalProducts > 0 && (
                          <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                            {snapshotData.expiredSummary.totalProducts} expired
                          </Badge>
                        )}
                      </div>
                      {snapshotData.previousDayBaseline && (
                        <div className="text-[11px] text-blue-700 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded px-2.5 py-1.5 mb-2 flex items-center gap-1.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Previous day end stock included — from <strong>{snapshotData.previousDayBaseline.userName}</strong>'s shift ended at {format(new Date(snapshotData.previousDayBaseline.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm')} ({snapshotData.previousDayBaseline.itemCount} items)</span>
                        </div>
                      )}
                      {snapshotData.expiredSummary && snapshotData.expiredSummary.totalProducts > 0 && (
                        <div className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2.5 py-1.5 mb-2 flex items-center gap-1.5">
                          <PackageX className="h-3 w-3 shrink-0" />
                          <span><strong>{snapshotData.expiredSummary.totalProducts}</strong> product(s) ({snapshotData.expiredSummary.totalExpiredQty} units) expired since last shift — cost loss: <strong className="text-red-700">{formatCurrency(snapshotData.expiredSummary.totalCostLoss)}</strong>. Variance adjusted to exclude expiry-explained drops.</span>
                        </div>
                      )}
                      {!snapshotData.previousDayBaseline && snapshotData.shifts.length === 1 && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/20 border border-amber-200 rounded p-2 mb-2">
                          No previous day snapshot found. Comparison requires at least 2 shifts today or a previous day's ended shift with inventory snapshot.
                        </div>
                      )}
                      <ScrollArea className="max-h-[400px]">
                        <Table className="table-header-standard">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-10">#</TableHead>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-xs">Category</TableHead>
                              {snapshotData.previousDayBaseline && (
                                <TableHead className="text-xs text-center min-w-[90px] bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/20/60">
                                  <div className="flex items-center justify-center gap-1">
                                    <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    <span>Prev Day End</span>
                                  </div>
                                  <div className="text-[9px] font-normal text-muted-foreground">
                                    {snapshotData.previousDayBaseline.userName}
                                  </div>
                                </TableHead>
                              )}
                              {snapshotData.shifts.map((s: any) => (
                                <TableHead key={s.shiftId} className="text-xs text-center min-w-[80px]">
                                  <div>{s.userName}</div>
                                  <div className="text-[9px] font-normal text-muted-foreground">
                                    {s.endedAt ? format(new Date(s.endedAt), 'HH:mm') : ''}
                                  </div>
                                </TableHead>
                              ))}
                              {snapshotData.previousDayBaseline && (
                                <TableHead className="text-xs text-center min-w-[70px]">Day Δ</TableHead>
                              )}
                              <TableHead className="text-xs text-center">Variance</TableHead>
                              <TableHead className="text-xs text-right">Cost Impact</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshotData.comparisonMatrix.map((item: any, i: number) => {
                              const displayVariance = item.expiryRelated ? item.adjustedVariance : item.variance
                              const displayDayChange = item.expiryRelated ? item.adjustedDayChange : item.dayChange
                              const isExpiredRow = item.expiryRelated
                              return (
                                <TableRow key={item.productId} className={isExpiredRow ? 'opacity-60 bg-orange-50/30' : ''}>
                                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                  <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                                  <TableCell className="text-[11px] text-muted-foreground">{item.category || '—'}</TableCell>
                                  {snapshotData.previousDayBaseline && (
                                    <TableCell className={`text-xs text-center font-mono ${isExpiredRow ? 'bg-orange-50/50' : 'bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/20/30'}`}>
                                      <span className={item.prevDayQty === 0 ? 'text-muted-foreground/40' : 'font-medium'}>{item.prevDayQty}</span>
                                    </TableCell>
                                  )}
                                  {snapshotData.shifts.map((s: any) => {
                                    const qty = item.quantities[s.shiftId] || 0
                                    return (
                                      <TableCell key={s.shiftId} className="text-xs text-center font-mono">
                                        <span className={qty === 0 ? 'text-muted-foreground/40' : ''}>{qty}</span>
                                      </TableCell>
                                    )
                                  })}
                                  {snapshotData.previousDayBaseline && (
                                    <TableCell className="text-center">
                                      {isExpiredRow && item.dayChange < 0 && item.adjustedDayChange === 0 ? (
                                        <Badge variant="outline" className="text-[10px] font-mono border-orange-300 text-orange-600 bg-orange-50" title={`Raw: ${item.dayChange}, adjusted for ${item.prevDayQty - (snapshotData.shifts.length > 0 ? (item.quantities[snapshotData.shifts[0].shiftId] || 0) : 0)} expired units`}>
                                          Expired
                                        </Badge>
                                      ) : displayDayChange !== 0 ? (
                                        <Badge variant={displayDayChange < 0 ? 'destructive' : 'secondary'} className="text-[10px] font-mono">
                                          {displayDayChange > 0 ? '+' : ''}{displayDayChange}
                                        </Badge>
                                      ) : (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-center">
                                    {isExpiredRow && item.variance > 0 && item.adjustedVariance === 0 ? (
                                      <Badge variant="outline" className="text-[10px] font-mono border-orange-300 text-orange-600 bg-orange-50" title={`Raw variance: ${item.variance}, fully explained by expiry`}>
                                        <PackageX className="h-2.5 w-2.5 mr-0.5 inline" />
                                        Expired
                                      </Badge>
                                    ) : isExpiredRow && item.adjustedVariance > 0 && item.adjustedVariance < item.variance ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <Badge variant="destructive" className="text-[10px] font-mono">{item.adjustedVariance}</Badge>
                                        <span className="text-[8px] text-orange-500">was {item.variance}</span>
                                      </div>
                                    ) : displayVariance > 0 ? (
                                      <Badge variant="destructive" className="text-[10px] font-mono">{displayVariance}</Badge>
                                    ) : displayVariance === 0 ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                    ) : null}
                                  </TableCell>
                                  <TableCell className={`text-xs text-right font-mono font-medium ${displayVariance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {displayVariance > 0 ? formatCurrency(displayVariance * item.costPrice) : ''}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Expired Since Last Shift — detailed breakdown */}
                  {snapshotData.expiredSinceLastShift && snapshotData.expiredSinceLastShift.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <PackageX className="h-3.5 w-3.5 text-orange-500" />
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Expired Since Last Shift
                        </p>
                        <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                          {snapshotData.expiredSummary.totalProducts} products
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20">
                          Loss: {formatCurrency(snapshotData.expiredSummary.totalCostLoss)}
                        </Badge>
                      </div>
                      <div className="border border-orange-200 rounded-lg overflow-hidden">
                        <Table className="table-header-standard">
                          <TableHeader>
                            <TableRow className="bg-orange-50/60">
                              <TableHead className="text-xs w-10">#</TableHead>
                              <TableHead className="text-xs">Product</TableHead>
                              <TableHead className="text-xs">Category</TableHead>
                              <TableHead className="text-xs text-center">Batches Expired</TableHead>
                              <TableHead className="text-xs text-center">Units Expired</TableHead>
                              <TableHead className="text-xs text-right">Cost / Unit</TableHead>
                              <TableHead className="text-xs text-right">Cost Loss</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshotData.expiredSinceLastShift.map((exp: any, i: number) => (
                              <TableRow key={exp.productId} className="bg-orange-50/20">
                                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="text-sm font-medium">{exp.productName}</TableCell>
                                <TableCell className="text-[11px] text-muted-foreground">{exp.category || '—'}</TableCell>
                                <TableCell className="text-xs text-center">
                                  {exp.expiredBatches && exp.expiredBatches.length > 0 ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="font-mono">{exp.expiredBatches.length}</span>
                                      <div className="flex flex-wrap gap-0.5 justify-center">
                                        {exp.expiredBatches.map((b: any, bi: number) => (
                                          <span key={bi} className="text-[8px] font-mono text-orange-600 bg-orange-100 rounded px-1" title={`Exp: ${b.expiryDate}, Qty: ${b.quantity}`}>
                                            {b.batchNumber || 'No BN'}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-center font-mono font-medium text-orange-700">{exp.totalExpiredQty}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{formatCurrency(exp.costPrice)}</TableCell>
                                <TableCell className="text-xs text-right font-mono font-medium text-red-600 dark:text-red-400">{formatCurrency(exp.costLoss)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {snapshotData.comparisonMatrix && snapshotData.comparisonMatrix.length === 0 && snapshotData.shifts.length > 0 && (
                    <div className="text-center py-4">
                      <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No inventory items were in stock when shifts ended.</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Discrepancy Analysis (independent of shift report data) ── */}
          <Card className={discrepancy?.hasData && discrepancy.summary.totalDiscrepancies > 0 ? 'border-amber-300 overflow-hidden' : 'overflow-hidden'}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Shift Discrepancy Analysis
                      {discrepancy?.hasData && discrepancy.totalHandoffs > 1 && (
                        <Badge variant="outline" className="ml-2 text-[10px] font-normal">{discrepancy.totalHandoffs} handoff(s)</Badge>
                      )}
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
                      {/* Aggregate summary cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="rounded-lg border p-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground">Discrepancies</p>
                          <p className="text-base font-bold">{discrepancy.summary.totalDiscrepancies}</p>
                        </div>
                        <div className="rounded-lg border border-red-200 p-2.5 text-center">
                          <p className="text-[10px] text-red-600 dark:text-red-400">Shortages</p>
                          <p className="text-base font-bold text-red-700">{discrepancy.summary.shortageCount}</p>
                          <p className="text-[10px] text-red-500 font-mono">{formatCurrency(discrepancy.summary.totalShortageCost)}</p>
                        </div>
                        <div className="rounded-lg border border-blue-200 p-2.5 text-center">
                          <p className="text-[10px] text-blue-600 dark:text-blue-400">Overs</p>
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

                      {/* Each handoff comparison */}
                      {discrepancy.comparisons.map((comp: any, ci: number) => (
                        <div key={ci} className="mb-4 last:mb-0">
                          {discrepancy.comparisons.length > 1 && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Handoff {ci + 1}</span>
                              <div className="flex-1 border-t" />
                            </div>
                          )}

                          {comp.usingLiveInventory && (
                            <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/20 border border-amber-200 rounded p-2 mb-3">
                              Note: Using live inventory (no snapshot at shift end). Future shifts will have snapshots automatically.
                            </div>
                          )}

                          {comp.reconstructedPrevious && (
                            <div className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded p-2 mb-3">
                              Prev Stock is approximated (no snapshot saved when that shift ended). It is reconstructed from current stock + sales since then. Future shifts will capture exact snapshots.
                            </div>
                          )}

                          {/* Shift comparison header */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div className="rounded-lg border p-3 bg-muted/30">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Handed Over By</p>
                              <p className="text-sm font-semibold">{comp.previousShift.userName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {format(new Date(comp.previousShift.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm')}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{formatCurrency(comp.previousShift.totalSales)} in {comp.previousShift.totalTransactions} txns</p>
                            </div>
                            <div className="rounded-lg border p-3 bg-muted/30">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Received By</p>
                              <p className="text-sm font-semibold">{comp.currentShift.userName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {format(new Date(comp.currentShift.endedAt), dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm')}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{formatCurrency(comp.currentShift.totalSales)} in {comp.currentShift.totalTransactions} txns</p>
                            </div>
                          </div>

                          {/* Per-handoff mini summary */}
                          <div className="flex gap-2 mb-3">
                            <Badge variant={comp.handoffSummary.shortageCount > 0 ? 'destructive' : 'secondary'} className="text-[10px]">
                              {comp.handoffSummary.shortageCount} shortage(s) — {formatCurrency(comp.handoffSummary.shortageCost)}
                            </Badge>
                            <Badge variant={comp.handoffSummary.overCount > 0 ? 'default' : 'secondary'} className="text-[10px]">
                              {comp.handoffSummary.overCount} over(s) — {formatCurrency(comp.handoffSummary.overCost)}
                            </Badge>
                          </div>

                          {/* Cash Reconciliation */}
                          {comp.cashHandoff && (comp.cashHandoff.prevCashDiscrepancy != null || comp.cashHandoff.curCashDiscrepancy != null || comp.cashHandoff.handoffCashGap != null) && (
                            <div className="border rounded-lg p-3 mb-3 bg-muted/20 space-y-2">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cash Reconciliation</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                                {/* Previous user cash */}
                                <div className="space-y-0.5">
                                  <p className="font-medium text-muted-foreground">{comp.previousShift.userName} (ended)</p>
                                  {comp.cashHandoff.prevExpectedCash != null && (
                                    <p>Expected: <span className="font-mono">{formatCurrency(comp.cashHandoff.prevExpectedCash)}</span></p>
                                  )}
                                  {comp.cashHandoff.prevCashAtEnd != null && (
                                    <p>Actual: <span className="font-mono">{formatCurrency(comp.cashHandoff.prevCashAtEnd)}</span></p>
                                  )}
                                  {comp.cashHandoff.prevCashDiscrepancy != null && (
                                    <p className={comp.cashHandoff.prevCashDiscrepancy > 0 ? 'text-red-600 dark:text-red-400 font-medium' : comp.cashHandoff.prevCashDiscrepancy < 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                                      Diff: {comp.cashHandoff.prevCashDiscrepancy > 0 ? '-' : '+'}{formatCurrency(Math.abs(comp.cashHandoff.prevCashDiscrepancy))}
                                    </p>
                                  )}
                                </div>
                                {/* Current user cash */}
                                <div className="space-y-0.5">
                                  <p className="font-medium text-muted-foreground">{comp.currentShift.userName} (ended)</p>
                                  {comp.cashHandoff.curExpectedCash != null && (
                                    <p>Expected: <span className="font-mono">{formatCurrency(comp.cashHandoff.curExpectedCash)}</span></p>
                                  )}
                                  {comp.cashHandoff.curCashAtEnd != null && (
                                    <p>Actual: <span className="font-mono">{formatCurrency(comp.cashHandoff.curCashAtEnd)}</span></p>
                                  )}
                                  {comp.cashHandoff.curCashDiscrepancy != null && (
                                    <p className={comp.cashHandoff.curCashDiscrepancy > 0 ? 'text-red-600 dark:text-red-400 font-medium' : comp.cashHandoff.curCashDiscrepancy < 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                                      Diff: {comp.cashHandoff.curCashDiscrepancy > 0 ? '-' : '+'}{formatCurrency(Math.abs(comp.cashHandoff.curCashDiscrepancy))}
                                    </p>
                                  )}
                                </div>
                                {/* Handoff cash gap */}
                                {comp.cashHandoff.handoffCashGap != null && (
                                  <div className="space-y-0.5">
                                    <p className="font-medium text-muted-foreground">Handoff Gap</p>
                                    <p>Prev ended with: <span className="font-mono">{formatCurrency(comp.cashHandoff.prevCashAtEnd!)}</span></p>
                                    <p>Cur started with: <span className="font-mono">{formatCurrency(comp.cashHandoff.curCashAtStart!)}</span></p>
                                    <p className={comp.cashHandoff.handoffCashGap !== 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                                      Gap: {formatCurrency(Math.abs(comp.cashHandoff.handoffCashGap))}
                                      {comp.cashHandoff.handoffCashGap !== 0 ? (comp.cashHandoff.handoffCashGap > 0 ? ' (excess)' : ' (shortage)') : ' (balanced)'}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Discrepancy table */}
                          {comp.discrepancies.length === 0 ? (
                            <EmptyState icon={CheckCircle2} title="No discrepancies" description="All products match expected quantities" />
                          ) : (
                            <ScrollArea className="max-h-[300px]">
                              <Table className="table-header-standard">
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
                                  {comp.discrepancies.map((d: any, i: number) => (
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
                                      <TableCell className={`text-xs text-right font-mono font-medium ${d.discrepancy > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                        {formatCurrency(d.discrepancyCost)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
        </TabsContent>

        {/* Staff Targets Tab */}
        <TabsContent value="staff-targets" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Staff Performance Targets
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">From:</Label>
                  <DateInput value={targetDateFrom} onChange={(iso) => setTargetDateFrom(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80" />
                  <Label className="text-xs">To:</Label>
                  <DateInput value={targetDateTo} onChange={(iso) => setTargetDateTo(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80" />
                  {isSuperAdmin && (
                    <Button size="sm" onClick={() => setShowTargetDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Set Target
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {targetsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !targetsData?.targets?.length ? (
                <EmptyState icon={Target} title="No Targets Set" description="Set performance targets for staff members" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Staff</TableHead>
                        <TableHead className="text-xs">Target Type</TableHead>
                        <TableHead className="text-xs text-right">Target</TableHead>
                        <TableHead className="text-xs text-right">Actual</TableHead>
                        <TableHead className="text-xs">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {targetsData.targets.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm">
                            <div>
                              <p className="font-medium">{t.userName}</p>
                              <p className="text-[10px] text-muted-foreground">{t.userEmail}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="secondary" className="text-[10px]">
                              {t.targetType === 'SALES_AMOUNT' ? 'Sales Amount' : 'Transactions'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium">
                            {t.targetType === 'SALES_AMOUNT' ? formatCurrency(t.targetValue) : t.targetValue}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium">
                            {t.targetType === 'SALES_AMOUNT' ? formatCurrency(t.actualValue) : t.actualValue}
                          </TableCell>
                          <TableCell className="w-40">
                            <div className="space-y-1">
                              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${t.percentage >= 100 ? 'bg-emerald-500' : t.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${Math.min(100, t.percentage)}%` }}
                                />
                              </div>
                              <p className={`text-[10px] font-medium ${t.percentage >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                {t.percentage}%
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insurance Claims Tab */}
        <TabsContent value="insurance-claims" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Insurance / NHIS Claims
                </CardTitle>
                <Select value={claimsFilter} onValueChange={setClaimsFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="SUBMITTED">Submitted</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="PARTIALLY_APPROVED">Partially Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {claimsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : claims.length === 0 ? (
                <EmptyState icon={Shield} title="No Claims" description="Insurance claims will appear here when customers pay with insurance" />
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Provider</TableHead>
                        <TableHead className="text-xs">Policy #</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                        <TableHead className="text-xs text-right">Co-pay</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {claims.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs whitespace-nowrap">{formatDateTimeShort(c.createdAt)}</TableCell>
                          <TableCell className="text-xs font-medium">{c.customerName}</TableCell>
                          <TableCell className="text-xs">{c.insuranceProvider || '—'}</TableCell>
                          <TableCell className="text-xs font-mono">{c.policyNumber || '—'}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{formatCurrency(c.totalAmount)}</TableCell>
                          <TableCell className="text-xs text-right">{c.coPayAmount > 0 ? formatCurrency(c.coPayAmount) : '—'}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${
                              c.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                              c.status === 'PARTIALLY_APPROVED' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                              c.status === 'REJECTED' ? 'bg-red-100 text-red-700 border-red-200' :
                              c.status === 'PAID' ? 'bg-sky-100 text-sky-700 border-sky-200' :
                              'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                              {c.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isSuperAdmin && c.status !== 'PAID' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={() => {
                                  setSelectedClaim(c)
                                  setClaimAction('')
                                  setClaimApprovedAmount('')
                                  setClaimRejectionReason('')
                                  setClaimNotes('')
                                  setShowClaimDialog(true)
                                }}
                              >
                                Review
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial P&L Tab */}
        <TabsContent value="financial" className="space-y-4">
        {/* Date range filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-xs">From:</Label>
              <DateInput value={finDateFrom} onChange={(iso) => setFinDateFrom(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80" />
              <Label className="text-xs">To:</Label>
              <DateInput value={finDateTo} onChange={(iso) => setFinDateTo(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50/50 border-gray-200 dark:border-gray-700/80" />
              <Button size="sm" variant="outline" onClick={fetchFinancialReport} disabled={finLoading}>
                {finLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
              {finData && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {finData.dateFrom} to {finData.dateTo}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {finLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : finData ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
              <Card className="card-hover transition-all duration-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{formatCurrency(finData.revenue)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Revenue</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-hover transition-all duration-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20 flex items-center justify-center">
                    <ArrowDown className="h-4 w-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{formatCurrency(finData.costOfGoodsSold)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">COGS</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-hover transition-all duration-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 dark:bg-teal-900/20 flex items-center justify-center">
                    {finData.grossProfit >= 0 ? <ArrowUp className="h-4 w-4 text-teal-600" /> : <ArrowDown className="h-4 w-4 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-xl font-bold">{formatCurrency(finData.grossProfit)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Gross Profit</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-hover transition-all duration-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${finData.netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/30 dark:bg-red-900/20'}`}>
                    <DollarSign className={`h-4 w-4 ${finData.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`} />
                  </div>
                  <div>
                    <p className={`text-xl font-bold ${finData.netProfit >= 0 ? '' : 'text-red-500'}`}>{formatCurrency(finData.netProfit)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Net Profit (est.)</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="card-hover"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{finData.transactionCount}</p><p className="text-[10px] text-muted-foreground">Transactions</p></CardContent></Card>
              <Card className="card-hover"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{formatCurrency(finData.averageTransactionValue)}</p><p className="text-[10px] text-muted-foreground">Avg Transaction</p></CardContent></Card>
              <Card className="card-hover"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-red-500">{formatCurrency(finData.refunds)}</p><p className="text-[10px] text-muted-foreground">Refunds</p></CardContent></Card>
              <Card className="card-hover"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{formatCurrency(finData.taxesCollected)}</p><p className="text-[10px] text-muted-foreground">Taxes Collected</p></CardContent></Card>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Payment Method Breakdown */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" /> Payment Methods</CardTitle></CardHeader>
                <CardContent>
                  {finData.paymentMethodBreakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No transactions</p>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={finData.paymentMethodBreakdown} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={2}>
                              {finData.paymentMethodBreakdown.map((_: any, i: number) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(val: number) => formatCurrency(val)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 min-w-[120px]">
                        {finData.paymentMethodBreakdown.map((pm: any, i: number) => (
                          <div key={pm.method} className="flex items-center gap-2 text-xs">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="flex-1 truncate">{pm.method}</span>
                            <span className="font-medium">{pm.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Selling Products */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Top Selling Products</CardTitle></CardHeader>
                <CardContent>
                  {finData.topSellingProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No sales data</p>
                  ) : (
                    <div className="max-h-[250px] overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">Product</TableHead><TableHead className="text-xs text-right">Qty</TableHead><TableHead className="text-xs text-right">Revenue</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {finData.topSellingProducts.slice(0, 10).map((p: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium truncate max-w-[160px]">{p.name}</TableCell>
                              <TableCell className="text-xs text-right">{p.qty}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{formatCurrency(p.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Daily Trend (when range spans multiple days) */}
            {finData.dailyTrend && finData.dailyTrend.length > 1 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Daily Revenue Trend</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={finData.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatCurrency(v)} />
                      <Tooltip formatter={(val: number) => formatCurrency(val)} labelFormatter={(l: string) => `Date: ${l}`} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
                      <Line type="monotone" dataKey="cogs" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="COGS" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <EmptyState icon={FileText} title="No financial data" description="Select a period and click refresh to load" />
        )}
        </TabsContent>

        {/* Controlled Substances Tab */}
        <TabsContent value="controlled-substances" className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-xs">From:</Label>
              <DateInput value={csDateFrom} onChange={(iso) => setCsDateFrom(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/80" />
              <Label className="text-xs">To:</Label>
              <DateInput value={csDateTo} onChange={(iso) => setCsDateTo(iso)} className="h-8 w-36 text-xs bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/80" />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={fetchCsData}>
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current Inventory */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              Current Controlled Substance Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {csLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : csInventory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No controlled substances found in inventory.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs">DEA</TableHead>
                      <TableHead className="text-xs text-right">Stock</TableHead>
                      <TableHead className="text-xs text-right">Total Dispensed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csInventory.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-muted-foreground">{item.strength} · {item.dosageForm}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.deaSchedule ? <Badge variant="outline" className="text-[10px]">{item.deaSchedule}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          <span className={item.stock <= 10 ? 'text-red-600 dark:text-red-400' : ''}>{item.stock}</span>
                        </TableCell>
                        <TableCell className="text-xs text-right">{item.totalDispensed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dispensing Log */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Dispensing Log</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {csLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : csLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No dispensing events recorded.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs">Dispensed By</TableHead>
                      <TableHead className="text-xs">Verified By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTimeShort(log.createdAt)}</TableCell>
                        <TableCell className="text-xs font-medium">{log.productName}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{log.quantity}</TableCell>
                        <TableCell className="text-xs">{log.dispenserName}</TableCell>
                        <TableCell className="text-xs">{log.verifierName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>

      {/* Set Target Dialog */}
      <Dialog open={showTargetDialog} onOpenChange={(open) => { if (!open) { setShowTargetDialog(false); setTargetForm({ userId: '', targetType: 'SALES_AMOUNT', targetValue: '' }) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Staff Target</DialogTitle>
            <DialogDescription>For period: {targetDateFrom} to {targetDateTo}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Target Type</Label>
              <Select value={targetForm.targetType} onValueChange={(v) => setTargetForm(f => ({ ...f, targetType: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES_AMOUNT">Sales Amount</SelectItem>
                  <SelectItem value="TRANSACTIONS_COUNT">Transaction Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Target Value</Label>
              <Input
                type="number"
                min={1}
                value={targetForm.targetValue}
                onChange={(e) => setTargetForm(f => ({ ...f, targetValue: e.target.value }))}
                placeholder={targetForm.targetType === 'SALES_AMOUNT' ? 'e.g. 5000' : 'e.g. 100'}
              />
            </div>
            <div>
              <Label className="text-xs">User ID</Label>
              <Input
                value={targetForm.userId}
                onChange={(e) => setTargetForm(f => ({ ...f, userId: e.target.value }))}
                placeholder="Enter staff user ID"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTargetDialog(false)}>Cancel</Button>
            <Button disabled={targetSaving || !targetForm.userId || !targetForm.targetValue} onClick={handleSaveTarget} className="bg-emerald-600 hover:bg-emerald-700">
              {targetSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Review Dialog */}
      <Dialog open={showClaimDialog} onOpenChange={(open) => { if (!open) { setShowClaimDialog(false); setSelectedClaim(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Review Insurance Claim
            </DialogTitle>
            <DialogDescription>
              {selectedClaim?.customerName} — {selectedClaim?.insuranceProvider || 'No provider'}
              {selectedClaim?.policyNumber && ` • Policy: ${selectedClaim.policyNumber}`}
            </DialogDescription>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-muted-foreground text-xs">Total Amount</p><p className="font-semibold">{formatCurrency(selectedClaim.totalAmount)}</p></div>
                <div><p className="text-muted-foreground text-xs">Co-pay</p><p className="font-semibold">{formatCurrency(selectedClaim.coPayAmount)}</p></div>
              </div>
              {selectedClaim.approvedAmount !== null && (
                <div className="text-sm"><p className="text-muted-foreground text-xs">Previously Approved</p><p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedClaim.approvedAmount)}</p></div>
              )}
              <div>
                <Label className="text-xs">Action *</Label>
                <Select value={claimAction} onValueChange={setClaimAction}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">Approve (Full)</SelectItem>
                    <SelectItem value="PARTIALLY_APPROVED">Partially Approve</SelectItem>
                    <SelectItem value="REJECTED">Reject</SelectItem>
                    <SelectItem value="PAID">Mark as Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(claimAction === 'APPROVED' || claimAction === 'PARTIALLY_APPROVED') && (
                <div>
                  <Label className="text-xs">Approved Amount</Label>
                  <Input type="number" value={claimApprovedAmount} onChange={e => setClaimApprovedAmount(e.target.value)} placeholder={String(selectedClaim.totalAmount)} />
                </div>
              )}
              {claimAction === 'REJECTED' && (
                <div>
                  <Label className="text-xs">Rejection Reason *</Label>
                  <Textarea value={claimRejectionReason} onChange={e => setClaimRejectionReason(e.target.value)} placeholder="Reason for rejection..." rows={2} />
                </div>
              )}
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={claimNotes} onChange={e => setClaimNotes(e.target.value)} placeholder="Internal notes..." />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowClaimDialog(false)}>Cancel</Button>
            <Button disabled={claimUpdating || !claimAction} onClick={handleUpdateClaim} className="bg-emerald-600 hover:bg-emerald-700">
              {claimUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Update Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => { if (!open) setDeleteProduct(null) }}>
        <AlertDialogContent className="rounded-xl">
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
