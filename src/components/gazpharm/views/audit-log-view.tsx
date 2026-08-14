'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { authHeaders } from '@/lib/auth-headers'
import { formatDateTime } from '@/lib/date-utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string
  userId: string
  userName: string
  userEmail: string
  action: string
  category: string
  entity: string | null
  entityId: string | null
  details: string | null
  ipAddress: string | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ── Category badge colours ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  auth: 'bg-red-100 text-red-700 hover:bg-red-100/80',
  transaction: 'bg-blue-100 text-blue-700 hover:bg-blue-100/80',
  inventory: 'bg-amber-100 text-amber-700 hover:bg-amber-100/80',
  product: 'bg-green-100 text-green-700 hover:bg-green-100/80',
  customer: 'bg-purple-100 text-purple-700 hover:bg-purple-100/80',
  prescription: 'bg-pink-100 text-pink-700 hover:bg-pink-100/80',
  user: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100/80',
  system: 'bg-gray-100 text-gray-700 dark:text-gray-300 hover:bg-gray-100/80',
  purchase: 'bg-teal-100 text-teal-700 hover:bg-teal-100/80',
  general: 'bg-slate-100 text-slate-700 hover:bg-slate-100/80',
}

const CATEGORIES = [
  'all', 'auth', 'transaction', 'inventory', 'product', 'customer',
  'prescription', 'user', 'system', 'purchase', 'general',
] as const

// ── Helpers ────────────────────────────────────────────────────────────────

