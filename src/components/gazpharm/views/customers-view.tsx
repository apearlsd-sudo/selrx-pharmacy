'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, Search, Plus, Edit, Eye, Phone, Mail, Shield, X,
  Download, Loader2, ShoppingBag, ClipboardList, DollarSign,
  Award, Minus, Wallet, Receipt, Star,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAppStore } from '@/store/app-store'
import { formatDate, formatDateTime } from '@/lib/date-utils'
import { formatCurrency } from '@/lib/currency'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { authHeaders } from '@/lib/auth-headers'

// ── Types ──────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  gender: string | null
  address: string | null
  insuranceProvider: string | null
  insurancePolicyNo: string | null
  allergies: string | null
  notes: string | null
  loyaltyPoints?: number
  loyaltyTier?: string
}

interface Transaction {
  id: string
  transactionNumber: string
  itemsCount: number
  total: number
  status: string
  createdAt: string
}

interface Prescription {
  id: string
  rxNumber: string
  productName: string
  status: string
  createdAt: string
}

interface CustomerDetail {
  customer: Customer
  transactions: Transaction[]
  prescriptions: Prescription[]
}

// ── Status badge colours ──────────────────────────────────────────────────

const TXN_STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  VOIDED: 'bg-red-100 text-red-700 border-red-200',
  PENDING: 'bg-amber-100 text-amber-700 dark:text-amber-400 border-amber-200',
  REFUNDED: 'bg-gray-100 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
 PARTIAL_REFUND: 'bg-orange-100 text-orange-700 border-orange-200',
}

const RX_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:text-amber-400 border-amber-200',
  IN_PROGRESS: 'bg-sky-100 text-sky-700 border-sky-200',
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DISPENSED: 'bg-green-100 text-green-700 border-green-200',
  EXPIRED: 'bg-gray-100 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
}

