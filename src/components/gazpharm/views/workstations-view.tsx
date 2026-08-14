'use client'

import { useState, useEffect, useCallback } from 'react'
import { Monitor, Plus, Pencil, Trash2, MapPin, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

interface Workstation {
  id: string
  name: string
  description: string | null
  location: string | null
  isActive: boolean
  createdAt: string
}

export function WorkstationsView() {
  const addToast = useAppStore((s) => s.addToast)
  const currentWorkstationId = useAppStore((s) => s.currentWorkstationId)
  const setCurrentWorkstationId = useAppStore((s) => s.setCurrentWorkstationId)

  const [workstations, setWorkstations] = useState<Workstation[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Workstation | null>(null)
  const [formName, setFormName] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchWorkstations = useCallback(async () => {
    try {
      const res = await fetch('/api/workstations', { headers: authHeaders() })
      if (res.ok) {
        const json = await res.json()
        setWorkstations(json.workstations || [])
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load workstations', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchWorkstations() }, [fetchWorkstations])

  const openCreate = () => {
    setEditing(null)
    setFormName('')
    setFormLocation('')
    setFormDescription('')
    setDialogOpen(true)
  }

  const openEdit = (ws: Workstation) => {
    setEditing(ws)
    setFormName(ws.name)
    setFormLocation(ws.location || '')
    setFormDescription(ws.description || '')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const method = editing ? 'PUT' : 'POST'
      const body: Record<string, unknown> = { name: formName, location: formLocation, description: formDescription }
      if (editing) {
        body.id = editing.id
        body.isActive = editing.isActive
      }
      const res = await fetch('/api/workstations', {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save')
      addToast({ title: editing ? 'Workstation Updated' : 'Workstation Created', variant: 'success' })
      setDialogOpen(false)
      fetchWorkstations()
    } catch {
      addToast({ title: 'Error', description: 'Failed to save workstation', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ws: Workstation) => {
    if (!confirm(`Deactivate "${ws.name}"? It can be reactivated later.`)) return
    try {
      const res = await fetch(`/api/workstations?id=${ws.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error()
      if (currentWorkstationId === ws.id) setCurrentWorkstationId(null)
      addToast({ title: 'Workstation Deactivated', variant: 'success' })
      fetchWorkstations()
    } catch {
      addToast({ title: 'Error', description: 'Failed to deactivate workstation', variant: 'destructive' })
    }
  }

  const handleSelect = (id: string) => {
    if (currentWorkstationId === id) {
      setCurrentWorkstationId(null)
      addToast({ title: 'Workstation Deselected', description: 'Transactions will not be tagged with a workstation.', variant: 'default' })
    } else {
      setCurrentWorkstationId(id)
      const ws = workstations.find(w => w.id === id)
      addToast({ title: 'Workstation Active', description: `Now using: ${ws?.name}`, variant: 'success' })
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader icon={Monitor} title="Workstations" description="Register and manage POS terminals" />

      {/* Current Selection Banner */}
      <Card className={`border-2 transition-colors ${currentWorkstationId ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Monitor className={`h-5 w-5 ${currentWorkstationId ? 'text-emerald-600' : 'text-amber-500'}`} />
            <div>
              <p className="text-sm font-semibold">Current Active Terminal</p>
              <p className="text-xs text-muted-foreground">
                {currentWorkstationId
                  ? workstations.find(w => w.id === currentWorkstationId)?.name || 'Unknown'
                  : 'No workstation selected — transactions will not be tagged'}
              </p>
            </div>
            {currentWorkstationId && (
              <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Workstation Grid */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Click a workstation to set it as your active terminal</p>
        <Button onClick={openCreate} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add Workstation</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-none shadow-sm"><CardContent className="p-4"><div className="h-20 animate-pulse bg-gray-100 rounded-lg" /></CardContent></Card>
          ))}
        </div>
      ) : workstations.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-12 text-center">
            <Monitor className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No workstations registered</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first POS terminal to start tracking transactions by workstation</p>
            <Button onClick={openCreate} className="mt-4 h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add Workstation</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workstations.map((ws) => {
            const isSelected = currentWorkstationId === ws.id
            return (
              <Card
                key={ws.id}
                className={`border-2 transition-all cursor-pointer hover:shadow-md ${
                  isSelected ? 'border-emerald-400 bg-emerald-50/40 shadow-emerald-100 shadow-md' :
                  ws.isActive ? 'border-gray-100 hover:border-gray-200' : 'border-gray-100 opacity-60'
                }`}
                onClick={() => handleSelect(ws.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Monitor className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{ws.name}</p>
                        {ws.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {ws.location}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      {!ws.isActive && <XCircle className="h-4 w-4 text-red-400" />}
                    </div>
                  </div>
                  {ws.description && (
                    <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{ws.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <Badge variant="outline" className={`text-[10px] ${
                      isSelected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                      ws.isActive ? 'border-gray-200 text-gray-500' : 'border-red-200 bg-red-50 text-red-500'
                    }`}>
                      {isSelected ? 'Selected' : ws.isActive ? 'Available' : 'Inactive'}
                    </Badge>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ws)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {ws.isActive && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(ws)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Workstation' : 'Register New Workstation'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Counter 1, Pharmacy Window" className="mt-1" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g. Front Desk, Drive-Thru" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional notes" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
