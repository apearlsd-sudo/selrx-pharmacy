'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpDown,
  Eye,
  MoreHorizontal,
  TrendingDown,
  Ban,
  Check,
  ShoppingBag,
  Tag,
  User,
  FileText,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { NewReturnDialog } from './new-return-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAppStore } from '@/store/app-store'
import { formatCurrency } from '@/lib/currency'
import { formatDateTimeShort, formatDateShort } from '@/lib/date-utils'
import { authHeaders } from '@/lib/auth-headers'

const CHART_COLORS = ['#059669', '#14b8a6', '#10b981', '#34d399', '#6ee7b7', '#0d9488']

function formatDate(dateStr: string): string {
  return formatDateTimeShort(dateStr)
}

function formatShortDate(dateStr: string): string {
  return formatDateShort(dateStr)
}

// Reason badge colors
function reasonBadgeColor(reason: string): string {
  switch (reason) {
    case 'DEFECTIVE': return 'bg-red-100 text-red-700 border-red-200'
    case 'EXPIRED': return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'WRONG_ITEM': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'WRONG_QUANTITY': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'DAMAGED': return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'CUSTOMER_CHANGE_OF_MIND': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'RECALLED': return 'bg-sky-100 text-sky-700 border-sky-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function reasonLabel(reason: string): string {
  return (reason || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Status badge
function statusBadge(status: string) {
  switch (status) {
    case 'PENDING_APPROVAL':
      return <Badge className="bg-amber-100 text-amber-700 text-xs border-amber-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
    case 'APPROVED':
      return <Badge className="bg-blue-100 text-blue-700 text-xs border-blue-200"><Check className="h-3 w-3 mr-1" />Approved & Restocked</Badge>
    case 'REJECTED':
      return <Badge className="bg-red-100 text-red-700 text-xs border-red-200"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
    case 'COMPLETED':
      return <Badge className="bg-emerald-100 text-emerald-700 text-xs border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>
    case 'CANCELLED':
      return <Badge className="bg-gray-100 text-gray-600 text-xs border-gray-200"><Ban className="h-3 w-3 mr-1" />Cancelled</Badge>
    default:
      return <Badge className="bg-gray-100 text-gray-700 text-xs border-gray-200">{status}</Badge>
  }
}

interface ReturnRecord {
  id: string
  returnNo: string
  transactionId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  refundAmount: number
  reason: string
  reasonNote: string | null
  customerId: string | null
  customerName: string | null
  userId: string
  status: string
  approvedById: string | null
  approvedAt: string | null
  refundMethod: string
  refundProcessed: boolean
  restocked: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; name: string; role: string }
  approvedBy: { id: string; name: string } | null
  transaction: { transactionNo: string }
  product: { id: string; name: string; ndc: string | null }
}

interface TransactionItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  transactionId: string
}

interface TransactionData {
  id: string
  transactionNo: string
  status: string
  items: TransactionItem[]
  customer?: { firstName: string; lastName: string }
  createdAt: string
}

export function GoodsReturnView() {
  const user = useAppStore((s) => s.user)
  const addToast = useAppStore((s) => s.addToast)

  // State for returns list
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [summary, setSummary] = useState({
    totalReturns: 0,
    pendingCount: 0,
    completedCount: 0,
    totalRefundAmount: 0,
    topReasons: [] as { reason: string; _count: { reason: number } }[],
  })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterReason, setFilterReason] = useState('ALL')

  // State for new return dialog
  const [newReturnOpen, setNewReturnOpen] = useState(false)

  // State for detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailReturn, setDetailReturn] = useState<ReturnRecord | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // State for active tab
  const [activeTab, setActiveTab] = useState('all')

  // Fetch returns list
  const fetchReturns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      })
      if (filterStatus !== 'ALL') params.set('status', filterStatus)
      if (filterReason !== 'ALL') params.set('reason', filterReason)
      if (searchQuery) params.set('search', searchQuery)

      const res = await fetch(`/api/returns?${params}`, { headers: authHeaders() })
      const data = await res.json()
      if (data.returns && Array.isArray(data.returns)) {
        setReturns(data.returns)
        setTotalPages(data.pagination ? data.pagination.pages : 1)
      }
      if (data.summary) {
        setSummary(data.summary)
      }
    } catch (err) {
      console.error('Failed to fetch returns:', err)
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, filterReason, searchQuery])

  useEffect(() => {
    fetchReturns()
  }, [fetchReturns])



  // Action on return (approve, reject, complete, cancel)
  const performAction = async (returnId: string, action: string) => {
    if (!user) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/returns/${returnId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          action,
          approvedById: user.id,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        const actionLabels: Record<string, string> = {
          approve: 'approved & restocked',
          reject: 'rejected',
          complete: 'completed',
          cancel: 'cancelled',
        }
        addToast({
          title: `Return ${actionLabels[action]}`,
          description: `Return has been ${actionLabels[action]}`,
          variant: action === 'reject' ? 'destructive' : 'success',
        })
        fetchReturns()
        // Refresh detail if open
        if (detailReturn && detailReturn.id === returnId) {
          setDetailReturn(data.return)
        }
      } else {
        addToast({ title: 'Action failed', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch (err) {
      console.error('Failed to perform action:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // Pie chart data for reasons
  const reasonChartData = summary.topReasons.map((r) => ({
    name: reasonLabel(r.reason),
    value: r._count.reason,
  }))

  // Filter returns for tabs
  const pendingReturns = returns.filter((r) => r.status === 'PENDING_APPROVAL')

  const displayReturns = activeTab === 'pending' ? pendingReturns : returns

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goods Return</h1>
          <p className="text-sm text-muted-foreground mt-1">Process product returns, restock inventory, and manage return tickets</p>
        </div>
        <Button
          onClick={() => setNewReturnOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Return
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Returns</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalReturns}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Approval</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{summary.pendingCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{summary.completedCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Refunded</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(summary.totalRefundAmount)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: All Returns | Pending */}
      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val) }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="all">All Returns</TabsTrigger>
            <TabsTrigger value="pending" className="relative">
              Pending
              {summary.pendingCount > 0 && (
                <span className="ml-1.5 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center inline-flex">
                  {summary.pendingCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search returns..."
                className="h-9 w-48 pl-8 text-xs"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              />
            </div>
            <Select value={filterStatus} onValueChange={(val) => { setFilterStatus(val); setPage(1) }}>
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterReason} onValueChange={(val) => { setFilterReason(val); setPage(1) }}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Reasons</SelectItem>
                <SelectItem value="DEFECTIVE">Defective</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="WRONG_ITEM">Wrong Item</SelectItem>
                <SelectItem value="WRONG_QUANTITY">Wrong Qty</SelectItem>
                <SelectItem value="DAMAGED">Damaged</SelectItem>
                <SelectItem value="CUSTOMER_CHANGE_OF_MIND">Change of Mind</SelectItem>
                <SelectItem value="RECALLED">Recalled</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="all" className="mt-4">
          <ReturnTable
            returns={displayReturns}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onViewDetail={(r) => { setDetailReturn(r); setDetailOpen(true) }}
            onAction={performAction}
            actionLoading={actionLoading}
            userRole={user?.role || ''}
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <ReturnTable
            returns={displayReturns}
            loading={loading}
            page={1}
            totalPages={1}
            onPageChange={() => {}}
            onViewDetail={(r) => { setDetailReturn(r); setDetailOpen(true) }}
            onAction={performAction}
            actionLoading={actionLoading}
            userRole={user?.role || ''}
          />
        </TabsContent>
      </Tabs>

      {/* Reason Breakdown (when there's data) */}
      {summary.topReasons.length > 0 && activeTab === 'all' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900">Return Reasons</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reasonChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {reasonChartData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {reasonChartData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                    <span className="text-muted-foreground">{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900">Reason Distribution</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reasonChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {reasonChartData.map((_entry, index) => (
                        <Cell key={`bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==================== NEW RETURN DIALOG ==================== */}
      <NewReturnDialog
        open={newReturnOpen}
        onOpenChange={setNewReturnOpen}
        onReturnCreated={fetchReturns}
      />

      {/* ==================== DETAIL DIALOG ==================== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              Return Ticket Detail
            </DialogTitle>
          </DialogHeader>

          {detailReturn && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-gray-900">{detailReturn.returnNo}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(detailReturn.createdAt)}</p>
                </div>
                {statusBadge(detailReturn.status)}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Product</p>
                  <p className="font-semibold text-gray-900">{detailReturn.productName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Quantity</p>
                  <p className="font-semibold text-gray-900">{detailReturn.quantity}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Refund Amount</p>
                  <p className="font-semibold text-emerald-600">{formatCurrency(detailReturn.refundAmount)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Reason</p>
                  <p>
                    <Badge className={`text-xs ${reasonBadgeColor(detailReturn.reason)}`}>
                      {reasonLabel(detailReturn.reason)}
                    </Badge>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Original TXN</p>
                  <p className="font-semibold text-gray-900">{detailReturn.transaction?.transactionNo}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Refund Method</p>
                  <p className="font-semibold text-gray-900">{(detailReturn.refundMethod || '').replace(/_/g, ' ')}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Processed By</p>
                  <p className="font-semibold text-gray-900">{detailReturn.user?.name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Restocked</p>
                  <p className="font-semibold text-gray-900">
                    {detailReturn.restocked ? (
                      <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Yes</span>
                    ) : (
                      <span className="text-amber-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> No</span>
                    )}
                  </p>
                </div>
              </div>

              {detailReturn.customerName && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Customer</p>
                  <p className="font-semibold text-gray-900">{detailReturn.customerName}</p>
                </div>
              )}

              {detailReturn.approvedBy && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs">
                  <p className="text-blue-600 font-medium uppercase tracking-wide">Approved By</p>
                  <p className="font-semibold text-gray-900">
                    {detailReturn.approvedBy.name}
                    {detailReturn.approvedAt && <span className="ml-2 text-muted-foreground">{formatDate(detailReturn.approvedAt)}</span>}
                  </p>
                </div>
              )}

              {detailReturn.reasonNote && (
                <div className="bg-amber-50 rounded-lg p-3 text-xs">
                  <p className="text-amber-700 font-medium uppercase tracking-wide">Reason Notes</p>
                  <p className="text-gray-700 mt-0.5">{detailReturn.reasonNote}</p>
                </div>
              )}

              {detailReturn.notes && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  <p className="text-muted-foreground font-medium uppercase tracking-wide">Notes</p>
                  <p className="text-gray-700 mt-0.5">{detailReturn.notes}</p>
                </div>
              )}

              {/* Actions — admin: approve/reject/complete; user: cancel own pending only */}
              {(detailReturn.status === 'PENDING_APPROVAL' || detailReturn.status === 'APPROVED') && (
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Actions</p>
                  <div className="flex gap-2 flex-wrap">
                    {detailReturn.status === 'PENDING_APPROVAL' && (
                      <>
                        {user?.role === 'SUPER_ADMIN' && (
                          <>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => performAction(detailReturn.id, 'approve')}
                              disabled={actionLoading}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Approve & Restock
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => performAction(detailReturn.id, 'reject')}
                              disabled={actionLoading}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => performAction(detailReturn.id, 'cancel')}
                          disabled={actionLoading}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                      </>
                    )}
                    {detailReturn.status === 'APPROVED' && user?.role === 'SUPER_ADMIN' && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => performAction(detailReturn.id, 'complete')}
                          disabled={actionLoading}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete & Restock
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => performAction(detailReturn.id, 'cancel')}
                          disabled={actionLoading}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ==================== RETURN TABLE COMPONENT ====================

function ReturnTable({
  returns,
  loading,
  page,
  totalPages,
  onPageChange,
  onViewDetail,
  onAction,
  actionLoading,
  userRole,
}: {
  returns: ReturnRecord[]
  loading: boolean
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  onViewDetail: (r: ReturnRecord) => void
  onAction: (id: string, action: string) => void
  actionLoading: boolean
  userRole: string
}) {
  if (loading) {
    return (
      <Card className="border-none shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (returns.length === 0) {
    return (
      <Card className="border-none shadow-sm">
        <CardContent className="p-12 text-center">
          <RotateCcw className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No returns found</p>
          <p className="text-xs text-muted-foreground mt-1">Returns will appear here once they are processed</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80">
              <TableHead className="text-xs font-semibold">Return #</TableHead>
              <TableHead className="text-xs font-semibold">Product</TableHead>
              <TableHead className="text-xs font-semibold">Customer</TableHead>
              <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
              <TableHead className="text-xs font-semibold text-right">Refund</TableHead>
              <TableHead className="text-xs font-semibold">Reason</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Processed By</TableHead>
              <TableHead className="text-xs font-semibold">Date</TableHead>
              <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.map((ret) => (
              <TableRow key={ret.id} className="hover:bg-gray-50/50">
                <TableCell className="text-xs font-mono font-medium text-emerald-700">{ret.returnNo}</TableCell>
                <TableCell>
                  <div className="text-xs">
                    <p className="font-medium truncate max-w-[150px]">{ret.productName}</p>
                    <p className="text-gray-600">{formatCurrency(ret.unitPrice)}/ea</p>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-gray-600">
                  {ret.customerName ? ret.customerName : <span className="italic">Walk-in</span>}
                </TableCell>
                <TableCell className="text-xs font-medium text-right">{ret.quantity}</TableCell>
                <TableCell className="text-xs font-semibold text-right text-emerald-600">{formatCurrency(ret.refundAmount)}</TableCell>
                <TableCell>
                  <Badge className={`text-[10px] ${reasonBadgeColor(ret.reason)}`}>
                    {reasonLabel(ret.reason)}
                  </Badge>
                </TableCell>
                <TableCell>{statusBadge(ret.status)}</TableCell>
                <TableCell className="text-xs text-gray-600">{ret.user?.name}</TableCell>
                <TableCell className="text-xs text-gray-600">{formatShortDate(ret.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetail(ret)}>
                        <Eye className="h-3.5 w-3.5 mr-2" /> View Details
                      </DropdownMenuItem>
                      {ret.status === 'PENDING_APPROVAL' && (
                        <>
                          <DropdownMenuSeparator />
                          {userRole === 'SUPER_ADMIN' && (
                            <>
                              <DropdownMenuItem onClick={() => onAction(ret.id, 'approve')} disabled={actionLoading}>
                                <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Approve & Restock
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onAction(ret.id, 'reject')} disabled={actionLoading}>
                                <XCircle className="h-3.5 w-3.5 mr-2 text-red-600" /> Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => onAction(ret.id, 'cancel')} disabled={actionLoading}>
                            <Ban className="h-3.5 w-3.5 mr-2 text-gray-500" /> Cancel
                          </DropdownMenuItem>
                        </>
                      )}
                      {ret.status === 'APPROVED' && userRole === 'SUPER_ADMIN' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onAction(ret.id, 'complete')} disabled={actionLoading}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Complete & Restock
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onAction(ret.id, 'cancel')} disabled={actionLoading}>
                            <Ban className="h-3.5 w-3.5 mr-2 text-gray-500" /> Cancel
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                if (pageNum > totalPages) return null
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className={`h-7 w-7 text-xs ${page === pageNum ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                    onClick={() => onPageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
