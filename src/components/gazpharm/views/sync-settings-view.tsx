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
  type SyncInfo,
  type SyncState,
  type SyncConflict,
} from '@/lib/sync-engine'
import { useAppStore } from '@/store/app-store'

// ── Connection test result ──────────────────────────────────────────────

interface TestResult {
  ok: boolean
  message: string
  latency?: number
}

// ── Status colors ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SyncState, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  idle:      { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Synced', icon: CheckCircle2 },
  syncing:   { color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',   label: 'Syncing...', icon: RefreshCw },
  error:     { color: 'text-red-600',     bg: 'bg-red-50 border-red-200',       label: 'Error', icon: XCircle },
  offline:   { color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',     label: 'Offline', icon: WifiOff },
}

// ── Component ───────────────────────────────────────────────────────────

export function SyncSettingsView() {
  const addToast = useAppStore((s) => s.addToast)
  const user = useAppStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [info, setInfo] = useState<SyncInfo>(() => getSyncInfo())
  const [hubUrlInput, setHubUrlInput] = useState('')
  const [deviceRole, setDeviceRole] = useState<'terminal' | 'hub'>('terminal')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  // ── Persist & listen ───────────────────────────────────────────────

  useEffect(() => {
    // Load saved settings from localStorage
    try {
      const saved = localStorage.getItem('selrx_sync_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.hubUrl) {
          setHubUrlInput(parsed.hubUrl)
        }
        if (parsed.deviceRole) {
          setDeviceRole(parsed.deviceRole)
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
 const unsub = onSyncStateChange((_state, newInfo) => {
      setInfo({ ...newInfo })
      // Refresh conflicts list
      setConflicts(getSyncConflicts())
    })
    return unsub
  }, [])

  const saveSettings = useCallback((settings: { hubUrl?: string; deviceRole?: string }) => {
    const current = JSON.parse(localStorage.getItem('selrx_sync_settings') || '{}')
    const updated = { ...current, ...settings }
    localStorage.setItem('selrx_sync_settings', JSON.stringify(updated))
  }, [])

  // ── Test connection ─────────────────────────────────────────────────

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
      const res = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      })
      const latency = Date.now() - start

      if (res.ok) {
        const data = await res.json()
        setTestResult({
          ok: true,
          message: `Connected to hub (${data.role || 'unknown'}). Latency: ${latency}ms`,
          latency,
        })
      } else {
        setTestResult({ ok: false, message: `Hub returned status ${res.status}` })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setTestResult({
        ok: false,
        message: `Cannot reach hub: ${msg}`,
      })
    } finally {
      setTesting(false)
    }
  }, [hubUrlInput])

  // ── Save & apply hub URL ───────────────────────────────────────────

  const applyHubUrl = useCallback(() => {
    if (!hubUrlInput.trim()) return

    setHubUrl(hubUrlInput.trim())
    saveSettings({ hubUrl: hubUrlInput.trim() })
    addToast({
      title: 'Hub URL Saved',
      description: 'Sync will use the new hub address',
      variant: 'success',
    })
  }, [hubUrlInput, setHubUrl, saveSettings, addToast])

  // ── Change device role ─────────────────────────────────────────────

  const applyDeviceRole = useCallback((role: 'terminal' | 'hub') => {
    setDeviceRole(role)
    saveSettings({ deviceRole: role })

    if (role === 'terminal') {
      if (hubUrlInput.trim()) {
        startSync(hubUrlInput.trim())
      }
    } else {
      stopSync()
    }

    addToast({
      title: `Role: ${role === 'hub' ? 'Hub (Server)' : 'Terminal'}`,
      description: role === 'hub'
        ? 'This device will act as the sync server for other terminals'
        : 'This device will sync to the hub',
      variant: 'success',
    })
  }, [hubUrlInput, saveSettings, addToast, startSync, stopSync])

  // ── Manual sync ────────────────────────────────────────────────────

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

  // ── Copy device ID ─────────────────────────────────────────────────

  const copyDeviceId = useCallback(() => {
    navigator.clipboard.writeText(info.deviceId)
    addToast({ title: 'Copied', description: 'Device ID copied to clipboard', variant: 'success' })
  }, [info.deviceId, addToast])

  // ── Resolve conflict ──
  const handleResolveConflict = useCallback(async (conflictId: string, resolution: 'keep_local' | 'keep_hub') => {
    await resolveConflict(conflictId, resolution)
    setConflicts(getSyncConflicts())
    addToast({ title: 'Conflict Resolved', description: `Kept ${resolution === 'keep_hub' ? 'hub' : 'local'} version`, variant: 'success' })
  }, [addToast])

  // ── Not desktop? Show info only ────────────────────────────────────

  if (!isDesktop()) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-600" />
            Device Sync
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure multi-device synchronization
          </p>
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Shield className="h-8 w-8 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Cloud Mode Active</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  You are currently running on the web (Vercel + Turso cloud). 
                  Device sync settings are only available in the desktop app. 
                  All data is already synchronized through the cloud database.
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 max-w-md">
                <p className="text-xs text-blue-700 font-medium flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  To use offline sync between devices, install the desktop app using Tauri.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Desktop UI ─────────────────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[info.state]
  const StatusIcon = statusCfg.icon

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-emerald-600" />
          Device Sync
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure multi-device synchronization for offline and online operation
        </p>
      </div>

      {/* ── Current Status ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Wifi className="h-4 w-4 text-emerald-500" />
            Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status banner */}
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${statusCfg.bg}`}>
            <StatusIcon className={`h-6 w-6 shrink-0 ${statusCfg.color} ${info.state === 'syncing' ? 'animate-spin' : ''}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${statusCfg.color}`}>{statusCfg.label}</p>
              {info.lastSyncAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last synced: {new Date(info.lastSyncAt).toLocaleString()}
                </p>
              )}
              {info.lastError && (
                <p className="text-xs text-red-500 mt-0.5">{info.lastError}</p>
              )}
            </div>
            {info.pendingCount > 0 && (
              <Badge variant="destructive" className="shrink-0">
                {info.pendingCount} pending
              </Badge>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Device ID</p>
              <p className="text-xs font-mono font-medium mt-1 flex items-center gap-1">
                {info.deviceId?.slice(0, 12)}...
                <button onClick={copyDeviceId} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3 w-3" />
                </button>
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Errors</p>
              <p className="text-xs font-medium mt-1">{info.errorCount}</p>
            </div>
          </div>

          {/* Manual sync button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing || !info.hubUrl}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Device Role ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4 text-violet-500" />
            Device Role
          </CardTitle>
          <CardDescription className="text-xs">
            Set whether this device is the sync hub (server) or a terminal (client)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Terminal option */}
            <button
              onClick={() => applyDeviceRole('terminal')}
              className={`relative rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${
                deviceRole === 'terminal'
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  deviceRole === 'terminal' ? 'bg-emerald-100' : 'bg-gray-100'
                }`}>
                  <Monitor className={`h-5 w-5 ${
                    deviceRole === 'terminal' ? 'text-emerald-600' : 'text-gray-400'
                  }`} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Terminal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connects to the hub for sync. Use for POS workstations.
                  </p>
                </div>
              </div>
              {deviceRole === 'terminal' && (
                <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-emerald-500" />
              )}
            </button>

            {/* Hub option */}
            <button
              onClick={() => isSuperAdmin && applyDeviceRole('hub')}
              disabled={!isSuperAdmin}
              className={`relative rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${
                !isSuperAdmin ? 'opacity-50 cursor-not-allowed border-gray-200' :
                deviceRole === 'hub'
                  ? 'border-violet-500 bg-violet-50/50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  deviceRole === 'hub' ? 'bg-violet-100' : 'bg-gray-100'
                }`}>
                  <Server className={`h-5 w-5 ${
                    deviceRole === 'hub' ? 'text-violet-600' : 'text-gray-400'
                  }`} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Hub (Server)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hosts sync server. Super admin only.
                  </p>
                </div>
              </div>
              {deviceRole === 'hub' && (
                <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-violet-500" />
              )}
              {!isSuperAdmin && (
                <div className="absolute bottom-3 right-3">
                  <Badge variant="secondary" className="text-[10px]">Super Admin only</Badge>
                </div>
              )}
            </button>
          </div>

          {!isSuperAdmin && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Only the Super Admin can set a device as Hub. Contact your administrator to change this.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Hub Connection (Terminal mode only) ── */}
      {deviceRole === 'terminal' && (
        <Card>
          <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-500" />
            Hub Connection
          </CardTitle>
          <CardDescription className="text-xs">
            Enter the URL of the hub device. For LAN use the hub's local IP (e.g. http://192.168.1.100:3001). For internet, use a Cloudflare Tunnel URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Hub URL</Label>
            <div className="flex gap-2">
              <Input
                value={hubUrlInput}
                onChange={(e) => setHubUrlInput(e.target.value)}
                placeholder="http://192.168.1.100:3001"
                className="h-9 text-xs font-mono"
                onKeyDown={(e) => e.key === 'Enter' && applyHubUrl()}
              />
              <Button size="sm" onClick={applyHubUrl} className="h-9 shrink-0">
                Save
              </Button>
            </div>
          </div>

          {/* Quick examples */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Examples</p>
            <div className="space-y-1.5">
              <button
                onClick={() => setHubUrlInput('http://192.168.1.100:3001')}
                className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-mono"
              >
                LAN: http://192.168.1.100:3001
              </button>
              <button
                onClick={() => setHubUrlInput('https://example.trycloudflare.com')}
                className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-mono"
              >
                Internet (Tunnel): https://example.trycloudflare.com
              </button>
            </div>
          </div>

          {/* Test connection */}
          <Button
            variant="outline"
            size="sm"
            onClick={testConnection}
            disabled={testing || !hubUrlInput.trim()}
            className="gap-2"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 ${
              testResult.ok
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-red-200 bg-red-50/50'
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              }
              <p className={`text-xs ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {testResult.message}
              </p>
            </div>
          )}
        </CardContent>
        </Card>
      )}

      {/* ── Hub Info (Hub mode only) ── */}
      {deviceRole === 'hub' && (
        <Card>
          <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-violet-500" />
            Hub Server Info
          </CardTitle>
          <CardDescription className="text-xs">
            This device is running the sync server. Other terminals connect to this address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <Separator />

          <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              How to connect terminals
            </p>
            <div className="space-y-2 text-xs text-violet-600">
              <p><span className="font-semibold">Same network (LAN):</span> Terminals use your local IP address. Find it by running <code className="bg-white px-1.5 py-0.5 rounded border font-mono text-[11px]">ipconfig</code> in PowerShell. Example: http://192.168.1.100:3001</p>
              <p><span className="font-semibold">Different networks (Internet):</span> Install Cloudflare Tunnel and run <code className="bg-white px-1.5 py-0.5 rounded border font-mono text-[11px]">cloudflared tunnel --url http://localhost:3001</code>. Share the generated URL with terminals.</p>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {/* ── Sync Conflicts ── */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Sync Conflicts
              <Badge variant="destructive" className="ml-auto">
                {conflicts.filter((c) => !c.resolved).length} unresolved
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              These records were modified on both the hub and this device. Choose which version to keep.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  conflict.resolved
                    ? 'border-gray-200 bg-gray-50/50 opacity-60'
                    : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">{conflict.tableName}</Badge>
                    <span className="text-xs text-muted-foreground">{conflict.recordId.slice(0, 8)}...</span>
                  </div>
                  {conflict.resolved ? (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                      Kept {conflict.resolution === 'keep_hub' ? 'hub' : 'local'}
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => handleResolveConflict(conflict.id, 'keep_hub')}
                      >
                        <Server className="h-3 w-3" /> Keep Hub
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => handleResolveConflict(conflict.id, 'keep_local')}
                      >
                        <Monitor className="h-3 w-3" /> Keep Local
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded bg-white/80 border p-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Hub Version</p>
                    <p className="text-[10px] text-gray-600 mt-0.5 font-mono truncate">
                      {JSON.stringify(conflict.hubData).slice(0, 80)}...
                    </p>
                  </div>
                  <div className="rounded bg-white/80 border p-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">Local Version</p>
                    <p className="text-[10px] text-gray-600 mt-0.5 font-mono truncate">
                      {JSON.stringify(conflict.localData).slice(0, 80)}...
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Sync Details ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-gray-500" />
            How Sync Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-emerald-500" />
                Terminals Push
              </p>
              <p>Transactions, returns, prescriptions, audit logs</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-blue-500" />
                Hub Pulls
              </p>
              <p>Products, inventory, batches, customers, categories, prices</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/30 p-3">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-700">
              Sync runs automatically every 30 seconds when online. The hub's data always wins in conflicts for master data (products, prices). Transaction data from terminals is never overwritten.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
