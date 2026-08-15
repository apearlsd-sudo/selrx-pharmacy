'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart3, TrendingUp, Users, AlertTriangle, CreditCard, ArrowLeftRight,
  Download, DollarSign, ShoppingBag, Percent, CalendarDays,
  Zap, RotateCcw, Award, FileText, Package, Clock, Activity, TrendingDown,
  CheckCircle2, Tag, Sun, LayoutGrid, LayoutDashboard, Link2,
  Brain, Flame, Target, Factory, Shield, Grid3x3, ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart,
} from 'recharts'
import { formatCurrency } from '@/lib/currency'
import { formatDateShort } from '@/lib/date-utils'
import { authHeaders } from '@/lib/auth-headers'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { useAppStore } from '@/store/app-store'

// Palette
const COLORS = ['#059669', '#0d9488', '#0891b2', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#65a30d', '#14b8a6']
const COLORS_LIGHT = ['#d1fae5', '#ccfbf1', '#cffafe', '#e0f2fe', '#ede9fe', '#fce7f3', '#ffedd5', '#fef9c3', '#dcfce7', '#ccfbf1']

// Date helpers
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgoLocal(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ChangeIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const isUp = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
      {isUp ? '↑' : '↓'} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color = 'emerald' }: {
  icon: React.ElementType; label: string; value: string; sub?: React.ReactNode; color?: string
}) {
  const bgMap: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', rose: 'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', cyan: 'bg-cyan-50 text-cyan-600',
  }
  return (
    <Card className="border-none shadow-sm card-hover">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
            {sub && <div className="mt-1">{sub}</div>}
          </div>
          <div className={`h-8 w-8 rounded-lg ${bgMap[color] || bgMap.emerald} flex items-center justify-center`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const csv = [headers.join(','), ...data.map(row => headers.map(h => {
    const v = row[h]
    const s = typeof v === 'string' ? v : JSON.stringify(v ?? '')
    return `"${s.replace(/"/g, '""')}"`
  }).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// Quick date presets
const PRESETS = [
  { label: 'Today', from: todayLocal(), to: todayLocal() },
  { label: '7 Days', from: daysAgoLocal(6), to: todayLocal() },
  { label: '30 Days', from: daysAgoLocal(29), to: todayLocal() },
  { label: '90 Days', from: daysAgoLocal(89), to: todayLocal() },
  { label: 'This Month', from: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, to: todayLocal() },
  { label: 'This Year', from: `${new Date().getFullYear()}-01-01`, to: todayLocal() },
]

// Categorized report groups
const REPORT_GROUPS = [
  {
    label: 'Sales & Finance',
    items: [
      { value: 'revenue', label: 'Revenue', icon: TrendingUp },
      { value: 'profit', label: 'Profit', icon: DollarSign },
      { value: 'payments', label: 'Payments', icon: CreditCard },
      { value: 'discount-analysis', label: 'Discounts', icon: Tag },
      { value: 'tax-compliance', label: 'Tax Compliance', icon: Shield },
    ],
  },
  {
    label: 'Customers',
    items: [
      { value: 'customers', label: 'Customers', icon: Users },
      { value: 'customer-segmentation', label: 'Segments', icon: Target },
      { value: 'product-affinity', label: 'Affinity', icon: Link2 },
    ],
  },
  {
    label: 'Inventory & Stock',
    items: [
      { value: 'inventory-valuation', label: 'Stock Value', icon: Package },
      { value: 'stock-velocity', label: 'Stock Velocity', icon: Zap },
      { value: 'category-deep-dive', label: 'Categories', icon: LayoutGrid },
      { value: 'batch-expiry', label: 'Batch Expiry', icon: Flame },
      { value: 'expiry', label: 'Expiry Alerts', icon: AlertTriangle },
      { value: 'stock-take-accuracy', label: 'Stock Accuracy', icon: CheckCircle2 },
    ],
  },
  {
    label: 'Operations & Staff',
    items: [
      { value: 'user-performance', label: 'Staff Performance', icon: Award },
      { value: 'shift-analysis', label: 'Shifts', icon: Sun },
      { value: 'returns-analysis', label: 'Returns', icon: RotateCcw },
      { value: 'prescription-analytics', label: 'Prescriptions', icon: FileText },
    ],
  },
  {
    label: 'Advanced Analytics',
    items: [
      { value: 'executive-summary', label: 'Executive Summary', icon: LayoutDashboard },
      { value: 'comparison', label: 'Period Compare', icon: ArrowLeftRight },
      { value: 'sales-forecast', label: 'Sales Forecast', icon: Brain },
      { value: 'hourly-heatmap', label: 'Hourly Heatmap', icon: Grid3x3 },
      { value: 'manufacturer-performance', label: 'Manufacturers', icon: Factory },
    ],
  },
]

// ========================================================================
// CUSTOM HOVER NAVBAR DROPDOWN
// ========================================================================
function NavbarDropdown({
  group, activeTab, onSelect,
}: {
  group: typeof REPORT_GROUPS[number]; activeTab: string; onSelect: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveGroup = group.items.some((i) => i.value === activeTab)
  const GroupIcon = group.items[0].icon

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpen(true)
  }
  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger */}
      <button
        type="button"
        className={`flex items-center gap-1 h-9 px-2.5 text-[11px] font-medium rounded-none border-b-2 transition-colors whitespace-nowrap shrink-0 ${
          isActiveGroup
            ? 'border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30/50'
            : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:bg-gray-800/50'
        }`}
      >
        <GroupIcon className="h-4 w-4" />
        {group.label}
        <ChevronDown className={`h-3 w-3 ml-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Dropdown — positioned directly beneath the trigger */}
      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-0 w-52 bg-white dark:bg-gray-900 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700 shadow-lg py-1 animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {group.items.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors ${
                activeTab === item.value
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 dark:bg-gray-800/50 hover:text-gray-900 dark:text-gray-100'
              }`}
              onClick={() => {
                onSelect(item.value)
                setOpen(false)
              }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {activeTab === item.value && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ========================================================================
// MAIN COMPONENT
// ========================================================================

export function AdvancedReportsView() {
  const addToast = useAppStore((s) => s.addToast)
  const [activeTab, setActiveTab] = useState('revenue')
  const [from, setFrom] = useState(daysAgoLocal(29))
  const [to, setTo] = useState(todayLocal())
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: activeTab, from, to })
      const res = await fetch(`/api/reports/advanced?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`Server error (${res.status})`)
      const json = await res.json()
      if (json.error) { addToast({ title: 'Report Error', description: json.error, variant: 'destructive' }); return }
      setData(json)
    } catch (err) {
      console.error(err)
      addToast({ title: 'Failed to load report', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [activeTab, from, to])

  useEffect(() => { fetchData() }, [fetchData])

  const applyPreset = (p: { from: string; to: string }) => { setFrom(p.from); setTo(p.to) }

  // Find current report label for display
  const activeReport = REPORT_GROUPS.flatMap((g) => g.items).find((i) => i.value === activeTab)
  const activeGroup = REPORT_GROUPS.find((g) => g.items.some((i) => i.value === activeTab))

  const selectReport = (value: string) => {
    setActiveTab(value)
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <PageHeader icon={BarChart3} title="Advanced Reports" description="Deep analytics and insights"
        action={
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-7 w-[115px] text-xs border rounded-md px-2 bg-white dark:bg-gray-900" />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-7 w-[115px] text-xs border rounded-md px-2 bg-white dark:bg-gray-900" />
            <div className="flex items-center gap-1">
              {PRESETS.map((p) => (
                <Button key={p.label} variant="outline" size="sm" className="h-7 text-[11px] px-2"
                  onClick={() => applyPreset(p)}>{p.label}</Button>
              ))}
            </div>
          </div>
        }
      />

      {/* Navigation Bar */}
      <div className="relative z-10 flex items-center overflow-visible">
          {REPORT_GROUPS.map((group) => (
            <NavbarDropdown
              key={group.label}
              group={group}
              activeTab={activeTab}
              onSelect={selectReport}
            />
          ))}
      </div>

      {/* Active report indicator bar */}
      <Card className="border-none shadow-sm">
        <CardContent className="flex items-center gap-2 px-4 py-2">
          {activeReport && <activeReport.icon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {activeGroup?.label && <span className="text-muted-foreground mr-1.5">{activeGroup.label} /</span>}
            {activeReport?.label || 'Select a report'}</span>
        </CardContent>
      </Card>

      {/* Report Content */}
      {loading ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          {activeTab === 'revenue' && <RevenueTab data={data} />}
          {activeTab === 'profit' && <ProfitTab data={data} />}
          {activeTab === 'customers' && <CustomerTab data={data} />}
          {activeTab === 'expiry' && <ExpiryTab data={data} />}
          {activeTab === 'payments' && <PaymentTab data={data} />}
          {activeTab === 'comparison' && <ComparisonTab data={data} />}
          {activeTab === 'stock-velocity' && <StockVelocityTab data={data} />}
          {activeTab === 'returns-analysis' && <ReturnsAnalysisTab data={data} />}
          {activeTab === 'user-performance' && <UserPerformanceTab data={data} />}
          {activeTab === 'prescription-analytics' && <PrescriptionAnalyticsTab data={data} />}
          {activeTab === 'inventory-valuation' && <InventoryValuationTab data={data} />}
          {activeTab === 'discount-analysis' && <DiscountAnalysisTab data={data} />}
          {activeTab === 'shift-analysis' && <ShiftAnalysisTab data={data} />}
          {activeTab === 'category-deep-dive' && <CategoryDeepDiveTab data={data} />}
          {activeTab === 'executive-summary' && <ExecutiveSummaryTab data={data} />}
          {activeTab === 'product-affinity' && <ProductAffinityTab data={data} />}
          {activeTab === 'sales-forecast' && <SalesForecastTab data={data} />}
          {activeTab === 'customer-segmentation' && <CustomerSegmentationTab data={data} />}
          {activeTab === 'batch-expiry' && <BatchExpiryTab data={data} />}
          {activeTab === 'stock-take-accuracy' && <StockTakeAccuracyTab data={data} />}
          {activeTab === 'manufacturer-performance' && <ManufacturerPerformanceTab data={data} />}
          {activeTab === 'tax-compliance' && <TaxComplianceTab data={data} />}
          {activeTab === 'hourly-heatmap' && <HourlyHeatmapTab data={data} />}
        </div>
      )}
    </div>
  )
}

// ========================================================================
// REVENUE TAB
// ========================================================================

function RevenueTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const daily = (data?.daily as Array<Record<string, unknown>>) || []
  const hourly = (data?.hourly as Array<Record<string, unknown>>) || []
  const dayOfWeek = (data?.dayOfWeek as Array<Record<string, unknown>>) || []
  const topProducts = (data?.topProducts as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={DollarSign} label="Total Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={ShoppingBag} label="Transactions" value={String(s.totalTx || 0)} color="blue" />
        <KpiCard icon={Percent} label="Avg Transaction" value={formatCurrency(Number(s.avgTxValue || 0))} color="violet" />
        <KpiCard icon={TrendingUp} label="Total Discount" value={formatCurrency(Number(s.totalDiscount || 0))} color="amber" />
      </div>

      {/* Daily Revenue Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Daily Revenue Trend</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(daily.map(d => ({ Date: d.day, Revenue: d.revenue, Transactions: d.txCount })), 'revenue-daily.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.3}/><stop offset="95%" stopColor="#059669" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="revenue" stroke="#059669" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Day of Week */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue by Day</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#0891b2" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue by Hour</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}:00`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top Revenue Products</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(topProducts.map(p => ({ Product: p.productName, Qty: p.totalQty, Revenue: p.totalRevenue, Transactions: p.txCount })), 'top-products.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80">
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
              </TableRow></TableHeader>
              <TableBody>{topProducts.slice(0, 10).map((p, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium truncate max-w-[160px]">{String(p.productName)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(p.totalQty)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(p.totalRevenue))}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// PROFIT TAB
// ========================================================================

function ProfitTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const dailyProfit = (data?.dailyProfit as Array<Record<string, unknown>>) || []
  const categoryProfit = (data?.categoryProfit as Array<Record<string, unknown>>) || []
  const productProfit = (data?.productProfit as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={DollarSign} label="Total Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={ShoppingBag} label="Total Cost" value={formatCurrency(Number(s.totalCost || 0))} color="amber" />
        <KpiCard icon={TrendingUp} label="Gross Profit" value={formatCurrency(Number(s.totalProfit || 0))} color="blue" />
        <KpiCard icon={Percent} label="Avg Margin" value={`${Number(s.avgMargin || 0)}%`} color={Number(s.avgMargin || 0) >= 30 ? 'emerald' : Number(s.avgMargin || 0) >= 15 ? 'amber' : 'rose'} />
      </div>

      {/* Revenue vs Cost vs Profit daily */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Profit Trend</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyProfit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cost" fill="#f59e0b" radius={[2, 2, 0, 0]} name="Cost" />
                <Bar dataKey="revenue" fill="#059669" radius={[2, 2, 0, 0]} name="Revenue" />
                <Line type="monotone" dataKey="profit" stroke="#0284c7" strokeWidth={2} dot={false} name="Profit" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category profit */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Profit by Category</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(categoryProfit.map(c => ({ Category: c.category, Revenue: c.totalRevenue, Cost: c.totalCost, Profit: c.profit, Margin: `${c.margin}%` })), 'profit-by-category.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryProfit} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="profit" fill="#059669" radius={[0, 4, 4, 0]} name="Profit" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Product profit table */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Product Profitability</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(productProfit.map(p => ({ Product: p.productName, Category: p.category, Qty: p.totalQty, Revenue: p.totalRevenue, Cost: p.totalCost, Profit: p.profit, Margin: `${p.margin}%` })), 'product-profitability.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Profit</TableHead>
                  <TableHead className="text-xs text-right">Margin</TableHead>
                </TableRow></TableHeader>
                <TableBody>{productProfit.slice(0, 15).map((p, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[120px]">{String(p.productName)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(Number(p.totalRevenue))}</TableCell>
                    <TableCell className={`text-xs text-right font-semibold ${Number(p.profit) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{formatCurrency(Number(p.profit))}</TableCell>
                    <TableCell className="text-xs text-right"><Badge className={`text-[10px] ${Number(p.margin) >= 30 ? 'bg-emerald-100 text-emerald-700' : Number(p.margin) >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{Number(p.margin)}%</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// CUSTOMER TAB
// ========================================================================

function CustomerTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const topCustomers = (data?.topCustomers as Array<Record<string, unknown>>) || []
  const dailyRetention = (data?.dailyRetention as Array<Record<string, unknown>>) || []
  const basketDistribution = (data?.basketDistribution as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={Users} label="Active Customers" value={String(s.totalCustomers || 0)} color="blue" />
        <KpiCard icon={DollarSign} label="Total Spent" value={formatCurrency(Number(s.totalSpent || 0))} color="emerald" />
        <KpiCard icon={ShoppingBag} label="Avg Basket Size" value={formatCurrency(Number(s.avgBasket || 0))} color="violet" />
      </div>

      {/* Retention trend */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">New vs Returning Customers</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRetention}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="newCustomers" stackId="1" stroke="#059669" fill="#d1fae5" name="New" />
                <Area type="monotone" dataKey="returningCustomers" stackId="1" stroke="#0284c7" fill="#e0f2fe" name="Returning" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Basket distribution */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Basket Size Distribution</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="h-52 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={basketDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="txCount" nameKey="range" paddingAngle={2}>
                    {basketDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {basketDistribution.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground w-20">{String(b.range)}</span>
                  <span className="font-semibold">{Number(b.txCount)} txns</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top customers table */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top Customers</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(topCustomers.map(c => ({ Name: c.customerName, Phone: c.customerPhone || '', Transactions: c.txCount, TotalSpent: c.totalSpent, AvgBasket: c.avgBasket })), 'top-customers.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Txns</TableHead>
                  <TableHead className="text-xs text-right">Total Spent</TableHead>
                  <TableHead className="text-xs text-right">Avg Basket</TableHead>
                </TableRow></TableHeader>
                <TableBody>{topCustomers.slice(0, 15).map((c, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs">
                      <p className="font-medium">{String(c.customerName)}</p>
                      {c.customerPhone && <p className="text-muted-foreground">{String(c.customerPhone)}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-right">{Number(c.txCount)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(c.totalSpent))}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(Number(c.avgBasket))}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// EXPIRY TAB
// ========================================================================

function ExpiryTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const buckets = (data?.buckets as Array<Record<string, unknown>>) || []
  const expired = (data?.expired as Array<Record<string, unknown>>) || []

  const bucketChartData = buckets.map((b) => ({ name: String(b.label), value: Number(b.totalValue), count: Number(b.count) }))

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={AlertTriangle} label="At-Risk Value" value={formatCurrency(Number(s.totalAtRisk || 0))} color="amber" />
        <KpiCard icon={AlertTriangle} label="Expired Value" value={formatCurrency(Number(s.totalExpired || 0))} color="rose" />
        <KpiCard icon={DollarSign} label="Total Potential Loss" value={formatCurrency(Number(s.totalLoss || 0))} color={Number(s.totalLoss || 0) > 0 ? 'rose' : 'emerald'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Expiry Risk Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bucketChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={3}>
                    {bucketChartData.map((_, i) => <Cell key={i} fill={['#f59e0b', '#fb923c', '#f87171', '#ef4444'][i] || '#f59e0b'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {buckets.map((b, i) => (
                <div key={i} className="text-xs flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ['#f59e0b', '#fb923c', '#f87171', '#ef4444'][i] }} />
                  <span className="text-muted-foreground">{String(b.label)}: <strong>{Number(b.count)}</strong> items ({formatCurrency(Number(b.totalValue))})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expired items table */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Already Expired</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(expired.map(e => ({ Product: e.productName, Batch: e.batchNumber, Qty: e.quantity, CostPrice: e.costPrice, Value: e.totalValue, ExpiryDate: e.expiryDate })), 'expired-goods.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Batch</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Loss Value</TableHead>
                  <TableHead className="text-xs">Expiry</TableHead>
                </TableRow></TableHeader>
                <TableBody>{expired.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No expired items in stock</TableCell></TableRow>
                ) : expired.map((e, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[140px]">{String(e.productName)}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{String(e.batchNumber)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(e.quantity)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-red-500">{formatCurrency(Number(e.totalValue))}</TableCell>
                    <TableCell className="text-xs text-red-500">{String(e.expiryDate)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiring soon buckets */}
      {buckets.map((bucket, bi) => Number(bucket.count) > 0 && (
        <Card key={bi} className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Expiring in {String(bucket.label)}</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Batch</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Value at Risk</TableHead>
                  <TableHead className="text-xs">Expiry Date</TableHead>
                </TableRow></TableHeader>
                <TableBody>{(bucket.items as Array<Record<string, unknown>>).map((item, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[140px]">{String(item.productName)}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{String(item.batchNumber)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(item.quantity)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(Number(item.totalValue))}</TableCell>
                    <TableCell className="text-xs text-amber-600 dark:text-amber-400">{String(item.expiryDate)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ========================================================================
// PAYMENT TAB
// ========================================================================

function PaymentTab({ data }: { data: Record<string, unknown> | null }) {
  const distribution = (data?.distribution as Array<Record<string, unknown>>) || []
  const daily = (data?.daily as Array<Record<string, unknown>>) || []

  // Pivot daily data for stacked chart
  const methods = [...new Set(daily.map((d) => String(d.method)))]
  const days = [...new Set(daily.map((d) => String(d.day)))].sort()
  const chartData = days.map((day) => {
    const row: Record<string, unknown> = { day }
    methods.forEach((m) => {
      const match = daily.find((d) => String(d.day) === day && String(d.method) === m)
      row[m] = match ? Number(match.totalAmount) : 0
    })
    return row
  })

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Method Distribution</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="h-56 w-56 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="totalAmount" nameKey="method" paddingAngle={2}>
                    {distribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 flex-1">
              {distribution.map((d, i) => {
                const total = distribution.reduce((s, x) => s + Number(x.totalAmount), 0)
                const pct = total > 0 ? Math.round((Number(d.totalAmount) / total) * 100) : 0
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-medium">{String(d.method)}</span>
                      </div>
                      <span className="text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>{Number(d.txCount)} transactions</span>
                      <span className="font-medium">{formatCurrency(Number(d.totalAmount))}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {methods.map((m, i) => (
                    <Bar key={m} dataKey={m} stackId="a" fill={COLORS[i % COLORS.length]} name={m} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// COMPARISON TAB
// ========================================================================

function ComparisonTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const cur = (s.current as Record<string, unknown>) || {}
  const prv = (s.previous as Record<string, unknown>) || {}
  const changes = (s.changes as Record<string, unknown>) || {}
  const dailyComparison = (data?.dailyComparison as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      {/* Comparison KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revenue</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(Number(cur.revenue || 0))}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">vs {formatCurrency(Number(prv.revenue || 0))}</p>
            <ChangeIndicator value={Number(changes.revenue || 0)} />
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transactions</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{Number(cur.txCount || 0)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">vs {Number(prv.txCount || 0)}</p>
            <ChangeIndicator value={Number(changes.txCount || 0)} />
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Transaction</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(Number(cur.avgTxValue || 0))}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">vs {formatCurrency(Number(prv.avgTxValue || 0))}</p>
            <ChangeIndicator value={Number(changes.avgTxValue || 0)} />
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Discounts</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(Number(cur.discount || 0))}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">vs {formatCurrency(Number(prv.discount || 0))}</p>
            <ChangeIndicator value={Number(changes.discount || 0)} />
          </CardContent>
        </Card>
      </div>

      {/* Daily comparison chart */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Daily Comparison — Current vs Previous Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="currentRevenue" fill="#059669" radius={[3, 3, 0, 0]} name="Current" />
                <Bar dataKey="previousRevenue" fill="#e5e7eb" radius={[3, 3, 0, 0]} name="Previous" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Period detail table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Period Details</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80">
              <TableHead className="text-xs">Metric</TableHead>
              <TableHead className="text-xs text-right">Current Period</TableHead>
              <TableHead className="text-xs text-right">Previous Period</TableHead>
              <TableHead className="text-xs text-right">Change</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {[
                { label: 'Total Revenue', cur: cur.revenue, prv: prv.revenue, chg: changes.revenue },
                { label: 'Transactions', cur: cur.txCount, prv: prv.txCount, chg: changes.txCount },
                { label: 'Avg Transaction Value', cur: cur.avgTxValue, prv: prv.avgTxValue, chg: changes.avgTxValue },
                { label: 'Total Discounts', cur: cur.discount, prv: prv.discount, chg: changes.discount },
              ].map((row, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium">{row.label}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{typeof row.cur === 'number' && row.label.includes('Revenue') || row.label.includes('Discount') || row.label.includes('Avg') ? formatCurrency(Number(row.cur)) : String(row.cur)}</TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">{typeof row.prv === 'number' && (row.label.includes('Revenue') || row.label.includes('Discount') || row.label.includes('Avg')) ? formatCurrency(Number(row.prv)) : String(row.prv)}</TableCell>
                  <TableCell className="text-xs text-right"><ChangeIndicator value={Number(row.chg || 0)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ========================================================================
// STOCK VELOCITY TAB
// ========================================================================

function StockVelocityTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const products = (data?.products as Array<Record<string, unknown>>) || []
  const velocityDistribution = (data?.velocityDistribution as Array<Record<string, unknown>>) || []

  const velocityColor = (v: string) => {
    if (v === 'Fast') return 'bg-emerald-100 text-emerald-700'
    if (v === 'Moderate') return 'bg-blue-100 text-blue-700'
    if (v === 'Slow') return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Products Tracked" value={String(s.totalProducts || 0)} color="blue" />
        <KpiCard icon={Zap} label="Fast Moving" value={String(s.fastMoving || 0)} color="emerald" />
        <KpiCard icon={TrendingDown} label="Slow Moving" value={String(s.slowMoving || 0)} color="amber" />
        <KpiCard icon={AlertTriangle} label="Dead Stock" value={String(s.deadStock || 0)} color="rose" />
        <KpiCard icon={Clock} label="Avg Days to Sell" value={`${s.avgDaysToSell || 0}d`} color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Velocity Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={velocityDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="velocity" paddingAngle={2}>
                    {velocityDistribution.map((entry, i) => <Cell key={i} fill={String(entry.color)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Product Velocity Detail</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(products.map(p => ({ Product: p.productName, Category: p.category, Sold: p.totalSold, Revenue: p.totalRevenue, DailyRate: p.dailyRate, Stock: p.currentStock, DaysOfStock: p.daysOfStock, Velocity: p.velocity })), 'stock-velocity.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Sold</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Daily Rate</TableHead>
                  <TableHead className="text-xs text-right">In Stock</TableHead>
                  <TableHead className="text-xs text-right">Days Left</TableHead>
                  <TableHead className="text-xs">Velocity</TableHead>
                </TableRow></TableHeader>
                <TableBody>{products.slice(0, 30).map((p, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[140px]">{String(p.productName)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{String(p.category)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(p.totalSold)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(p.totalRevenue))}</TableCell>
                    <TableCell className="text-xs text-right">{Number(p.dailyRate)}/day</TableCell>
                    <TableCell className="text-xs text-right">{Number(p.currentStock)}</TableCell>
                    <TableCell className="text-xs text-right">
                      <span className={Number(p.daysOfStock) < 14 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                        {Number(p.daysOfStock) >= 999 ? '∞' : `${Number(p.daysOfStock)}d`}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${velocityColor(String(p.velocity))}`}>{String(p.velocity)}</Badge></TableCell>
                  </TableRow>
                ))}{products.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No sales data for this period</TableCell></TableRow>}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// RETURNS ANALYSIS TAB
// ========================================================================

function ReturnsAnalysisTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const byReason = (data?.byReason as Array<Record<string, unknown>>) || []
  const dailyTrend = (data?.dailyTrend as Array<Record<string, unknown>>) || []
  const topProducts = (data?.topProducts as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={RotateCcw} label="Total Returns" value={String(s.totalReturns || 0)} color="amber" />
        <KpiCard icon={DollarSign} label="Total Refunded" value={formatCurrency(Number(s.totalRefundAmount || 0))} color="rose" />
        <KpiCard icon={Percent} label="Return Rate" value={`${s.returnRate || 0}%`} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Returns by Reason</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="h-52 w-52 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byReason} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="returnCount" nameKey="reason" paddingAngle={2}>
                    {byReason.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1">
              {byReason.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-medium">{String(r.reason)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{Number(r.returnCount)} items</span>
                    <span className="font-semibold text-rose-600">{formatCurrency(Number(r.totalRefund))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Return Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend}>
                  <defs><linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="returnCount" fill="#f87171" radius={[3, 3, 0, 0]} name="Returns" />
                  <Line type="monotone" dataKey="totalRefund" stroke="#ef4444" strokeWidth={2} name="Refund Amount" yAxisId={0} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Most Returned Products</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(topProducts.map(p => ({ Product: p.productName, ReturnCount: p.returnCount, QtyReturned: p.totalQtyReturned, TotalRefund: p.totalRefund })), 'returns-products.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs text-right">Returns</TableHead>
                <TableHead className="text-xs text-right">Qty Returned</TableHead>
                <TableHead className="text-xs text-right">Total Refund</TableHead>
              </TableRow></TableHeader>
              <TableBody>{topProducts.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No returns in this period</TableCell></TableRow>
              ) : topProducts.map((p, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium truncate max-w-[180px]">{String(p.productName)}</TableCell>
                  <TableCell className="text-xs text-right"><Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50">{Number(p.returnCount)}</Badge></TableCell>
                  <TableCell className="text-xs text-right">{Number(p.totalQtyReturned)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold text-rose-600">{formatCurrency(Number(p.totalRefund))}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ========================================================================
// USER PERFORMANCE TAB
// ========================================================================

function UserPerformanceTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const users = (data?.users as Array<Record<string, unknown>>) || []

  const topPerformer = s.topPerformer as Record<string, unknown> | null

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={Users} label="Total Staff" value={String(s.totalUsers || 0)} color="blue" />
        <KpiCard icon={Activity} label="Active Staff" value={String(s.activeUsers || 0)} color="emerald" />
        <KpiCard icon={DollarSign} label="Avg Sales/User" value={formatCurrency(Number(s.avgSalesPerUser || 0))} color="violet" />
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Performer</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{topPerformer ? String(topPerformer.name) : 'N/A'}</p>
            {topPerformer && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">{formatCurrency(Number(topPerformer.sales))}</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Staff Performance Breakdown</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(users.map(u => ({ Name: u.userName, Role: u.role, Transactions: u.txCount, TotalSales: u.totalSales, AvgTransaction: u.avgTransaction, ItemsSold: u.totalItems, DiscountRate: `${u.discountRate}%`, VoidRate: `${u.voidRate}%` })), 'staff-performance.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                <TableHead className="text-xs">Staff</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs text-right">Transactions</TableHead>
                <TableHead className="text-xs text-right">Total Sales</TableHead>
                <TableHead className="text-xs text-right">Avg Transaction</TableHead>
                <TableHead className="text-xs text-right">Items Sold</TableHead>
                <TableHead className="text-xs text-right">Discount Rate</TableHead>
                <TableHead className="text-xs text-right">Void Rate</TableHead>
              </TableRow></TableHeader>
              <TableBody>{users.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No data</TableCell></TableRow>
              ) : users.map((u, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium">{String(u.userName)}</TableCell>
                  <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{String(u.role).replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="text-xs text-right font-medium">{Number(u.txCount)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(u.totalSales))}</TableCell>
                  <TableCell className="text-xs text-right">{formatCurrency(Number(u.avgTransaction))}</TableCell>
                  <TableCell className="text-xs text-right">{Number(u.totalItems)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <span className={Number(u.discountRate) > 5 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}>{Number(u.discountRate)}%</span>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <span className={Number(u.voidRate) > 3 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}>{Number(u.voidRate)}%</span>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ========================================================================
// PRESCRIPTION ANALYTICS TAB
// ========================================================================

function PrescriptionAnalyticsTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const byStatus = (data?.byStatus as Array<Record<string, unknown>>) || []
  const byPrescriber = (data?.byPrescriber as Array<Record<string, unknown>>) || []
  const dailyTrend = (data?.dailyTrend as Array<Record<string, unknown>>) || []

  const statusColors: Record<string, string> = {
    'PENDING': '#ca8a04', 'IN PROGRESS': '#0891b2', 'READY': '#7c3aed',
    'DISPENSED': '#059669', 'EXPIRED': '#dc2626', 'CANCELLED': '#9ca3af',
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={FileText} label="Total Prescriptions" value={String(s.totalRx || 0)} color="blue" />
        <KpiCard icon={CheckCircle2} label="Filled" value={String(s.filled || 0)} color="emerald" />
        <KpiCard icon={Clock} label="Pending" value={String(s.pending || 0)} color="amber" />
        <KpiCard icon={Activity} label="Avg Fulfillment" value={`${s.avgFulfillmentHours || 0}h`} color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Rx Status Breakdown</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="h-52 w-52 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="count" nameKey="status" paddingAngle={2}>
                    {byStatus.map((entry) => <Cell key={String(entry.status)} fill={statusColors[String(entry.status)] || '#9ca3af'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1">
              {byStatus.map((b) => (
                <div key={String(b.status)} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[String(b.status)] || '#9ca3af' }} />
                    <span className="font-medium">{String(b.status)}</span>
                  </div>
                  <span className="font-semibold">{Number(b.count)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Prescription Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" fill="#0891b2" radius={[3, 3, 0, 0]} name="Total Rx" />
                  <Bar dataKey="dispensed" fill="#059669" radius={[3, 3, 0, 0]} name="Dispensed" />
                  <Line type="monotone" dataKey="pending" stroke="#ca8a04" strokeWidth={2} name="Pending" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Top Prescribers</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(byPrescriber.map(p => ({ Prescriber: p.prescriberName, RxCount: p.rxCount, UniquePatients: p.uniquePatients, FirstRx: p.firstRx, LastRx: p.lastRx })), 'prescribers.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                <TableHead className="text-xs">Prescriber</TableHead>
                <TableHead className="text-xs text-right">Prescriptions</TableHead>
                <TableHead className="text-xs text-right">Unique Patients</TableHead>
                <TableHead className="text-xs">First Rx</TableHead>
                <TableHead className="text-xs">Last Rx</TableHead>
              </TableRow></TableHeader>
              <TableBody>{byPrescriber.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No prescriptions in this period</TableCell></TableRow>
              ) : byPrescriber.map((p, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium">{String(p.prescriberName)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{Number(p.rxCount)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(p.uniquePatients)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{String(p.firstRx)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{String(p.lastRx)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ========================================================================
// INVENTORY VALUATION TAB
// ========================================================================

function InventoryValuationTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const byCategory = (data?.byCategory as Array<Record<string, unknown>>) || []
  const lowValueItems = (data?.lowValueItems as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Total Products" value={String(s.totalProducts || 0)} color="blue" />
        <KpiCard icon={ShoppingBag} label="Products in Stock" value={String(s.stockedProducts || 0)} color="emerald" />
        <KpiCard icon={TrendingUp} label="Total Units" value={String(s.totalUnits || 0)} color="cyan" />
        <KpiCard icon={DollarSign} label="Cost Value" value={formatCurrency(Number(s.totalCostValue || 0))} color="amber" />
        <KpiCard icon={TrendingUp} label="Retail Value" value={formatCurrency(Number(s.totalRetailValue || 0))} color="violet" />
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Potential Profit</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(s.potentialProfit || 0))}</p>
              <p className="text-xs text-muted-foreground mt-1">If all stock sold at retail price</p>
            </div>
            <div className="flex-1">
              <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                <div className="bg-emerald-50 dark:bg-emerald-900/300 h-full" style={{ width: `${Number(s.totalRetailValue || 0) > 0 ? Math.min(100, ((Number(s.totalRetailValue) - Number(s.totalCostValue)) / Number(s.totalRetailValue)) * 100) : 0}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Cost: {formatCurrency(Number(s.totalCostValue || 0))}</span>
                <span>Retail: {formatCurrency(Number(s.totalRetailValue || 0))}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Valuation by Category</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(byCategory.map(c => ({ Category: c.category, Products: c.productCount, Units: c.totalUnits, CostValue: c.costValue, RetailValue: c.retailValue, PotentialProfit: c.potentialProfit, Margin: `${c.margin}%` })), 'inventory-valuation.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(Number(v))} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="costValue" fill="#fbbf24" name="Cost Value" />
                  <Bar dataKey="retailValue" fill="#059669" name="Retail Value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Below Reorder Point</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Stock</TableHead>
                  <TableHead className="text-xs text-right">Reorder At</TableHead>
                  <TableHead className="text-xs text-right">Deficit</TableHead>
                  <TableHead className="text-xs text-right">Retail Value</TableHead>
                </TableRow></TableHeader>
                <TableBody>{lowValueItems.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">All stocked items above reorder point</TableCell></TableRow>
                ) : lowValueItems.map((item, i) => {
                  const deficit = Number(item.reorderPoint) - Number(item.stockQty)
                  return (
                    <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                      <TableCell className="text-xs font-medium truncate max-w-[120px]">{String(item.productName)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{String(item.category)}</TableCell>
                      <TableCell className="text-xs text-right text-red-600 dark:text-red-400 font-medium">{Number(item.stockQty)}</TableCell>
                      <TableCell className="text-xs text-right">{Number(item.reorderPoint)}</TableCell>
                      <TableCell className="text-xs text-right text-red-600 dark:text-red-400 font-semibold">-{deficit}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(Number(item.retailValue))}</TableCell>
                    </TableRow>
                  )
                })}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// DISCOUNT ANALYSIS TAB
// ========================================================================

function DiscountAnalysisTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const byUser = (data?.byUser as Array<Record<string, unknown>>) || []
  const dailyTrend = (data?.dailyTrend as Array<Record<string, unknown>>) || []
  const discountDistribution = (data?.discountDistribution as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={Tag} label="Total Discounts" value={formatCurrency(Number(s.totalDiscount || 0))} color="amber" />
        <KpiCard icon={Percent} label="Discount Rate" value={`${s.discountRate || 0}%`} color="blue" />
        <KpiCard icon={DollarSign} label="Avg Discount/Tx" value={formatCurrency(Number(s.avgDiscountPerTx || 0))} color="violet" />
        <KpiCard icon={ShoppingBag} label="Tx with Discount" value={String(s.txWithDiscount || 0)} color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Discount Trend vs Revenue</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="totalRevenue" fill="#e5e7eb" radius={[3, 3, 0, 0]} name="Revenue" />
                  <Line type="monotone" dataKey="totalDiscount" stroke="#f59e0b" strokeWidth={2} name="Discount" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Discount Size Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={discountDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="txCount" radius={[4, 4, 0, 0]} name="Transactions">
                    {discountDistribution.map((_, i) => <Cell key={i} fill={i === 0 ? '#e5e7eb' : COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Discounts by Staff Member</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(byUser.map(u => ({ Name: u.userName, Transactions: u.txCount, DiscountedTx: u.discountedTx, TotalDiscount: u.totalDiscount, TotalSales: u.totalSales, DiscountPctOfSales: `${u.discountPctOfSales}%`, DiscountTxRate: `${u.discountTxRate}%` })), 'discount-analysis.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                <TableHead className="text-xs">Staff</TableHead>
                <TableHead className="text-xs text-right">Transactions</TableHead>
                <TableHead className="text-xs text-right">Discounted Tx</TableHead>
                <TableHead className="text-xs text-right">Total Discount</TableHead>
                <TableHead className="text-xs text-right">% of Sales</TableHead>
                <TableHead className="text-xs text-right">Tx Discount Rate</TableHead>
              </TableRow></TableHeader>
              <TableBody>{byUser.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No discount data</TableCell></TableRow>
              ) : byUser.map((u, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium">{String(u.userName)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(u.txCount)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(u.discountedTx)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(Number(u.totalDiscount))}</TableCell>
                  <TableCell className="text-xs text-right">
                    <span className={Number(u.discountPctOfSales) > 5 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>{Number(u.discountPctOfSales)}%</span>
                  </TableCell>
                  <TableCell className="text-xs text-right">{Number(u.discountTxRate)}%</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ========================================================================
// SHIFT ANALYSIS TAB
// ========================================================================

function ShiftAnalysisTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const shifts = (data?.shifts as Array<Record<string, unknown>>) || []
  const hourlyComparison = (data?.hourlyComparison as Array<Record<string, unknown>>) || []
  const dowShiftData = (data?.dowShiftData as Array<Record<string, unknown>>) || []

  const shiftColors: Record<string, string> = { Morning: '#fbbf24', Afternoon: '#059669', Evening: '#7c3aed' }
  const days = [...new Set(dowShiftData.map((d) => String(d.day)))]
  const shiftNames = ['Morning', 'Afternoon', 'Evening']
  const dowChartData = days.map((day) => {
    const row: Record<string, unknown> = { day }
    shiftNames.forEach((sh) => {
      const match = dowShiftData.find((d) => String(d.day) === day && String(d.shift) === sh)
      row[sh] = match ? Number(match.totalRevenue) : 0
    })
    return row
  })

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={DollarSign} label="Total Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={ShoppingBag} label="Total Transactions" value={String(s.totalTx || 0)} color="blue" />
        <KpiCard icon={TrendingUp} label="Avg Transaction" value={formatCurrency(Number(s.avgTxValue || 0))} color="violet" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {shifts.map((sh, i) => (
          <Card key={i} className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: shiftColors[String(sh.shift)] || '#9ca3af' }} />
                <p className="text-sm font-semibold">{String(sh.shift)} Shift</p>
              </div>
              <p className="text-xl font-bold">{formatCurrency(Number(sh.totalRevenue))}</p>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{Number(sh.txCount)} txns</span>
                <span>Avg {formatCurrency(Number(sh.avgTxValue))}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Hourly Revenue Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="totalRevenue" radius={[3, 3, 0, 0]} name="Revenue">
                    {hourlyComparison.map((h) => <Cell key={String(h.hour)} fill={shiftColors[String(h.shift)] || '#9ca3af'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2">
              {shiftNames.map((sh) => (
                <div key={sh} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: shiftColors[sh] }} />
                  <span>{sh}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Day of Week by Shift</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dowChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {shiftNames.map((sh) => (
                    <Bar key={sh} dataKey={sh} fill={shiftColors[sh]} name={sh} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// CATEGORY DEEP DIVE TAB
// ========================================================================

function CategoryDeepDiveTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const categories = (data?.categories as Array<Record<string, unknown>>) || []
  const topProductsByCategory = (data?.topProductsByCategory as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={LayoutGrid} label="Categories" value={String(s.totalCategories || 0)} color="blue" />
        <KpiCard icon={TrendingUp} label="Top Category" value={String((s.topCategory as Record<string, unknown>)?.name || 'N/A')} color="emerald" />
        <KpiCard icon={DollarSign} label="Top Category Revenue" value={formatCurrency(Number((s.topCategory as Record<string, unknown>)?.revenue || 0))} color="violet" />
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Category Performance</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(categories.map(c => ({ Category: c.category, Products: c.productCount, UnitsSold: c.totalQty, Revenue: c.totalRevenue, Transactions: c.txCount, AvgUnitPrice: c.avgUnitPrice, RevenueShare: `${c.revenueShare}%` })), 'category-deep-dive.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Products</TableHead>
                  <TableHead className="text-xs text-right">Units Sold</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Transactions</TableHead>
                  <TableHead className="text-xs text-right">Avg Unit Price</TableHead>
                  <TableHead className="text-xs text-right">Share</TableHead>
                </TableRow></TableHeader>
                <TableBody>{categories.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No data</TableCell></TableRow>
                ) : categories.map((c, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium">{String(c.category)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.productCount)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.totalQty)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(c.totalRevenue))}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.txCount)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(Number(c.avgUnitPrice))}</TableCell>
                    <TableCell className="text-xs text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="w-12 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/300" style={{ width: `${Math.min(100, Number(c.revenueShare))}%` }} />
                        </div>
                        <span className="w-10 text-right">{Number(c.revenueShare)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

      {topProductsByCategory.map((catGroup, i) => (
        <Card key={i} className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top Products: {String(catGroup.category)}</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Qty Sold</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Transactions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{(catGroup.products as Array<Record<string, unknown>>).map((p, j) => (
                  <TableRow key={j} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[160px]">{String(p.productName)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(p.totalQty)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(p.totalRevenue))}</TableCell>
                    <TableCell className="text-xs text-right">{Number(p.txCount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ========================================================================
// EXECUTIVE SUMMARY TAB
// ========================================================================

function ExecutiveSummaryTab({ data }: { data: Record<string, unknown> | null }) {
  const kpis = (data?.kpis as Record<string, unknown>) || {}
  const alerts = (data?.alerts as Array<Record<string, unknown>>) || []

  const alertIcon = (type: string) => {
    if (type === 'danger') return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
    if (type === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
    return <Activity className="h-3.5 w-3.5 text-blue-500" />
  }
  const alertBg = (type: string) => {
    if (type === 'danger') return 'bg-red-50 dark:bg-red-900/30 border-red-100'
    if (type === 'warning') return 'bg-amber-50 dark:bg-amber-900/30 border-amber-100'
    return 'bg-blue-50 dark:bg-blue-900/30 border-blue-100'
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={DollarSign} label="Period Revenue" value={formatCurrency(Number(kpis.revenue || 0))} color="emerald" />
        <KpiCard icon={ShoppingBag} label="Transactions" value={String(kpis.completedTx || 0)} color="blue" />
        <KpiCard icon={TrendingUp} label="Avg Transaction" value={formatCurrency(Number(kpis.avgTxValue || 0))} color="violet" />
        <KpiCard icon={Percent} label="Void Rate" value={`${kpis.voidRate || 0}%`} color={Number(kpis.voidRate || 0) > 3 ? 'rose' : 'cyan'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={CalendarDays} label="Today Revenue" value={formatCurrency(Number(kpis.todayRevenue || 0))} color="emerald" />
        <KpiCard icon={ShoppingBag} label="Today Txns" value={String(kpis.todayTx || 0)} color="blue" />
        <KpiCard icon={Package} label="Low Stock Items" value={String(kpis.lowStockCount || 0)} color="amber" />
        <KpiCard icon={FileText} label="Pending Rx" value={String(kpis.pendingRx || 0)} color="violet" />
      </div>

      {alerts.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Alerts & Action Items</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${alertBg(String(a.type))}`}>
                  {alertIcon(String(a.type))}
                  <span className="text-xs font-medium">{String(a.message)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Discounts Given</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">{formatCurrency(Number(kpis.totalDiscount || 0))}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Returns</p>
            <p className="text-lg font-bold text-rose-600 mt-1">{String(kpis.totalReturns || 0)}</p>
            <p className="text-[10px] text-muted-foreground">Refunded: {formatCurrency(Number(kpis.totalRefund || 0))}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Pending Returns</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">{String(kpis.pendingReturns || 0)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// PRODUCT AFFINITY TAB
// ========================================================================

function ProductAffinityTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const pairs = (data?.pairs as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <KpiCard icon={Link2} label="Product Pairs Found" value={String(s.totalPairs || 0)} color="blue" />

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Frequently Bought Together</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(pairs.map(p => ({ ProductA: p.productA, ProductB: p.productB, CoOccurrence: p.coOccurrence })), 'product-affinity.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pairs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Not enough multi-item transactions in this period</p>
              <p className="text-xs mt-1">Product affinity requires transactions with 2 or more items</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">Product A</TableHead>
                  <TableHead className="text-xs">Product B</TableHead>
                  <TableHead className="text-xs text-right">Times Bought Together</TableHead>
                  <TableHead className="text-xs">Frequency</TableHead>
                </TableRow></TableHeader>
                <TableBody>{pairs.map((p, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium truncate max-w-[160px]">{String(p.productA)}</TableCell>
                    <TableCell className="text-xs font-medium truncate max-w-[160px]">{String(p.productB)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{Number(p.coOccurrence)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/300" style={{ width: `${Math.min(100, (Number(p.coOccurrence) / (Number(pairs[0]?.coOccurrence || 1))) * 100)}%` }} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ========================================================================
// SALES FORECAST TAB
// ========================================================================

function SalesForecastTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const historical = (data?.historical as Array<Record<string, unknown>>) || []
  const forecast = (data?.forecast as Array<Record<string, unknown>>) || []
  const dayOfWeekAvg = (data?.dayOfWeekAvg as Array<Record<string, unknown>>) || []

  const trendColor = String(s.trendDirection) === 'Growing' ? 'text-emerald-600 dark:text-emerald-400' : String(s.trendDirection) === 'Declining' ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
  const trendIcon = String(s.trendDirection) === 'Growing' ? '\u2191' : String(s.trendDirection) === 'Declining' ? '\u2193' : '\u2192'

  // Combine historical + forecast for continuous chart
  const combinedData = [
    ...historical.map(h => ({ day: String(h.day), actual: Number(h.revenue), movingAvg: Number(h.movingAvg), forecast: null, lower: null, upper: null })),
    ...forecast.map(f => ({ day: String(f.day), actual: null, movingAvg: null, forecast: Number(f.forecast), lower: Number(f.lower), upper: Number(f.upper) })),
  ]

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} label="Period Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={TrendingUp} label="Avg Daily" value={formatCurrency(Number(s.avgDailyRevenue || 0))} color="blue" />
        <KpiCard icon={Activity} label="Trend" value={String(s.trendDirection || 'N/A')} color={String(s.trendDirection) === 'Growing' ? 'emerald' : String(s.trendDirection) === 'Declining' ? 'rose' : 'amber'}
          sub={<span className={`text-xs font-semibold ${trendColor}`}>{trendIcon} Slope: {Number(s.trendSlope || 0).toFixed(2)}/day</span>} />
        <KpiCard icon={Brain} label="14-Day Forecast" value={formatCurrency(Number(s.forecast14Day || 0))} color="violet" />
        <KpiCard icon={CalendarDays} label="Data Points" value={String(historical.length)} color="cyan" />
      </div>

      {/* Forecast Chart */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Revenue Forecast (14-Day Projection with 95% CI)</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(combinedData.map(d => ({ Date: d.day, Actual: d.actual, MovingAvg: d.movingAvg, Forecast: d.forecast, Lower: d.lower, Upper: d.upper })), 'sales-forecast.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedData}>
                <defs>
                  <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="upper" stroke="none" fill="url(#ciGrad)" name="Upper Bound" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#ffffff" name="Lower Bound" />
                <Line type="monotone" dataKey="actual" stroke="#059669" strokeWidth={2} dot={false} name="Actual Revenue" />
                <Line type="monotone" dataKey="movingAvg" stroke="#0891b2" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="7-Day Moving Avg" />
                <Line type="monotone" dataKey="forecast" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Forecast" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Day-of-Week Pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Day-of-Week Pattern</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeekAvg}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="avgRevenue" fill="#0891b2" radius={[4, 4, 0, 0]} name="Avg Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Forecast Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Forecast</TableHead>
                  <TableHead className="text-xs text-right">Lower</TableHead>
                  <TableHead className="text-xs text-right">Upper</TableHead>
                </TableRow></TableHeader>
                <TableBody>{forecast.map((f, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium">{String(f.day).slice(5)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-violet-600 dark:text-violet-400">{formatCurrency(Number(f.forecast))}</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">{formatCurrency(Number(f.lower))}</TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">{formatCurrency(Number(f.upper))}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// CUSTOMER SEGMENTATION TAB
// ========================================================================

const SEGMENT_COLORS: Record<string, string> = {
  Champions: '#059669', Loyal: '#0891b2', 'Big Spenders': '#7c3aed',
  'At Risk': '#ea580c', Lost: '#dc2626', 'Potential Loyalists': '#0284c7', 'New Customers': '#65a30d',
}
const SEGMENT_BG: Record<string, string> = {
  Champions: 'bg-emerald-100 text-emerald-700', Loyal: 'bg-cyan-100 text-cyan-700', 'Big Spenders': 'bg-violet-100 text-violet-700',
  'At Risk': 'bg-orange-100 text-orange-700', Lost: 'bg-red-100 text-red-700', 'Potential Loyalists': 'bg-blue-100 text-blue-700', 'New Customers': 'bg-lime-100 text-lime-700',
}

function CustomerSegmentationTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const segmentDistribution = (data?.segmentDistribution as Array<Record<string, unknown>>) || []
  const customers = (data?.customers as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={Users} label="Customers" value={String(s.totalCustomers || 0)} color="emerald" />
        <KpiCard icon={DollarSign} label="Total Spend" value={formatCurrency(Number(s.totalSpend || 0))} color="blue" />
        <KpiCard icon={ShoppingBag} label="Avg Spend" value={formatCurrency(Number(s.avgSpend || 0))} color="violet" />
        <KpiCard icon={Target} label="Segments" value={String(s.segmentsCount || 0)} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Segment Pie + Legend */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Segment Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={segmentDistribution} dataKey="count" nameKey="segment" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}
                    stroke="none">
                    {segmentDistribution.map((entry, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[String(entry.segment)] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {segmentDistribution.map((seg, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEGMENT_COLORS[String(seg.segment)] || COLORS[i % COLORS.length] }} />
                  <span className="text-[11px] text-muted-foreground truncate">{String(seg.segment)} ({Number(seg.count)})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Customer Table */}
        <Card className="border-none shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">RFM Customer Segments</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(customers.map(c => ({ Name: c.customerName, Phone: c.customerPhone, Frequency: c.frequency, Spend: c.monetary, RecencyDays: c.recencyDays, Segment: c.segment })), 'customer-segments.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Visits</TableHead>
                  <TableHead className="text-xs text-right">Total Spend</TableHead>
                  <TableHead className="text-xs text-right">Days Ago</TableHead>
                  <TableHead className="text-xs">Segment</TableHead>
                </TableRow></TableHeader>
                <TableBody>{customers.map((c, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{String(c.customerName)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.frequency)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(c.monetary))}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.recencyDays)}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SEGMENT_BG[String(c.segment)] || ''}`}>
                        {String(c.segment)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// BATCH EXPIRY TAB
// ========================================================================

const BUCKET_COLORS: Record<string, string> = {
  Expired: '#dc2626', '0-30 Days': '#ea580c', '31-90 Days': '#ca8a04',
  '91-180 Days': '#0284c7', '181-365 Days': '#059669', '365+ Days': '#65a30d',
}

function BatchExpiryTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const expiryBuckets = (data?.expiryBuckets as Array<Record<string, unknown>>) || []
  const atRiskProducts = (data?.atRiskProducts as Array<Record<string, unknown>>) || []
  const batchDiversity = (data?.batchDiversity as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Total Batches" value={String(s.totalBatches || 0)} color="blue" />
        <KpiCard icon={ShoppingBag} label="Total Units" value={String(Number(s.totalUnits || 0).toLocaleString())} color="emerald" />
        <KpiCard icon={DollarSign} label="Cost Value" value={formatCurrency(Number(s.totalCostValue || 0))} color="violet" />
        <KpiCard icon={AlertTriangle} label="Expired Batches" value={String(s.expiredCount || 0)} color="rose" />
        <KpiCard icon={Flame} label="At-Risk (30d) Cost" value={formatCurrency(Number(s.atRisk30DayCost || 0))} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Expiry Bucket Pie */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Expiry Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expiryBuckets} dataKey="batchCount" nameKey="bucket" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} stroke="none">
                    {expiryBuckets.map((entry, i) => (
                      <Cell key={i} fill={BUCKET_COLORS[String(entry.bucket)] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {expiryBuckets.map((b, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: BUCKET_COLORS[String(b.bucket)] || COLORS[i % COLORS.length] }} />
                  <span className="text-[11px] text-muted-foreground truncate">{String(b.bucket)} ({Number(b.batchCount)})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* At-Risk Products Table */}
        <Card className="border-none shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Products Expiring Within 90 Days</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(atRiskProducts.map(p => ({ Product: p.productName, Category: p.category, Expiry: p.expiryDate, Quantity: p.quantity, CostPrice: p.costPrice, AtRiskValue: p.atRiskValue, Batch: p.batchNumber })), 'batch-expiry-atrisk.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Expiry Date</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">At-Risk Value</TableHead>
                  <TableHead className="text-xs">Batch</TableHead>
                </TableRow></TableHeader>
                <TableBody>{atRiskProducts.map((p, i) => {
                  const isExpired = new Date(String(p.expiryDate)) < new Date()
                  return (
                    <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                      <TableCell className="text-xs font-medium truncate max-w-[140px]">{String(p.productName)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{String(p.category)}</TableCell>
                      <TableCell className="text-xs">
                        <span className={isExpired ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}>{String(p.expiryDate).slice(5)}</span>
                      </TableCell>
                      <TableCell className="text-xs text-right">{Number(p.quantity)}</TableCell>
                      <TableCell className="text-xs text-right font-semibold text-rose-600">{formatCurrency(Number(p.atRiskValue))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{String(p.batchNumber)}</TableCell>
                    </TableRow>
                  )
                })}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch Diversity Table */}
      {batchDiversity.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Products with Multiple Batches (FEFO Priority)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Batches</TableHead>
                  <TableHead className="text-xs text-right">Total Units</TableHead>
                  <TableHead className="text-xs">Nearest Expiry</TableHead>
                  <TableHead className="text-xs">Furthest Expiry</TableHead>
                  <TableHead className="text-xs text-right">Total Cost</TableHead>
                </TableRow></TableHeader>
                <TableBody>{batchDiversity.map((b, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium">{String(b.productName)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{Number(b.batchCount)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(b.totalUnits)}</TableCell>
                    <TableCell className="text-xs text-amber-600 dark:text-amber-400">{String(b.nearestExpiry).slice(5)}</TableCell>
                    <TableCell className="text-xs text-emerald-600 dark:text-emerald-400">{String(b.furthestExpiry).slice(5)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(Number(b.totalCost))}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ========================================================================
// STOCK TAKE ACCURACY TAB
// ========================================================================

function StockTakeAccuracyTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const trendData = (data?.trendData as Array<Record<string, unknown>>) || []
  const discrepancies = (data?.discrepancies as Array<Record<string, unknown>>) || []
  const categoryAccuracy = (data?.categoryAccuracy as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={CheckCircle2} label="Stock Takes" value={String(s.totalStockTakes || 0)} color="blue" />
        <KpiCard icon={Target} label="Overall Accuracy" value={`${Number(s.overallAccuracy || 0).toFixed(1)}%`} color={Number(s.overallAccuracy || 0) >= 95 ? 'emerald' : Number(s.overallAccuracy || 0) >= 80 ? 'amber' : 'rose'} />
        <KpiCard icon={ShoppingBag} label="Items Counted" value={String(Number(s.totalItemsCounted || 0).toLocaleString())} color="violet" />
        <KpiCard icon={AlertTriangle} label="Discrepancies" value={String(s.totalDiscrepancies || 0)} color="rose" />
      </div>

      {/* Accuracy Trend */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Accuracy Trend by Stock Take</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="accuracy" stroke="#059669" strokeWidth={2} dot={{ r: 4, fill: '#059669' }} name="Accuracy %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Accuracy */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Accuracy by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryAccuracy} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="accuracy" fill="#0891b2" radius={[0, 4, 4, 0]} name="Accuracy %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Biggest Discrepancies */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Biggest Discrepancies</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(discrepancies.map(d => ({ Product: d.productName, Category: d.category, SystemQty: d.systemQty, CountedQty: d.countedQty, Variance: d.variance, StockTake: d.stockTakeRef })), 'stock-take-discrepancies.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">System</TableHead>
                  <TableHead className="text-xs text-right">Counted</TableHead>
                  <TableHead className="text-xs text-right">Variance</TableHead>
                  <TableHead className="text-xs">Ref</TableHead>
                </TableRow></TableHeader>
                <TableBody>{discrepancies.slice(0, 15).map((d, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[120px]">{String(d.productName)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(d.systemQty)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(d.countedQty)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">
                      <span className={Number(d.variance) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                        {Number(d.variance) > 0 ? '+' : ''}{Number(d.variance)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{String(d.stockTakeRef).slice(0, 12)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================
// MANUFACTURER PERFORMANCE TAB
// ========================================================================

function ManufacturerPerformanceTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const manufacturers = (data?.manufacturers as Array<Record<string, unknown>>) || []
  const topProductsByMfr = (data?.topProductsByMfr as Array<Record<string, unknown>>) || []
  const dailyTrend = (data?.dailyTrend as Array<Record<string, unknown>>) || []
  const trendManufacturerNames = (data?.trendManufacturerNames as string[]) || []

  const trendColors = ['#059669', '#0891b2', '#7c3aed']

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={Factory} label="Manufacturers" value={String(s.totalManufacturers || 0)} color="blue" />
        <KpiCard icon={DollarSign} label="Total Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={Award} label="Top Mfr" value={String((s.topManufacturer as Record<string, unknown>)?.name || 'N/A')} color="violet" />
        <KpiCard icon={TrendingUp} label="Top Mfr Revenue" value={formatCurrency(Number((s.topManufacturer as Record<string, unknown>)?.revenue || 0))} color="amber" />
      </div>

      {/* Daily Trend for Top 3 */}
      {dailyTrend.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Revenue: Top 3 Manufacturers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {trendManufacturerNames.map((name, i) => (
                    <Line key={i} type="monotone" dataKey={name} stroke={trendColors[i]} strokeWidth={2} dot={false} name={name} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manufacturer Table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Manufacturer Performance</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(manufacturers.map(m => ({ Manufacturer: m.manufacturer, Products: m.productCount, Revenue: m.totalRevenue, Profit: m.estimatedProfit, Margin: `${m.margin}%`, Share: `${m.revenueShare}%` })), 'manufacturer-performance.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                <TableHead className="text-xs">Manufacturer</TableHead>
                <TableHead className="text-xs text-right">Products</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Est. Profit</TableHead>
                <TableHead className="text-xs text-right">Margin</TableHead>
                <TableHead className="text-xs">Share</TableHead>
              </TableRow></TableHeader>
              <TableBody>{manufacturers.map((m, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium">{String(m.manufacturer)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(m.productCount)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(m.totalRevenue))}</TableCell>
                  <TableCell className="text-xs text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(m.estimatedProfit))}</TableCell>
                  <TableCell className="text-xs text-right">
                    <span className={Number(m.margin) >= 30 ? 'text-emerald-600 dark:text-emerald-400' : Number(m.margin) >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}>
                      {Number(m.margin).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-50 dark:bg-blue-900/300" style={{ width: `${Math.min(100, Number(m.revenueShare))}%` }} />
                      </div>
                      <span className="text-muted-foreground">{Number(m.revenueShare).toFixed(1)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top Products by Manufacturer */}
      {topProductsByMfr.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Products per Manufacturer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProductsByMfr.map((mfrGroup: Record<string, unknown>, gi: number) => {
                const prods = (mfrGroup.products as Array<Record<string, unknown>>) || []
                return (
                  <div key={gi}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">{String(mfrGroup.manufacturer)}</p>
                    <Table>
                      <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/60">
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs text-right">Qty Sold</TableHead>
                        <TableHead className="text-xs text-right">Revenue</TableHead>
                        <TableHead className="text-xs text-right">Transactions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>{prods.map((p, pi) => (
                        <TableRow key={pi} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                          <TableCell className="text-xs font-medium">{String(p.productName)}</TableCell>
                          <TableCell className="text-xs text-right">{Number(p.totalQty)}</TableCell>
                          <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(p.totalRevenue))}</TableCell>
                          <TableCell className="text-xs text-right">{Number(p.txCount)}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ========================================================================
// TAX COMPLIANCE TAB
// ========================================================================

function TaxComplianceTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const dailyTax = (data?.dailyTax as Array<Record<string, unknown>>) || []
  const byPaymentMethod = (data?.byPaymentMethod as Array<Record<string, unknown>>) || []
  const byCategory = (data?.byCategory as Array<Record<string, unknown>>) || []
  const exemptTransactions = (data?.exemptTransactions as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} label="Taxable Revenue" value={formatCurrency(Number(s.taxableRevenue || 0))} color="emerald" />
        <KpiCard icon={Shield} label="Tax Collected" value={formatCurrency(Number(s.totalTax || 0))} color="blue" />
        <KpiCard icon={Percent} label="Effective Rate" value={`${Number(s.effectiveRate || 0).toFixed(2)}%`} color="violet" />
        <KpiCard icon={CreditCard} label="Exempt Sales" value={formatCurrency(Number(s.exemptRevenue || 0))} color="amber" />
        <KpiCard icon={ShoppingBag} label="Total Tx" value={String(s.totalTransactions || 0)} color="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Tax Trend */}
        <Card className="border-none shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Daily Tax Collection</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(dailyTax.map(d => ({ Date: d.day, Revenue: d.revenue, Tax: d.tax, Rate: d.taxRate })), 'tax-daily.csv')}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTax}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="tax" fill="#059669" radius={[3, 3, 0, 0]} name="Tax" />
                  <Line yAxisId="right" type="monotone" dataKey="taxRate" stroke="#7c3aed" strokeWidth={2} dot={false} name="Rate %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Tax by Payment Method */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Tax by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byPaymentMethod} dataKey="tax" nameKey="method" cx="50%" cy="50%" outerRadius={75} innerRadius={35} paddingAngle={2} stroke="none">
                    {byPaymentMethod.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 mt-2">
              {byPaymentMethod.map((pm, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground">{String(pm.method)}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(Number(pm.tax))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax by Category */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Tax by Category</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(byCategory.map(c => ({ Category: c.category, Revenue: c.revenue, Tax: c.tax, Rate: c.taxRate })), 'tax-by-category.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Tax</TableHead>
                <TableHead className="text-xs text-right">Rate</TableHead>
              </TableRow></TableHeader>
              <TableBody>{byCategory.map((c, i) => (
                <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                  <TableCell className="text-xs font-medium">{String(c.category)}</TableCell>
                  <TableCell className="text-xs text-right">{formatCurrency(Number(c.revenue))}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(c.tax))}</TableCell>
                  <TableCell className="text-xs text-right">{Number(c.taxRate).toFixed(2)}%</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Exempt Transactions */}
      {exemptTransactions.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Insurance/Tax-Exempt Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Tx #</TableHead>
                  <TableHead className="text-xs text-right">Subtotal</TableHead>
                  <TableHead className="text-xs text-right">Tax</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                </TableRow></TableHeader>
                <TableBody>{exemptTransactions.slice(0, 20).map((t, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs">{String(t.date).slice(5)}</TableCell>
                    <TableCell className="text-xs font-medium">{String(t.transactionNo)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(Number(t.subtotal))}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(t.tax))}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px] px-1.5 py-0">{String(t.paymentMethod)}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ========================================================================
// HOURLY SALES HEATMAP TAB
// ========================================================================

function HourlyHeatmapTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const heatmap = (data?.heatmap as Array<Record<string, unknown>>) || []
  const hourlyAvg = (data?.hourlyAvg as Array<Record<string, unknown>>) || []
  const peakHours = (data?.peakHours as Array<Record<string, unknown>>) || []

  // Build day x hour grid
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const days = [...new Set(heatmap.map(h => String(h.day)))].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
  const hours = [...new Set(heatmap.map(h => Number(h.hour)))].sort((a, b) => a - b)
  const grid = days.map(d => hours.map(h => {
    const cell = heatmap.find(r => String(r.day) === d && Number(r.hour) === h)
    return { revenue: Number(cell?.revenue || 0), txCount: Number(cell?.txCount || 0) }
  }))
  const maxRev = Math.max(...grid.flat().map(c => c.revenue), 1)

  const getCellColor = (val: number) => {
    if (val === 0) return 'bg-gray-50 dark:bg-gray-800/50'
    const ratio = val / maxRev
    if (ratio >= 0.75) return 'bg-emerald-600 text-white'
    if (ratio >= 0.5) return 'bg-emerald-400 text-white'
    if (ratio >= 0.25) return 'bg-emerald-200 text-emerald-900'
    return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700'
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={DollarSign} label="Total Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={Clock} label="Peak Hour" value={String(s.peakHour || 'N/A')} color="blue" />
        <KpiCard icon={TrendingUp} label="Peak Day" value={String(s.peakDay || 'N/A')} color="violet" />
        <KpiCard icon={Activity} label="Avg/Hour (Peak)" value={formatCurrency(Number(s.peakHourAvg || 0))} color="amber" />
      </div>

      {/* Heatmap Grid */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Sales Heatmap (Day x Hour)</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
              const rows = grid.flatMap((row, di) => row.map((cell, hi) => ({ Day: days[di], Hour: `${hours[hi]}:00`, Revenue: cell.revenue, Transactions: cell.txCount })))
              exportCSV(rows, 'hourly-heatmap.csv')
            }}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row with hours */}
              <div className="flex gap-0.5 mb-0.5 pl-10">
                {hours.map(h => (
                  <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground font-medium">
                    {h}
                  </div>
                ))}
              </div>
              {/* Grid rows */}
              {grid.map((row, di) => (
                <div key={di} className="flex gap-0.5 mb-0.5">
                  <div className="w-10 text-right text-[10px] font-medium text-muted-foreground pr-2 flex items-center justify-end">{days[di]}</div>
                  {row.map((cell, hi) => (
                    <div key={hi} className={`flex-1 h-9 rounded-sm flex items-center justify-center text-[9px] font-medium cursor-default transition-colors ${getCellColor(cell.revenue)}`}>
                      {cell.revenue > 0 ? formatCurrency(cell.revenue).replace(/\$/g, '') : ''}
                    </div>
                  ))}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 pl-10">
                <span className="text-[9px] text-muted-foreground">Low</span>
                <div className="h-3 w-3 rounded-sm bg-emerald-50 dark:bg-emerald-900/30" />
                <div className="h-3 w-3 rounded-sm bg-emerald-200" />
                <div className="h-3 w-3 rounded-sm bg-emerald-400" />
                <div className="h-3 w-3 rounded-sm bg-emerald-600" />
                <span className="text-[9px] text-muted-foreground">High</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly Average Bar Chart */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Average Revenue by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyAvg}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}:00`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="avgRevenue" fill="#0891b2" radius={[3, 3, 0, 0]} name="Avg Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Peak Hours Table */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Peak Hours Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50 dark:bg-gray-800/50/80 sticky top-0">
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">Day</TableHead>
                  <TableHead className="text-xs">Hour</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Transactions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{peakHours.slice(0, 15).map((p, i) => (
                  <TableRow key={i} className="hover:bg-gray-50 dark:bg-gray-800/50/50">
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{String(p.day)}</TableCell>
                    <TableCell className="text-xs font-medium">{String(p.hour)}:00</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(p.revenue))}</TableCell>
                    <TableCell className="text-xs text-right">{Number(p.txCount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

