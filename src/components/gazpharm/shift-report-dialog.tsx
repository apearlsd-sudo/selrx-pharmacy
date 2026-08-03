'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/currency'
import { useAppStore } from '@/store/app-store'
import { format } from 'date-fns'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DollarSign, Package, ShoppingCart, Clock, TrendingUp, Filter,
  ArrowRight, Printer, Download,
} from 'lucide-react'

interface ShiftReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShiftReportDialog({ open, onOpenChange }: ShiftReportDialogProps) {
  const user = useAppStore((s) => s.user)
  const dateFormat = useAppStore((s) => s.dateFormat)
  const addToast = useAppStore((s) => s.addToast)

  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split('T')[0]
  })
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().split('T')[0])
  const [filterUser, setFilterUser] = useState('')
  const [activeTab, setActiveTab] = useState('summary')

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', new Date(filterFrom).toISOString())
      params.set('to', new Date(filterTo + 'T23:59:59').toISOString())
      if (filterUser) params.set('userId', filterUser)
      const res = await fetch(`/api/shifts?${params}`, {
        headers: { 'x-user-role': user?.role || '', 'x-user-id': user?.id || '' },
      })
      if (res.ok) {
        const data = await res.json()
        setReportData(data)
      } else {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load report')
      }
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to load report', variant: 'destructive' })
    }
    setLoading(false)
  }, [filterFrom, filterTo, filterUser, user])

  useEffect(() => {
    if (open) fetchReport()
  }, [open, fetchReport])

  const fmtDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr)
      return format(d, dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy' : 'yyyy-MM-dd')
    } catch { return isoStr }
  }
  const fmtDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr)
      return format(d, dateFormat === 'dd/mm/yyyy' ? 'dd/MM/yyyy HH:mm' : dateFormat === 'mm/dd/yyyy' ? 'MM/dd/yyyy hh:mm a' : 'yyyy-MM-dd HH:mm')
    } catch { return isoStr }
  }

  const handleExportCSV = () => {
    if (!reportData) return
    const rows = [['Product', 'Qty Sold', 'Revenue'].join(',')]
    for (const item of reportData.itemsSold) {
      rows.push([`"${item.productName}"`, item.quantitySold, item.revenue.toFixed(2)].join(','))
    }
    rows.push([])
    rows.push(['Total Sales', '', reportData.summary.totalSales.toFixed(2)].join(','))
    rows.push(['Total Transactions', '', reportData.summary.totalTransactions].join(','))
    rows.push(['Total Items Sold', '', reportData.summary.totalItemsSold].join(','))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-report-${filterFrom}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Shift Report
          </DialogTitle>
          <DialogDescription>
            View sales performance, items sold, and current inventory for a specific date range and user.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 border rounded-lg p-3 bg-muted/30">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <div className="flex-1 min-w-[130px]">
            <Label className="text-[11px]">From</Label>
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex-1 min-w-[130px]">
            <Label className="text-[11px]">To</Label>
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 text-xs" />
          </div>
          {isSuperAdmin && reportData?.users && (
            <div className="flex-1 min-w-[150px]">
              <Label className="text-[11px]">User</Label>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="w-full h-8 text-xs border rounded-md px-2 bg-white"
              >
                <option value="">All Users</option>
                {reportData.users.map((u: { id: string; name: string }) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={fetchReport} disabled={loading} className="h-8">
            {loading ? 'Loading...' : 'Apply'}
          </Button>
        </div>

        {/* Content */}
        {reportData && !loading && (
          <div className="flex-1 min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
                <TabsTrigger value="items" className="text-xs">Items Sold</TabsTrigger>
                <TabsTrigger value="inventory" className="text-xs">Inventory</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">Shift History</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-3 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-emerald-700 mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Total Sales</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-800">{formatCurrency(reportData.summary.totalSales)}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-blue-700 mb-1">
                      <ShoppingCart className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Transactions</span>
                    </div>
                    <p className="text-lg font-bold text-blue-800">{reportData.summary.totalTransactions}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-amber-700 mb-1">
                      <Package className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Items Sold</span>
                    </div>
                    <p className="text-lg font-bold text-amber-800">{reportData.summary.totalItemsSold}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-gray-700 mb-1">
                      <Clock className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Products Sold</span>
                    </div>
                    <p className="text-lg font-bold text-gray-800">{reportData.summary.totalProductsSold}</p>
                  </div>
                </div>

                {reportData.summary.totalDiscount > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted rounded p-2">
                    Total Discount Given: {formatCurrency(reportData.summary.totalDiscount)}
                  </div>
                )}

                {/* Sales by user (admin) */}
                {isSuperAdmin && reportData.salesByUser.length > 0 && (
                  <div className="border rounded-lg p-3">
                    <h4 className="text-sm font-semibold mb-2">Sales by User</h4>
                    <div className="space-y-1.5">
                      {reportData.salesByUser.map((u: any) => (
                        <div key={u.userId} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{u.userName}</span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{u.txnCount} txn{u.txnCount !== 1 ? 's' : ''}</span>
                            <span className="font-semibold text-foreground">{formatCurrency(u.sales)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="items" className="mt-3">
                {reportData.itemsSold.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No items sold in this period</div>
                ) : (
                  <ScrollArea className="max-h-[40vh]">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Product</th>
                          <th className="text-center px-3 py-2 font-medium">Qty Sold</th>
                          <th className="text-right px-3 py-2 font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.itemsSold.map((item: any, i: number) => (
                          <tr key={item.productId} className="hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-3 py-2 font-medium">{item.productName}</td>
                            <td className="px-3 py-2 text-center font-mono">{item.quantitySold}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatCurrency(item.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="inventory" className="mt-3">
                <div className="text-xs text-muted-foreground mb-2">
                  Current stock levels ({reportData.inventorySnapshot.length} items with stock)
                </div>
                <ScrollArea className="max-h-[40vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Product</th>
                        <th className="text-left px-3 py-2 font-medium">Category</th>
                        <th className="text-center px-3 py-2 font-medium">In Stock</th>
                        <th className="text-right px-3 py-2 font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {reportData.inventorySnapshot.map((item: any, i: number) => (
                        <tr key={item.productId} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{item.productName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.category || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={item.currentStock <= 10 ? 'destructive' : item.currentStock <= 30 ? 'secondary' : 'default'} className="font-mono text-xs">
                              {item.currentStock}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(item.sellingPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="mt-3">
                {reportData.shiftHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No shift history found</div>
                ) : (
                  <ScrollArea className="max-h-[40vh]">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">User</th>
                          <th className="text-left px-3 py-2 font-medium">Started</th>
                          <th className="text-left px-3 py-2 font-medium">Ended</th>
                          <th className="text-center px-3 py-2 font-medium">Status</th>
                          <th className="text-center px-3 py-2 font-medium">Txns</th>
                          <th className="text-right px-3 py-2 font-medium">Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reportData.shiftHistory.map((s: any) => (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{s.userName}</td>
                            <td className="px-3 py-2 text-xs">{fmtDateTime(s.startedAt)}</td>
                            <td className="px-3 py-2 text-xs">{s.endedAt ? fmtDateTime(s.endedAt) : '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={s.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px]">
                                {s.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-xs">{s.totalTransactions}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(s.totalSales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {loading && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-sm text-muted-foreground animate-pulse">Loading report...</div>
          </div>
        )}

        <DialogFooter className="mt-3 gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={loading || !reportData}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !reportData}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
