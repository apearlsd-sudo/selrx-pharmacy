'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useAppStore } from '@/store/app-store'

function getToastStyles(variant?: 'default' | 'destructive' | 'success') {
  switch (variant) {
    case 'success':
      return {
        container:
          'border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100',
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />,
      }
    case 'destructive':
      return {
        container:
          'border-red-200 bg-red-50 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100',
        icon: <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />,
      }
    default:
      return {
        container:
          'border-gray-200 bg-white text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100',
        icon: <Info className="h-5 w-5 text-gray-500 shrink-0" />,
      }
  }
}

function ToastItem({
  id,
  title,
  description,
  variant,
}: {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
}) {
  const removeToast = useAppStore((s) => s.removeToast)
  const styles = getToastStyles(variant)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`pointer-events-auto relative flex items-start gap-3 rounded-lg border p-4 shadow-lg max-w-sm w-full ${styles.container}`}
    >
      {styles.icon}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold leading-none">{title}</p>
        )}
        {description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
            {description}
          </p>
        )}
      </div>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts)

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-0 right-0 z-[100] flex flex-col-reverse gap-2 p-4 sm:p-6"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            id={toast.id}
            title={toast.title}
            description={toast.description}
            variant={toast.variant}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
