'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, FileText, PackageX, AlertTriangle, TrendingDown, TrendingUp,
  Printer, Download, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  ClipboardCheck, DollarSign, BarChart3, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'
import { formatDate, formatDateTime } from '@/lib/date-utils'

// ── Report Types ──

interface ExpiredItem {
  productId: string
  productName: string
  ndc: string | null
  category: string
  dosageForm: string | null
  strength: string | null
  expiryDate: string | null
  countedQty: number
  costPrice: number
  sellingPrice: number
  totalCost: number
  potentialRevenue: number
  manufacturer: string | null
  vendor: string | null
  daysSinceExpiry: number
}

interface NearExpiryItem {
  productId: string
  productName: string
  ndc: string | null
  category: string
  dosageForm: string | null
  strength: string | null
  expiryDate: string | null
  countedQty: number
  costPrice: number
  sellingPrice: number
  totalCost: number
  potentialRevenue: number
  manufacturer: string | null
  vendor: string | null
  daysToExpiry: number
}

interface VarianceItem {
  productId: string
  productName: string
  ndc: string | null
  category: string
  dosageForm: string | null
  strength: string | null
  systemQty: number
  countedQty: number
  variance: number
  varianceType: 'SHORTAGE' | 'SURPLUS'
  variancePercent: number
  unitCost: number
  totalCost: number
  manufacturer: string | null
  vendor: string | null
}

interface ReorderAlertItem {
  productId: string
  productName: string
  ndc: string | null
  category: string
  countedQty: number
  reorderPoint: number
  reorderQty: number
  deficit: number
  unitCost: number
  reorderCost: number
  manufacturer: string | null
  vendor: string | null
}

interface InventoryValuation {
  totalItems: number
  totalCostValue: number
  totalRetailValue: number
  potentialProfit: number
  profitMargin: number
}

interface ReportData {
  generatedAt: string
  stockTakeRef: string
  stockTakeId: string
  completedAt: string | null
  countedBy: string | null
  startedAt: string | null
  notes: string | null
  totalItemsChecked: number
  itemsWithZeroCount: number
  itemsMatched: number
  inventoryValuation: InventoryValuation
  expiredGoods: {
    count: number
    totalCost: number
    totalPotentialRevenue: number
    items: ExpiredItem[]
  }
  nearExpiryGoods: {
    count: number
    totalCost: number
    totalPotentialRevenue: number
    items: NearExpiryItem[]
  }
  stockVariance: {
    totalVarianceItems: number
    shortageCount: number
    shortageTotalCost: number
    surplusCount: number
    surplusTotalCost: number
    netVarianceCost: number
    items: VarianceItem[]
  }
  reorderAlerts: {
    count: number
    totalReorderCost: number
    items: ReorderAlertItem[]
  }
}

// ── Component ──

