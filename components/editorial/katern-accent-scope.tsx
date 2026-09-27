/**
 * KaternAccentScope — zet binnen zijn subtree het module-accent op één van de vier
 * gebruikersaccenten (eigenaarswens 27 sep: "maak de accentkleuren niet de achtergrond
 * maar accentkleuren op de subpagina").
 *
 * Werking: `--module-active-50..950` → `var(--color-<accent>-50..950)`, als inline custom
 * properties op een `display: contents`-wrapper. Custom properties erven via de
 * DOM-boom, ook door een `contents`-element heen, terwijl de wrapper zelf geen box maakt
 * — hij verandert dus niets aan layout, grid of sticky-gedrag en kan ook om losse slots
 * (bv. een zijkolom) gezet worden. Alles wat in de subtree al `--module-active-*` leest
 * (SectionLabel-kickers, links, knoppen, randen) krijgt vanzelf de katernkleur; het
 * accent wordt nooit een achtergrondvlak.
 *
 * Wat NIET meebeweegt: stoplicht (`LEVERAGE_STATUS_DOT`, `text-positive/negative`),
 * fase- (`--color-phase-*`) en boxkleuren staan op eigen tokens, niet op module-active.
 * De basis-accenten zelf (`--color-kern-*` enz.) zet `ModuleColorProvider`; deze scope
 * leest ze alleen en overschrijft niets buiten zijn subtree.
 *
 * Geen `'use client'`: puur presentational, bruikbaar vanuit server- en clientcode.
 */

import type { CSSProperties, ReactNode } from 'react'

/**
 * Een van de vier gebruikersinstelbare accenten (CLAUDE.md, Kleurconventie). Nooit een
 * stoplichtkleur: status draagt zijn eigen tokens.
 */
export type KaternAccent = 'kern' | 'wil' | 'horizon' | 'fin'

const TINTEN = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

/** De custom properties die `--module-active-*` op het gekozen accent zetten. */
export function moduleActiveVars(accent: KaternAccent): CSSProperties {
  const vars: Record<string, string> = {}
  for (const t of TINTEN) vars[`--module-active-${t}`] = `var(--color-${accent}-${t})`
  return vars as CSSProperties
}

export interface KaternAccentScopeProps {
  /** Het accent binnen de scope; zonder accent erft de subtree het route-accent. */
  accent?: KaternAccent | null
  children: ReactNode
  /** Standaard `contents` (geen eigen box). Geef een eigen klasse als je wél een box wilt. */
  className?: string
}

export function KaternAccentScope({ accent = null, children, className = 'contents' }: KaternAccentScopeProps) {
  return (
    <div
      className={className || undefined}
      data-testid="katern-accent-scope"
      data-accent={accent ?? undefined}
      style={accent ? moduleActiveVars(accent) : undefined}
    >
      {children}
    </div>
  )
}
