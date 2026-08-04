'use client'

import { useState, useEffect, useCallback, useMemo, useTransition } from 'react'
import {
  Search, Package, RefreshCw, X, ArrowUpDown, UserCircle, CalendarDays, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'
import { getTodayWAT } from '@/lib/date-utils'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'

interface AnalyticsRow {
  productId: string
  productName: string
  productNdc: string | null
  productCategory: string
  productStrength: string | null
  productDosageForm: string | null
  productUnit: string
  totalQuantity: number
  totalRevenue: number
  transactions: number
  lastSold: string | null
}

interface UserOption {
  id: string
  name: string
  role: string
}

type SortField = 'totalQuantity' | 'totalRevenue' | 'transactions' | 'productName' | 'productCategory'

export function ProductSalesAnalytics() {
  const [data, setData] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [categories, setCategories] = useState<string[]>([])
  const [userFilter, setUserFilter] = useState('all')
  const [users, setUsers] = useState<UserOption[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortField, setSortField] = useState<SortField>('totalQuantity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isPending, startTransition] = useTransition()

  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // Fetch users list (SUPER_ADMIN only)
  const fetchUsers = useCallback(async () => {
    if (!isSuperAdmin) return
    try {
      const res = await fetch('/api/users', { headers: authHeaders() })
      if (res.ok) {
        const json = await res.json()
        startTransition(() => {
          setUsers((json.users || json || []).map((u: any) => ({
          id: u.id,
          name: u.name,
          role: u.role,
        })))
        })
      }
    } catch {
      // ignore — users filter is optional
    }
  }, [isSuperAdmin])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter && categoryFilter !== 'all') params.set('categoryId', categoryFilter)
      if (userFilter && userFilter !== 'all') params.set('userId', userFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate + 'T23:59:59')
      const res = await fetch(`/api/product-sales-analytics?${params}`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        const json = await res.json()
        const cats = Array.from(new Set(json.map((r: AnalyticsRow) => r.productCategory))).sort()
        startTransition(() => {
          setData(json)
          setCategories(cats)
        })
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, userFilter, startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Filter by search
  const filtered = useMemo(() => data.filter((row) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      row.productName.toLowerCase().includes(q) ||
      (row.productNdc && row.productNdc.toLowerCase().includes(q)) ||
      row.productCategory.toLowerCase().includes(q)
    )
  }), [data, search])

  // Sort
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDir === 'asc'
      ? (Number(aVal) || 0) - (Number(bVal) || 0)
      : (Number(bVal) || 0) - (Number(aVal) || 0)
  }), [filtered, sortField, sortDir])

  const totalQty = filtered.reduce((s, r) => s + r.totalQuantity, 0)
  const totalRev = filtered.reduce((s, r) => s + r.totalRevenue, 0)
  const totalTx = filtered.reduce((s, r) => s + r.transactions, 0)

  const toggleSort = (field: SortField) => {
    startTransition(() => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir('desc')
      }
    })
  }

  const sortIcon = (field: SortField) => {
    const active = sortField === field
    return (
      <ArrowUpDown
        className={`h-3 w-3 ml-1 inline ${active ? (sortDir === 'desc' ? 'text-emerald-600' : 'text-amber-600') : 'text-gray-300'}`}
      />
    )
  }

  // Quick date presets
  const setDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter' | 'year' | '') => {
    startTransition(() => {
      if (!preset) { setStartDate(''); setEndDate(''); return }
      const today = new Date(getTodayWAT() + 'T00:00:00')
      const y = today.getFullYear()
      const m = today.getMonth()
      const d = today.getDate()
      let from: Date
      switch (preset) {
        case 'today': from = new Date(y, m, d); break
        case 'week': {
          const dow = today.getDay() || 7 // Mon=1 … Sun=7
          from = new Date(y, m, d - dow + 1)
          break
        }
        case 'month': from = new Date(y, m, 1); break
        case 'quarter': from = new Date(y, m - (m % 3), 1); break
        case 'year': from = new Date(y, 0, 1); break
      }
      setStartDate(from.toISOString().split('T')[0])
      setEndDate(today.toISOString().split('T')[0])
    })
  }

  const activePreset = useMemo(() => {
    if (!startDate && !endDate) return ''
    const today = new Date(getTodayWAT() + 'T00:00:00')
    const todayStr = today.toISOString().split('T')[0]
    if (startDate === todayStr && endDate === todayStr) return 'today'
    const dow = today.getDay() || 7
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow + 1).toISOString().split('T')[0]
    if (startDate === weekStart && endDate === todayStr) return 'week'
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    if (startDate === monthStart && endDate === todayStr) return 'month'
    const qStart = new Date(today.getFullYear(), today.getMonth() - (today.getMonth() % 3), 1).toISOString().split('T')[0]
    if (startDate === qStart && endDate === todayStr) return 'quarter'
    const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
    if (startDate === yearStart && endDate === todayStr) return 'year'
    return 'custom'
  }, [startDate, endDate])

  const clearDates = () => startTransition(() => { setStartDate(''); setEndDate('') })

  const selectedUserName = userFilter !== 'all'
    ? users.find((u) => u.id === userFilter)?.name || ''
    : ''

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={TrendingUp}
        title="Product Sales Analytics"
        description="Analyze product performance and sales trends"
        action={
          <div className="flex items-center gap-2">
            {selectedUserName && (
              <Badge variant="secondary" className="text-xs">
                <UserCircle className="h-3 w-3 mr-1" />
                {selectedUserName}
                <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setUserFilter('all')} />
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by product name, NDC, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Category:</Label>
            <Select value={categoryFilter} onValueChange={(v) => startTransition(() => setCategoryFilter(v))}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">User:</Label>
              <Select value={userFilter} onValueChange={(v) => startTransition(() => setUserFilter(v))}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Date range filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Period:</span>
            {([['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['quarter', 'Quarter'], ['year', 'This Year']] as const).map(([key, label]) => (
              <Button
                key={key}
                variant={activePreset === key ? 'default' : 'outline'}
                size="sm"
                className={`h-7 text-[11px] px-2.5 ${activePreset === key ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                onClick={() => setDatePreset(key)}
              >
                {label}
              </Button>
            ))}
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-500 hover:text-red-600 px-2" onClick={clearDates}>
                <X className="h-3 w-3 mr-0.5" />Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => startTransition(() => setStartDate(e.target.value))}
              className="h-8 w-[140px] text-xs"
              max={endDate || undefined}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => startTransition(() => setEndDate(e.target.value))}
              className="h-8 w-[140px] text-xs"
              min={startDate || undefined}
            />
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 stagger-children">
          <Card className="card-hover">
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-emerald-600">{totalQty.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">Total Units Sold</p>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-emerald-600">{totalTx.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">Total Transactions</p>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalRev)}</p>
              <p className="text-[11px] text-muted-foreground">Total Revenue</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="text-xs w-8">#</TableHead>
                <TableHead
                  className={`text-xs cursor-pointer select-none ${isPending ? 'opacity-60' : ''}`}
                  onClick={() => toggleSort('productName')}
                >
                  Product {sortIcon('productName')}
                </TableHead>
                <TableHead
                  className="text-xs hidden sm:table-cell cursor-pointer select-none"
                  onClick={() => toggleSort('productCategory')}
                >
                  Category {sortIcon('productCategory')}
                </TableHead>
                <TableHead
                  className="text-xs text-right cursor-pointer select-none"
                  onClick={() => toggleSort('totalQuantity')}
                >
                  Qty Sold {sortIcon('totalQuantity')}
                </TableHead>
                <TableHead
                  className="text-xs text-right hidden md:table-cell cursor-pointer select-none"
                  onClick={() => toggleSort('transactions')}
                >
                  Transactions {sortIcon('transactions')}
                </TableHead>
                <TableHead
                  className="text-xs text-right cursor-pointer select-none"
                  onClick={() => toggleSort('totalRevenue')}
                >
                  Revenue {sortIcon('totalRevenue')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={Package}
                      title={search ? 'No matching products' : 'No sales data yet'}
                      description={search ? `No products match "${search}". Try a different search term.` : 'Sales data will appear here once transactions are recorded.'}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, i) => (
                  <TableRow key={row.productId} className="hover:bg-emerald-50/30">
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{row.productName}</p>
                          {row.productStrength && (
                            <p className="text-[10px] text-muted-foreground">{row.productStrength} · {row.productDosageForm || row.productUnit}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{row.productCategory}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{row.totalQuantity.toLocaleString()} {row.productUnit}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground hidden md:table-cell">{row.transactions}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatCurrency(row.totalRevenue)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {filtered.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center">
            Showing {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : ''}
            {categoryFilter && categoryFilter !== 'all' ? ` in ${categoryFilter}` : ''}
            {(startDate || endDate) ? ` · ${startDate || '…'} to ${endDate || '…'}` : ''}
            {selectedUserName ? ` · User: ${selectedUserName}` : ''}
            {sortField !== 'totalQuantity' && (
              <> · Sorted by {sortField === 'totalRevenue' ? 'revenue' : sortField === 'transactions' ? 'transactions' : sortField === 'productName' ? 'product name' : 'category'} ({sortDir === 'desc' ? 'high → low' : 'low → high'})</>
            )}
          </p>
        )}
    </div>
  )
}
