// ── AppSetup framework — shared types ───────────────────────
//
// Elke app levert een `AppSetupConfig` met 3 secties en een save-handler.
// De generieke `<AppSetupGate>` orchestreert state, validatie en save —
// individuele configs hoeven alleen hun secties en payload-shape te
// definiëren.

import type { ComponentType } from 'react'
import type { AppSetupKey } from '@/lib/app-setup-status'

/**
 * Per-sectie render-helper. Ontvangt de huidige state en een setter; de
 * config-file kiest zelf welke shape de state heeft (vrij in TState).
 */
export interface AppSetupSectionRenderProps<TState> {
  state: TState
  setState: (updater: (prev: TState) => TState) => void
}

export interface AppSetupSection<TState> {
  id: string
  /** Kicker-stijl uppercase eyebrow boven de sectie-titel. */
  kicker: string
  /** Sectie-titel (sentence case). */
  title: string
  /** Sub-uitleg onder de titel, max 1 zin. Optioneel. */
  hint?: string
  /**
   * Inhoudelijke sectie-body. Wordt door de gate als React-component
   * gemount (eigen fiber) — mag dus vrij hooks gebruiken. Nooit door een
   * consumer als gewone functie aanroepen: dat schendt de hook-regels
   * zodra de sectie eigen state heeft (zie app-setup-gate.tsx).
   *
   * MOET een stabiele, module-level component-referentie zijn — géén
   * inline arrow (`render: (p) => <Foo {...p}/>`): een nieuwe identiteit
   * per render remount de sectie en wist zijn interne state. Het
   * `ComponentType`-type legt die intentie vast.
   */
  render: ComponentType<AppSetupSectionRenderProps<TState>>
}

/**
 * Validatie-resultaat voor de "Voltooien"-knop. `ok=false` disabelt de
 * knop én toont de optionele `reason` als hint onder de knop.
 */
export interface AppSetupValidation {
  ok: boolean
  reason?: string
}

export interface AppSetupConfig<TState = unknown> {
  appKey: AppSetupKey
  /** `user_feature_visits.feature_slug` — bron-van-waarheid komt uit `APP_SETUP_SLUGS`. */
  featureSlug: string
  /** Korte kicker boven de hero-titel (sentence case, max 4 woorden). */
  kicker: string
  /** Hero-titel (sentence case). */
  title: string
  /** Intro-paragraaf onder de titel. */
  intro: string
  /** Initiële state — geroepen bij elke mount. */
  initialState: () => TState
  /** Drie secties is de norm; mag minder of meer als de app dat vraagt. */
  sections: AppSetupSection<TState>[]
  /** Validatie voor de Voltooien-knop. */
  validate: (state: TState) => AppSetupValidation
  /** Server-endpoint dat de setup-data wegschrijft + de feature-visit-POST handelt. */
  endpoint: string
  /** Bouwt de body voor de POST naar `endpoint`. */
  buildPayload: (state: TState) => unknown
}
