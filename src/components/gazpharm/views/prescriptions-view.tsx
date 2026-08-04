'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Search, Plus, AlertTriangle, CheckCircle, Clock,
  XCircle, ChevronRight, Eye, Ban, Play, Printer, ClipboardList
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { formatDate, formatDateTime } from '@/lib/date-utils'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'

interface Prescription {
  id: string
  rxNumber: string
  patientName: string
  productName: string
  productNdc: string | null
  prescriberName: string
  prescriberNPI: string | null
  prescriberPhone: string | null
  dosage: string | null
  quantity: number
  refillsRemaining: number
  refillsTotal: number
  daysSupply: number | null
  dispenseAsWritten: boolean
  priority: string
  status: string
  notes: string | null
  filledById: string | null
  verifiedById: string | null
  createdAt: string
  expiresAt: string | null
  customer?: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    allergies: string | null
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  READY: { label: 'Ready', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DISPENSED: { label: 'Dispensed', color: 'bg-green-100 text-green-700 border-green-200' },
  EXPIRED: { label: 'Expired', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  ROUTINE: { label: 'Routine', color: 'bg-gray-100 text-gray-600' },
  URGENT: { label: 'Urgent', color: 'bg-amber-100 text-amber-700' },
  STAT: { label: 'STAT', color: 'bg-red-100 text-red-700' },
}

export function PrescriptionsView() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [detailDialog, setDetailDialog] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null)
  const [form, setForm] = useState({
    patientName: '', productName: '', productNdc: '', prescriberName: '',
    prescriberNPI: '', prescriberPhone: '', dosage: '', quantity: '1',
    refillsTotal: '0', daysSupply: '30', priority: 'ROUTINE', notes: '',
  })
  const user = useAppStore((s) => s.user)
  const addToast = useAppStore((s) => s.addToast)

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/prescriptions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setPrescriptions(Array.isArray(data) ? data : data.prescriptions || [])
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load prescriptions', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery, addToast])

  useEffect(() => { fetchPrescriptions() }, [fetchPrescriptions])

  const statusCounts = {
    pending: prescriptions.filter((r) => r.status === 'PENDING').length,
    inProgress: prescriptions.filter((r) => r.status === 'IN_PROGRESS').length,
    ready: prescriptions.filter((r) => r.status === 'READY').length,
  }

