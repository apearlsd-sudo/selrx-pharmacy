'use client'

import { useState } from 'react'
import {
  Settings,
  Coins,
  Printer,
  FileText,
  Monitor,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'

export function OtherSettingsView() {
  const currency = useAppStore((s) => s.currency)
  const setCurrency = useAppStore((s) => s.setCurrency)
  const autoPrintReceipt = useAppStore((s) => s.autoPrintReceipt)
  const setAutoPrintReceipt = useAppStore((s) => s.setAutoPrintReceipt)
  const showReceiptModal = useAppStore((s) => s.showReceiptModal)
  const setShowReceiptModal = useAppStore((s) => s.setShowReceiptModal)
  const addToast = useAppStore((s) => s.addToast)
  const company = useAppStore((s) => s.company)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-5 w-5 text-emerald-600" />
          Other Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure currency, receipt printing, and other preferences
        </p>
      </div>

      {/* Currency Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-500" />
            Currency Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Select the local currency used for all prices and transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-xs font-medium w-20 shrink-0">Currency</Label>
            <Select value={currency} onValueChange={(val) => {
              setCurrency(val as CurrencyCode)
              addToast({ title: 'Currency Updated', description: `Switched to ${CURRENCIES[val as CurrencyCode].name}`, variant: 'success' })
            }}>
              <SelectTrigger className="h-9 w-full max-w-xs text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-medium">{CURRENCIES[code].symbol}</span>
                    <span className="ml-1.5">{CURRENCIES[code].name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-amber-700">{CURRENCIES[currency].symbol}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{CURRENCIES[currency].name}</p>
              <p className="text-xs text-muted-foreground">Code: {currency} &middot; {CURRENCIES[currency].country}</p>
            </div>
            <Badge className="ml-auto text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Printing Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-500" />
            Sales Receipt Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Configure how receipts are handled after completing a sale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auto-print */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <Printer className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <Label className="text-sm font-medium">Auto-print Receipt</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically send the receipt to the printer after each completed sale
                </p>
              </div>
            </div>
            <Switch
              checked={autoPrintReceipt}
              onCheckedChange={(checked) => {
                setAutoPrintReceipt(checked)
                addToast({
                  title: checked ? 'Auto-print Enabled' : 'Auto-print Disabled',
                  description: checked ? 'Receipts will print automatically after sales' : 'Receipts will not print automatically',
                  variant: 'success',
                })
              }}
            />
          </div>

          <Separator />

          {/* Show receipt modal */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <Label className="text-sm font-medium">Show Receipt Popup</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Display a receipt preview modal after completing a sale. Disable to skip the popup entirely.
                </p>
              </div>
            </div>
            <Switch
              checked={showReceiptModal}
              onCheckedChange={(checked) => {
                setShowReceiptModal(checked)
                addToast({
                  title: checked ? 'Receipt Popup Enabled' : 'Receipt Popup Disabled',
                  description: checked ? 'Receipt preview will appear after sales' : 'Receipt preview will be skipped',
                  variant: 'success',
                })
              }}
            />
          </div>

          <Separator />

          {/* Info note */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-medium">Receipt Printer Setup</p>
              <p className="mt-0.5 text-blue-600">
                To use auto-print, configure your receipt printer in the Hardware settings page.
                Make sure the printer is connected and drivers are installed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4 text-gray-500" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Application</p>
              <p className="font-medium mt-0.5">SelRx Pharmacy POS</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Version</p>
              <p className="font-medium mt-0.5">v1.0.0</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Pharmacy</p>
              <p className="font-medium mt-0.5">{company?.name || 'Not configured'}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Business Type</p>
              <p className="font-medium mt-0.5 capitalize">{company?.businessType || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
