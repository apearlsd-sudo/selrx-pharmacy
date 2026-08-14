'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LogIn,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Monitor,
  Globe,
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
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { authHeaders } from '@/lib/auth-headers'
import { formatDateTime } from '@/lib/date-utils'
import { useAppStore } from '@/store/app-store'

// ── Types ──────────────────────────────────────────────────────────────────

interface LoginEntry {
  id: string
  userId: string
  userName: string
  userEmail: string
  action: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  details: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseUserAgent(ua: string | null | undefined): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' }
  let browser = 'Unknown'
  if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/')) browser = 'Safari'
  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  return { browser, os }
}

// ── Component ──────────────────────────────────────────────────────────────

export function LoginHistoryView() {
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('')
  const [userFilter, setUserFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Data
  const [entries, setEntries] = useState<LoginEntry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      })
      if (actionFilter) params.set('action', actionFilter)
      if (isSuperAdmin && userFilter.trim()) params.set('userId', userFilter.trim())
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/login-history?${params.toString()}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to fetch login history')
      const data = await res.json()

      // Normalize Turso vs Prisma response shapes
      const raw = data.entries ?? []
      const normalized: LoginEntry[] = raw.map((e: Record<string, unknown>) => {
        // Turso returns flat fields; Prisma nests user under "user"
        const userObj = e.user as { name: string; email: string } | null
        return {
          id: e.id as string,
          userId: e.userId as string,
          userName: (e.userName as string) ?? userObj?.name ?? '—',
          userEmail: (e.userEmail as string) ?? userObj?.email ?? '',
          action: e.action as string,
          ipAddress: (e.ipAddress as string) ?? null,
          userAgent: (e.userAgent as string) ?? null,
          createdAt: e.createdAt as string,
          details: (e.details as string) ?? null,
        }
      })

      setEntries(normalized)
      setPagination(data.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 })
    } catch (err) {
      console.error('Login history fetch error:', err)
      setEntries([])
      setPagination({ page: 1, limit: 25, total: 0, pages: 0 })
    } finally {
      setLoading(false)
    }
  }, [actionFilter, userFilter, startDate, endDate, isSuperAdmin])

  useEffect(() => {
    fetchHistory(1)
  }, [fetchHistory])

  // ── Filter helpers ──────────────────────────────────────────────────────

  const hasActiveFilters = !!actionFilter || (isSuperAdmin && userFilter.trim() !== '') || !!startDate || !!endDate

  const clearFilters = () => {
    setActionFilter('')
    setUserFilter('')
    setStartDate('')
    setEndDate('')
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <PageHeader
        icon={LogIn}
        title="Login History"
        description="Track all login attempts across the system"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHistory(pagination.page)}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
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
            {/* Action filter */}
            <div className="w-[160px]">
              <Select value={actionFilter || '_all'} onValueChange={(v) => setActionFilter(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Actions</SelectItem>
                  <SelectItem value="LOGIN_SUCCESS">Successful</SelectItem>
                  <SelectItem value="LOGIN_FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User filter (SUPER_ADMIN only) */}
            {isSuperAdmin && (
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by user ID…"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Start date */}
            <div className="w-[150px]">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-sm"
                max={endDate || undefined}
              />
            </div>

            {/* End date */}
            <div className="w-[150px]">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-sm"
                min={startDate || undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Card */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-[140px]" />
                  <Skeleton className="h-5 w-[140px]" />
                  <Skeleton className="h-5 w-[100px]" />
                  <Skeleton className="h-5 w-[100px]" />
                  <Skeleton className="h-5 w-[120px]" />
                  <Skeleton className="h-5 flex-1" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={LogIn}
              title="No login history found"
              description={
                hasActiveFilters
                  ? 'Try adjusting your filters to see more results'
                  : 'Login events will appear here once users attempt to sign in'
              }
              action={
                hasActiveFilters
                  ? { label: 'Clear Filters', onClick: clearFilters }
                  : undefined
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead className="text-xs font-semibold">Time</TableHead>
                      <TableHead className="text-xs font-semibold">User</TableHead>
                      <TableHead className="text-xs font-semibold">Action</TableHead>
                      <TableHead className="text-xs font-semibold hidden lg:table-cell">IP Address</TableHead>
                      <TableHead className="text-xs font-semibold hidden xl:table-cell">Browser</TableHead>
                      <TableHead className="text-xs font-semibold hidden xl:table-cell">OS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const { browser, os } = parseUserAgent(entry.userAgent)
                      const isSuccess = entry.action === 'LOGIN_SUCCESS'

                      return (
                        <TableRow
                          key={entry.id}
                          className="hover:bg-gray-50/50 cursor-default"
                        >
                          {/* Time */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(entry.createdAt) ?? entry.createdAt}
                          </TableCell>

                          {/* User */}
                          <TableCell className="whitespace-nowrap">
                            <div className="text-xs">
                              <p className="font-medium">{entry.userName}</p>
                              {entry.userEmail && (
                                <p className="text-muted-foreground">{entry.userEmail}</p>
                              )}
                            </div>
                          </TableCell>

                          {/* Action badge */}
                          <TableCell className="whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-medium ${
                                isSuccess
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80'
                                  : 'bg-red-100 text-red-700 hover:bg-red-100/80'
                              }`}
                            >
                              {isSuccess ? 'Successful' : 'Failed'}
                            </Badge>
                          </TableCell>

                          {/* IP Address */}
                          <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap hidden lg:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3" />
                              {entry.ipAddress || '—'}
                            </div>
                          </TableCell>

                          {/* Browser */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden xl:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Monitor className="h-3 w-3" />
                              {browser}
                            </div>
                          </TableCell>

                          {/* OS */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden xl:table-cell">
                            {os}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {((pagination.page - 1) * pagination.limit) + 1}
                    –{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                    {' '}· Page {pagination.page} of {pagination.pages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fetchHistory(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                      const pageNum =
                        Math.max(1, Math.min(pagination.page - 2, pagination.pages - 4)) + i
                      if (pageNum > pagination.pages) return null
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
                          onClick={() => fetchHistory(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fetchHistory(pagination.page + 1)}
                      disabled={pagination.page >= pagination.pages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Single page info */}
              {pagination.pages <= 1 && pagination.total > 0 && (
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
    </div>
  )
}