  const handleAction = async (rx: Prescription, action: 'verify' | 'fill' | 'cancel') => {
    try {
      if (action === 'verify') {
        await fetch(`/api/prescriptions/${rx.id}?action=verify`, { method: 'PUT' })
        addToast({ title: 'Verified', description: `${rx.rxNumber} verified`, variant: 'success' })
      } else if (action === 'fill') {
        await fetch(`/api/prescriptions/${rx.id}?action=fill`, { method: 'PUT' })
        addToast({ title: 'Filled', description: `${rx.rxNumber} dispensed`, variant: 'success' })
      } else {
        await fetch(`/api/prescriptions/${rx.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED' }),
        })
        addToast({ title: 'Cancelled', description: `${rx.rxNumber} cancelled` })
      }
      fetchPrescriptions()
    } catch {
      addToast({ title: 'Error', description: 'Action failed', variant: 'destructive' })
    }
  }

  const handleCreate = async () => {
    try {
      await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          quantity: parseInt(form.quantity),
          refillsTotal: parseInt(form.refillsTotal),
          daysSupply: parseInt(form.daysSupply),
          refillsRemaining: parseInt(form.refillsTotal),
          customerId: 'demo-customer',
        }),
      })
      addToast({ title: 'Created', description: 'New prescription created', variant: 'success' })
      setCreateDialog(false)
      fetchPrescriptions()
    } catch {
      addToast({ title: 'Error', description: 'Failed to create prescription', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader icon={ClipboardList} title="Prescriptions" description="Track and manage prescription orders" />

      {/* Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <Card className="border-amber-200 bg-amber-50/50 card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-700">{statusCounts.pending}</p>
              <p className="text-xs text-amber-600">Pending Verification</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-sky-200 bg-sky-50/50 card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <Play className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sky-700">{statusCounts.inProgress}</p>
              <p className="text-xs text-sky-600">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50 card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-700">{statusCounts.ready}</p>
              <p className="text-xs text-emerald-600">Ready for Pickup</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Rx #, patient, or medication..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50/50"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['ALL', 'PENDING', 'IN_PROGRESS', 'READY', 'DISPENSED', 'EXPIRED', 'CANCELLED'].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  className={statusFilter === s ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
            <Button onClick={() => setCreateDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              New Rx
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prescriptions Table */}
      <Card>
        <CardContent className="p-0">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead>Rx #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="hidden md:table-cell">Medication</TableHead>
                <TableHead className="hidden lg:table-cell">Prescriber</TableHead>
                <TableHead className="hidden sm:table-cell">Refills</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : prescriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState icon={ClipboardList} title="No prescriptions found" description="Create a new prescription or adjust your filters" />
                  </TableCell>
                </TableRow>
              ) : (
                prescriptions.map((rx) => {
                  const statusCfg = STATUS_CONFIG[rx.status] || STATUS_CONFIG.PENDING
                  const priorityCfg = PRIORITY_CONFIG[rx.priority] || PRIORITY_CONFIG.ROUTINE
                  return (
                    <TableRow key={rx.id}>
                      <TableCell className="font-mono text-xs font-medium">{rx.rxNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{rx.patientName}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm">{rx.productName}</p>
                        {rx.dosage && <p className="text-xs text-gray-600">{rx.dosage} × {rx.quantity}</p>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{rx.prescriberName}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {rx.refillsRemaining}/{rx.refillsTotal}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${priorityCfg.color}`}>{priorityCfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-gray-600">
                        {formatDate(rx.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedRx(rx); setDetailDialog(true) }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {rx.status === 'PENDING' && (user?.role === 'PHARMACIST' || user?.role === 'SUPER_ADMIN') && (
                            <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => handleAction(rx, 'verify')}>
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />Verify
                            </Button>
                          )}
                          {rx.status === 'IN_PROGRESS' && (
                            <Button size="sm" variant="ghost" className="text-sky-600" onClick={() => handleAction(rx, 'fill')}>
                              <Printer className="h-3.5 w-3.5 mr-1" />Fill
                            </Button>
                          )}
                          {rx.status === 'READY' && (
                            <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => handleAction(rx, 'fill')}>
                              <ChevronRight className="h-3.5 w-3.5 mr-1" />Dispense
                            </Button>
                          )}
                          {['PENDING', 'IN_PROGRESS'].includes(rx.status) && (
                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleAction(rx, 'cancel')}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
          </DialogHeader>
          {selectedRx && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Rx Number:</span><p className="font-medium font-mono">{selectedRx.rxNumber}</p></div>
                <div><span className="text-muted-foreground">Status:</span><p className="font-medium"><Badge className={STATUS_CONFIG[selectedRx.status]?.color}>{selectedRx.status}</Badge></p></div>
                <div><span className="text-muted-foreground">Patient:</span><p className="font-medium">{selectedRx.patientName}</p></div>
                <div><span className="text-muted-foreground">Priority:</span><p className="font-medium"><Badge className={PRIORITY_CONFIG[selectedRx.priority]?.color}>{selectedRx.priority}</Badge></p></div>
                <div><span className="text-muted-foreground">Medication:</span><p className="font-medium">{selectedRx.productName}</p></div>
                <div><span className="text-muted-foreground">NDC:</span><p className="font-medium font-mono">{selectedRx.productNdc || '—'}</p></div>
                <div><span className="text-muted-foreground">Prescriber:</span><p className="font-medium">{selectedRx.prescriberName}</p></div>
                <div><span className="text-muted-foreground">NPI:</span><p className="font-medium">{selectedRx.prescriberNPI || '—'}</p></div>
                <div><span className="text-muted-foreground">Dosage:</span><p className="font-medium">{selectedRx.dosage || '—'}</p></div>
                <div><span className="text-muted-foreground">Quantity:</span><p className="font-medium">{selectedRx.quantity}</p></div>
                <div><span className="text-muted-foreground">Refills:</span><p className="font-medium">{selectedRx.refillsRemaining}/{selectedRx.refillsTotal}</p></div>
                <div><span className="text-muted-foreground">Days Supply:</span><p className="font-medium">{selectedRx.daysSupply || '—'}</p></div>
                <div><span className="text-muted-foreground">DAW:</span><p className="font-medium">{selectedRx.dispenseAsWritten ? 'Yes' : 'No'}</p></div>
                <div><span className="text-muted-foreground">Created:</span><p className="font-medium">{formatDateTime(selectedRx.createdAt)}</p></div>
              </div>
              {selectedRx.notes && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedRx.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Prescription Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Prescription</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            <div className="col-span-2">
              <Label>Patient Name</Label>
              <Input value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} placeholder="Full name" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Medication Name</Label>
              <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="Drug name" className="mt-1" />
            </div>
            <div>
              <Label>NDC (optional)</Label>
              <Input value={form.productNdc} onChange={(e) => setForm({ ...form, productNdc: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Dosage</Label>
              <Input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="e.g., 500mg" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Prescriber Name</Label>
              <Input value={form.prescriberName} onChange={(e) => setForm({ ...form, prescriberName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>NPI</Label>
              <Input value={form.prescriberNPI} onChange={(e) => setForm({ ...form, prescriberNPI: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.prescriberPhone} onChange={(e) => setForm({ ...form, prescriberPhone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Refills</Label>
              <Input type="number" value={form.refillsTotal} onChange={(e) => setForm({ ...form, refillsTotal: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Days Supply</Label>
              <Input type="number" value={form.daysSupply} onChange={(e) => setForm({ ...form, daysSupply: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="STAT">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={!form.patientName || !form.productName || !form.prescriberName}>
              Create Prescription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
