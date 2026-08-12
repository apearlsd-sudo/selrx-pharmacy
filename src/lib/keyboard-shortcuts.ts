/**
 * src/lib/keyboard-shortcuts.ts
 *
 * Global keyboard shortcut definitions for the POS.
 * Cashiers can fly through sales using these shortcuts.
 */

export interface KeyboardShortcut {
  key: string           // e.g. 'F2', 'F4', 'Enter', 'Escape'
  label: string         // Human-readable description
  ctrl?: boolean        // Requires Ctrl/Cmd
  shift?: boolean       // Requires Shift
  alt?: boolean         // Requires Alt
  action: string        // Action identifier
}

/**
 * All available POS keyboard shortcuts.
 */
export const POS_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'F2',            label: 'New Transaction',      action: 'new-transaction' },
  { key: 'F4',            label: 'Focus Search',         action: 'focus-search' },
  { key: 'F5',            label: 'Toggle Barcode',       action: 'toggle-barcode' },
  { key: 'F9',            label: 'Process Payment',      action: 'process-payment' },
  { key: 'F7',            label: 'Suspend / Recall',     action: 'suspend-recall' },
  { key: 'F12',           label: 'Open Settings',        action: 'open-settings' },
  { key: 'Escape',        label: 'Void / Close',         action: 'void' },
  { key: 'Delete',        label: 'Remove Selected',      action: 'remove-selected' },
  { key: 'b', ctrl: true, label: 'Barcode Scan',         action: 'toggle-barcode' },
  { key: 'n', ctrl: true, label: 'New Transaction',      action: 'new-transaction' },
  { key: 'f', ctrl: true, label: 'Focus Search',         action: 'focus-search' },
]

/**
 * Check if a keyboard event matches a shortcut.
 */
export function matchesShortcut(
  e: KeyboardEvent,
  shortcut: KeyboardShortcut
): boolean {
  const keyMatch = e.key === shortcut.key || e.code === shortcut.key
  const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey)
  const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey
  const altMatch = shortcut.alt ? e.altKey : !e.altKey
  return keyMatch && ctrlMatch && shiftMatch && altMatch
}

/**
 * Format a shortcut for display (e.g. "Ctrl+F", "F2").
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = []
  if (shortcut.ctrl)  parts.push('Ctrl')
  if (shortcut.shift) parts.push('Shift')
  if (shortcut.alt)   parts.push('Alt')
  parts.push(shortcut.key)
  return parts.join('+')
}