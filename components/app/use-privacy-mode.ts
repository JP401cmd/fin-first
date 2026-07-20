'use client'

import { useEffect, useState } from 'react'

// ── usePrivacyMode — client-side lezing van profiles.privacy_mode ─────────────
//
// Eén gedeelde, lichte lezing van de per-gebruiker privé-modus voor PASSIEVE
// oppervlakken die alleen hun COPY/label eerlijk moeten houden (de
// AiPrivacyIndicator, het cloud-label van de WhatIfChat). Leest via de bestaande
// GET /api/privacy-mode (own-row RLS, geen service-role — spiegelt de bron).
//
// Bewust een module-singleton: meerdere indicatoren op één pagina (bv. drie
// AiPrivacyIndicators in de widgets) delen zo één GET i.p.v. N losse requests.
// De waarde is cosmetisch (welke tekst tonen we) — een privé-toggle op
// /mijn/privacy leidt tot een paginanavigatie/reload die het proces vernieuwt,
// dus de singleton-staleness is hier geen probleem. Oppervlakken waarvoor de
// verse waarde WÉL kritisch is (de ChatPanel-transport-swap, fail-closed) lezen
// bewust NIET via deze singleton maar doen een verse fetch per open.

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
  useEffect(() => {
    let active = true
    readPrivacyModeOnce().then((v) => {
      if (active) setMode(v)
    })
    return () => {
      active = false
    }
  }, [])
  return mode
}
