'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Printer,
  ScanLine,
  DoorOpen,
  Tag,
  Scale as ScaleIcon,
  TestTube2,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MonitorSmartphone,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { useAppStore } from '@/store/app-store'
import { formatDateTime } from '@/lib/date-utils'

type DeviceKey = 'receiptPrinter' | 'barcodeScanner' | 'cashDrawer' | 'labelPrinter' | 'scale'

type DeviceInfo = {
  connected: boolean
  name: string
  status: string
  paperLevel?: string
}

interface HardwareStatus {
  receiptPrinter: DeviceInfo
  barcodeScanner: DeviceInfo
  cashDrawer: DeviceInfo
  labelPrinter: DeviceInfo
  scale: DeviceInfo
  lastChecked: string
}

interface LogEntry {
  id: string
  createdAt: string
  hardwareType: string
  action: string
  status: string
  details: string | null
}

const DEVICE_CONFIG: Record<DeviceKey, { label: string; icon: React.ComponentType<{ className?: string }>; port?: string }> = {
  receiptPrinter: { label: 'Receipt Printer', icon: Printer, port: 'USB-001' },
  barcodeScanner: { label: 'Barcode Scanner', icon: ScanLine, port: 'USB-002' },
  cashDrawer: { label: 'Cash Drawer', icon: DoorOpen, port: 'USB-003' },
  labelPrinter: { label: 'Label Printer', icon: Tag, port: 'USB-004' },
  scale: { label: 'Scale', icon: ScaleIcon, port: 'COM-001' },
}

function getStatusColor(status: string): string {
  if (status === 'ready' || status === 'closed') return 'bg-emerald-500'
  if (status === 'disconnected' || status === 'error') return 'bg-red-500'
  return 'bg-yellow-500'
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready' || status === 'closed') {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Connected</Badge>
  }
  if (status === 'disconnected') {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Disconnected</Badge>
  }
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Warning</Badge>
}

