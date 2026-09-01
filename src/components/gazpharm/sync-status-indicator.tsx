/**
 * SyncStatusIndicator
 *
 * A compact status indicator showing the current sync state.
 * Green = synced, Yellow = syncing, Red = error, Gray = offline/no hub.
 * Placed in the POS header / sidebar footer.
 */

'use client'

import { useEffect, useState } from 'react'
import { isDesktop } from '@/lib/platform'
import {
  onSyncStateChange,
  getSyncInfo,
  manualSync,
  type SyncInfo,
} from '@/lib/sync-engine'
import { Wifi, WifiOff, RefreshCw, AlertTriangle, Cloud, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const statusConfig = {
  idle: {
    icon: Wifi,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    label: 'Synced',
  },
  syncing: {
    icon: RefreshCw,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    label: 'Syncing...',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    label: 'Sync Error',
  },
  offline: {
    icon: WifiOff,
    color: 'text-gray-400',
    bg: 'bg-gray-400/10',
    label: 'Offline',
  },
  ws_connected: {
    icon: Wifi,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    label: 'Live Sync',
  },
  discovering: {
    icon: RefreshCw,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    label: 'Scanning...',
  },
} as const

export function SyncStatusIndicator() {
  const [info, setInfo] = useState<SyncInfo>(() => getSyncInfo())

  useEffect(() => {
    // Listen for changes
    const unsub = onSyncStateChange((_state, newInfo) => {
      setInfo({ ...newInfo })
    })

    return unsub
  }, [])

  // On web, show a subtle "Cloud" indicator
  if (!isDesktop()) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground">
              <Cloud className="h-3.5 w-3.5" />
              <span>Cloud</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Running on cloud (Vercel + Turso)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const config = statusConfig[info.state]
  const Icon = config.icon
  const isSyncing = info.state === 'syncing'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 gap-1.5 px-2 text-xs ${config.bg} ${config.color} hover:${config.bg}`}
            onClick={() => info.state !== 'syncing' && manualSync()}
            disabled={info.state === 'syncing' || !info.hubUrl}
          >
            <Monitor className="h-3 w-3" />
            <Icon
              className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">{config.label}</span>
            {info.pendingCount > 0 && info.state !== 'syncing' && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                {info.pendingCount > 9 ? '9+' : info.pendingCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-medium">Desktop Mode — {config.label}</p>
            {info.hubUrl && <p>Hub: {info.hubUrl}</p>}
            <p>Device: {info.deviceId?.slice(0, 8)}...</p>
            {info.lastSyncAt && (
              <p>Last sync: {new Date(info.lastSyncAt).toLocaleTimeString()}</p>
            )}
            {info.lastError && (
              <p className="text-red-400">Error: {info.lastError}</p>
            )}
            {info.pendingCount > 0 && (
              <p>{info.pendingCount} changes pending upload</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
