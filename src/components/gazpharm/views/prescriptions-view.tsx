'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Search, Plus, AlertTriangle, CheckCircle, Clock,
  XCircle, ChevronRight, Eye, Ban, Play, Printer, ClipboardList,
  RotateCcw, Loader2, X, Download,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAppStore } from '@/store/app-store'
import { formatDate, formatDateTime } from '@/lib/date-utils'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { authHeaders } from '@/lib/auth-headers'

// ── Types ──────────────────────────────────────────────────────────────────

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
  customerId?: string | null
  customer?: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    allergies: string | null
  }
}

interface CustomerOption {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

interface ProductOption {
  id: string
  name: string
  ndc: string | null
  strength: string | null
  dosageForm: string | null
  sellingPrice: number | null
}

// ── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  READY: { label: 'Ready', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DISPENSED: { label: 'Dispensed', color: 'bg-green-100 text-green-700 border-green-200' },
  EXPIRED: { label: 'Expired', color: 'bg-gray-100 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  ROUTINE: { label: 'Routine', color: 'bg-gray-100 text-gray-600' },
  URGENT: { label: 'Urgent', color: 'bg-amber-100 text-amber-700' },
  STAT: { label: 'STAT', color: 'bg-red-100 text-red-700' },
}

// ── Component ──────────────────────────────────────────────────────────────

export function PrescriptionsView() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [detailDialog, setDetailDialog] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null)

  // Customer / product lookup data
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [lookupLoading, setLookupLoading] = useState(false)

  // Search states for combobox popovers
  const [customerSearch, setCustomerSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false)
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)

  const [form, setForm] = useState({
    customerId: '',
    patientName: '', productName: '', productNdc: '', prescriberName: '',
    prescriberNPI: '', prescriberPhone: '', dosage: '', quantity: '1',
    refillsTotal: '0', daysSupply: '30', priority: 'ROUTINE', notes: '',
    strength: '', dosageForm: '',
  })
  const [exportingCSV, setExportingCSV] = useState(false)

  const user = useAppStore((s) => s.user)
  const addToast = useAppStore((s) => s.addToast)

  // ── Fetch prescriptions ─────────────────────────────────────────────────

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/prescriptions?${params}`, { headers: authHeaders() })
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

  // ── Fetch customers & products on dialog open ──────────────────────────

  const fetchLookupData = useCallback(async () => {
    setLookupLoading(true)
    try {
      const [custRes, prodRes] = await Promise.all([
        fetch('/api/customers?limit=100', { headers: authHeaders() }),
        fetch('/api/products?limit=50&status=ACTIVE', { headers: authHeaders() }),
      ])
      if (custRes.ok) {
        const custData = await custRes.json()
        const custArr = Array.isArray(custData) ? custData : custData.customers || []
        setCustomers(custArr)
      }
      if (prodRes.ok) {
        const prodData = await prodRes.json()
        const prodArr = Array.isArray(prodData) ? prodData : prodData.products || []
        setProducts(prodArr)
      }
    } catch {
      // silently fail — user can still type manually
    } finally {
      setLookupLoading(false)
    }
  }, [])

  const openCreateDialog = (prefill?: Prescription) => {
    if (prefill) {
      // Refill mode — pre-fill form from original Rx
      setForm({
        customerId: prefill.customerId || '',
        patientName: prefill.patientName,
        productName: prefill.productName,
        productNdc: prefill.productNdc || '',
        prescriberName: prefill.prescriberName,
        prescriberNPI: prefill.prescriberNPI || '',
        prescriberPhone: prefill.prescriberPhone || '',
        dosage: prefill.dosage || '',
        quantity: String(prefill.quantity),
        refillsTotal: String(prefill.refillsTotal),
        daysSupply: prefill.daysSupply ? String(prefill.daysSupply) : '30',
        priority: prefill.priority,
        notes: `Refill of ${prefill.rxNumber}`,
        strength: '',
        dosageForm: '',
      })
      setCustomerSearch(`${prefill.patientName}`)
      setProductSearch(prefill.productName)
    } else {
      setForm({
        customerId: '',
        patientName: '', productName: '', productNdc: '', prescriberName: '',
        prescriberNPI: '', prescriberPhone: '', dosage: '', quantity: '1',
        refillsTotal: '0', daysSupply: '30', priority: 'ROUTINE', notes: '',
        strength: '', dosageForm: '',
      })
      setCustomerSearch('')
      setProductSearch('')
    }
    setCreateDialog(true)
    fetchLookupData()
  }

  // ── Derived lists ─────────────────────────────────────────────────────

  const filteredCustomers = customerSearch.trim()
    ? customers.filter((c) => {
        const q = customerSearch.toLowerCase()
        return (
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
        )
      })
    : customers

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => {
        const q = productSearch.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          (p.ndc && p.ndc.includes(q)) ||
          (p.strength && p.strength.toLowerCase().includes(q)) ||
          (p.dosageForm && p.dosageForm.toLowerCase().includes(q))
        )
      })
    : products

  const selectedCustomerObj = customers.find((c) => c.id === form.customerId)

  // ── Status counts ─────────────────────────────────────────────────────

  const statusCounts = {
    pending: prescriptions.filter((r) => r.status === 'PENDING').length,
    inProgress: prescriptions.filter((r) => r.status === 'IN_PROGRESS').length,
    ready: prescriptions.filter((r) => r.status === 'READY').length,
  }

  // ── Actions ───────────────────────────────────────────────────────────

  const handleAction = async (rx: Prescription, action: 'verify' | 'fill' | 'cancel') => {
    try {
      if (action === 'verify') {
        await fetch(`/api/prescriptions/${rx.id}?action=verify`, { method: 'PUT', headers: authHeaders() })
        addToast({ title: 'Verified', description: `${rx.rxNumber} verified`, variant: 'success' })
      } else if (action === 'fill') {
        await fetch(`/api/prescriptions/${rx.id}?action=fill`, { method: 'PUT', headers: authHeaders() })
        addToast({ title: 'Filled', description: `${rx.rxNumber} dispensed`, variant: 'success' })
      } else {
        await fetch(`/api/prescriptions/${rx.id}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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
      const payload: Record<string, unknown> = {
        ...form,
        quantity: parseInt(form.quantity),
        refillsTotal: parseInt(form.refillsTotal),
        daysSupply: parseInt(form.daysSupply),
        refillsRemaining: parseInt(form.refillsTotal),
      }
      // Only send customerId if one is selected; otherwise send patientName
      if (form.customerId) {
        payload.customerId = form.customerId
      }
      // Remove extra fields that aren't part of the API
      delete payload.strength
      delete payload.dosageForm

      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        addToast({ title: 'Created', description: 'New prescription created', variant: 'success' })
        setCreateDialog(false)
        fetchPrescriptions()
      } else {
        addToast({ title: 'Error', description: 'Failed to create prescription', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to create prescription', variant: 'destructive' })
    }
  }

  const selectCustomer = (c: CustomerOption) => {
    setForm((prev) => ({ ...prev, customerId: c.id, patientName: `${c.firstName} ${c.lastName}` }))
    setCustomerSearch(`${c.firstName} ${c.lastName}`)
    setCustomerPopoverOpen(false)
  }

  // ── CSV Export ──────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    setExportingCSV(true)
    try {
      const params = new URLSearchParams({ limit: '10000' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/prescriptions?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const exportRxs: Prescription[] = Array.isArray(data) ? data : data.prescriptions || []

      const headers = ['Rx Number', 'Patient', 'Medication', 'Prescriber', 'Status', 'Priority', 'Quantity', 'Refills Remaining', 'Created']
      const rows = exportRxs.map((rx) => [
        rx.rxNumber,
        rx.patientName,
        rx.productName,
        rx.prescriberName,
        rx.status,
        rx.priority,
        String(rx.quantity),
        String(rx.refillsRemaining),
        rx.createdAt || '',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `prescriptions-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export error:', err)
      addToast({ title: 'Export Failed', description: 'Could not export prescriptions CSV', variant: 'destructive' })
    } finally {
      setExportingCSV(false)
    }
  }

  const selectProduct = (p: ProductOption) => {
    setForm((prev) => ({
      ...prev,
      productName: p.name,
      productNdc: p.ndc || '',
      dosage: p.strength || prev.dosage,
      strength: p.strength || '',
      dosageForm: p.dosageForm || '',
    }))
    setProductSearch(p.name)
    setProductPopoverOpen(false)
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <PageHeader icon={ClipboardList} title="Prescriptions" description="Track and manage prescription orders" action={
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={exportingCSV}
          className="gap-2"
        >
          {exportingCSV ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export CSV
        </Button>
      } />

      {/* Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <Card className="border-amber-200 bg-amber-50/50 card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-amber-700">{statusCounts.pending}</p>
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
              <p className="text-xl sm:text-2xl font-bold text-sky-700">{statusCounts.inProgress}</p>
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
              <p className="text-xl sm:text-2xl font-bold text-emerald-700">{statusCounts.ready}</p>
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
            <Button onClick={() => openCreateDialog()} className="bg-emerald-600 hover:bg-emerald-700">
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
                          {/* TASK 5: Refill button for dispensed prescriptions with remaining refills */}
                          {rx.status === 'DISPENSED' && rx.refillsRemaining > 0 && (
                            <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => openCreateDialog(rx)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />Refill
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

      {/* Create / Refill Prescription Dialog */}
      <Dialog open={createDialog} onOpenChange={(open) => { if (!open) setCreateDialog(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Prescription</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {/* TASK 1: Customer Search/Select */}
            <div className="col-span-2">
              <Label>Customer *</Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <div className="relative mt-1">
                    {lookupLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Input
                      placeholder="Search customer by name, email, or phone..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setCustomerPopoverOpen(true)
                        // Clear customerId if user is typing a new search
                        if (form.customerId) {
                          const match = customers.find(
                            (c) => `${c.firstName} ${c.lastName}` === e.target.value
                          )
                          if (!match) {
                            setForm((prev) => ({ ...prev, customerId: '' }))
                          }
                        }
                      }}
                      onFocus={() => setCustomerPopoverOpen(true)}
                      className={selectedCustomerObj ? 'pr-16' : ''}
                    />
                    {selectedCustomerObj && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, customerId: '', patientName: '' }))
                          setCustomerSearch('')
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">No customers found</p>
                    ) : (
                      filteredCustomers.slice(0, 20).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${form.customerId === c.id ? 'bg-muted' : ''}`}
                          onClick={() => selectCustomer(c)}
                        >
                          <p className="font-medium">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-muted-foreground">
                            {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* TASK 2: Product Autocomplete */}
            <div className="col-span-2">
              <Label>Medication Name *</Label>
              <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                <PopoverTrigger asChild>
                  <div className="relative mt-1">
                    {lookupLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Input
                      placeholder="Search medication by name, NDC, strength..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value)
                        setProductPopoverOpen(true)
                        setForm((prev) => ({ ...prev, productName: e.target.value }))
                      }}
                      onFocus={() => setProductPopoverOpen(true)}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">No products found</p>
                    ) : (
                      filteredProducts.slice(0, 20).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                          onClick={() => selectProduct(p)}
                        >
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[p.ndc, p.strength, p.dosageForm, p.sellingPrice != null ? `$${p.sellingPrice}` : null].filter(Boolean).join(' · ')}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
              <Label>Prescriber Name *</Label>
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