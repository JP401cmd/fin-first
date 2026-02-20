'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

// ── Types ───────────────────────────────────────────────────────────

export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'badge'

export type Toast = {
  id: string
  type: ToastType
  title: string
  message?: string
  icon?: string
  duration?: number
}

type BadgeQueueItem = {
  name: string
  icon: string
  description: string
  slug?: string
}

type ToastContextType = {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  showBadgeEarned: (badge: BadgeQueueItem) => void
  queueBadges: (badges: BadgeQueueItem[]) => void
}

// ── Context ─────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ── Flying Badge Icon ───────────────────────────────────────────────

function FlyingBadgeIcon({ icon, onDone }: { icon: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'start' | 'fly' | 'done'>('start')

  useEffect(() => {
    // Start animation after mount
    const t1 = requestAnimationFrame(() => setPhase('fly'))
    const t2 = setTimeout(() => {
      setPhase('done')
      onDone()
    }, 900)
    return () => {
      cancelAnimationFrame(t1)
      clearTimeout(t2)
    }
  }, [onDone])

  // Compute target position: the profile button in the header (top-right area)
  const getTargetTransform = () => {
    if (phase === 'start') return 'translate(0, 0) scale(1)'
    if (phase === 'fly') return 'translate(calc(100vw - 120px - 100%), -60px) scale(0.3)'
    return 'translate(calc(100vw - 120px - 100%), -60px) scale(0)'
  }

  if (phase === 'done') return null

  return (
    <div
      ref={ref}
      className="fixed z-[200] pointer-events-none"
      data-testid="flying-badge-icon"
      style={{
        top: '1rem',
        right: 'calc(100vw - 2rem - 24rem)',
        transform: getTargetTransform(),
        opacity: phase === 'fly' ? 0.6 : 1,
        transition: 'all 800ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <span className="text-4xl drop-shadow-[var(--s2)]" aria-hidden="true">
        {icon}
      </span>
    </div>
  )
}

// ── Badge Toast Item ────────────────────────────────────────────────

function BadgeToastItem({
  toast,
  onRemove,
}: {
  toast: Toast
  onRemove: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [showFly, setShowFly] = useState(false)

  useEffect(() => {
    const timer = requestAnimationFrame(() => setVisible(true))
    // Trigger fly animation after a short delay
    const flyTimer = setTimeout(() => setShowFly(true), 500)
    return () => {
      cancelAnimationFrame(timer)
      clearTimeout(flyTimer)
    }
  }, [])

  return (
    <>
      <div
        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--r-lg)] border-2 p-4 shadow-[var(--s2)] backdrop-blur-sm transition-all duration-300 bg-gradient-to-r from-amber-50 to-teal-50 border-amber-300 text-[var(--ink)]"
        role="alert"
        data-testid="badge-toast"
        data-toast-type="badge"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(-20px)',
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Trophy prefix icon */}
        <span className="flex-shrink-0 text-lg" aria-hidden="true" data-testid="badge-toast-trophy">
          🏆
        </span>
        {toast.icon && (
          <span className="flex-shrink-0 text-2xl" aria-hidden="true" data-testid="badge-toast-icon">
            {toast.icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight" data-testid="badge-toast-title">
            {toast.title}
          </p>
          {toast.message && (
            <p className="mt-0.5 text-xs leading-snug opacity-80" data-testid="badge-toast-message">
              {toast.message}
            </p>
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
      {showFly && toast.icon && (
        <FlyingBadgeIcon icon={toast.icon} onDone={() => setShowFly(false)} />
      )}
    </>
  )
}

// ── Generic Toast Item ──────────────────────────────────────────────

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

  if (toast.type === 'badge') {
    return <BadgeToastItem toast={toast} onRemove={onRemove} />
  }

  const bgMap: Record<ToastType, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    badge: '', // handled above
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
  const badgeQueueRef = useRef<BadgeQueueItem[]>([])
  const processingRef = useRef(false)

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const duration = toast.duration ?? (toast.type === 'badge' ? 6000 : 4000)

      setToasts((prev) => [...prev, { ...toast, id }])

      // Auto-remove after duration
      setTimeout(() => {
        removeToast(id)
      }, duration)
    },
    [removeToast]
  )

  // Process badge queue sequentially with delays
  const processBadgeQueue = useCallback(() => {
    if (processingRef.current) return
    if (badgeQueueRef.current.length === 0) return

    processingRef.current = true

    const processNext = () => {
      const badge = badgeQueueRef.current.shift()
      if (!badge) {
        processingRef.current = false
        return
      }

      addToast({
        type: 'badge',
        title: `🏆 Badge verdiend: ${badge.name}!`,
        message: badge.description,
        icon: badge.icon,
        duration: 6000,
      })

      // Mark as notified in background
      if (badge.slug) {
        fetch('/api/badges/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: badge.slug }),
        }).catch(() => {}) // Silent fail — notification is best-effort
      }

      // Process next badge after delay
      if (badgeQueueRef.current.length > 0) {
        setTimeout(processNext, 1200) // 1.2s between sequential toasts
      } else {
        processingRef.current = false
      }
    }

    processNext()
  }, [addToast])

  const showBadgeEarned = useCallback(
    (badge: BadgeQueueItem) => {
      badgeQueueRef.current.push(badge)
      processBadgeQueue()
    },
    [processBadgeQueue]
  )

  // Queue multiple badges at once (for simultaneous badge earning)
  const queueBadges = useCallback(
    (badges: BadgeQueueItem[]) => {
      if (badges.length === 0) return
      badgeQueueRef.current.push(...badges)
      processBadgeQueue()
    },
    [processBadgeQueue]
  )

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, showBadgeEarned, queueBadges }}>
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
