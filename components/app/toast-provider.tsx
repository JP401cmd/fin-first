'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

// ── Types ───────────────────────────────────────────────────────────

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export type Toast = {
  id: string
  type: ToastType
  title: string
  message?: string
  icon?: string
  duration?: number
}

type ToastContextType = {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

// ── Context ─────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ── Toast Item ──────────────────────────────────────────────────────

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast
  onRemove: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(timer)
  }, [])

  const bgMap: Record<ToastType, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  }

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--r-lg)] border-2 p-4 shadow-[var(--s2)] backdrop-blur-sm transition-all duration-300 ${bgMap[toast.type]}`}
      role="alert"
      data-testid="toast-item"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-20px)',
        opacity: visible ? 1 : 0,
      }}
    >
      {toast.icon && (
        <span className="flex-shrink-0 text-2xl" aria-hidden="true">
          {toast.icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-xs leading-snug opacity-80">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onRemove}
        className="flex-shrink-0 ml-2 text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
        aria-label="Sluiten"
      >
        ✕
      </button>
    </div>
  )
}

// ── Provider ────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const duration = toast.duration ?? 4000

      setToasts((prev) => [...prev, { ...toast, id }])

      setTimeout(() => {
        removeToast(id)
      }, duration)
    },
    [removeToast]
  )

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}

      {/* Toast container — fixed top-right */}
      {toasts.length > 0 && (
        <div
          className="fixed top-4 z-[100] flex flex-col gap-2 pointer-events-none transition-[right] duration-300"
          style={{ right: 'calc(1rem + var(--chat-sidebar-width, 0px))' }}
          aria-live="polite"
          aria-atomic="false"
          data-testid="toast-container"
        >
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onRemove={() => removeToast(toast.id)}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
