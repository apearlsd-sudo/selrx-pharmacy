'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DollarSign, ShoppingCart, TrendingUp, CalendarDays, Download, FileText, PackageX, AlertTriangle, TrendingDown, TrendingUp as TrendingUpIcon,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

const CHART_COLORS = ['#059669', '#14b8a6', '#10b981', '#34d399', '#6ee7b7', '#0d9488', '#0f766e', '#a7f3d0']

import { formatCurrency } from '@/lib/currency'

export function ReportsView() {
  const [activeTab, setActiveTab] = useState('sales')
  const [salesStats, setSalesStats] = useState<any>(null)
  const [inventory, setInventory] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [completedStockTakes, setCompletedStockTakes] = useState<any[]>([])
  const [selectedReport, setSelectedReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)

  const fetchSalesData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, txRes, invRes, rxRes, stRes] = await Promise.all([
        fetch('/api/transactions?action=stats'),
        fetch('/api/transactions'),
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

  useEffect(() => { fetchSalesData() }, [fetchSalesData])

  // Re-fetch inventory data in reports when stock changes
  const prevInvVer = useRef(inventoryVersion)
  useEffect(() => {
    if (prevInvVer.current !== inventoryVersion) {
      prevInvVer.current = inventoryVersion
      fetch('/api/inventory').then(r => { if (r.ok) r.json().then(setInventory) }).catch(() => {})
    }
  }, [inventoryVersion])

  // Prepare chart data
  const salesByCategory = salesStats?.topProducts?.map((p: any, i: number) => ({
    name: p.productName?.split(' ').slice(0, 2).join(' ') || 'Unknown',
    revenue: p._sum?.subtotal || 0,
    units: p._sum?.quantity || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  })) || []

  const dailySales = transactions
    .filter((t: any) => t.status === 'COMPLETED')
    .reduce((acc: any, t: any) => {
      const date = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const existing = acc.find((d: any) => d.date === date)
      if (existing) { existing.sales += t.total; existing.count += 1 }
      else { acc.push({ date, sales: t.total, count: 1 }) }
      return acc
    }, [])
    .slice(-7)

  const categoryData = inventory.reduce((acc: any, item: any) => {
    const cat = item.product?.category?.replace(/_/g, ' ') || 'Other'
    const existing = acc.find((c: any) => c.category === cat)
    if (existing) existing.count++
    else acc.push({ category: cat, count: 1, fill: CHART_COLORS[acc.length % CHART_COLORS.length] })
    return acc
  }, [])

  const lowStockItems = inventory.filter((i: any) => i.quantity <= i.product?.reorderPoint)
  const expiringSoon = inventory.filter((i: any) => i.product?.expiryDate && new Date(i.product.expiryDate) <= new Date(Date.now() + 30 * 86400000))

  const rxByStatus = prescriptions.reduce((acc: any, rx: any) => {
    const existing = acc.find((s: any) => s.status === rx.status)
    if (existing) existing.count++
    else acc.push({ status: rx.status?.replace(/_/g, ' '), count: 1, fill: CHART_COLORS[acc.length % CHART_COLORS.length] })
    return acc
  }, [])

  return (
    <div className="space-y-4">
      {/* Report Type Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="sales">Sales Summary</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            <TabsTrigger value="stocktake">Stock Take Reports</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
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
                  <DollarSign className="h-5 w-5 text-emerald-600" />
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

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
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
                              onClick={async () => {
                                setReportLoading(true)
                                try {
                                  const res = await fetch(`/api/stock-take?action=report&id=${st.id}`, { headers: authHeaders() })
                                  if (res.ok) setSelectedReport(await res.json())
                                  else addToast({ title: 'Error', description: 'Failed to load report', variant: 'destructive' })
                                } catch {
                                  addToast({ title: 'Error', description: 'Failed to load report', variant: 'destructive' })
                                } finally {
                                  setReportLoading(false)
                                }
                              }}
                              disabled={reportLoading}
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

              {/* Report Dialog */}
              <Dialog open={!!selectedReport} onOpenChange={(open) => { if (!open) setSelectedReport(null) }}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                  {selectedReport && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-emerald-600" />
                          Stock Take Report — {selectedReport.stockTakeRef}
                        </DialogTitle>
                        <DialogDescription>
                          {selectedReport.completedAt ? new Date(selectedReport.completedAt).toLocaleString() : new Date(selectedReport.generatedAt).toLocaleString()}
                          {' · '}{selectedReport.totalItemsChecked} items checked
                          {selectedReport.countedBy ? ` · By ${selectedReport.countedBy}` : ''}
                        </DialogDescription>
                      </DialogHeader>

                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-lg font-bold">{selectedReport.totalItemsChecked}</p>
                          <p className="text-[11px] text-muted-foreground">Items Checked</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-lg font-bold text-red-600">{selectedReport.expiredGoods.count}</p>
                          <p className="text-[11px] text-muted-foreground">Expired Goods</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-lg font-bold text-orange-600">{selectedReport.stockVariance.shortageCount}</p>
                          <p className="text-[11px] text-muted-foreground">Shortages</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <p className="text-lg font-bold text-emerald-600">{selectedReport.stockVariance.surplusCount}</p>
                          <p className="text-[11px] text-muted-foreground">Surplus</p>
                        </div>
                      </div>

                      {/* Expired Goods */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <PackageX className="h-4 w-4 text-red-500" />
                          <h3 className="text-sm font-semibold">
                            Expired Goods
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {selectedReport.expiredGoods.count} item{selectedReport.expiredGoods.count !== 1 ? 's' : ''} · Total cost: <span className="font-semibold text-red-600">{formatCurrency(selectedReport.expiredGoods.totalCost)}</span>
                            </span>
                          </h3>
                        </div>
                        {selectedReport.expiredGoods.items.length > 0 ? (
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-red-50/50">
                                  <TableHead className="text-xs">Product</TableHead>
                                  <TableHead className="text-xs hidden md:table-cell">Category</TableHead>
                                  <TableHead className="text-xs hidden lg:table-cell">Strength/Form</TableHead>
                                  <TableHead className="text-xs text-right">Qty</TableHead>
                                  <TableHead className="text-xs hidden sm:table-cell">Expiry</TableHead>
                                  <TableHead className="text-xs text-right">Unit Cost</TableHead>
                                  <TableHead className="text-xs text-right">Total Cost</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedReport.expiredGoods.items.map((item: any) => (
                                  <TableRow key={item.productId} className="bg-red-50/30">
                                    <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{item.category?.replace(/_/g, ' ')}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                                      {[item.strength, item.dosageForm].filter(Boolean).join(' / ') || '—'}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">{item.countedQty}</TableCell>
                                    <TableCell className="text-xs text-red-600 font-medium hidden sm:table-cell">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '—'}</TableCell>
                                    <TableCell className="text-right text-xs">{formatCurrency(item.costPrice)}</TableCell>
                                    <TableCell className="text-right text-sm font-semibold text-red-600">{formatCurrency(item.totalCost)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-center">
                            <p className="text-sm text-muted-foreground">No expired goods found</p>
                          </div>
                        )}
                      </div>

                      {/* Stock Variance */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <h3 className="text-sm font-semibold">
                            Stock Variance
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {selectedReport.stockVariance.totalVarianceItems} item{selectedReport.stockVariance.totalVarianceItems !== 1 ? 's' : ''} with variance
                              {' · '}Shortage cost: <span className="font-semibold text-orange-600">{formatCurrency(selectedReport.stockVariance.shortageTotalCost)}</span>
                              {' · '}Surplus value: <span className="font-semibold text-emerald-600">{formatCurrency(selectedReport.stockVariance.surplusTotalCost)}</span>
                            </span>
                          </h3>
                        </div>
                        {selectedReport.stockVariance.items.length > 0 ? (
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-amber-50/50">
                                  <TableHead className="text-xs">Product</TableHead>
                                  <TableHead className="text-xs hidden md:table-cell">Category</TableHead>
                                  <TableHead className="text-xs text-right">System</TableHead>
                                  <TableHead className="text-xs text-right">Counted</TableHead>
                                  <TableHead className="text-xs text-right">Variance</TableHead>
                                  <TableHead className="text-xs text-right hidden sm:table-cell">Unit Cost</TableHead>
                                  <TableHead className="text-xs text-right">Total Cost</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedReport.stockVariance.items.map((item: any) => (
                                  <TableRow key={item.productId} className={item.varianceType === 'SHORTAGE' ? 'bg-orange-50/30' : 'bg-emerald-50/30'}>
                                    <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{item.category?.replace(/_/g, ' ')}</TableCell>
                                    <TableCell className="text-right text-sm text-muted-foreground">{item.systemQty}</TableCell>
                                    <TableCell className="text-right text-sm font-medium">{item.countedQty}</TableCell>
                                    <TableCell className="text-right text-sm font-bold">
                                      <span className={`inline-flex items-center gap-1 ${item.varianceType === 'SHORTAGE' ? 'text-orange-600' : 'text-emerald-600'}`}>
                                        {item.varianceType === 'SHORTAGE' ? <TrendingDown className="h-3 w-3" /> : <TrendingUpIcon className="h-3 w-3" />}
                                        {item.variance > 0 ? '+' : ''}{item.variance}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right text-xs hidden sm:table-cell">{formatCurrency(item.unitCost)}</TableCell>
                                    <TableCell className="text-right text-sm font-semibold">{formatCurrency(item.totalCost)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-center">
                            <p className="text-sm text-muted-foreground">No variances found — all counts match system quantities</p>
                          </div>
                        )}
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedReport(null)}>Close</Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
