'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Monitor,
  Server,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
  Shield,
  AlertTriangle,
  Info,
  Globe,
  TowerControl,
  Power,
  PowerOff,
  Radio,
  Zap,
  Activity,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isDesktop } from '@/lib/platform'
import {
  getSyncInfo,
  onSyncStateChange,
  manualSync,
  setHubUrl,
  startSync,
  stopSync,
  getSyncConflicts,
  resolveConflict,
  discoverHubs,
  refreshQueueStats,
  type SyncInfo,
  type SyncState,
  type SyncConflict,
} from '@/lib/sync-engine'
import { SyncHealthDashboard, MdnsDiscoveryPanel } from './sync-health-dashboard'
import { useAppStore } from '@/store/app-store'

// ── Connection test result ──

interface TestResult {
  ok: boolean
  message: string
  latency?: number
}

// ── Status colors ──

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  idle:         { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Synced', icon: CheckCircle2 },
  syncing:      { color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',   label: 'Syncing...', icon: RefreshCw },
  error:        { color: 'text-red-600',     bg: 'bg-red-50 border-red-200',       label: 'Error', icon: XCircle },
  offline:      { color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200 dark:border-gray-700',     label: 'Offline', icon: WifiOff },
  ws_connected: { color: 'text-cyan-600',    bg: 'bg-cyan-50 border-cyan-200',     label: 'Live (WebSocket)', icon: Radio },
  discovering:  { color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', label: 'Scanning LAN...', icon: Radio },
}

// ── Component ──

export function SyncSettingsView() {
  const addToast = useAppStore((s) => s.addToast)
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [info, setInfo] = useState<SyncInfo>(() => getSyncInfo())
  const [hubUrlInput, setHubUrlInput] = useState('')
  const [syncSecretInput, setSyncSecretInput] = useState('')
  const [deviceRole, setDeviceRoleLocal] = useState<'terminal' | 'hub'>('terminal')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [showDashboard, setShowDashboard] = useState(false)

  // Hub secret state
  const [hubSecret, setHubSecret] = useState('')
  const [showHubSecret, setShowHubSecret] = useState(false)
  const [secretLoading, setSecretLoading] = useState(false)

  // Tunnel state
  const [tunnelToken, setTunnelToken] = useState('')
  const [tunnelStatus, setTunnelStatus] = useState<{
    running: boolean; url: string | null; uptime_secs: number; cloudflared_installed: boolean
  } | null>(null)
  const [tunnelLoading, setTunnelLoading] = useState(false)
  const [manualUrl, setManualUrl] = useState('')

  // Persist & listen
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selrx_sync_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.hubUrl) setHubUrlInput(parsed.hubUrl)
        if (parsed.syncSecret) setSyncSecretInput(parsed.syncSecret)
        if (parsed.deviceRole) setDeviceRoleLocal(parsed.deviceRole)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const unsub = onSyncStateChange((_state, newInfo) => {
      setInfo({ ...newInfo })
      setConflicts(getSyncConflicts())
    })
    return unsub
  }, [])

  const saveSettings = useCallback((settings: Record<string, string>) => {
    const current = JSON.parse(localStorage.getItem('selrx_sync_settings') || '{}')
    const updated = { ...current, ...settings }
    localStorage.setItem('selrx_sync_settings', JSON.stringify(updated))
  }, [])

  // ── Connection test ──
  const testConnection = useCallback(async () => {
    if (!hubUrlInput.trim()) {
      setTestResult({ ok: false, message: 'Please enter a hub URL' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const start = Date.now()
      const url = hubUrlInput.replace(/\/$/, '')
      const res = await fetch(`${url}/api/health`, { method: 'GET', signal: AbortSignal.timeout(10000) })
      const latency = Date.now() - start
      if (res.ok) {
        const data = await res.json()
        setTestResult({ ok: true, message: `Connected to hub (${data.role || 'unknown'}). Latency: ${latency}ms`, latency })
      } else {
        setTestResult({ ok: false, message: `Hub returned status ${res.status}` })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setTestResult({ ok: false, message: `Cannot reach hub: ${msg}` })
    } finally {
      setTesting(false)
    }
  }, [hubUrlInput])

  // ── Load hub secret (hub mode only) ──
  const loadHubSecret = useCallback(async () => {
    if (!isDesktop()) return
    try {
      const { getSyncSecretFromHub } = await import('@/lib/desktop/tauri-bridge')
      const secret = await getSyncSecretFromHub()
      setHubSecret(secret)
    } catch { /* web mode */ }
  }, [])

  useEffect(() => {
    if (deviceRole === 'hub') loadHubSecret()
  }, [deviceRole, loadHubSecret])

  const handleRegenerateSecret = useCallback(async () => {
    setSecretLoading(true)
    try {
      const { regenerateSyncSecret } = await import('@/lib/desktop/tauri-bridge')
      const newSecret = await regenerateSyncSecret()
      setHubSecret(newSecret)
      setShowHubSecret(false)
      addToast({ title: 'Secret Regenerated', description: 'All terminals must update their secret to continue syncing', variant: 'success' })
    } catch (err) {
      addToast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally {
      setSecretLoading(false)
    }
  }, [addToast])

  const copySecret = useCallback(() => {
    navigator.clipboard.writeText(hubSecret)
    addToast({ title: 'Copied', description: 'Shared secret copied to clipboard', variant: 'success' })
  }, [hubSecret, addToast])

  // ── Apply hub URL ──
  const applyHubUrl = useCallback(() => {
    if (!hubUrlInput.trim()) return
    setHubUrl(hubUrlInput.trim(), syncSecretInput.trim() || undefined)
    saveSettings({ hubUrl: hubUrlInput.trim(), syncSecret: syncSecretInput.trim() })
    addToast({ title: 'Hub URL Saved', description: 'Sync will use the new hub address', variant: 'success' })
  }, [hubUrlInput, syncSecretInput, setHubUrl, saveSettings, addToast])

  // ── Change device role ──
  const applyDeviceRole = useCallback(async (role: 'terminal' | 'hub') => {
    setDeviceRoleLocal(role)
    saveSettings({ deviceRole: role })

    // Persist role to Rust/Tauri side so it survives app restarts
    try {
      const { setDeviceRole } = await import('@/lib/desktop/tauri-bridge')
      await setDeviceRole(role)
    } catch { /* web mode — ignore */ }

    if (role === 'terminal') {
      if (hubUrlInput.trim()) startSync(hubUrlInput.trim())
    } else {
      stopSync()
    }
    addToast({
      title: `Role: ${role === 'hub' ? 'Hub (Server)' : 'Terminal'}`,
      description: role === 'hub' ? 'This device will act as the sync server for other terminals' : 'This device will sync to the hub',
      variant: 'success',
    })
  }, [hubUrlInput, saveSettings, addToast, startSync, stopSync])

  // ── Manual sync ──
  const handleManualSync = useCallback(async () => {
    setSyncing(true)
    try {
      await manualSync()
      addToast({ title: 'Sync Complete', variant: 'success' })
    } catch {
      addToast({ title: 'Sync Failed', variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }, [addToast])

  const copyDeviceId = useCallback(() => {
    navigator.clipboard.writeText(info.deviceId)
    addToast({ title: 'Copied', description: 'Device ID copied to clipboard', variant: 'success' })
  }, [info.deviceId, addToast])

  // ── mDNS Discovery handler ──
  const handleDiscoveredHub = useCallback((url: string) => {
    setHubUrlInput(url)
    setHubUrl(url)
    saveSettings({ hubUrl: url })
    addToast({ title: 'Hub Found', description: `Connected to ${url}`, variant: 'success' })
  }, [setHubUrl, saveSettings, addToast])

  // ── Tunnel management ──
  const loadTunnelState = useCallback(async () => {
    if (!isDesktop()) return
    try {
      const { loadTunnelToken, getTunnelStatus } = await import('@/lib/desktop/tauri-bridge')
      const token = await loadTunnelToken()
      if (token) setTunnelToken(token)
      const status = await getTunnelStatus()
      setTunnelStatus(status)
    } catch { /* web mode */ }
  }, [])

  useEffect(() => {
    if (deviceRole === 'hub') loadTunnelState()
  }, [deviceRole, loadTunnelState])

  const handleStartTunnel = useCallback(async () => {
    if (!tunnelToken.trim()) {
      addToast({ title: 'Token Required', description: 'Enter a Cloudflare Tunnel token first', variant: 'destructive' })
      return
    }
    setTunnelLoading(true)
    try {
      const { startTunnel, saveTunnelToken } = await import('@/lib/desktop/tauri-bridge')
      await saveTunnelToken(tunnelToken.trim())
      const url = await startTunnel(tunnelToken.trim(), 3001)
      if (url && !url.includes('connecting')) {
        addToast({ title: 'Tunnel Started', description: `Connected at ${url}`, variant: 'success' })
      } else {
        addToast({ title: 'Tunnel Starting', description: 'URL detection in progress...', variant: 'default' })
      }
      await loadTunnelState()
    } catch (err) {
      addToast({ title: 'Tunnel Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally {
      setTunnelLoading(false)
    }
  }, [tunnelToken, addToast, loadTunnelState])

  const handleStopTunnel = useCallback(async () => {
    setTunnelLoading(true)
    try {
      const { stopTunnel } = await import('@/lib/desktop/tauri-bridge')
      await stopTunnel()
      addToast({ title: 'Tunnel Stopped', variant: 'success' })
      await loadTunnelState()
    } catch (err) {
      addToast({ title: 'Tunnel Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally {
      setTunnelLoading(false)
    }
  }, [addToast, loadTunnelState])

  const handleSetManualUrl = useCallback(async () => {
    if (!manualUrl.trim()) return
    try {
      const { setTunnelUrl } = await import('@/lib/desktop/tauri-bridge')
      await setTunnelUrl(manualUrl.trim())
      addToast({ title: 'Tunnel URL Set', description: manualUrl.trim(), variant: 'success' })
      await loadTunnelState()
      setManualUrl('')
    } catch (err) {
      addToast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }, [manualUrl, addToast, loadTunnelState])

  const copyTunnelUrl = useCallback(() => {
    if (tunnelStatus?.url) {
      navigator.clipboard.writeText(tunnelStatus.url)
      addToast({ title: 'Copied', description: 'Tunnel URL copied to clipboard', variant: 'success' })
    }
  }, [tunnelStatus?.url, addToast])

  const formatUptime = (secs: number) => {
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return `${h}h ${m}m`
  }

  const handleResolveConflict = useCallback(async (conflictId: string, resolution: 'keep_local' | 'keep_hub') => {
    await resolveConflict(conflictId, resolution)
    setConflicts(getSyncConflicts())
    addToast({ title: 'Conflict Resolved', description: `Kept ${resolution === 'keep_hub' ? 'hub' : 'local'} version`, variant: 'success' })
  }, [addToast])

  // ── Not desktop? ──
  if (!isDesktop()) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-600" /> Device Sync
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure multi-device synchronization</p>
        </div>
        <Card><CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
              <Shield className="h-8 w-8 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cloud Mode Active</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                You are running on the web (Vercel + Turso). Device sync settings are only available in the desktop app.
              </p>
            </div>
          </div>
        </CardContent></Card>
      </div>
    )
  }

  // ── Desktop UI ──
  const statusCfg = STATUS_CONFIG[info.state] || STATUS_CONFIG.idle
  const StatusIcon = statusCfg.icon

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-600" /> Device Sync
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure multi-device synchronization</p>
        </div>
        {deviceRole === 'hub' && info.hubUrl && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowDashboard(!showDashboard)}>
            <Activity className="h-4 w-4" />
            {showDashboard ? 'Settings' : 'Health Dashboard'}
          </Button>
        )}
      </div>

      {/* ── Health Dashboard (Hub mode, toggled) ── */}
      {showDashboard && deviceRole === 'hub' && (
        <SyncHealthDashboard hubUrl={info.hubUrl} />
      )}

      {!showDashboard && (
        <>
          {/* ── Current Status ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wifi className="h-4 w-4 text-emerald-500" /> Sync Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`flex items-center gap-3 rounded-lg border p-4 ${statusCfg.bg}`}>
                <StatusIcon className={`h-6 w-6 shrink-0 ${statusCfg.color} ${info.state === 'syncing' ? 'animate-spin' : ''}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${statusCfg.color}`}>{statusCfg.label}</p>
                  {info.lastSyncAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">Last synced: {new Date(info.lastSyncAt).toLocaleString()}</p>
                  )}
                  {info.wsConnected && (
                    <p className="text-xs text-cyan-600 mt-0.5">WebSocket connected since {info.wsConnectedAt ? new Date(info.wsConnectedAt).toLocaleString() : 'N/A'}</p>
                  )}
                  {info.lastError && <p className="text-xs text-red-500 mt-0.5">{info.lastError}</p>}
                </div>
                {info.pendingCount > 0 && <Badge variant="destructive" className="shrink-0">{info.pendingCount} pending</Badge>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Device ID</p>
                  <p className="text-xs font-mono font-medium mt-1 flex items-center gap-1">
                    {info.deviceId?.slice(0, 12)}...
                    <button onClick={copyDeviceId} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Platform</p>
                  <p className="text-xs font-medium mt-1 capitalize">{info.platform}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</p>
                  <p className="text-xs font-medium mt-1">{info.pendingCount} changes</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Offline Queue</p>
                  <p className={`text-xs font-medium mt-1 ${info.queueStats?.pending > 0 ? 'text-orange-600' : ''}`}>
                    {info.queueStats?.pending ?? 0} items
                  </p>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={handleManualSync} disabled={syncing || !info.hubUrl} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </CardContent>
          </Card>

          {/* ── Device Role ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Monitor className="h-4 w-4 text-violet-500" /> Device Role</CardTitle>
              <CardDescription className="text-xs">Set whether this device is the sync hub (server) or a terminal (client)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => applyDeviceRole('terminal')} className={`relative rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${deviceRole === 'terminal' ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${deviceRole === 'terminal' ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                      <Monitor className={`h-4 w-4 ${deviceRole === 'terminal' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Terminal</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Connects to the hub for sync. Use for POS workstations.</p>
                    </div>
                  </div>
                  {deviceRole === 'terminal' && <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-emerald-500" />}
                </button>
                <button onClick={() => isSuperAdmin && applyDeviceRole('hub')} disabled={!isSuperAdmin} className={`relative rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${!isSuperAdmin ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700' : deviceRole === 'hub' ? 'border-violet-500 bg-violet-50/50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${deviceRole === 'hub' ? 'bg-violet-100' : 'bg-gray-100'}`}>
                      <Server className={`h-4 w-4 ${deviceRole === 'hub' ? 'text-violet-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Hub (Server)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Hosts sync server. Super admin only.</p>
                    </div>
                  </div>
                  {deviceRole === 'hub' && <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-violet-500" />}
                  {!isSuperAdmin && <div className="absolute bottom-3 right-3"><Badge variant="secondary" className="text-[10px]">Super Admin only</Badge></div>}
                </button>
              </div>
              {!isSuperAdmin && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Only the Super Admin can set a device as Hub. Contact your administrator.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Terminal: Hub Connection ── */}
          {deviceRole === 'terminal' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Server className="h-4 w-4 text-blue-500" /> Hub Connection</CardTitle>
                <CardDescription className="text-xs">Enter the URL of the hub device, or use LAN auto-discovery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* mDNS Auto-Discovery */}
                <MdnsDiscoveryPanel onSelect={handleDiscoveredHub} />

                <Separator />

                {/* Manual URL entry */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Hub URL (manual)</Label>
                  <div className="flex gap-2">
                    <Input value={hubUrlInput} onChange={(e) => setHubUrlInput(e.target.value)} placeholder="http://192.168.1.100:3001" className="h-9 text-xs font-mono" onKeyDown={(e) => e.key === 'Enter' && applyHubUrl()} />
                    <Button size="sm" onClick={applyHubUrl} className="h-9 shrink-0">Save</Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Shared Secret</Label>
                    <div className="flex gap-2">
                      <Input type="password" value={syncSecretInput} onChange={(e) => setSyncSecretInput(e.target.value)} placeholder="Paste the hub's shared secret" className="h-9 text-xs font-mono" onKeyDown={(e) => e.key === 'Enter' && applyHubUrl()} />
                      <Button size="sm" variant="outline" onClick={applyHubUrl} className="h-9 shrink-0">Connect</Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Get this key from the hub's Device Sync settings page. Required for authenticated sync.</p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Examples</p>
                    <button onClick={() => setHubUrlInput('http://192.168.1.100:3001')} className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-mono">LAN: http://192.168.1.100:3001</button>
                    <button onClick={() => setHubUrlInput('https://example.trycloudflare.com')} className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-mono">Internet: https://example.trycloudflare.com</button>
                  </div>
                </div>

                <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !hubUrlInput.trim()} className="gap-2">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                  {testing ? 'Testing...' : 'Test Connection'}
                </Button>

                {testResult && (
                  <div className={`flex items-center gap-2 rounded-lg border p-3 ${testResult.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
                    {testResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <p className={`text-xs ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{testResult.message}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Hub: Server Info ── */}
          {deviceRole === 'hub' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Server className="h-4 w-4 text-violet-500" /> Hub Server Info</CardTitle>
                <CardDescription className="text-xs">This device is running the sync server. Other terminals connect to this address.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Local Address</p>
                    <p className="text-sm font-mono font-medium mt-1">http://localhost:3001</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sync Port</p>
                    <p className="text-sm font-mono font-medium mt-1">3001</p>
                  </div>
                </div>
                {info.localIps.length > 0 && (
                  <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                    <p className="text-[10px] font-semibold text-violet-700 mb-1">LAN IP Addresses (share with terminals)</p>
                    <div className="flex flex-wrap gap-2">
                      {info.localIps.map((ip) => (
                        <button key={ip} onClick={() => { navigator.clipboard.writeText(`http://${ip}:3001`); addToast({ title: 'Copied', variant: 'success' }) }} className="rounded-md border border-white bg-white px-2.5 py-1.5 text-xs font-mono hover:bg-violet-100 transition-colors">
                          http://{ip}:3001
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> How to connect terminals</p>
                  <div className="space-y-2 text-xs text-violet-600">
                    <p><span className="font-semibold">Same network (LAN):</span> Terminals will auto-discover this hub. Or use the IP address above.</p>
                    <p><span className="font-semibold">Different networks (Internet):</span> Use Cloudflare Tunnel (below).</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {deviceRole === 'hub' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  Shared Secret Key
                  <Badge className="bg-amber-100 text-amber-700 text-[10px] ml-auto">Hub pairing key</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-3">
                  <p className="text-[10px] text-amber-600 mb-2">This key is persisted on disk and survives app restarts. Share it with trusted terminals on your LAN or private tunnel.</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md bg-white dark:bg-gray-900 border px-3 py-2 font-mono text-xs">
                      {showHubSecret ? hubSecret : '•'.repeat(Math.min(hubSecret.length, 40))}
                    </div>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setShowHubSecret(!showHubSecret)}>
                      {showHubSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={copySecret}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={handleRegenerateSecret} disabled={secretLoading} className="gap-2">
                  {secretLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Regenerate Secret
                </Button>
                <p className="text-[10px] text-red-500">Warning: Regenerating will disconnect all terminals until they get the new key.</p>
              </CardContent>
            </Card>
          )}

          {/* ── Cloudflare Tunnel ── */}
          {deviceRole === 'hub' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-orange-500" />
                  Cloudflare Tunnel
                  {tunnelStatus?.running && <Badge className="bg-emerald-100 text-emerald-700 text-[10px] ml-auto">Live</Badge>}
                </CardTitle>
                <CardDescription className="text-xs">Expose your hub to the internet for free. No port forwarding needed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tunnelStatus && (
                  <div className={`flex items-center gap-3 rounded-lg border p-3 ${tunnelStatus.running ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50'}`}>
                    <TowerControl className={`h-5 w-5 shrink-0 ${tunnelStatus.running ? 'text-emerald-500' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${tunnelStatus.running ? 'text-emerald-700' : 'text-gray-500'}`}>{tunnelStatus.running ? 'Tunnel Active' : 'Tunnel Inactive'}</p>
                      {tunnelStatus.running && tunnelStatus.url && (
                        <p className="text-xs font-mono text-emerald-600 mt-0.5 flex items-center gap-1">{tunnelStatus.url}<button onClick={copyTunnelUrl} className="text-emerald-400 hover:text-emerald-700"><Copy className="h-3 w-3" /></button></p>
                      )}
                      {tunnelStatus.running && <p className="text-[10px] text-muted-foreground mt-0.5">Uptime: {formatUptime(tunnelStatus.uptime_secs)}</p>}
                    </div>
                  </div>
                )}

                {tunnelStatus && !tunnelStatus.cloudflared_installed && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-700">cloudflared not found</p>
                      <p className="text-[10px] text-amber-600">Download from cloudflare.com and place next to the app or add to PATH.</p>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Tunnel Token</Label>
                  <Input type="password" value={tunnelToken} onChange={(e) => setTunnelToken(e.target.value)} placeholder="Paste your Cloudflare Tunnel token" className="h-9 text-xs font-mono" />
                  <p className="text-[10px] text-muted-foreground">Run <code className="bg-muted px-1 py-0.5 rounded font-mono">cloudflared tunnel create selrx-hub</code> to get a token.</p>
                </div>

                {tunnelStatus?.running && !tunnelStatus?.url && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Manual URL</Label>
                    <div className="flex gap-2">
                      <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://abc-xyz.trycloudflare.com" className="h-9 text-xs font-mono" onKeyDown={(e) => e.key === 'Enter' && handleSetManualUrl()} />
                      <Button size="sm" onClick={handleSetManualUrl} className="h-9 shrink-0">Set</Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {!tunnelStatus?.running ? (
                    <Button size="sm" onClick={handleStartTunnel} disabled={tunnelLoading || !tunnelToken.trim()} className="gap-2 bg-orange-600 hover:bg-orange-700">
                      {tunnelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Start Tunnel
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={handleStopTunnel} disabled={tunnelLoading} className="gap-2">
                      {tunnelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />} Stop Tunnel
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={loadTunnelState} disabled={tunnelLoading} className="gap-2">
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </Button>
                </div>

                <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-4 space-y-3">
                  <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Setup Guide</p>
                  <ol className="space-y-1.5 text-xs text-orange-600 list-decimal list-inside">
                    <li>Install <span className="font-semibold">cloudflared</span> on this PC</li>
                    <li>Run <code className="bg-white dark:bg-gray-900 px-1.5 py-0.5 rounded border font-mono text-[11px]">cloudflared tunnel create selrx-hub</code></li>
                    <li>Copy the token from the output and paste above</li>
                    <li>Click <span className="font-semibold">Start Tunnel</span> — share the URL with terminals</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Offline Queue Status ── */}
          {deviceRole === 'terminal' && info.queueStats && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-orange-500" /> Offline Queue</CardTitle>
                <CardDescription className="text-[10px]">Persisted operations that survive app restarts. They sync automatically when the hub is reachable.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center">
                    <p className="text-lg font-bold text-amber-600">{info.queueStats.pending}</p>
                    <p className="text-[9px] text-amber-600 uppercase">Pending</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 text-center">
                    <p className="text-lg font-bold text-blue-600">{info.queueStats.in_progress}</p>
                    <p className="text-[9px] text-blue-600 uppercase">Active</p>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-center">
                    <p className="text-lg font-bold text-red-600">{info.queueStats.failed}</p>
                    <p className="text-[9px] text-red-600 uppercase">Failed</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center">
                    <p className="text-lg font-bold text-emerald-600">{info.queueStats.completed}</p>
                    <p className="text-[9px] text-emerald-600 uppercase">Done</p>
                  </div>
                </div>
                {info.queueStats.pending > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700">{info.queueStats.pending} items queued. They will sync automatically with exponential backoff (5s, 10s, 20s...).</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Sync Conflicts ── */}
          {conflicts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Sync Conflicts <Badge variant="destructive" className="ml-auto">{conflicts.filter((c) => !c.resolved).length} unresolved</Badge></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {conflicts.map((conflict) => (
                  <div key={conflict.id} className={`rounded-lg border p-3 space-y-2 ${conflict.resolved ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 opacity-60' : 'border-amber-200 bg-amber-50/50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono">{conflict.tableName}</Badge>
                        <span className="text-xs text-muted-foreground">{conflict.recordId.slice(0, 8)}...</span>
                      </div>
                      {conflict.resolved ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Kept {conflict.resolution === 'keep_hub' ? 'hub' : 'local'}</Badge>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleResolveConflict(conflict.id, 'keep_hub')}><Server className="h-3 w-3" /> Hub</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleResolveConflict(conflict.id, 'keep_local')}><Monitor className="h-3 w-3" /> Local</Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── How Sync Works ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Info className="h-4 w-4 text-gray-500" /> How Sync Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="font-semibold text-foreground flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5 text-emerald-500" /> Terminals Push</p>
                  <p>Transactions, returns, prescriptions, audit logs</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="font-semibold text-foreground flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-blue-500" /> Hub Pulls</p>
                  <p>Products, inventory, batches, customers, prices</p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/30 p-3">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-amber-700">
                  Sync runs every 10s via HTTP polling + real-time WebSocket push notifications.
                  Inventory uses delta-based sync (quantity changes) to prevent race conditions.
                  Offline operations are persisted to SQLite and survive app restarts.
                  Terminals auto-discover hubs on LAN via broadcast.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