function DeviceCard({
  deviceKey,
  device,
  onTest,
  onConfigure,
}: {
  deviceKey: DeviceKey
  device: DeviceInfo
  onTest: (key: DeviceKey) => void
  onConfigure: (key: DeviceKey) => void
}) {
  const config = DEVICE_CONFIG[deviceKey]
  const Icon = config.icon
  const statusColor = getStatusColor(device.status)

  return (
    <Card className="card-hover relative overflow-hidden transition-shadow hover:shadow-md">
      <div className="absolute top-0 left-0 h-1 w-full bg-emerald-600" />
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
            <Icon className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">{config.label}</CardTitle>
            <CardDescription className="text-xs">{config.port}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-2.5 w-2.5 rounded-full ${statusColor} animate-pulse`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 space-y-1">
          <p className="truncate text-sm font-medium text-foreground">{device.name}</p>
          {device.paperLevel && (
            <p className="text-xs text-muted-foreground">Paper: {device.paperLevel}</p>
          )}
          <div className="mt-2">
            <StatusBadge status={device.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onTest(deviceKey)}
            disabled={!device.connected}
          >
            <TestTube2 className="mr-1 h-3 w-3" />
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onConfigure(deviceKey)}
          >
            <Settings className="mr-1 h-3 w-3" />
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DeviceCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  )
}

export function HardwareView() {
  const addToast = useAppStore((s) => s.addToast)
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>('receiptPrinter')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Hardware Log
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logFilter, setLogFilter] = useState('all')
  const [logPage, setLogPage] = useState(1)
  const logsPerPage = 10

  // Config settings
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [configDevice, setConfigDevice] = useState<DeviceKey>('receiptPrinter')
  const [printerSettings, setPrinterSettings] = useState({ paperSize: '80mm', copies: 1, autoCut: true })
  const [scannerSettings, setScannerSettings] = useState<{ type: 'USB' | 'Bluetooth' | 'Serial' }>({ type: 'USB' })
  const [drawerSettings, setDrawerSettings] = useState<{ connectionType: 'USB' | 'Serial'; openDuration: number }>({ connectionType: 'USB', openDuration: 3 })

  const fetchHardwareStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/hardware?action=status')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setHardwareStatus(data)
    } catch {
      addToast({ title: 'Error', description: 'Failed to fetch hardware status', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (logFilter !== 'all') params.set('filter', logFilter)
      params.set('page', logPage.toString())
      params.set('limit', '50')
      const res = await fetch(`/api/hardware/logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch {
      setLogs([])
    }
  }, [logFilter, logPage])

  useEffect(() => {
    fetchHardwareStatus()
  }, [fetchHardwareStatus])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const stored = localStorage.getItem('selrx-hardware-config')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.printer) setPrinterSettings(parsed.printer)
        if (parsed.scanner) setScannerSettings(parsed.scanner)
        if (parsed.drawer) setDrawerSettings(parsed.drawer)
      } catch {
        // ignore corrupt config
      }
    }
  }, [])

  const saveConfig = () => {
    const config = { printer: printerSettings, scanner: scannerSettings, drawer: drawerSettings }
    localStorage.setItem('selrx-hardware-config', JSON.stringify(config))
    addToast({ title: 'Settings Saved', description: 'Hardware configuration saved successfully', variant: 'success' })
    setConfigDialogOpen(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const actionMap: Record<DeviceKey, string> = {
        receiptPrinter: 'receipt',
        barcodeScanner: 'barcode',
        cashDrawer: 'drawer',
        labelPrinter: 'label',
        scale: 'scale',
      }
      const res = await fetch(`/api/hardware?action=${actionMap[selectedDevice]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, device: selectedDevice }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({ success: true, message: data.message || `${DEVICE_CONFIG[selectedDevice].label} test successful` })
      } else {
        setTestResult({ success: false, message: data.error || 'Test failed' })
      }
    } catch {
      setTestResult({ success: false, message: 'Network error — device may be unreachable' })
    } finally {
      setTesting(false)
    }
  }

  const openTestDialog = (key: DeviceKey) => {
    setSelectedDevice(key)
    setTestResult(null)
    setTestDialogOpen(true)
  }

  const openConfigDialog = (key: DeviceKey) => {
    setConfigDevice(key)
    setConfigDialogOpen(true)
  }

  const filteredLogs = logFilter === 'all' ? logs : logs.filter((l) => l.hardwareType === logFilter)
  const paginatedLogs = filteredLogs.slice((logPage - 1) * logsPerPage, logPage * logsPerPage)
  const totalLogPages = Math.ceil(filteredLogs.length / logsPerPage)
  const deviceKeys: DeviceKey[] = ['receiptPrinter', 'barcodeScanner', 'cashDrawer', 'labelPrinter', 'scale']

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <PageHeader
        icon={MonitorSmartphone}
        title="Hardware"
        description="Configure printers, scanners, and connected devices"
        actions={
          <Button variant="outline" size="sm" onClick={fetchHardwareStatus}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        }
      />

      {/* Device Status Cards */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Device Status</h2>
        <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loading && !hardwareStatus
            ? Array.from({ length: 5 }).map((_, i) => <DeviceCardSkeleton key={i} />)
            : hardwareStatus && deviceKeys.map((key) => (
                <DeviceCard
                  key={key}
                  deviceKey={key}
                  device={hardwareStatus[key]}
                  onTest={openTestDialog}
                  onConfigure={openConfigDialog}
                />
              ))}
        </div>
      </section>

      {/* Hardware Log & Configuration */}
      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Hardware Log</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        {/* Log Table */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Hardware Activity Log</CardTitle>
                <CardDescription>Recent hardware events and interactions</CardDescription>
              </div>
              <Select value={logFilter} onValueChange={(v) => { setLogFilter(v); setLogPage(1) }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Filter by device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  {deviceKeys.map((key) => (
                    <SelectItem key={key} value={key}>{DEVICE_CONFIG[key].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <Card className="max-h-96 overflow-y-auto">
                <Table className="table-header-standard">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Timestamp</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0">
                          <EmptyState
                            title="No log entries"
                            description="Hardware activity logs will appear here once devices are used."
                            icon={AlertTriangle}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {DEVICE_CONFIG[log.hardwareType as DeviceKey]?.label || log.hardwareType}
                          </TableCell>
                          <TableCell className="text-sm">{log.action}</TableCell>
                          <TableCell>
                            {log.status === 'success' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : log.status === 'failed' ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-48 truncate text-xs text-muted-foreground sm:table-cell">
                            {log.details}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
              {totalLogPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {logPage} of {totalLogPages} ({filteredLogs.length} entries)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={logPage <= 1}
                      onClick={() => setLogPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={logPage >= totalLogPages}
                      onClick={() => setLogPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration */}
        <TabsContent value="configuration">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-base">Printer Settings</CardTitle>
                </div>
                <CardDescription>Configure receipt printer behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="paperSize">Paper Size</Label>
                  <Select
                    value={printerSettings.paperSize}
                    onValueChange={(v) => setPrinterSettings((s) => ({ ...s, paperSize: v }))}
                  >
                    <SelectTrigger id="paperSize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm (2 inch)</SelectItem>
                      <SelectItem value="80mm">80mm (3 inch)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="copies">Copies</Label>
                  <Input
                    id="copies"
                    type="number"
                    min={1}
                    max={5}
                    value={printerSettings.copies}
                    onChange={(e) => setPrinterSettings((s) => ({ ...s, copies: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="autoCut">Auto-Cut</Label>
                  <Switch
                    id="autoCut"
                    checked={printerSettings.autoCut}
                    onCheckedChange={(checked) => setPrinterSettings((s) => ({ ...s, autoCut: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ScanLine className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-base">Scanner Settings</CardTitle>
                </div>
                <CardDescription>Configure barcode scanner connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Scanner Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['USB', 'Bluetooth', 'Serial'] as const).map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant={scannerSettings.type === type ? 'default' : 'outline'}
                        className={scannerSettings.type === type ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                        onClick={() => setScannerSettings((s) => ({ ...s, type }))}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-base">Cash Drawer Settings</CardTitle>
                </div>
                <CardDescription>Configure cash drawer behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Connection Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['USB', 'Serial'] as const).map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant={drawerSettings.connectionType === type ? 'default' : 'outline'}
                        className={drawerSettings.connectionType === type ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                        onClick={() => setDrawerSettings((s) => ({ ...s, connectionType: type }))}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openDuration">Open Duration (seconds)</Label>
                  <Input
                    id="openDuration"
                    type="number"
                    min={1}
                    max={30}
                    value={drawerSettings.openDuration}
                    onChange={(e) => setDrawerSettings((s) => ({ ...s, openDuration: parseInt(e.target.value) || 3 }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator className="my-6" />

          <div className="flex justify-end">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveConfig}>
              Save All Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Test Hardware Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Device</DialogTitle>
            <DialogDescription>
              Send a test command to verify {DEVICE_CONFIG[selectedDevice].label} is working properly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              {(() => {
                const Icon = DEVICE_CONFIG[selectedDevice].icon
                return <Icon className="h-6 w-6 text-emerald-600" />
              })()}
              <div>
                <p className="font-medium">{DEVICE_CONFIG[selectedDevice].label}</p>
                <p className="text-sm text-muted-foreground">
                  {hardwareStatus?.[selectedDevice]?.name}
                </p>
              </div>
            </div>
            {testResult && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-red-50 text-red-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {testResult.message}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleTest}
              disabled={testing}
            >
              {testing && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Run Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