function isJsonString(str: string | null | undefined): boolean {
  if (!str) return false
  const trimmed = str.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function truncate(str: string | null | undefined, maxLen = 60): string {
  if (!str) return '—'
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

function formatDetails(details: string | null): string {
  if (!details) return '—'
  if (isJsonString(details)) {
    try {
      return JSON.stringify(JSON.parse(details), null, 2)
    } catch {
      return details
    }
  }
  return details
}

// ── Component ──────────────────────────────────────────────────────────────

export function AuditLogView() {
  // Filters
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Data
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Detail dialog
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  // ── Fetch logs ────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (category && category !== 'all') params.set('category', category)
      if (search.trim()) params.set('search', search.trim())
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to fetch audit logs')
      const data = await res.json()
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 })
    } catch (err) {
      console.error('Audit log fetch error:', err)
      setLogs([])
      setPagination({ page: 1, limit: 50, total: 0, totalPages: 0 })
    } finally {
      setLoading(false)
    }
  }, [category, search, fromDate, toDate])

  useEffect(() => {
    fetchLogs(1)
  }, [fetchLogs])

  // Reset to page 1 when filters change
  const handleFilterChange = (updater: () => void) => {
    updater()
    // fetchLogs will be called by the useEffect since deps change
  }

  // ── CSV Export ────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '1000' })
      if (category && category !== 'all') params.set('category', category)
      if (search.trim()) params.set('search', search.trim())
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const exportLogs: AuditLog[] = data.logs ?? []

      const headers = ['Timestamp', 'User', 'Email', 'Action', 'Category', 'Entity', 'Entity ID', 'Details', 'IP Address']
      const rows = exportLogs.map((log) => [
        log.createdAt,
        log.userName,
        log.userEmail,
        log.action,
        log.category,
        log.entity ?? '',
        log.entityId ?? '',
        (log.details ?? '').replace(/"/g, '“"'),
        log.ipAddress ?? '',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export error:', err)
    } finally {
      setExporting(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────

  const hasActiveFilters = category !== 'all' || search.trim() !== '' || fromDate || toDate

  const clearFilters = () => {
    setCategory('all')
    setSearch('')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <PageHeader
        icon={Shield}
        title="Audit Logs"
        description="Track all system activity and changes"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        }
      />

      {/* Filters Card */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filters
            </CardTitle>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                <X className="h-3 w-3 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search action, details, user…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            {/* Category */}
            <div className="w-[160px]">
              <Select value={category} onValueChange={(v) => handleFilterChange(() => setCategory(v))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-sm capitalize">
                      {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* From date */}
            <div className="w-[150px]">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 text-sm"
                max={toDate || undefined}
              />
            </div>

            {/* To date */}
            <div className="w-[150px]">
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 text-sm"
                min={fromDate || undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table Card */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            /* Loading skeleton */
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-[140px]" />
                  <Skeleton className="h-5 w-[120px]" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-[70px]" />
                  <Skeleton className="h-5 w-[80px]" />
                  <Skeleton className="h-5 w-[160px]" />
                  <Skeleton className="h-5 w-[100px]" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            /* Empty state */
            <EmptyState
              icon={FileText}
              title="No audit logs found"
              description={
                hasActiveFilters
                  ? 'Try adjusting your filters to see more results'
                  : 'Audit logs will appear here once actions are performed'
              }
              action={
                hasActiveFilters
                  ? { label: 'Clear Filters', onClick: clearFilters }
                  : undefined
              }
            />
          ) : (
            /* Table */
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-800/50/80">
                      <TableHead className="text-xs font-semibold whitespace-nowrap">Timestamp</TableHead>
                      <TableHead className="text-xs font-semibold whitespace-nowrap">User</TableHead>
                      <TableHead className="text-xs font-semibold whitespace-nowrap">Action</TableHead>
                      <TableHead className="text-xs font-semibold whitespace-nowrap">Category</TableHead>
                      <TableHead className="text-xs font-semibold whitespace-nowrap">Entity</TableHead>
                      <TableHead className="text-xs font-semibold whitespace-nowrap">Details</TableHead>
                      <TableHead className="text-xs font-semibold whitespace-nowrap">IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="hover:bg-gray-50 dark:bg-gray-800/50/50 cursor-default"
                      >
                        {/* Timestamp */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt) ?? log.createdAt}
                        </TableCell>

                        {/* User */}
                        <TableCell className="whitespace-nowrap">
                          <div className="text-xs">
                            <p className="font-medium">{log.userName}</p>
                            {log.userEmail && (
                              <p className="text-muted-foreground">{log.userEmail}</p>
                            )}
                          </div>
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {log.action}
                        </TableCell>

                        {/* Category */}
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] font-medium capitalize ${
                              CATEGORY_COLORS[log.category] ?? CATEGORY_COLORS.general
                            }`}
                          >
                            {log.category}
                          </Badge>
                        </TableCell>

                        {/* Entity */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {log.entity || '—'}
                        </TableCell>

                        {/* Details */}
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[200px]"
                        >
                          {isJsonString(log.details) ? (
                            <button
                              type="button"
                              className="text-blue-600 hover:text-blue-800 hover:underline text-left truncate block w-full"
                              onClick={() => setDetailLog(log)}
                              title="Click to view full details"
                            >
                              {truncate(log.details, 60)}
                            </button>
                          ) : (
                            <span className="truncate block">{truncate(log.details, 60)}</span>
                          )}
                        </TableCell>

                        {/* IP Address */}
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {log.ipAddress || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {((pagination.page - 1) * pagination.limit) + 1}
                    –{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                    {' '}· Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fetchLogs(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                      const pageNum =
                        Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4)) + i
                      if (pageNum > pagination.totalPages) return null
                      return (
                        <Button
                          key={pageNum}
                          variant={pagination.page === pageNum ? 'default' : 'outline'}
                          size="icon"
                          className={`h-7 w-7 text-xs ${
                            pagination.page === pageNum
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : ''
                          }`}
                          onClick={() => fetchLogs(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fetchLogs(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Single page info */}
              {pagination.totalPages <= 1 && pagination.total > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={(open) => !open && setDetailLog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Log Details
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Full details for audit log entry
            </DialogDescription>
          </DialogHeader>

          {detailLog && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">Timestamp</p>
                  <p className="font-medium">{formatDateTime(detailLog.createdAt) ?? detailLog.createdAt}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">User</p>
                  <p className="font-medium">{detailLog.userName}</p>
                  {detailLog.userEmail && (
                    <p className="text-muted-foreground">{detailLog.userEmail}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Action</p>
                  <p className="font-medium">{detailLog.action}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Category</p>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] font-medium capitalize ${
                      CATEGORY_COLORS[detailLog.category] ?? CATEGORY_COLORS.general
                    }`}
                  >
                    {detailLog.category}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Entity</p>
                  <p className="font-medium">{detailLog.entity || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">IP Address</p>
                  <p className="font-mono font-medium">{detailLog.ipAddress || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Details</p>
                <pre className="bg-gray-50 dark:bg-gray-800/50 border rounded-md p-3 text-xs overflow-auto max-h-[300px] whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {formatDetails(detailLog.details)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