// ── Component ──────────────────────────────────────────────────────────────

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [formDialog, setFormDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '',
    gender: '', address: '', insuranceProvider: '', insurancePolicyNo: '',
    allergies: '', notes: '',
  })
  const addToast = useAppStore((s) => s.addToast)

  // TASK 3: Customer detail state
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Loyalty state
  const [loyaltyAction, setLoyaltyAction] = useState<'add' | 'redeem' | null>(null)
  const [loyaltyAmount, setLoyaltyAmount] = useState('')
  const [loyaltyReason, setLoyaltyReason] = useState('')
  const [loyaltyInfo, setLoyaltyInfo] = useState<any>(null)
  const [loyaltyLoading, setLoyaltyLoading] = useState(false)
  // Loyalty transactions (from /api/loyalty)
  const [loyaltyTransactions, setLoyaltyTransactions] = useState<any[]>([])
  const [redeemPointsInput, setRedeemPointsInput] = useState('')
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)
  const [redeemLoading, setRedeemLoading] = useState(false)

  // Medication history state
  const [medHistory, setMedHistory] = useState<any>(null)
  const [medHistoryLoading, setMedHistoryLoading] = useState(false)

  // Notification dialog state
  const [showNotifDialog, setShowNotifDialog] = useState(false)
  const [notifType, setNotifType] = useState('REFILL_REMINDER')
  const [notifMessage, setNotifMessage] = useState('')
  const [notifSending, setNotifSending] = useState(false)

  // Credit account state
  const [creditSummary, setCreditSummary] = useState<{ totalOwed: number; totalPaid: number; outstandingBalance: number; lastPaymentDate: string | null } | null>(null)
  const [creditLedger, setCreditLedger] = useState<any[]>([])
  const [creditLoading, setCreditLoading] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)

  // TASK 4: CSV export state
  const [exporting, setExporting] = useState(false)

  // ── Fetch customers list ────────────────────────────────────────────────

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/customers?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setCustomers(Array.isArray(data) ? data : data.customers || [])
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load customers', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [searchQuery, addToast])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // ── TASK 3: Fetch customer detail with transactions & prescriptions ─────

  const openDetailDialog = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setDetailDialog(true)
    setDetailLoading(true)
    setCustomerDetail(null)
    setLoyaltyInfo(null)
    setCreditSummary(null)
    setCreditLedger([])
    try {
      const res = await fetch(`/api/customers/${customer.id}?include=transactions,prescriptions`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setCustomerDetail(data)
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load customer details', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
    // Fetch loyalty info (non-blocking)
    fetch(`/api/customers/${customer.id}/loyalty`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLoyaltyInfo(data) })
      .catch(() => {})
    // Fetch loyalty transactions from /api/loyalty
    fetch(`/api/loyalty?customerId=${customer.id}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLoyaltyTransactions(data.transactions || []) })
      .catch(() => {})
    // Fetch credit summary + ledger (non-blocking)
    fetchCreditData(customer.id)
    // Fetch medication history
    fetchMedHistory(customer.id)
  }

  // ── Form dialogs ───────────────────────────────────────────────────────

  const openCreateDialog = () => {
    setEditingCustomer(null)
    setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '', address: '', insuranceProvider: '', insurancePolicyNo: '', allergies: '', notes: '' })
    setFormDialog(true)
  }

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      firstName: customer.firstName, lastName: customer.lastName,
      email: customer.email || '', phone: customer.phone || '',
      dateOfBirth: customer.dateOfBirth || '', gender: customer.gender || '',
      address: customer.address || '', insuranceProvider: customer.insuranceProvider || '',
      insurancePolicyNo: customer.insurancePolicyNo || '', allergies: customer.allergies || '',
      notes: customer.notes || '',
    })
    setFormDialog(true)
  }

  const handleSave = async () => {
    if (!form.firstName || !form.lastName) return
    try {
      if (editingCustomer) {
        await fetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        addToast({ title: 'Updated', description: 'Customer updated', variant: 'success' })
      } else {
        await fetch('/api/customers', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        addToast({ title: 'Created', description: 'New customer added', variant: 'success' })
      }
      setFormDialog(false)
      fetchCustomers()
    } catch {
      addToast({ title: 'Error', description: 'Failed to save customer', variant: 'destructive' })
    }
  }

  // ── TASK 4: CSV Export ─────────────────────────────────────────────────

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/customers?limit=1000', {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const exportCustomers: Customer[] = Array.isArray(data) ? data : data.customers || []

      const headers = ['Name', 'Email', 'Phone', 'DOB', 'Gender', 'Insurance Provider', 'Policy No', 'Allergies', 'Created']
      const rows = exportCustomers.map((c) => [
        `${c.firstName} ${c.lastName}`,
        c.email ?? '',
        c.phone ?? '',
        c.dateOfBirth ?? '',
        c.gender ?? '',
        c.insuranceProvider ?? '',
        c.insurancePolicyNo ?? '',
        (c.allergies ?? '').replace(/"/g, '""'),
        c.createdAt ?? '',
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast({ title: 'Error', description: 'Failed to export customers', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  // ── TASK 3: Derived values for detail dialog ───────────────────────────

  const txns = customerDetail?.transactions || []
  const rxs = customerDetail?.prescriptions || []
  const totalSpent = txns.reduce((sum, t) => sum + (t.total || 0), 0)
  const purchaseCount = txns.length

  // Loyalty computed values
  const TIER_COLORS: Record<string, string> = {
    BRONZE: 'bg-amber-100 text-amber-700 dark:text-amber-400 border-amber-200',
    SILVER: 'bg-gray-100 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    GOLD: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    PLATINUM: 'bg-violet-100 text-violet-700 border-violet-200',
  }
  const tierColor = TIER_COLORS[selectedCustomer?.loyaltyTier || 'BRONZE'] || TIER_COLORS.BRONZE
  const tierDiscount = loyaltyInfo?.tierDiscount ?? 0

  // ── Credit account handlers ─────────────────────────────────────────
  const fetchCreditData = async (customerId: string) => {
    setCreditLoading(true)
    try {
      const [summaryRes, ledgerRes] = await Promise.all([
        fetch(`/api/customer-credits?action=summary&customerId=${customerId}`, { headers: authHeaders() }),
        fetch(`/api/customer-credits?customerId=${customerId}`, { headers: authHeaders() }),
      ])
      if (summaryRes.ok) setCreditSummary(await summaryRes.json())
      if (ledgerRes.ok) setCreditLedger(await ledgerRes.json())
    } catch {
      /* silent */
    } finally {
      setCreditLoading(false)
    }
  }

  const fetchMedHistory = async (customerId: string) => {
    setMedHistoryLoading(true)
    try {
      const res = await fetch(`/api/patient-records?customerId=${customerId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMedHistory(data)
      }
    } catch { /* silent */ }
    setMedHistoryLoading(false)
  }

  const handleSendNotification = async () => {
    if (!selectedCustomer || !notifMessage.trim()) return
    setNotifSending(true)
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          type: notifType,
          message: notifMessage.trim(),
        }),
      })
      if (res.ok) {
        addToast({ title: 'Notification Sent', description: `${notifType} notification queued.`, variant: 'success' })
        setShowNotifDialog(false)
        setNotifMessage('')
      } else {
        const err = await res.json()
        addToast({ title: 'Failed', description: err.error || 'Failed to send', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setNotifSending(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return
    const amt = parseFloat(paymentAmount)
    if (!amt || amt <= 0) return
    setPaymentSaving(true)
    try {
      const res = await fetch('/api/customer-credits', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount: -amt,
          description: paymentDescription || 'Payment received',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      addToast({ title: 'Payment Recorded', description: `${formatCurrency(amt)} payment applied`, variant: 'success' })
      setShowPaymentDialog(false)
      setPaymentAmount('')
      setPaymentDescription('')
      fetchCreditData(selectedCustomer.id)
    } catch (err) {
      addToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to record payment', variant: 'destructive' })
    } finally {
      setPaymentSaving(false)
    }
  }

  // ── Loyalty adjustment handler ─────────────────────────────────────────
  const handleLoyaltyAdjust = async () => {
    if (!selectedCustomer || !loyaltyAction) return
    const amt = parseInt(loyaltyAmount)
    if (!amt || amt <= 0) return
    setLoyaltyLoading(true)
    try {
      const res = await fetch(`/api/customers/${selectedCustomer.id}/loyalty`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: loyaltyAction, amount: amt, reason: loyaltyReason }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      const data = await res.json()
      setSelectedCustomer({ ...selectedCustomer, loyaltyPoints: data.loyaltyPoints, loyaltyTier: data.loyaltyTier })
      setLoyaltyInfo({ ...loyaltyInfo, loyaltyPoints: data.loyaltyPoints, loyaltyTier: data.loyaltyTier, tierDiscount: data.tierDiscount })
      setLoyaltyAction(null)
      setLoyaltyAmount('')
      setLoyaltyReason('')
      addToast({ title: 'Points Updated', description: `${data.loyaltyPoints} points — ${data.loyaltyTier} tier`, variant: 'success' })
      // Refresh loyalty transactions
      fetch(`/api/loyalty?customerId=${selectedCustomer.id}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLoyaltyTransactions(d.transactions || []) })
        .catch(() => {})
    } catch (err) {
      addToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' })
    }
    setLoyaltyLoading(false)
  }

  // ── Redeem points handler (via /api/loyalty) ─────────────────────────
  const handleRedeemPoints = async () => {
    if (!selectedCustomer) return
    const pts = parseInt(redeemPointsInput)
    if (!pts || pts <= 0) return
    const currentPts = selectedCustomer.loyaltyPoints || 0
    if (pts > currentPts) {
      addToast({ title: 'Insufficient Points', description: `Only ${currentPts} points available`, variant: 'destructive' })
      return
    }
    setRedeemLoading(true)
    try {
      const res = await fetch('/api/loyalty', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          points: -pts,
          action: 'REDEEMED',
          description: 'Points redeemed by customer',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to redeem')
      }
      const data = await res.json()
      setSelectedCustomer({ ...selectedCustomer, loyaltyPoints: data.balanceAfter, loyaltyTier: data.newTier })
      setLoyaltyInfo({ ...loyaltyInfo, loyaltyPoints: data.balanceAfter, loyaltyTier: data.newTier })
      setRedeemDialogOpen(false)
      setRedeemPointsInput('')
      addToast({ title: 'Points Redeemed', description: `${pts} points redeemed — ${data.balanceAfter} remaining`, variant: 'success' })
      // Refresh loyalty transactions
      fetch(`/api/loyalty?customerId=${selectedCustomer.id}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLoyaltyTransactions(d.transactions || []) })
        .catch(() => {})
    } catch (err) {
      addToast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to redeem points', variant: 'destructive' })
    } finally {
      setRedeemLoading(false)
    }
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* TASK 4: PageHeader with Export CSV action */}
      <PageHeader
        icon={Users}
        title="Customers"
        description="Manage your customer records and information"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{customers.length}</p>
              <p className="text-xs text-muted-foreground">Total Customers</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{customers.filter((c) => c.insuranceProvider).length}</p>
              <p className="text-xs text-muted-foreground">With Insurance</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{customers.filter((c) => c.allergies).length}</p>
              <p className="text-xs text-muted-foreground">Allergy Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-gray-800/50/50"
              />
            </div>
            <Button onClick={openCreateDialog} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              New Customer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">Tier</TableHead>
                <TableHead className="hidden md:table-cell">Insurance</TableHead>
                <TableHead className="hidden xl:table-cell">Allergies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState icon={Users} title="No customers found" description="Try adjusting your search or add a new customer" />
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                          {customer.firstName[0]}{customer.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{customer.firstName} {customer.lastName}</p>
                          <p className="text-xs text-muted-foreground">{customer.gender || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm space-y-0.5">
                        {customer.email && (
                          <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{customer.email}</p>
                        )}
                        {customer.phone && (
                          <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{customer.phone}</p>
                        )}
                        {!customer.email && !customer.phone && <p className="text-muted-foreground">No contact info</p>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge className={`text-[10px] ${TIER_COLORS[customer.loyaltyTier || 'BRONZE'] || ''}`}>{customer.loyaltyTier || 'BRONZE'}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {customer.insuranceProvider ? (
                        <Badge variant="outline" className="text-xs">{customer.insuranceProvider}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {customer.allergies ? (
                        <div className="flex flex-wrap gap-1">
                          {customer.allergies.split(',').map((a, i) => (
                            <Badge key={i} className="bg-red-100 text-red-700 border-red-200 text-xs">{a.trim()}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* TASK 3: View button fetches full detail with transactions/prescriptions */}
                        <Button size="sm" variant="ghost" onClick={() => openDetailDialog(customer)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(customer)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* TASK 3: Customer Detail Dialog with Tabs */}
      <Dialog open={detailDialog} onOpenChange={(open) => { if (!open) { setDetailDialog(false); setCustomerDetail(null) } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              {/* Customer Info Header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-base sm:text-lg font-bold text-emerald-700">
                  {selectedCustomer.firstName[0]}{selectedCustomer.lastName[0]}
                </div>
                <div className="flex-1">
                  <p className="text-base sm:text-lg font-semibold">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer.gender || ''}{selectedCustomer.dateOfBirth ? ` · DOB: ${selectedCustomer.dateOfBirth}` : ''}
                  </p>
                </div>
              </div>

              {/* Contact & Insurance Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{selectedCustomer.email || '—'}</p></div>
                <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{selectedCustomer.phone || '—'}</p></div>
                <div><span className="text-muted-foreground">Insurance:</span><p className="font-medium">{selectedCustomer.insuranceProvider || '—'}</p></div>
                <div><span className="text-muted-foreground">Policy #:</span><p className="font-medium">{selectedCustomer.insurancePolicyNo || '—'}</p></div>
                {selectedCustomer.allergies && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Allergies:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedCustomer.allergies.split(',').map((a, i) => (
                        <Badge key={i} className="bg-red-100 text-red-700 border-red-200">{a.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Spending Summary */}
              {!detailLoading && customerDetail && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/30 dark:bg-emerald-900/20 border border-emerald-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-base sm:text-lg font-bold text-emerald-700">${totalSpent.toFixed(2)}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Total Spent</p>
                    </div>
                  </div>
                  <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
                      <ShoppingBag className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <p className="text-base sm:text-lg font-bold text-sky-700">{purchaseCount}</p>
                      <p className="text-xs text-sky-600 dark:text-sky-400">Purchases</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Loyalty Points Section */}
              <div className="rounded-lg border p-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-500" />
                    Loyalty Program
                  </h4>
                  <Badge className={tierColor}>{selectedCustomer.loyaltyTier || 'BRONZE'}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-muted-foreground text-xs">Points Balance</p>
                    <p className="font-semibold text-lg">{selectedCustomer.loyaltyPoints || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Tier Discount</p>
                    <p className="font-semibold text-lg">{tierDiscount}%</p>
                  </div>
                </div>
                {/* Progress to next tier */}
                {loyaltyInfo?.nextTier && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{loyaltyInfo.pointsToNextTier} pts to {loyaltyInfo.nextTier.name}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all" style={{ width: `${Math.min(100, ((selectedCustomer.loyaltyPoints || 0) / loyaltyInfo.nextTier.minPoints) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLoyaltyAction('add')}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Points
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLoyaltyAction('redeem')}>
                    <Minus className="h-3.5 w-3.5 mr-1" /> Redeem Points
                  </Button>
                </div>
              </div>

              {/* Credit Account Section */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    Credit Account
                  </h4>
                  {(creditSummary?.outstandingBalance ?? 0) > 0 && (
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowPaymentDialog(true)}>
                      <DollarSign className="h-3 w-3 mr-1" />
                      Record Payment
                    </Button>
                  )}
                </div>
                {creditLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : creditSummary ? (
                  <div className="space-y-3">
                    {/* Outstanding Balance - Prominent */}
                    <div className={`rounded-lg p-3 flex items-center justify-between ${
                      creditSummary.outstandingBalance > 0
                        ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Receipt className={`h-4 w-4 ${creditSummary.outstandingBalance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                        <span className="text-xs font-medium text-muted-foreground">Outstanding Balance</span>
                      </div>
                      <span className={`text-lg font-bold ${creditSummary.outstandingBalance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {formatCurrency(creditSummary.outstandingBalance)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Total Credit Given</p>
                        <p className="font-semibold">{formatCurrency(creditSummary.totalOwed)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Total Paid</p>
                        <p className="font-semibold">{formatCurrency(creditSummary.totalPaid)}</p>
                      </div>
                    </div>
                    {creditSummary.lastPaymentDate && (
                      <p className="text-xs text-muted-foreground">Last payment: {formatDateTime(creditSummary.lastPaymentDate)}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No credit history</p>
                )}
              </div>

              {/* Tabs: Purchase History | Prescriptions | Credit Ledger */}
              {!detailLoading && customerDetail && (
                <Tabs defaultValue="purchases">
                  <TabsList>
                    <TabsTrigger value="purchases" className="gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Purchase History
                    </TabsTrigger>
                    <TabsTrigger value="prescriptions" className="gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Prescriptions
                    </TabsTrigger>
                    <TabsTrigger value="credit-ledger" className="gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      Credit Ledger
                    </TabsTrigger>
                    <TabsTrigger value="loyalty" className="gap-1.5">
                      <Star className="h-3.5 w-3.5" />
                      Loyalty
                    </TabsTrigger>
                    <TabsTrigger value="medication" className="gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Medication History
                    </TabsTrigger>
                  </TabsList>

                  {/* Purchase History Tab */}
                  <TabsContent value="purchases">
                    {txns.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No purchase history</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Txn #</TableHead>
                              <TableHead className="text-xs text-right">Items</TableHead>
                              <TableHead className="text-xs text-right">Total</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {txns.map((t) => (
                              <TableRow key={t.id}>
                                <TableCell className="text-xs whitespace-nowrap">{formatDate(t.createdAt)}</TableCell>
                                <TableCell className="text-xs font-mono">{t.transactionNumber}</TableCell>
                                <TableCell className="text-xs text-right">{t.itemsCount}</TableCell>
                                <TableCell className="text-xs text-right font-medium">${(t.total || 0).toFixed(2)}</TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${TXN_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-700 dark:text-gray-300'}`}>
                                    {t.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Prescriptions Tab */}
                  <TabsContent value="prescriptions">
                    {rxs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No prescriptions</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Rx #</TableHead>
                              <TableHead className="text-xs">Medication</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rxs.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="text-xs whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                                <TableCell className="text-xs font-mono">{r.rxNumber}</TableCell>
                                <TableCell className="text-xs">{r.productName}</TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${RXN_STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700 dark:text-gray-300'}`}>
                                    {r.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Credit Ledger Tab */}
                  <TabsContent value="credit-ledger">
                    {creditLedger.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No credit transactions</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-xs text-right">Amount</TableHead>
                              <TableHead className="text-xs text-right">Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {creditLedger.map((entry: any) => (
                              <TableRow key={entry.id}>
                                <TableCell className="text-xs whitespace-nowrap">{formatDateTime(entry.createdAt)}</TableCell>
                                <TableCell className="text-xs max-w-[120px] truncate">{entry.description || '—'}</TableCell>
                                <TableCell className={`text-xs text-right font-medium ${entry.amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {entry.amount > 0 ? '+' : ''}{formatCurrency(entry.amount)}
                                </TableCell>
                                <TableCell className="text-xs text-right font-medium">{formatCurrency(entry.balance)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Loyalty Tab */}
                  <TabsContent value="loyalty">
                    {loyaltyTransactions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No loyalty transactions yet</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Action</TableHead>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-xs text-right">Points</TableHead>
                              <TableHead className="text-xs text-right">Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {loyaltyTransactions.map((tx: any) => (
                              <TableRow key={tx.id}>
                                <TableCell className="text-xs whitespace-nowrap">{formatDateTime(tx.createdAt)}</TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] ${
                                    tx.action === 'EARNED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                    tx.action === 'REDEEMED' ? 'bg-red-100 text-red-700 border-red-200' :
                                    'bg-gray-100 text-gray-700 border-gray-200'
                                  }`}>
                                    {tx.action}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs max-w-[120px] truncate">{tx.description || '—'}</TableCell>
                                <TableCell className={`text-xs text-right font-medium ${tx.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {tx.points > 0 ? '+' : ''}{tx.points}
                                </TableCell>
                                <TableCell className="text-xs text-right font-medium">{tx.balanceAfter}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => setRedeemDialogOpen(true)}>
                        <Minus className="h-3.5 w-3.5 mr-1" />
                        Redeem Points
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Medication History Tab */}
                  <TabsContent value="medication">
                    {medHistoryLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : medHistory ? (
                      <div className="space-y-4">
                        {medHistory.customer?.allergies?.length > 0 && (
                          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                              <Shield className="h-3.5 w-3.5" /> Allergies
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {medHistory.customer.allergies.map((a: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px] border-red-300 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30">{a}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {medHistory.prescriptions?.length > 0 ? (
                          <div className="max-h-64 overflow-y-auto">
                            <p className="text-xs font-medium mb-2">Prescriptions ({medHistory.prescriptions.length})</p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Date</TableHead>
                                  <TableHead className="text-xs">Rx #</TableHead>
                                  <TableHead className="text-xs">Medication</TableHead>
                                  <TableHead className="text-xs">Prescriber</TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {medHistory.prescriptions.map((rx: any) => (
                                  <TableRow key={rx.id}>
                                    <TableCell className="text-xs whitespace-nowrap">{formatDate(rx.createdAt)}</TableCell>
                                    <TableCell className="text-xs font-mono">{rx.rxNumber}</TableCell>
                                    <TableCell className="text-xs">
                                      <div className="font-medium">{rx.productName}</div>
                                      {rx.dosage && <div className="text-muted-foreground">{rx.dosage} × {rx.quantity}</div>}
                                    </TableCell>
                                    <TableCell className="text-xs">{rx.prescriberName || '—'}</TableCell>
                                    <TableCell>
                                      <Badge className={`text-[10px] ${RX_STATUS_COLORS[rx.status] || 'bg-gray-100 text-gray-700 dark:text-gray-300'}`}>{rx.status}</Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">No prescription records</p>
                        )}
                        {medHistory.transactions?.length > 0 && (
                          <div className="max-h-64 overflow-y-auto">
                            <p className="text-xs font-medium mb-2">Dispensed Medications</p>
                            {medHistory.transactions.map((tx: any) => (
                              <div key={tx.id} className="mb-3">
                                <p className="text-[10px] text-muted-foreground mb-1">{formatDate(tx.createdAt)} — {tx.transactionNo}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {tx.items?.map((item: any, idx: number) => (
                                    <Badge key={idx} variant="secondary" className="text-[10px]">{item.productName} ×{item.quantity}</Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="pt-2 border-t">
                          <Button size="sm" variant="outline" onClick={() => {
                            setNotifType('REFILL_REMINDER')
                            setNotifMessage(`Hello ${selectedCustomer?.firstName}, this is a reminder from SelRx Pharmacy regarding your medication refills.`)
                            setShowNotifDialog(true)
                          }}>
                            <Phone className="h-3.5 w-3.5 mr-1.5" />
                            Send Notification
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">No medication records available.</p>
                    )}
                  </TabsContent>
                </Tabs>
              )}

              {/* Detail Loading State */}
              {detailLoading && (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialog(false)}>Close</Button>
            <Button onClick={() => { setDetailDialog(false); openEditDialog(selectedCustomer!) }} className="bg-emerald-600 hover:bg-emerald-700">
              Edit Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => { if (!open) { setShowPaymentDialog(false); setPaymentAmount(''); setPaymentDescription('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <DollarSign className="h-5 w-5" />
              Record Credit Payment
            </DialogTitle>
            <DialogDescription>
              For {selectedCustomer?.firstName} {selectedCustomer?.lastName}
              {creditSummary && creditSummary.outstandingBalance > 0 && (
                <span className="block mt-1 font-semibold text-amber-600 dark:text-amber-400">
                  Outstanding: {formatCurrency(creditSummary.outstandingBalance)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Payment Amount *</label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <Input
                value={paymentDescription}
                onChange={e => setPaymentDescription(e.target.value)}
                placeholder="e.g. Cash payment received"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowPaymentDialog(false); setPaymentAmount(''); setPaymentDescription('') }}>Cancel</Button>
            <Button disabled={paymentSaving || !paymentAmount || parseFloat(paymentAmount) <= 0} onClick={handleRecordPayment} className="bg-emerald-600 hover:bg-emerald-700">
              {paymentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loyalty Adjustment Dialog */}
      <Dialog open={loyaltyAction !== null} onOpenChange={() => { setLoyaltyAction(null); setLoyaltyAmount(''); setLoyaltyReason('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{loyaltyAction === 'add' ? 'Add' : 'Redeem'} Loyalty Points</DialogTitle>
            <DialogDescription>
              For {selectedCustomer?.firstName} {selectedCustomer?.lastName} (current: {selectedCustomer?.loyaltyPoints || 0} pts)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input type="number" min={1} value={loyaltyAmount} onChange={e => setLoyaltyAmount(e.target.value)} placeholder="Enter points" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
              <Input value={loyaltyReason} onChange={e => setLoyaltyReason(e.target.value)} placeholder="e.g. Promotional bonus" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setLoyaltyAction(null); setLoyaltyAmount(''); setLoyaltyReason('') }}>Cancel</Button>
            <Button disabled={loyaltyLoading || !loyaltyAmount} onClick={handleLoyaltyAdjust}>
              {loyaltyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loyaltyAction === 'add' ? 'Add' : 'Redeem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Points Dialog (via /api/loyalty) */}
      <Dialog open={redeemDialogOpen} onOpenChange={(open) => { if (!open) { setRedeemDialogOpen(false); setRedeemPointsInput('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Star className="h-5 w-5" />
              Redeem Points
            </DialogTitle>
            <DialogDescription>
              For {selectedCustomer?.firstName} {selectedCustomer?.lastName}
              <span className="block mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                Available: {selectedCustomer?.loyaltyPoints || 0} pts
              </span>
              <span className="block mt-1 text-xs text-muted-foreground">
                1 pt = {formatCurrency(1)} (bonus: {(loyaltyInfo?.bonusPercent ?? 0)}% at {loyaltyInfo?.tier || selectedCustomer?.loyaltyTier || 'BRONZE'} tier)
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Points to Redeem</label>
              <Input
                type="number"
                min={1}
                max={selectedCustomer?.loyaltyPoints || 0}
                value={redeemPointsInput}
                onChange={e => setRedeemPointsInput(e.target.value)}
                placeholder="Enter points"
                autoFocus
              />
            </div>
            {redeemPointsInput && parseInt(redeemPointsInput) > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Redemption Value</span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {formatCurrency(parseInt(redeemPointsInput) * (1 + (loyaltyInfo?.bonusPercent ?? 0) / 100))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRedeemDialogOpen(false); setRedeemPointsInput('') }}>Cancel</Button>
            <Button disabled={redeemLoading || !redeemPointsInput || parseInt(redeemPointsInput) <= 0} onClick={handleRedeemPoints} className="bg-amber-600 hover:bg-amber-700">
              {redeemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={formDialog} onOpenChange={setFormDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            <div>
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} placeholder="YYYY-MM-DD" className="mt-1" />
            </div>
            <div>
              <Label>Gender</Label>
              <Input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="M/F/Other" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Insurance Provider</Label>
              <Input value={form.insuranceProvider} onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Policy Number</Label>
              <Input value={form.insurancePolicyNo} onChange={(e) => setForm({ ...form, insurancePolicyNo: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Allergies</Label>
              <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Comma-separated (e.g., Penicillin, Sulfa)" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700" disabled={!form.firstName || !form.lastName}>
              {editingCustomer ? 'Update' : 'Create'} Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Dialog */}
      <Dialog open={showNotifDialog} onOpenChange={setShowNotifDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
            <DialogDescription>Send a notification to {selectedCustomer?.firstName} {selectedCustomer?.lastName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={notifType} onValueChange={setNotifType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REFILL_REMINDER">Refill Reminder</SelectItem>
                  <SelectItem value="CREDIT_DUE">Credit Due</SelectItem>
                  <SelectItem value="PRESCRIPTION_READY">Prescription Ready</SelectItem>
                  <SelectItem value="PROMOTIONAL">Promotional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotifDialog(false)}>Cancel</Button>
            <Button onClick={handleSendNotification} disabled={notifSending || !notifMessage.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {notifSending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Phone className="h-4 w-4 mr-1.5" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
