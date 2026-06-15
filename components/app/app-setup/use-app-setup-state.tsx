'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppSetupConfig, AppSetupValidation } from './types'

/**
 * Form-state + save-handler voor één AppSetup-config.
 *
 * Save-flow (POST + feature-visit-marker + router.refresh):
 *  1. POST naar `config.endpoint` met de payload uit `config.buildPayload(state)`
 *     — dat endpoint schrijft de app-specifieke data + zet zelf de
 *     feature-visit-marker (binnen één DB-roundtrip is netter dan twee
 *     calls vanaf de client).
 *  2. `router.refresh()` — de server-pagina laadt opnieuw, ziet nu de
 *     marker, en rendert de echte content-tab in plaats van de gate.
 *
 * Bij endpoint-fout: marker wordt niet gezet, gate blijft staan, de fout
 * komt als banner onder de knop.
 */
export function useAppSetupState<TState>(config: AppSetupConfig<TState>) {
  const router = useRouter()
  const [state, setStateRaw] = useState<TState>(() => config.initialState())
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // updater-style setter zodat configs `setState((prev) => ...)` kunnen schrijven
  const setState = useCallback((updater: (prev: TState) => TState) => {
    setStateRaw((prev) => updater(prev))
  }, [])

  const validation: AppSetupValidation = config.validate(state)

  const save = useCallback(async () => {
    if (!validation.ok || saving) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const payload = config.buildPayload(state)
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Opslaan van setup mislukt')
      }
      // Server zet zelf de feature-visit-marker (zie `app/api/<app>/setup/route.ts`).
      // `router.refresh()` re-runt de server-pagina; die ziet de marker en
      // rendert de echte content-tab.
      router.refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Onbekende fout bij opslaan')
    } finally {
      setSaving(false)
    }
  }, [config, state, validation.ok, saving, router])

  return {
    state,
    setState,
    save,
    saving,
    errorMsg,
    validation,
  }
}
