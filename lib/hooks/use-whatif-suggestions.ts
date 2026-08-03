'use client'

// ── Wat-als levensgebeurtenis-suggesties: cloud óf on-device ────────────────
//
// Eén hook, twee bestemmingen, één uitvoervorm (`SuggestedEvent[]`) zodat de
// kaarten-UI niets van het onderscheid merkt. `useExecutionMode('tips')` bepaalt
// waar het draait — FAIL-CLOSED: in 'resolving' en 'blocked' vertrekt er niets,
// en het lokale pad valt NOOIT stil terug op /api/whatif/suggest.
//
// UX-HERSNEDE OP HET LOKALE PAD. De cloud-variant vuurt automatisch af, 2 s na
// de laatste sliderbeweging, en breekt een lopende call af met een
// AbortController. On-device kan dat laatste niet: een generatie op de gedeelde
// GPU-wachtrij is niet af te breken, en elke automatische afvuring zou een
// wachtrij van trage runs opbouwen die de gebruiker niet gevraagd heeft. Daarom
// is 'lokaal' expliciet: een knop ("Stel gebeurtenissen voor") plus een
// één-tegelijk-guard.
//
// GEEN VERZONNEN BEDRAGEN. Op het lokale pad levert het model alleen
// {event_type, name, explanation}; alle bedragen komen deterministisch uit de
// levensgebeurtenis-catalogus (parse-whatif-suggestions.ts). Geen catalogus-
// match → geen kaart.

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { SuggestedEvent } from '@/lib/types/horizon-whatif'
import { isSignificantDelta, buildSuggestionPrompt, buildSuggestionChanges } from '@/lib/whatif-suggestions'
import type { EventPrefillContext } from '@/lib/horizon/event-prefill'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
// Statische import: litert-runtime laadt de WASM-bundel pas lazy in zijn eigen
// functies, dus dit trekt die ~2 GB-keten niet eager mee.
import { loadModelSession } from '@/lib/ai/local/litert-runtime'
import {
  buildLocalWhatifSystemPrompt,
  buildLocalWhatifUserPrompt,
  LOCAL_WHATIF_MAX_SUGGESTIONS,
} from '@/lib/ai/local/local-whatif-prompt'
import {
  parseLocalWhatifSuggestions,
  resolveLocalWhatifSuggestions,
} from '@/lib/ai/local/parse-whatif-suggestions'
import { SuggestedEventSchema } from '@/lib/ai/schemas/whatif-suggestion-schema'

interface UseWhatIfSuggestionsOptions {
  overrides: WhatIfOverrides | null
  baseline: WhatIfOverrides | null
  fireAgeDelta: number | null
  activeEventNames: string[]
  debounceMs?: number
  /**
   * Vereist voor het LOKALE pad: de context waaruit `computeSuggestedEventValues`
   * de catalogus-bedragen oplost (dezelfde context als het
   * levensgebeurtenis-formulier op /toekomst). Ontbreekt hij, dan kan er lokaal
   * niets opgelost worden en blijft de knop uit — nooit een cloud-uitwijk.
   */
  prefillContext?: EventPrefillContext | null
  /** Soorten die al in het scenario staan; lokaal worden die overgeslagen. */
  activeEventTypes?: string[]
}

/** Waar deze hook nu draait, in UI-taal. */
export type WhatIfSuggestionsMode = 'wachten' | 'cloud' | 'lokaal' | 'onbeschikbaar'

interface UseWhatIfSuggestionsResult {
  suggestions: SuggestedEvent[]
  loading: boolean
  dismiss: (index: number) => void
  dismissAll: () => void
  /** Bestemming; 'lokaal' betekent: alleen op verzoek (zie `request`). */
  mode: WhatIfSuggestionsMode
  /** Mag er nu een lokale run gestart worden? (knop actief) */
  canRequest: boolean
  /** Start een lokale run. No-op op het cloud-pad of bij een lopende run. */
  request: () => void
  /** Eerlijke melding bij een lege uitkomst, een fout of een geblokkeerd toestel. */
  error: string | null
}

/** Ruwe token-ruimte; de web-SDK negeert dit (de prompt begrenst de uitvoer). */
const LOCAL_MAX_NEW_TOKENS = 320