export function StockTakeReportView({ stockTakeId }: { stockTakeId?: string }) {
  // stockTakeId is passed reactively via StockTakeReportViewWrapper which subscribes
  // to useAppStore((s) => s.stockTakeReportId). No non-reactive store reads here.

  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    expired: true,
    nearExpiry: true,
    variance: true,
    reorder: true,
    valuation: true,
  })
  const [sortField, setSortField] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const addToast = useAppStore((s) => s.addToast)

  const fetchReport = useCallback(async () => {
    if (!stockTakeId) {
      setLoading(false)
      setError('No stock take selected')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/stock-take?action=report&id=${stockTakeId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        // Validate that the response has the expected structure before setting state
        if (data && data.stockTakeRef && data.inventoryValuation) {
          setReport(data)
        } else {
          console.error('[StockTakeReport] Invalid report data:', data)
          setError('Invalid report data received from server')
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to load report' }))
        setError(err.error || 'Failed to load report')
      }
    } catch {
      setError('Network error while loading report')
    } finally {
      setLoading(false)
    }
  }, [stockTakeId])

  useEffect(() => { fetchReport() }, [fetchReport])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handlePrint = () => window.print()
  const handleExportCSV = () => {
    if (!report) return
    try {
      const lines: string[] = []
      // Expired goods
      lines.push('=== EXPIRED GOODS ===')
      lines.push('Product,NDC,Category,Strength,Form,Qty,Cost Price,Selling Price,Total Cost,Potential Revenue,Expiry Date,Days Since Expiry,Manufacturer,Vendor')
      for (const item of report.expiredGoods.items) {
        lines.push(`"${item.productName}","${item.ndc || ''}","${item.category}","${item.strength || ''}","${item.dosageForm || ''}",${item.countedQty},${item.costPrice},${item.sellingPrice},${item.totalCost},${item.potentialRevenue},"${item.expiryDate || ''}",${item.daysSinceExpiry},"${item.manufacturer || ''}","${item.vendor || ''}"`)
      }
      lines.push('')
      // Near expiry
      lines.push('=== NEAR EXPIRY (90 DAYS) ===')
      lines.push('Product,NDC,Category,Strength,Form,Qty,Cost Price,Selling Price,Total Cost,Potential Revenue,Expiry Date,Days To Expiry,Manufacturer,Vendor')
      for (const item of report.nearExpiryGoods.items) {
        lines.push(`"${item.productName}","${item.ndc || ''}","${item.category}","${item.strength || ''}","${item.dosageForm || ''}",${item.countedQty},${item.costPrice},${item.sellingPrice},${item.totalCost},${item.potentialRevenue},"${item.expiryDate || ''}",${item.daysToExpiry},"${item.manufacturer || ''}","${item.vendor || ''}"`)
      }
      lines.push('')
      // Variance
      lines.push('=== STOCK VARIANCE ===')
      lines.push('Product,NDC,Category,System Qty,Counted Qty,Variance,Variance %,Type,Unit Cost,Total Cost,Manufacturer,Vendor')
      for (const item of report.stockVariance.items) {
        lines.push(`"${item.productName}","${item.ndc || ''}","${item.category}",${item.systemQty},${item.countedQty},${item.variance},${item.variancePercent},"${item.varianceType}",${item.unitCost},${item.totalCost},"${item.manufacturer || ''}","${item.vendor || ''}"`)
      }
      lines.push('')
      // Reorder alerts
      lines.push('=== REORDER ALERTS ===')
      lines.push('Product,NDC,Category,Current Qty,Reorder Point,Reorder Qty,Deficit,Unit Cost,Reorder Cost,Manufacturer,Vendor')
      for (const item of report.reorderAlerts.items) {
        lines.push(`"${item.productName}","${item.ndc || ''}","${item.category}",${item.countedQty},${item.reorderPoint},${item.reorderQty},${item.deficit},${item.unitCost},${item.reorderCost},"${item.manufacturer || ''}","${item.vendor || ''}"`)
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock-take-report-${report.stockTakeRef}.csv`
      a.click()
      URL.revokeObjectURL(url)
      addToast({ title: 'Exported', description: 'Report exported as CSV', variant: 'success' })
    } catch {
      addToast({ title: 'Export Failed', description: 'Failed to export report', variant: 'destructive' })
    }
  }

  // ── Loading State ──
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // ── Error State ──
  if (error || !report) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
        <p className="text-sm font-medium text-gray-500">{error || 'Report not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => useAppStore.getState().setCurrentView('stock-take')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Stock Takes
        </Button>
      </div>
    )
  }

  const accuracyRate = report.totalItemsChecked > 0
    ? ((report.itemsMatched / report.totalItemsChecked) * 100).toFixed(1)
    : '0'

  const SectionHeader = ({
    id, icon: Icon, title, badge, badgeColor, count, subtitle,
  }: {
    id: string; icon: React.ElementType; title: string; badge?: string; badgeColor?: string
    count?: number; subtitle?: string
  }) => (
    <button
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 rounded-lg transition-colors cursor-pointer"
      onClick={() => toggleSection(id)}
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Icon className="h-4.5 w-4.5 text-emerald-600" />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {badge !== undefined && (
              <Badge className={`text-[10px] px-1.5 py-0 ${badgeColor || 'bg-gray-100 text-gray-700 dark:text-gray-300'}`}>{badge}</Badge>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {count !== undefined && <span className="text-xs font-medium text-muted-foreground">{count} items</span>}
        {expandedSections[id] ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>
    </button>
  )

  return (
    <div className="space-y-4 print:space-y-2 animate-fade-in">
      {/* ── Report Header ── */}
      <PageHeader
        icon={ClipboardCheck}
        title="Stock Take Report"
        description={`${report.stockTakeRef} · Generated ${report.completedAt ? formatDateTime(report.completedAt) : formatDateTime(report.generatedAt)}`}
        action={
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => useAppStore.getState().setCurrentView('stock-take')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* ── Meta Info Bar ── */}
      <Card className="print:border-none print:shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span><strong className="text-foreground">Reference:</strong> {report.stockTakeRef}</span>
            {report.countedBy && <span><strong className="text-foreground">Counted By:</strong> {report.countedBy}</span>}
            <span><strong className="text-foreground">Date:</strong> {report.completedAt ? formatDate(report.completedAt) : '—'}</span>
            <span><strong className="text-foreground">Items Checked:</strong> {report.totalItemsChecked}</span>
            {report.notes && <span><strong className="text-foreground">Notes:</strong> {report.notes}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Key Metrics Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:grid-cols-3 stagger-children">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-bold">{report.totalItemsChecked}</p>
            <p className="text-[11px] text-muted-foreground">Items Checked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600">{accuracyRate}%</p>
            <p className="text-[11px] text-muted-foreground">Accuracy Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <PackageX className="h-4 w-4 text-red-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-red-600">{report.expiredGoods.count}</p>
            <p className="text-[11px] text-muted-foreground">Expired Goods</p>
            <p className="text-[10px] text-red-500 font-medium">{formatCurrency(report.expiredGoods.totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-orange-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-orange-600">{report.nearExpiryGoods.count}</p>
            <p className="text-[11px] text-muted-foreground">Near Expiry</p>
            <p className="text-[10px] text-orange-500 font-medium">{formatCurrency(report.nearExpiryGoods.totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-orange-600">{report.stockVariance.shortageCount}</p>
            <p className="text-[11px] text-muted-foreground">Shortages</p>
            <p className="text-[10px] text-orange-500 font-medium">{formatCurrency(report.stockVariance.shortageTotalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <RotateCcw className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-blue-600">{report.reorderAlerts.count}</p>
            <p className="text-[11px] text-muted-foreground">Reorder Alerts</p>
            <p className="text-[10px] text-blue-500 font-medium">{formatCurrency(report.reorderAlerts.totalReorderCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Inventory Valuation Summary ── */}
      <Card>
        <SectionHeader
          id="valuation"
          icon={DollarSign}
          title="Inventory Valuation Summary"
          subtitle={`Total cost value: ${formatCurrency(report.inventoryValuation.totalCostValue)} · Retail value: ${formatCurrency(report.inventoryValuation.totalRetailValue)}`}
        />
        {expandedSections.valuation && (
          <CardContent className="pt-0 px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Cost Value</p>
                <p className="text-lg font-bold">{formatCurrency(report.inventoryValuation.totalCostValue)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Retail Value</p>
                <p className="text-lg font-bold">{formatCurrency(report.inventoryValuation.totalRetailValue)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Potential Profit</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(report.inventoryValuation.potentialProfit)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Profit Margin</p>
                <p className="text-lg font-bold text-emerald-600">{report.inventoryValuation.profitMargin.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Expired Goods ── */}
      <Card>
        <SectionHeader
          id="expired"
          icon={PackageX}
          title="Expired Goods"
          badge={report.expiredGoods.count.toString()}
          badgeColor="bg-red-100 text-red-700"
          count={report.expiredGoods.count}
          subtitle={`Total cost at risk: ${formatCurrency(report.expiredGoods.totalCost)} · Lost revenue: ${formatCurrency(report.expiredGoods.totalPotentialRevenue)}`}
        />
        {expandedSections.expired && (
          <CardContent className="pt-0 px-0">
            {report.expiredGoods.items.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="table-header-standard">
                  <TableHeader>
                    <TableRow className="bg-red-50/50">
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">NDC</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Category</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Strength/Form</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Manufacturer</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Vendor</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Cost Price</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Sell Price</TableHead>
                      <TableHead className="text-xs text-right">Total Cost</TableHead>
                      <TableHead className="text-xs text-right hidden lg:table-cell">Lost Revenue</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Expiry Date</TableHead>
                      <TableHead className="text-xs text-right hidden lg:table-cell">Days Expired</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.expiredGoods.items.map((item, i) => (
                      <TableRow key={item.productId} className="bg-red-50/20 hover:bg-red-50/40">
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground hidden xl:table-cell">{item.ndc || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{item.category.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">
                          {[item.strength, item.dosageForm].filter(Boolean).join(' / ') || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.manufacturer || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.vendor || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{item.countedQty}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(item.costPrice)}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(item.sellingPrice)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-red-600">{formatCurrency(item.totalCost)}</TableCell>
                        <TableCell className="text-right text-xs text-red-500 hidden lg:table-cell">{formatCurrency(item.potentialRevenue)}</TableCell>
                        <TableCell className="text-xs text-red-600 font-medium hidden md:table-cell">{formatDate(item.expiryDate)}</TableCell>
                        <TableCell className="text-right text-xs text-red-600 font-bold hidden lg:table-cell">{item.daysSinceExpiry}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-red-100/50 font-bold">
                      <TableCell colSpan={10} className="text-xs text-right">Total</TableCell>
                      <TableCell className="text-right text-sm text-red-700">{formatCurrency(report.expiredGoods.totalCost)}</TableCell>
                      <TableCell className="text-right text-xs text-red-700 hidden lg:table-cell">{formatCurrency(report.expiredGoods.totalPotentialRevenue)}</TableCell>
                      <TableCell colSpan={2} className="hidden lg:table-cell" />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="No expired goods" description="All products are within their expiry period" />
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Near Expiry Goods (within 90 days) ── */}
      <Card>
        <SectionHeader
          id="nearExpiry"
          icon={Clock}
          title="Near Expiry Goods (Within 90 Days)"
          badge={report.nearExpiryGoods.count.toString()}
          badgeColor="bg-orange-100 text-orange-700"
          count={report.nearExpiryGoods.count}
          subtitle={`Total cost: ${formatCurrency(report.nearExpiryGoods.totalCost)} · Potential revenue: ${formatCurrency(report.nearExpiryGoods.totalPotentialRevenue)}`}
        />
        {expandedSections.nearExpiry && (
          <CardContent className="pt-0 px-0">
            {report.nearExpiryGoods.items.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="table-header-standard">
                  <TableHeader>
                    <TableRow className="bg-orange-50/50">
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">NDC</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Category</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Strength/Form</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Manufacturer</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Vendor</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Cost Price</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Sell Price</TableHead>
                      <TableHead className="text-xs text-right">Total Cost</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Expiry Date</TableHead>
                      <TableHead className="text-xs text-right hidden lg:table-cell">Days Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.nearExpiryGoods.items.map((item, i) => (
                      <TableRow key={item.productId} className="hover:bg-orange-50/30">
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground hidden xl:table-cell">{item.ndc || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{item.category.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">
                          {[item.strength, item.dosageForm].filter(Boolean).join(' / ') || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.manufacturer || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.vendor || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{item.countedQty}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(item.costPrice)}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(item.sellingPrice)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(item.totalCost)}</TableCell>
                        <TableCell className="text-xs font-medium hidden md:table-cell">
                          <span className={item.daysToExpiry <= 30 ? 'text-red-600' : item.daysToExpiry <= 60 ? 'text-orange-600' : 'text-amber-600'}>
                            {formatDate(item.expiryDate)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold hidden lg:table-cell">
                          <span className={item.daysToExpiry <= 30 ? 'text-red-600' : item.daysToExpiry <= 60 ? 'text-orange-600' : 'text-amber-600'}>
                            {item.daysToExpiry}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-orange-100/50 font-bold">
                      <TableCell colSpan={10} className="text-xs text-right">Total</TableCell>
                      <TableCell className="text-right text-sm text-orange-700">{formatCurrency(report.nearExpiryGoods.totalCost)}</TableCell>
                      <TableCell colSpan={2} className="hidden lg:table-cell" />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="No near-expiry products" description="No products expiring within 90 days" />
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Stock Variance ── */}
      <Card>
        <SectionHeader
          id="variance"
          icon={AlertTriangle}
          title="Stock Variance (Shortage & Surplus)"
          badge={report.stockVariance.totalVarianceItems.toString()}
          badgeColor="bg-amber-100 text-amber-700"
          count={report.stockVariance.totalVarianceItems}
          subtitle={`Shortage cost: ${formatCurrency(report.stockVariance.shortageTotalCost)} · Surplus value: ${formatCurrency(report.stockVariance.surplusTotalCost)} · Net: ${formatCurrency(report.stockVariance.netVarianceCost)}`}
        />
        {expandedSections.variance && (
          <CardContent className="pt-0 px-0">
            {report.stockVariance.items.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="table-header-standard">
                  <TableHeader>
                    <TableRow className="bg-amber-50/50">
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">NDC</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Category</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Manufacturer</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Vendor</TableHead>
                      <TableHead className="text-xs text-right">System Qty</TableHead>
                      <TableHead className="text-xs text-right">Counted</TableHead>
                      <TableHead className="text-xs text-right">Variance</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Variance %</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Unit Cost</TableHead>
                      <TableHead className="text-xs text-right">Total Cost Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.stockVariance.items.map((item, i) => (
                      <TableRow key={item.productId} className={item.varianceType === 'SHORTAGE' ? 'bg-orange-50/20 hover:bg-orange-50/40' : 'bg-emerald-50/20 hover:bg-emerald-50/40'}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground hidden xl:table-cell">{item.ndc || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{item.category.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.manufacturer || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.vendor || '—'}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{item.systemQty}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{item.countedQty}</TableCell>
                        <TableCell className="text-right text-sm font-bold">
                          <span className={`inline-flex items-center gap-1 ${item.varianceType === 'SHORTAGE' ? 'text-orange-600' : 'text-emerald-600'}`}>
                            {item.varianceType === 'SHORTAGE' ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                            {item.variance > 0 ? '+' : ''}{item.variance}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">
                          <span className={`font-medium ${item.varianceType === 'SHORTAGE' ? 'text-orange-600' : 'text-emerald-600'}`}>
                            {item.variance > 0 ? '+' : ''}{item.variancePercent}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatCurrency(item.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-amber-100/50 font-bold">
                      <TableCell colSpan={7} className="text-xs text-right">Net Variance Cost</TableCell>
                      <TableCell colSpan={4} className="text-right text-sm text-amber-700 hidden md:table-cell">{formatCurrency(report.stockVariance.netVarianceCost)}</TableCell>
                      <TableCell className="text-right text-sm text-amber-700 md:hidden" colSpan={4}>{formatCurrency(report.stockVariance.netVarianceCost)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="No variances found" description="All counted quantities match system quantities exactly" />
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Reorder Alerts ── */}
      <Card>
        <SectionHeader
          id="reorder"
          icon={RotateCcw}
          title="Reorder Alerts (Below Reorder Point)"
          badge={report.reorderAlerts.count.toString()}
          badgeColor="bg-blue-100 text-blue-700"
          count={report.reorderAlerts.count}
          subtitle={`Total investment needed: ${formatCurrency(report.reorderAlerts.totalReorderCost)}`}
        />
        {expandedSections.reorder && (
          <CardContent className="pt-0 px-0">
            {report.reorderAlerts.items.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="table-header-standard">
                  <TableHeader>
                    <TableRow className="bg-blue-50/50">
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">NDC</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Category</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Manufacturer</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Vendor</TableHead>
                      <TableHead className="text-xs text-right">Current Qty</TableHead>
                      <TableHead className="text-xs text-right">Reorder Point</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Reorder Qty</TableHead>
                      <TableHead className="text-xs text-right">Deficit</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Unit Cost</TableHead>
                      <TableHead className="text-xs text-right">Reorder Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.reorderAlerts.items.map((item, i) => (
                      <TableRow key={item.productId} className="hover:bg-blue-50/30">
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground hidden xl:table-cell">{item.ndc || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{item.category.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.manufacturer || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{item.vendor || '—'}</TableCell>
                        <TableCell className="text-right text-sm font-bold text-red-600">{item.countedQty}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{item.reorderPoint}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{item.reorderQty}</TableCell>
                        <TableCell className="text-right text-sm font-bold text-blue-600">{item.deficit}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-blue-600">{formatCurrency(item.reorderCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-blue-100/50 font-bold">
                      <TableCell colSpan={10} className="text-xs text-right hidden md:table-cell">Total Reorder Investment</TableCell>
                      <TableCell className="text-right text-sm text-blue-700 hidden md:table-cell">{formatCurrency(report.reorderAlerts.totalReorderCost)}</TableCell>
                      <TableCell colSpan={10} className="text-right text-sm text-blue-700 md:hidden">{formatCurrency(report.reorderAlerts.totalReorderCost)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="No reorder alerts" description="All products are above their reorder points — no restocking needed" />
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Report Footer ── */}
      <div className="text-center py-4 text-xs text-muted-foreground print:py-2">
        <p>Report generated by SelRx Pharmacy POS · {formatDateTime(report.generatedAt)}</p>
      </div>
    </div>
  )
}

/**
 * Wrapper component that reactively reads stockTakeReportId from the Zustand store
 * and passes it as a prop to StockTakeReportView.
 *
 * This solves the race condition where page.tsx used useAppStore.getState()
 * (non-reactive) inside renderView(), causing the report view to mount with
 * an undefined stockTakeId before the store had updated.
 */
export function StockTakeReportViewWrapper() {
  const stockTakeReportId = useAppStore((s) => s.stockTakeReportId)
  return <StockTakeReportView stockTakeId={stockTakeReportId || undefined} />
}
