'use client'

import { useEffect } from 'react'

/**
 * ErrorReporter — vangt ongevangen client-fouten (window.onerror +
 * unhandledrejection) en rapporteert ze naar /api/log-error, zodat een
 * superadmin ze terugziet op /beheer/errors. Gecapt per sessie tegen floods.
 *
 * In een dev-build melden we niets: een lokale `next dev` praat vaak tegen de
 * productie-Supabase, en Turbopack/HMR-artefacten zouden /beheer/errors dan als
 * productiesignaal ondermijnen. Next toont die fouten lokaal al in zijn eigen
 * overlay + console. `NODE_ENV` is hier een BUILD-time constante die Next in de
 * clientbundel inlinet; een preview-deploy draait een productie-build en meldt
 * dus gewoon. De autoriteit blijft de server-side guard in /api/log-error —
 * deze check bespaart alleen de zinloze roundtrip.
 */
export function ErrorReporter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return

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