export function useWhatIfSuggestions({
  overrides,
  baseline,
  fireAgeDelta,
  activeEventNames,
  debounceMs = 2000,
  prefillContext = null,
  activeEventTypes,
}: UseWhatIfSuggestionsOptions): UseWhatIfSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SuggestedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Eén lokale generatie tegelijk: de gedeelde GPU-wachtrij kent geen abort, dus
  // een tweede klik zou alleen maar wachttijd stapelen.
  const runningRef = useRef(false)

  const execution = useExecutionMode('tips')

  // Dismiss suggestions on any slider change so stale results never linger.
  useEffect(() => {
    setSuggestions([])
  }, [overrides])

  // ── Cloud-pad: debounced auto-fetch bij een betekenisvolle verschuiving ────
  useEffect(() => {
    if (!overrides || !baseline) return
    // FAIL-CLOSED: alleen bij een expliciet cloud-groen licht. 'resolving',
    // 'blocked' en 'lokaal' komen hier niet voorbij.
    if (!execution.canUseCloud) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (!isSignificantDelta(overrides, baseline, fireAgeDelta)) return

      // Abort any in-flight request before issuing a new one.
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const prompt = buildSuggestionPrompt({
          overrides,
          baseline,
          fireAgeDelta,
          activeEventNames,
        })

        const res = await fetch('/api/whatif/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })

        if (res.ok) {
          const data = await res.json()
          if (!controller.signal.aborted) {
            setSuggestions(data.suggestions ?? [])
          }
        }
      } catch (err) {
        // Aborted requests are expected — swallow them silently.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // All other errors degrade silently; suggestions are non-critical.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [overrides, baseline, fireAgeDelta, activeEventNames, debounceMs, execution.canUseCloud])

  // Abort any pending request and clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // ── Lokaal pad: alleen op verzoek ─────────────────────────────────────────
  // Actuele overrides, voor de staleness-check onderin `request` (een ref zodat
  // de check geen extra render of dependency oplevert).
  const overridesRef = useRef(overrides)
  useEffect(() => {
    overridesRef.current = overrides
  }, [overrides])

  const canRequest = Boolean(
    execution.canUseLocal && overrides && baseline && prefillContext && !loading && !runningRef.current,
  )

  const request = useCallback(() => {
    if (!execution.canUseLocal || !overrides || !baseline || !prefillContext) return
    if (runningRef.current) return
    runningRef.current = true

    // Snapshot van het scenario waarvoor we voorstellen maken: schuift de
    // gebruiker tijdens de (trage) run verder, dan is het resultaat verouderd en
    // gooien we het weg i.p.v. het bij een ander scenario te tonen.
    const requestedFor = overrides

    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const session = await loadModelSession()
        const raw = await session.generate(
          [
            { role: 'system', content: buildLocalWhatifSystemPrompt() },
            {
              role: 'user',
              content: buildLocalWhatifUserPrompt({
                changes: buildSuggestionChanges({ overrides, baseline, fireAgeDelta, activeEventNames }),
                activeEventNames,
                max: LOCAL_WHATIF_MAX_SUGGESTIONS,
              }),
            },
          ],
          LOCAL_MAX_NEW_TOKENS,
        )

        const parsed = parseLocalWhatifSuggestions(raw)
        const resolved = resolveLocalWhatifSuggestions(parsed.items, prefillContext, {
          excludeTypes: activeEventTypes,
          max: LOCAL_WHATIF_MAX_SUGGESTIONS,
        })

        // TWEEDE GRENS: hetzelfde zod-schema dat de cloud-route afdwingt, hier
        // per item — liever één geldig voorstel dan drie half-geparste.
        const valid = resolved.filter((s) => SuggestedEventSchema.safeParse(s).success)

        if (requestedForIsStale(requestedFor, overridesRef.current)) return

        setSuggestions(valid)
        if (valid.length === 0) {
          setError('Geen bruikbaar voorstel gevonden. Probeer het nog eens.')
        }
      } catch (err) {
        // ALTIJD loggen: zonder deze kanarie is een lokale AI-fout voor gebruiker
        // én support onzichtbaar.
        console.error('[lokale-ai] wat-als-suggesties mislukt:', err)
        setError('Voorstellen maken lukte niet op dit apparaat.')
      } finally {
        runningRef.current = false
        setLoading(false)
      }
    })()
  }, [
    execution.canUseLocal,
    overrides,
    baseline,
    prefillContext,
    fireAgeDelta,
    activeEventNames,
    activeEventTypes,
  ])

  const dismiss = useCallback((index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index))
  }, [])

  const dismissAll = useCallback(() => {
    setSuggestions([])
  }, [])

  const mode: WhatIfSuggestionsMode =
    execution.status === 'cloud'
      ? 'cloud'
      : execution.status === 'lokaal'
        ? 'lokaal'
        : execution.status === 'blocked'
          ? 'onbeschikbaar'
          : 'wachten'

  return {
    suggestions,
    loading,
    dismiss,
    dismissAll,
    mode,
    canRequest,
    request,
    error: mode === 'onbeschikbaar' ? execution.message : error,
  }
}

/** Is het scenario veranderd sinds het verzoek werd gestart? */
function requestedForIsStale(requestedFor: WhatIfOverrides, current: WhatIfOverrides | null): boolean {
  return current !== requestedFor
}
