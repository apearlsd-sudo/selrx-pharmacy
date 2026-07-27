'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, Search, Package, RefreshCw, Filter, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'

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

export function ProductSalesAnalytics() {
  const [data, setData] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [categories, setCategories] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter && categoryFilter !== 'all') params.set('categoryId', categoryFilter)
      const res = await fetch(`/api/product-sales-analytics?${params}`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        const json = await res.json()
        setData(json)
        // Extract unique categories
        const cats = Array.from(new Set(json.map((r: AnalyticsRow) => r.productCategory))).sort()
        setCategories(cats)
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = data.filter((row) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      row.productName.toLowerCase().includes(q) ||
      (row.productNdc && row.productNdc.toLowerCase().includes(q)) ||
      row.productCategory.toLowerCase().includes(q)
    )
  })

  const totalQty = filtered.reduce((s, r) => s + r.totalQuantity, 0)
  const totalRev = filtered.reduce((s, r) => s + r.totalRevenue, 0)
  const totalTx = filtered.reduce((s, r) => s + r.transactions, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Product Sales Analytics</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-emerald-600">{totalQty.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Total Units Sold</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-emerald-600">{totalTx.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Total Transactions</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalRev)}</p>
            <p className="text-[11px] text-muted-foreground">Total Revenue</p>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="text-xs">#</TableHead>
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Category</TableHead>
                <TableHead className="text-xs text-right">Qty Sold</TableHead>
                <TableHead className="text-xs text-right hidden md:table-cell">Transactions</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
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
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    {search ? 'No products match your search' : 'No sales data available yet'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, i) => (
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
          </p>
        )}
      </CardContent>
    </Card>
  )
}
