'use client'

import { useEffect } from 'react'

/**
 * ErrorReporter — vangt ongevangen client-fouten (window.onerror +
 * unhandledrejection) en rapporteert ze naar /api/log-error, zodat een
 * superadmin ze terugziet op /beheer/errors. Gecapt per sessie tegen floods.
 */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0
    const MAX = 8

    function report(message: string, stack: string | undefined, context: string) {
      if (sent >= MAX || !message) return
      sent += 1
      try {
        fetch('/api/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message.slice(0, 2000),
            stack: stack?.slice(0, 8000),
            context,
            url: window.location.pathname,
          }),
          keepalive: true,
        }).catch(() => {})
      } catch {
        /* no-op */
      }
    }

    function onError(e: ErrorEvent) {
      report(e.message || 'Onbekende fout', e.error?.stack, 'window.onerror')
    }
    function onRejection(e: PromiseRejectionEvent) {
      const r = e.reason as { message?: string; stack?: string } | undefined
      report(r?.message || String(e.reason), r?.stack, 'unhandledrejection')
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
