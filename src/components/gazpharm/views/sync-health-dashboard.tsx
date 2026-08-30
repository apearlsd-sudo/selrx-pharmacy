'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Wifi,
  WifiOff,
  Radio,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Server,
  Monitor,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  Zap,
  RefreshCw,
  ArrowDownUp,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isDesktop } from '@/lib/platform'
import type { HealthDashboard, DiscoveredHub } from '@/lib/desktop/tauri-types'
import { fetchHealthDashboard } from '@/lib/desktop/tauri-bridge'
import { getSyncSecret } from '@/lib/sync-engine'

// ── Component ───────────────────────────────────────────────────────────

export function SyncHealthDashboard({ hubUrl }: { hubUrl: string | null }) {
  const [dashboard, setDashboard] = useState<HealthDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadDashboard = useCallback(async () => {
    if (!hubUrl || !isDesktop()) return

    setLoading(true)
    setError(null)

    try {
      const data = await fetchHealthDashboard(hubUrl, getSyncSecret())
      setDashboard(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health data')
    } finally {
      setLoading(false)
    }
  }, [hubUrl])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh || !hubUrl) return
    const timer = setInterval(loadDashboard, 10_000)
    return () => clearInterval(timer)
  }, [autoRefresh, loadDashboard, hubUrl])

  const formatUptime = (secs: number) => {
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return `${h}h ${m}m`
  }

  const formatTime = (iso: string) => {
    if (!iso || iso === '1970-01-01') return 'N/A'
    try {
      return new Date(iso).toLocaleString()
    } catch { return iso }
  }

  const getLatencyColor = (ms: number) => {
    if (ms < 100) return 'text-emerald-600'
    if (ms < 500) return 'text-amber-600'
    return 'text-red-600'
  }

  const getLatencyBg = (ms: number) => {
    if (ms < 100) return 'bg-emerald-50 border-emerald-200'
    if (ms < 500) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }

  if (!isDesktop()) return null
  if (!hubUrl) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <WifiOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Configure a hub connection to view the health dashboard</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-500" />
          <h3 className="text-sm font-semibold">Sync Health Dashboard</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Radio className={`h-3 w-3 ${autoRefresh ? 'text-emerald-500' : ''}`} />
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </Button>
        </div>
      </div>

      {error && !dashboard && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {dashboard && (
        <>
          {/* ── Top Stats Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Connected Terminals */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Monitor className="h-3.5 w-3.5 text-blue-500" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Terminals</p>
              </div>
              <p className="text-xl font-bold">{dashboard.connected_terminals}</p>
              <p className="text-[10px] text-muted-foreground">connected</p>
            </div>

            {/* Hub Uptime */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3.5 w-3.5 text-emerald-500" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Uptime</p>
              </div>
              <p className="text-xl font-bold">{formatUptime(dashboard.uptime_secs)}</p>
              <p className="text-[10px] text-muted-foreground">since start</p>
            </div>

            {/* Pending Syncs */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Layers className="h-3.5 w-3.5 text-amber-500" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</p>
              </div>
              <p className={`text-xl font-bold ${dashboard.pending_syncs > 0 ? 'text-amber-600' : ''}`}>
                {dashboard.pending_syncs}
              </p>
              <p className="text-[10px] text-muted-foreground">sync entries</p>
            </div>

            {/* Offline Queue */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3.5 w-3.5 text-violet-500" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Queue</p>
              </div>
              <p className={`text-xl font-bold ${dashboard.offline_queue?.pending > 0 ? 'text-orange-600' : ''}`}>
                {dashboard.offline_queue?.pending ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">offline items</p>
            </div>
          </div>

          {/* ── Terminal Status Table ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Monitor className="h-4 w-4 text-blue-500" />
                Connected Terminals
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {dashboard.terminals.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.terminals.length === 0 ? (
                <div className="text-center py-6">
                  <WifiOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No terminals have synced yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Terminal ID</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Tables Synced</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Last Sync</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.terminals.map((t) => {
                        const latency = dashboard.terminal_latency?.[t.workstation_id] ?? 0
                        return (
                          <tr key={t.workstation_id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 px-2 font-mono">{t.workstation_id.slice(0, 16)}...</td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-[10px]">{t.tables_synced} tables</Badge>
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">{formatTime(t.last_sync)}</td>
                            <td className="py-2 px-2">
                              <span className={`font-medium ${getLatencyColor(latency)}`}>
                                {latency > 0 ? `${Math.round(latency)}ms` : 'N/A'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Health Metrics & Queue Status ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Latency Overview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Sync Latency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.health_summary.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No metrics recorded yet. Data appears after sync cycles.</p>
                ) : (
                  dashboard.health_summary
                    .filter((m) => m.metricType.startsWith('latency_') || m.metricType === 'sync_cycle')
                    .slice(0, 5)
                    .map((m) => (
                      <div key={m.metricType} className={`flex items-center justify-between rounded-lg border p-2.5 ${getLatencyBg(m.avg_value)}`}>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {m.metricType.replace('latency_', 'Terminal ')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{m.count} samples</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${getLatencyColor(m.avg_value)}`}>
                            {Math.round(m.avg_value)}ms
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            min {Math.round(m.min_value)} / max {Math.round(m.max_value)}
                          </p>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* Offline Queue Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" />
                  Offline Queue
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Persisted operations that survive app restarts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.offline_queue && (
                  <>
                    {/* Queue status bars */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center">
                        <p className="text-lg font-bold text-amber-600">{dashboard.offline_queue.pending ?? 0}</p>
                        <p className="text-[9px] text-amber-600 uppercase">Pending</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 text-center">
                        <p className="text-lg font-bold text-blue-600">{dashboard.offline_queue.in_progress ?? 0}</p>
                        <p className="text-[9px] text-blue-600 uppercase">Active</p>
                      </div>
                      <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-center">
                        <p className="text-lg font-bold text-red-600">{dashboard.offline_queue.failed ?? 0}</p>
                        <p className="text-[9px] text-red-600 uppercase">Failed</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center">
                        <p className="text-lg font-bold text-emerald-600">{dashboard.offline_queue.completed ?? 0}</p>
                        <p className="text-[9px] text-emerald-600 uppercase">Done</p>
                      </div>
                    </div>

                    {dashboard.offline_queue.pending > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-700">
                          {dashboard.offline_queue.pending} items waiting to sync. They will be sent automatically when the hub is reachable.
                        </p>
                      </div>
                    )}

                    {dashboard.offline_queue.failed > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/50 p-2.5">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        <p className="text-xs text-red-700">
                          {dashboard.offline_queue.failed} items permanently failed (max retries exceeded). Review may be needed.
                        </p>
                      </div>
                    )}

                    {(dashboard.offline_queue.pending === 0 && dashboard.offline_queue.failed === 0) && (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <p className="text-xs text-emerald-700">Queue is empty. All operations synced successfully.</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Recent Delta Activity ── */}
          {dashboard.recent_deltas && dashboard.recent_deltas.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ArrowDownUp className="h-4 w-4 text-indigo-500" />
                  Recent Inventory Deltas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {dashboard.recent_deltas.slice(0, 10).map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border p-2">
                      <div className="flex items-center gap-2">
                        {d.value >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className="text-xs font-mono text-muted-foreground">{d.details?.slice(0, 40)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${d.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {d.value >= 0 ? '+' : ''}{d.value}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(d.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Server time */}
          <p className="text-[10px] text-muted-foreground text-center">
            Hub: {dashboard.hub_device_id.slice(0, 16)}... | Server time: {formatTime(dashboard.server_time)}
          </p>
        </>
      )}
    </div>
  )
}

// ── mDNS Discovery Component ──────────────────────────────────────────────

export function MdnsDiscoveryPanel({ onSelect }: { onSelect: (url: string) => void }) {
  const [hubs, setHubs] = useState<DiscoveredHub[]>([])
  const [scanning, setScanning] = useState(false)
  const [localIps, setLocalIps] = useState<string[]>([])

  const handleScan = useCallback(async () => {
    if (!isDesktop()) return
    setScanning(true)
    try {
      const { discoverHubs } = await import('@/lib/sync-engine')
      const { getLocalIps: getIps } = await import('@/lib/desktop/tauri-bridge')

      const [discovered, ips] = await Promise.all([
        discoverHubs(3),
        getIps().catch(() => []),
      ])

      setHubs(discovered)
      setLocalIps(ips)
    } catch (err) {
      console.error('Discovery failed:', err)
    } finally {
      setScanning(false)
    }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan-500" />
          LAN Auto-Discovery
          <Button
            variant="outline" size="sm" className="h-6 text-[10px] gap-1 ml-auto"
            onClick={handleScan} disabled={scanning}
          >
            {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radio className="h-3 w-3" />}
            {scanning ? 'Scanning...' : 'Scan LAN'}
          </Button>
        </CardTitle>
        <CardDescription className="text-[10px]">
          Automatically find SelRx hubs on your local network
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Local IPs info */}
        {localIps.length > 0 && (
          <div className="rounded-lg bg-cyan-50/50 border border-cyan-100 p-2.5">
            <p className="text-[10px] font-semibold text-cyan-700 mb-1">This device's IP addresses:</p>
            <div className="flex flex-wrap gap-1.5">
              {localIps.map((ip) => (
                <Badge key={ip} variant="outline" className="text-[10px] font-mono bg-white">
                  {ip}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Discovered hubs */}
        {hubs.length === 0 && !scanning && (
          <div className="text-center py-6">
            <Radio className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No hubs found on this network</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Make sure the hub device is running and on the same network
            </p>
          </div>
        )}

        {hubs.length > 0 && (
          <div className="space-y-2">
            {hubs.map((hub) => (
              <div
                key={hub.device_id}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-cyan-100 flex items-center justify-center">
                    <Server className="h-4.5 w-4.5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">SelRx Hub</p>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {hub.ip}:{hub.port} | {hub.device_id.slice(0, 12)}...
                    </p>
                  </div>
                </div>
                <Button
                  size="sm" className="h-7 text-xs gap-1"
                  onClick={() => onSelect(hub.url)}
                >
                  <Wifi className="h-3 w-3" />
                  Connect
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
