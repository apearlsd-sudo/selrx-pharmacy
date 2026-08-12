'use client'

import { useState } from 'react'
import {
  Globe, Coins, Printer, Database, UserCog, Monitor, RefreshCw, Info, MonitorSmartphone,
  Building2, KeyRound,
} from 'lucide-react'
import { UsersView } from './users-view'
import { WorkstationsView } from './workstations-view'
import { SyncSettingsView } from './sync-settings-view'
import { HardwareView } from './hardware-view'
import {
  RegionalSettingsSection,
  CurrencySettingsSection,
  ReceiptSettingsSection,
  BackupRestoreSection,
  AutoBackupSection,
  SystemInfoSection,
} from './settings-sections'
import { CompanyProfileSection } from './settings-sections/company-profile-section'
import { PasswordChangeSection } from './settings-sections/password-change-section'

const SETTINGS_NAV = [
  { key: 'company', label: 'Company Profile', icon: Building2, description: 'Business information, contact & tax settings' },
  { key: 'users', label: 'User Management', icon: UserCog, description: 'Manage staff accounts, roles & permissions' },
  { key: 'regional', label: 'Regional Settings', icon: Globe, description: 'Timezone, date & time formats' },
  { key: 'currency', label: 'Currency Settings', icon: Coins, description: 'Local currency for prices & transactions' },
  { key: 'receipt', label: 'Sales Receipt Settings', icon: Printer, description: 'Printing behavior, font & text style' },
  { key: 'backup', label: 'Data Backup & Restore', icon: Database, description: 'Manual and automatic data backups' },
  { key: 'workstations', label: 'Workstations', icon: Monitor, description: 'Register and manage POS workstations' },
  { key: 'sync', label: 'Device Sync', icon: RefreshCw, description: 'Sync settings across devices' },
  { key: 'hardware', label: 'Hardware', icon: MonitorSmartphone, description: 'Printers, scanners & peripheral devices' },
  { key: 'system', label: 'System Information', icon: Info, description: 'Application version & pharmacy info' },
  { key: 'password', label: 'Change Password', icon: KeyRound, description: 'Update your account password' },
] as const

type SettingsKey = (typeof SETTINGS_NAV)[number]['key']

export function SettingsHubView() {
  const [active, setActive] = useState<SettingsKey>('users')

  const renderSection = () => {
    switch (active) {
      case 'company': return <CompanyProfileSection />
      case 'users': return <UsersView />
      case 'regional': return <RegionalSettingsSection />
      case 'currency': return <CurrencySettingsSection />
      case 'receipt': return <ReceiptSettingsSection />
      case 'backup': return (
        <div className="space-y-6">
          <BackupRestoreSection />
          <AutoBackupSection />
        </div>
      )
      case 'workstations': return <WorkstationsView />
      case 'sync': return <SyncSettingsView />
      case 'hardware': return <HardwareView />
      case 'system': return <SystemInfoSection />
      case 'password': return <PasswordChangeSection />
    }
  }

  return (
    <div className="flex gap-6 animate-fade-in">
      {/* Sidebar nav */}
      <nav className="hidden md:block w-56 shrink-0">
        <div className="sticky top-20 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">Settings</p>
          {SETTINGS_NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150 text-xs ${
                active === item.key
                  ? 'bg-emerald-50 text-emerald-700 font-medium shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className={`h-4 w-4 shrink-0 ${active === item.key ? 'text-emerald-600' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile: horizontal scroll nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-3 py-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {SETTINGS_NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-left transition-all duration-150 text-[11px] whitespace-nowrap border ${
                active === item.key
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <item.icon className={`h-3 w-3 shrink-0 ${active === item.key ? 'text-emerald-600' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        {renderSection()}
      </div>
    </div>
  )
}
