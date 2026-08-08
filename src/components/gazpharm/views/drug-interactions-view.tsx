'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Pill, Search, Plus, Edit, Trash2, Database, AlertTriangle, ShieldAlert,
  FlaskConical, Calendar, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import { useAppStore } from '@/store/app-store'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { StatCard } from '@/components/gazpharm/shared/stat-card'
import { authHeaders } from '@/lib/auth-headers'

// ── Types ───────────────────────────────────────────────────────────────────

interface DrugInteraction {
  id: string
  drug1: string
  drug2: string
  severity: 'contraindicated' | 'critical' | 'severe' | 'moderate' | 'mild'
  category: 'drug-drug' | 'drug-disease' | 'drug-allergy' | 'duplicate-therapy' | 'drug-food'
  description: string
  mechanism?: string | null
  management?: string | null
  onset?: 'immediate' | 'delayed' | 'variable' | 'none' | null
  evidence?: 'established' | 'probable' | 'suspected' | 'theoretical' | null
  source?: string | null
  isCustom?: boolean | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface InteractionListResponse {
  interactions: DrugInteraction[]
  total: number
  page: number
  pageSize: number
  lastSeeded?: string | null
}

// ── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All Severities' },
  { value: 'contraindicated', label: 'Contraindicated' },
  { value: 'critical', label: 'Critical' },
  { value: 'severe', label: 'Severe' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'mild', label: 'Mild' },
] as const

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'drug-drug', label: 'Drug-Drug' },
  { value: 'drug-disease', label: 'Drug-Disease' },
  { value: 'drug-allergy', label: 'Drug-Allergy' },
  { value: 'duplicate-therapy', label: 'Duplicate Therapy' },
  { value: 'drug-food', label: 'Drug-Food' },
] as const

const ONSET_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'variable', label: 'Variable' },
  { value: 'none', label: 'None' },
] as const

const EVIDENCE_OPTIONS = [
  { value: 'established', label: 'Established' },
  { value: 'probable', label: 'Probable' },
  { value: 'suspected', label: 'Suspected' },
  { value: 'theoretical', label: 'Theoretical' },
] as const

const CATEGORY_LABELS: Record<string, string> = {
  'drug-drug': 'Drug-Drug',
  'drug-disease': 'Drug-Disease',
  'drug-allergy': 'Drug-Allergy',
  'duplicate-therapy': 'Duplicate Therapy',
  'drug-food': 'Drug-Food',
}

const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  contraindicated: 'bg-red-600 text-white',
  critical: 'bg-red-100 text-red-800 border-red-200',
  severe: 'bg-orange-100 text-orange-800 border-orange-200',
  moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  mild: 'bg-blue-100 text-blue-800 border-blue-200',
}

const PAGE_SIZE = 15

// ── Helpers ─────────────────────────────────────────────────────────────────

function severityLabel(s: string) {
  return SEVERITY_OPTIONS.find((o) => o.value === s)?.label ?? s
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return '—'
  }
}

// ── Component ───────────────────────────────────────────────────────────────

const emptyForm = {
  drug1: '',
  drug2: '',
  severity: 'moderate' as DrugInteraction['severity'],
  category: 'drug-drug' as DrugInteraction['category'],
  description: '',
  mechanism: '',
  management: '',
  onset: 'variable' as DrugInteraction['onset'],
  evidence: 'probable' as DrugInteraction['evidence'],
  source: '',
}

