'use client'

import { useEffect, useState } from 'react'
import { useExecutionPrefsVersion } from '@/lib/ai/execution-prefs-signal'

// ── usePrivacyMode — client-side lezing van profiles.privacy_mode ─────────────
//
// Eén gedeelde, lichte lezing van de per-gebruiker privé-modus voor PASSIEVE
// oppervlakken die alleen hun COPY/label eerlijk moeten houden (de
// AiPrivacyIndicator, het cloud-label van de WhatIfChat). Leest via de bestaande
// GET /api/privacy-mode (own-row RLS, geen service-role — spiegelt de bron).
//
// Bewust een module-singleton: meerdere indicatoren op één pagina (bv. drie
// AiPrivacyIndicators in de widgets) delen zo één GET i.p.v. N losse requests.
// Oppervlakken waarvoor de verse waarde kritisch is (de ChatPanel-transport-swap,
// fail-closed) lezen bewust NIET via deze singleton maar doen een verse fetch
// per open.
//
// DE CACHE WORDT WÉL ONGELDIG BIJ EEN WIJZIGING (4 aug 2026). Hier stond dat
// staleness geen probleem was omdat een privé-toggle "tot een paginanavigatie
// leidt die het proces vernieuwt". Die aanname ging niet meer op zodra de
// instellingen ook ín de chat te bedienen zijn: daar wisselt de keuze zonder
// navigatie. Gevolg was zichtbaar — het waarschuwingsicoon op de Fin-knop bleef
// staan tot een handmatige herlaad. De singleton luistert daarom nu naar
// `execution-prefs-signal`.

let cached: Promise<boolean> | null = null

/** Leest de privé-modus één keer per proces (gedeelde promise). */
export function readPrivacyModeOnce(): Promise<boolean> {
  if (!cached) {
    cached = fetch('/api/privacy-mode')
      .then((r) => (r.ok ? r.json() : { privacyMode: false }))
      .then((d: { privacyMode?: boolean }) => d?.privacyMode ?? false)
      .catch(() => false)
  }
  return cached
}

/** Test-only: wis de gedeelde cache zodat elke test vers begint. */
export function __resetPrivacyModeCache(): void {
  cached = null
}

/**
 * Reactieve privé-modus voor passieve labels. Retourneert `null` zolang de
 * lezing loopt (zodat een consument desgewenst niets toont vóór het antwoord),
 * daarna de boolean.
 */
export function usePrivacyMode(): boolean | null {
  const [mode, setMode] = useState<boolean | null>(null)
  // Elke wijziging elders (chat-popover, groepenlijst, hoofdschakelaar) maakt de
  // gedeelde promise ongeldig en dwingt een verse lezing af.
  const prefsVersion = useExecutionPrefsVersion()
  useEffect(() => {
    let active = true
    if (prefsVersion > 0) cached = null
    readPrivacyModeOnce().then((v) => {
      if (active) setMode(v)
    })
    return () => {
      active = false
    }
  }, [prefsVersion])
  return mode
}
