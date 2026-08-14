'use client'

import { useState } from 'react'
import { AuditLogView } from './audit-log-view'
import { LoginHistoryView } from './login-history-view'

interface AccessLogsViewProps {
  initialTab?: 'audit' | 'login'
}

export function AccessLogsView({ initialTab = 'audit' }: AccessLogsViewProps) {
  const [activeTab, setActiveTab] = useState<'audit' | 'login'>(initialTab)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Audit Log
        </button>
        <button
          onClick={() => setActiveTab('login')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'login'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Login History
        </button>
      </div>

      {activeTab === 'audit' ? <AuditLogView /> : <LoginHistoryView />}
    </div>
  )
}
