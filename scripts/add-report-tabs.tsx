// This script appends the 7 new tab components to the advanced-reports-view.tsx file
// The content below should be appended after the ProductAffinityTab component

export const NEW_TABS = `

// ========================================================================
// SALES FORECAST TAB
// ========================================================================

function SalesForecastTab({ data }: { data: Record<string, unknown> | null }) {
  const s = (data?.summary as Record<string, unknown>) || {}
  const historical = (data?.historical as Array<Record<string, unknown>>) || []
  const forecast = (data?.forecast as Array<Record<string, unknown>>) || []
  const dayOfWeekAvg = (data?.dayOfWeekAvg as Array<Record<string, unknown>>) || []

  const trendColor = String(s.trendDirection) === 'Growing' ? 'text-emerald-600' : String(s.trendDirection) === 'Declining' ? 'text-red-500' : 'text-amber-600'
  const trendIcon = String(s.trendDirection) === 'Growing' ? '\u2191' : String(s.trendDirection) === 'Declining' ? '\u2193' : '\u2192'

  // Combine historical + forecast for continuous chart
  const combinedData = [
    ...historical.map(h => ({ day: String(h.day), actual: Number(h.revenue), movingAvg: Number(h.movingAvg), forecast: null, lower: null, upper: null })),
    ...forecast.map(f => ({ day: String(f.day), actual: null, movingAvg: null, forecast: Number(f.forecast), lower: Number(f.lower), upper: Number(f.upper) })),
  ]

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} label="Period Revenue" value={formatCurrency(Number(s.totalRevenue || 0))} color="emerald" />
        <KpiCard icon={TrendingUp} label="Avg Daily" value={formatCurrency(Number(s.avgDailyRevenue || 0))} color="blue" />
        <KpiCard icon={Activity} label="Trend" value={String(s.trendDirection || 'N/A')} color={String(s.trendDirection) === 'Growing' ? 'emerald' : String(s.trendDirection) === 'Declining' ? 'rose' : 'amber'}
          sub={<span className={\`text-xs font-semibold \${trendColor}\`}>{trendIcon} Slope: {Number(s.trendSlope || 0).toFixed(2)}/day</span>} />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Forecast</TableHead>
                  <TableHead className="text-xs text-right">Lower</TableHead>
                  <TableHead className="text-xs text-right">Upper</TableHead>
                </TableRow></TableHeader>
                <TableBody>{forecast.map((f, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="text-xs font-medium">{String(f.day).slice(5)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-violet-600">{formatCurrency(Number(f.forecast))}</TableCell>
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
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Customers" value={String(s.totalCustomers || 0)} color="emerald" />
        <KpiCard icon={DollarSign} label="Total Spend" value={formatCurrency(Number(s.totalSpend || 0))} color="blue" />
        <KpiCard icon={ShoppingBag} label="Avg Spend" value={formatCurrency(Number(s.avgSpend || 0))} color="violet" />
        <KpiCard icon={Target} label="Segments" value={String(s.segmentsCount || 0)} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Visits</TableHead>
                  <TableHead className="text-xs text-right">Total Spend</TableHead>
                  <TableHead className="text-xs text-right">Days Ago</TableHead>
                  <TableHead className="text-xs">Segment</TableHead>
                </TableRow></TableHeader>
                <TableBody>{customers.map((c, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{String(c.customerName)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.frequency)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(c.monetary))}</TableCell>
                    <TableCell className="text-xs text-right">{Number(c.recencyDays)}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={\`text-[10px] px-1.5 py-0 \${SEGMENT_BG[String(c.segment)] || ''}\`}>
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
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Total Batches" value={String(s.totalBatches || 0)} color="blue" />
        <KpiCard icon={ShoppingBag} label="Total Units" value={String(Number(s.totalUnits || 0).toLocaleString())} color="emerald" />
        <KpiCard icon={DollarSign} label="Cost Value" value={formatCurrency(Number(s.totalCostValue || 0))} color="violet" />
        <KpiCard icon={AlertTriangle} label="Expired Batches" value={String(s.expiredCount || 0)} color="rose" />
        <KpiCard icon={Flame} label="At-Risk (30d) Cost" value={formatCurrency(Number(s.atRisk30DayCost || 0))} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
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
                    <TableRow key={i} className="hover:bg-gray-50/50">
                      <TableCell className="text-xs font-medium truncate max-w-[140px]">{String(p.productName)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{String(p.category)}</TableCell>
                      <TableCell className="text-xs">
                        <span className={isExpired ? 'text-red-600 font-semibold' : 'text-amber-600'}>{String(p.expiryDate).slice(5)}</span>
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">Batches</TableHead>
                  <TableHead className="text-xs text-right">Total Units</TableHead>
                  <TableHead className="text-xs">Nearest Expiry</TableHead>
                  <TableHead className="text-xs">Furthest Expiry</TableHead>
                  <TableHead className="text-xs text-right">Total Cost</TableHead>
                </TableRow></TableHeader>
                <TableBody>{batchDiversity.map((b, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="text-xs font-medium">{String(b.productName)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{Number(b.batchCount)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(b.totalUnits)}</TableCell>
                    <TableCell className="text-xs text-amber-600">{String(b.nearestExpiry).slice(5)}</TableCell>
                    <TableCell className="text-xs text-emerald-600">{String(b.furthestExpiry).slice(5)}</TableCell>
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
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={CheckCircle2} label="Stock Takes" value={String(s.totalStockTakes || 0)} color="blue" />
        <KpiCard icon={Target} label="Overall Accuracy" value={\`\${Number(s.overallAccuracy || 0).toFixed(1)}%\`} color={Number(s.overallAccuracy || 0) >= 95 ? 'emerald' : Number(s.overallAccuracy || 0) >= 80 ? 'amber' : 'rose'} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs text-right">System</TableHead>
                  <TableHead className="text-xs text-right">Counted</TableHead>
                  <TableHead className="text-xs text-right">Variance</TableHead>
                  <TableHead className="text-xs">Ref</TableHead>
                </TableRow></TableHeader>
                <TableBody>{discrepancies.slice(0, 15).map((d, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="text-xs font-medium truncate max-w-[120px]">{String(d.productName)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(d.systemQty)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(d.countedQty)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">
                      <span className={Number(d.variance) > 0 ? 'text-emerald-600' : 'text-red-500'}>
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
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className="h-72">
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
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportCSV(manufacturers.map(m => ({ Manufacturer: m.manufacturer, Products: m.productCount, Revenue: m.totalRevenue, Profit: m.estimatedProfit, Margin: \`\${m.margin}%\`, Share: \`\${m.revenueShare}%\` })), 'manufacturer-performance.csv')}>
              <Download className="h-3 w-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                <TableHead className="text-xs">Manufacturer</TableHead>
                <TableHead className="text-xs text-right">Products</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Est. Profit</TableHead>
                <TableHead className="text-xs text-right">Margin</TableHead>
                <TableHead className="text-xs">Share</TableHead>
              </TableRow></TableHeader>
              <TableBody>{manufacturers.map((m, i) => (
                <TableRow key={i} className="hover:bg-gray-50/50">
                  <TableCell className="text-xs font-medium">{String(m.manufacturer)}</TableCell>
                  <TableCell className="text-xs text-right">{Number(m.productCount)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{formatCurrency(Number(m.totalRevenue))}</TableCell>
                  <TableCell className="text-xs text-right text-emerald-600">{formatCurrency(Number(m.estimatedProfit))}</TableCell>
                  <TableCell className="text-xs text-right">
                    <span className={Number(m.margin) >= 30 ? 'text-emerald-600' : Number(m.margin) >= 15 ? 'text-amber-600' : 'text-red-500'}>
                      {Number(m.margin).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: \`\${Math.min(100, Number(m.revenueShare))}%\` }} />
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
            <div className="space-y-4">
              {topProductsByMfr.map((mfrGroup: Record<string, unknown>, gi: number) => {
                const prods = (mfrGroup.products as Array<Record<string, unknown>>) || []
                return (
                  <div key={gi}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">{String(mfrGroup.manufacturer)}</p>
                    <Table>
                      <TableHeader><TableRow className="bg-gray-50/60">
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs text-right">Qty Sold</TableHead>
                        <TableHead className="text-xs text-right">Revenue</TableHead>
                        <TableHead className="text-xs text-right">Transactions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>{prods.map((p, pi) => (
                        <TableRow key={pi} className="hover:bg-gray-50/50">
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
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} label="Taxable Revenue" value={formatCurrency(Number(s.taxableRevenue || 0))} color="emerald" />
        <KpiCard icon={Shield} label="Tax Collected" value={formatCurrency(Number(s.totalTax || 0))} color="blue" />
        <KpiCard icon={Percent} label="Effective Rate" value={\`\${Number(s.effectiveRate || 0).toFixed(2)}%\`} color="violet" />
        <KpiCard icon={CreditCard} label="Exempt Sales" value={formatCurrency(Number(s.exemptRevenue || 0))} color="amber" />
        <KpiCard icon={ShoppingBag} label="Total Tx" value={String(s.totalTransactions || 0)} color="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Tax</TableHead>
                <TableHead className="text-xs text-right">Rate</TableHead>
              </TableRow></TableHeader>
              <TableBody>{byCategory.map((c, i) => (
                <TableRow key={i} className="hover:bg-gray-50/50">
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Tx #</TableHead>
                  <TableHead className="text-xs text-right">Subtotal</TableHead>
                  <TableHead className="text-xs text-right">Tax</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                </TableRow></TableHeader>
                <TableBody>{exemptTransactions.slice(0, 20).map((t, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="text-xs">{String(t.date).slice(5)}</TableCell>
                    <TableCell className="text-xs font-medium">{String(t.transactionNo)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(Number(t.subtotal))}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-600">{formatCurrency(Number(t.tax))}</TableCell>
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
    if (val === 0) return 'bg-gray-50'
    const ratio = val / maxRev
    if (ratio >= 0.75) return 'bg-emerald-600 text-white'
    if (ratio >= 0.5) return 'bg-emerald-400 text-white'
    if (ratio >= 0.25) return 'bg-emerald-200 text-emerald-900'
    return 'bg-emerald-50 text-emerald-700'
  }

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              const rows = grid.flatMap((row, di) => row.map((cell, hi) => ({ Day: days[di], Hour: \`\${hours[hi]}:00\`, Revenue: cell.revenue, Transactions: cell.txCount })))
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
                    <div key={hi} className={\`flex-1 h-9 rounded-sm flex items-center justify-center text-[9px] font-medium cursor-default transition-colors \${getCellColor(cell.revenue)}\`}>
                      {cell.revenue > 0 ? formatCurrency(cell.revenue).replace(/\$/g, '') : ''}
                    </div>
                  ))}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 pl-10">
                <span className="text-[9px] text-muted-foreground">Low</span>
                <div className="h-3 w-3 rounded-sm bg-emerald-50" />
                <div className="h-3 w-3 rounded-sm bg-emerald-200" />
                <div className="h-3 w-3 rounded-sm bg-emerald-400" />
                <div className="h-3 w-3 rounded-sm bg-emerald-600" />
                <span className="text-[9px] text-muted-foreground">High</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(v) => \`\${v}:00\`} />
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
                <TableHeader><TableRow className="bg-gray-50/80 sticky top-0">
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">Day</TableHead>
                  <TableHead className="text-xs">Hour</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Transactions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{peakHours.slice(0, 15).map((p, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
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
`;