export function DrugInteractionsView() {
  const addToast = useAppStore((s) => s.addToast)

  // ── Data state ────────────────────────────────────────────────────────────
  const [interactions, setInteractions] = useState<DrugInteraction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastSeeded, setLastSeeded] = useState<string | null>(null)

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DrugInteraction | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DrugInteraction | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchInteractions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      if (searchQuery) params.set('search', searchQuery)
      if (severityFilter !== 'all') params.set('severity', severityFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)

      const res = await fetch(`/api/drug-interactions?${params}`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        const data: InteractionListResponse = await res.json()
        setInteractions(data.interactions ?? [])
        setTotal(data.total ?? 0)
        if (data.lastSeeded) setLastSeeded(data.lastSeeded)
      }
    } catch {
      addToast({
        title: 'Error',
        description: 'Failed to load drug interactions',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, severityFilter, categoryFilter, addToast])

  useEffect(() => {
    fetchInteractions()
  }, [fetchInteractions])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, severityFilter, categoryFilter])

  // ── Derived stats ─────────────────────────────────────────────────────────
  const statsTotal = total
  const statsCritical = interactions.filter(
    (i) => i.severity === 'contraindicated' || i.severity === 'critical'
  ).length
  const statsCustom = interactions.filter((i) => i.isCustom).length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openCreateDialog() {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormOpen(true)
  }

  function openEditDialog(item: DrugInteraction) {
    setEditing(item)
    setForm({
      drug1: item.drug1,
      drug2: item.drug2,
      severity: item.severity,
      category: item.category,
      description: item.description ?? '',
      mechanism: item.mechanism ?? '',
      management: item.management ?? '',
      onset: item.onset ?? 'variable',
      evidence: item.evidence ?? 'probable',
      source: item.source ?? '',
    })
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.drug1.trim() || !form.drug2.trim()) {
      addToast({
        title: 'Validation Error',
        description: 'Both drug names are required.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const url = editing
        ? `/api/drug-interactions`
        : `/api/drug-interactions`
      const method = editing ? 'PUT' : 'POST'
      const body = editing
        ? { id: editing.id, ...form }
        : form

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      })

      if (res.ok) {
        addToast({
          title: editing ? 'Updated' : 'Created',
          description: editing
            ? 'Interaction updated successfully.'
            : 'New interaction added successfully.',
          variant: 'success',
        })
        setFormOpen(false)
        fetchInteractions()
      } else {
        const err = await res.json().catch(() => ({}))
        addToast({
          title: 'Error',
          description: (err as { error?: string }).error ?? 'Failed to save interaction.',
          variant: 'destructive',
        })
      }
    } catch {
      addToast({
        title: 'Error',
        description: 'Network error while saving.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/drug-interactions?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        addToast({ title: 'Deleted', description: 'Interaction removed.', variant: 'success' })
        setDeleteTarget(null)
        fetchInteractions()
      } else {
        addToast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Network error.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch('/api/drug-interactions?action=seed', {
        method: 'POST',
        headers: authHeaders(),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const count = (data as { count?: number }).count ?? 'some'
        addToast({
          title: 'Database Seeded',
          description: `${count} interactions were seeded into the database.`,
          variant: 'success',
        })
        fetchInteractions()
      } else {
        const err = await res.json().catch(() => ({}))
        addToast({
          title: 'Seed Failed',
          description: (err as { error?: string }).error ?? 'Could not seed database.',
          variant: 'destructive',
        })
      }
    } catch {
      addToast({ title: 'Error', description: 'Network error during seed.', variant: 'destructive' })
    } finally {
      setSeeding(false)
    }
  }

  function updateForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={Pill}
        title="Drug Interactions"
        description="Monitor and manage known drug interactions, contraindications, and safety alerts"
      />

      {/* ── Stats Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <StatCard
          title="Total Interactions"
          value={statsTotal}
          icon={Pill}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          title="Critical + Contraindicated"
          value={statsCritical}
          icon={ShieldAlert}
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatCard
          title="Custom Added"
          value={statsCustom}
          icon={FlaskConical}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          title="Last Seeded"
          value={formatDate(lastSeeded)}
          icon={Calendar}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Interactions</TabsTrigger>
          <TabsTrigger value="high-risk">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            High-Risk
          </TabsTrigger>
          <TabsTrigger value="custom">
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
            Custom
          </TabsTrigger>
        </TabsList>

        {/* ── All Interactions Tab ──────────────────────────────────────── */}
        <TabsContent value="all" className="space-y-4">
          {renderFilterBar()}
          {renderTable(interactions)}
          {renderPagination()}
        </TabsContent>

        {/* ── High-Risk Tab ─────────────────────────────────────────────── */}
        <TabsContent value="high-risk" className="space-y-4">
          {renderTable(
            interactions.filter(
              (i) => i.severity === 'contraindicated' || i.severity === 'critical' || i.severity === 'severe'
            )
          )}
        </TabsContent>

        {/* ── Custom Tab ────────────────────────────────────────────────── */}
        <TabsContent value="custom" className="space-y-4">
          {renderTable(interactions.filter((i) => i.isCustom))}
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Drug Interaction' : 'Add New Drug Interaction'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the details of this known interaction.'
                : 'Define a new drug interaction rule for safety checks.'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-1">
            <div className="space-y-4 py-1">
              {/* Drug pair */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Drug 1 *</Label>
                  <Input
                    placeholder="e.g. Warfarin"
                    value={form.drug1}
                    onChange={(e) => updateForm('drug1', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Drug 2 *</Label>
                  <Input
                    placeholder="e.g. Aspirin"
                    value={form.drug2}
                    onChange={(e) => updateForm('drug2', e.target.value)}
                  />
                </div>
              </div>

              {/* Severity & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Severity *</Label>
                  <Select
                    value={form.severity}
                    onValueChange={(v) => updateForm('severity', v as DrugInteraction['severity'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => updateForm('category', v as DrugInteraction['category'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Onset & Evidence */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Onset</Label>
                  <Select
                    value={form.onset ?? 'variable'}
                    onValueChange={(v) => updateForm('onset', v as DrugInteraction['onset'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ONSET_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Evidence Level</Label>
                  <Select
                    value={form.evidence ?? 'probable'}
                    onValueChange={(v) => updateForm('evidence', v as DrugInteraction['evidence'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVIDENCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Description */}
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  placeholder="Describe the interaction..."
                  rows={3}
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                />
              </div>

              {/* Mechanism */}
              <div className="space-y-2">
                <Label>Mechanism</Label>
                <Textarea
                  placeholder="Pharmacokinetic / pharmacodynamic mechanism..."
                  rows={2}
                  value={form.mechanism}
                  onChange={(e) => updateForm('mechanism', e.target.value)}
                />
              </div>

              {/* Management */}
              <div className="space-y-2">
                <Label>Management Recommendations</Label>
                <Textarea
                  placeholder="How to manage this interaction..."
                  rows={2}
                  value={form.management}
                  onChange={(e) => updateForm('management', e.target.value)}
                />
              </div>

              {/* Source */}
              <div className="space-y-2">
                <Label>Source</Label>
                <Input
                  placeholder="e.g. Lexicomp, Medscape, PubMed"
                  value={form.source}
                  onChange={(e) => updateForm('source', e.target.value)}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.drug1.trim() || !form.drug2.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? 'Saving...' : editing ? 'Update Interaction' : 'Add Interaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ─────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Interaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the interaction between{' '}
              <strong>{deleteTarget?.drug1}</strong> and <strong>{deleteTarget?.drug2}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  // ── Sub-renderers ────────────────────────────────────────────────────────

  function renderFilterBar() {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drugs or descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50/50"
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSeed}
              variant="outline"
              disabled={seeding}
              className="shrink-0"
            >
              <Database className="h-4 w-4 mr-2" />
              {seeding ? 'Seeding...' : 'Seed Database'}
            </Button>
            <Button
              onClick={openCreateDialog}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  function renderTable(items: DrugInteraction[]) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[480px] overflow-y-auto">
            <Table className="table-header-standard">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Drug 1</TableHead>
                  <TableHead className="min-w-[140px]">Drug 2</TableHead>
                  <TableHead className="w-[130px]">Severity</TableHead>
                  <TableHead className="hidden md:table-cell w-[140px]">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Description</TableHead>
                  <TableHead className="hidden xl:table-cell w-[120px]">Source</TableHead>
                  <TableHead className="text-right w-[90px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        icon={Pill}
                        title="No interactions found"
                        description="Try adjusting your search or filters, or add a new interaction."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} className="group">
                      <TableCell className="font-medium text-sm">
                        {item.drug1}
                        {item.isCustom && (
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                            custom
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{item.drug2}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={SEVERITY_BADGE_CLASSES[item.severity] ?? ''}
                        >
                          {severityLabel(item.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[220px] truncate">
                        {item.description}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {item.source || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(item)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(item)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
    )
  }

  function renderPagination() {
    if (total <= PAGE_SIZE) return null
    return (
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * PAGE_SIZE + 1}
          {Math.min(page * PAGE_SIZE, total) !== (page - 1) * PAGE_SIZE + 1 &&
            `–${Math.min(page * PAGE_SIZE, total)}`}{' '}
          of {total} interactions
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {generatePageNumbers(page, totalPages).map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  size="sm"
                  variant={page === p ? 'default' : 'outline'}
                  className={page === p ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                  onClick={() => setPage(p as number)}
                >
                  {p}
                </Button>
              )
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    )
  }
}

// ── Pagination helper ────────────────────────────────────────────────────────

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | string)[] = [1]
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  if (total > 1) pages.push(total)
  return pages
}
