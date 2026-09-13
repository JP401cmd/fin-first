'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'

/**
 * De context van het uitgaven-na-stoppen-scherm, lui gelezen via
 * `GET /api/uitgaven-na-pensioen/context`. Uit `UitgavenPane` gehaald (TPR-15, pure move)
 * zodat de plan-review-wizard dezelfde lezing gebruikt.
 */
export interface UitgavenContext {
  initialMethod: RetirementExpenseMethod
  customAmount: number | null
  yearlyMustExpenses: number
  yearlyIncome: number
  estimatedYearlyExpenses: number
  currentRetirementExpense: number
  budgetingActive: boolean
  savedAspirations: unknown
}

export function useUitgavenContext(open: boolean) {
  const [ctx, setCtx] = useState<UitgavenContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumpt de fetch-effect-dep zodat de pane zijn ctx opnieuw ophaalt ná een
  // methode-wissel (save) terwijl 'ie open blijft. Zonder dit blijft `ctx`
  // (incl. currentRetirementExpense) hangen op de waarde van de initiële open —
  // `router.refresh()` in de child raakt deze client-fetch-state niet.
  const [reloadKey, setReloadKey] = useState(0)
  const reloadContext = useCallback(() => setReloadKey(k => k + 1), [])

  // Bewust setState-in-effect voor data-fetching: we synchroniseren externe
  // state (HTTP) met React. De alternatieve patronen (Suspense / SWR) zouden
  // de pane-wrapper veel ingrijpender maken; dit volgt het bestaande pattern
  // in `account-form-modal.tsx` en sheet-componenten.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/uitgaven-na-pensioen/context')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Laden mislukt')
        return r.json() as Promise<UitgavenContext>
      })
      .then(data => {
        if (!cancelled) setCtx(data)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Onbekende fout')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, reloadKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setCtx(null)
    setError(null)
    // Trigger reload
    setLoading(true)
    fetch('/api/uitgaven-na-pensioen/context')
      .then(async r => (r.ok ? r.json() : Promise.reject(await r.json())))
      .then(setCtx)
      .catch(e => setError(e?.error ?? 'Onbekende fout'))
      .finally(() => setLoading(false))
  }

  return { ctx, loading, error, reloadContext, retry }
}
