// ── Category deepening registry ──────────────────────────────
//
// Een verdieping is een tweede (of derde, etc.) tab op een asset/debt
// categorie-pagina, gekoppeld aan een specifieke module of "app". Bij `cash`
// toont de tab Budgetteren, bij `investment` toont de tab Holdings, etc.
//
// Multi-app: Eén categorie kan meerdere apps hebben. Daarom retourneert
// `findDeepenings()` een **array** van entries; `findDeepening()` blijft
// bestaan als alias voor de eerste match (backwards-compat) zodat bestaande
// call-sites blijven werken.
//
// Sinds de v2-refactor (mei 2026) is Aflosstrategie geen tab meer maar een
// globale "Schuldenprofiel & Aflosroute"-kaart op `/core/debts`. Daarom
// staan er hier geen Aflosstrategie-entries meer. Hypotheekplanner blijft
// een per-debt opt-in via `has_hypotheekplanner_tracking` op mortgage-rijen.
//
// Toevoegen van een nieuwe verdieping kost één entry — de tab-component zelf
// wordt opgehaald via `getDeepeningComponent()` zodat callers nooit direct
// met de mapping hoeven te werken.
//
// Architectuurnoot (perf-fase-1, Task 1.2): de pure key-/data-laag (types,
// `CATEGORY_DEEPENINGS`, `findDeepenings`, `getDeepeningSlug`,
// `getActiveAppKeys`, `countTrackedItems`) leeft in
// `@/lib/category-deepening-keys` — ZONDER component-imports. Dit bestand
// voegt alleen de component-mapping toe (`getDeepeningComponent`) en
// re-exporteert de keys zodat bestaande consumers ongewijzigd blijven werken.
// De shell (`app/(app)/layout.tsx`, `lib/category-app-nav.ts`) importeert de
// keys rechtstreeks uit de lib, zodat de vier zware tab-componenten niet meer
// in de layout-chunkgroep van alle app-pagina's belanden.
//
// Architectuurnoot: de tabs zijn statische imports. De vorige opzet met
// `next/dynamic({ ssr: false })` produceerde op Turbopack (Next 16) een
// ChunkLoadError op `/core/assets/[type]`, omdat de runtime de async chunk
// (`components_core_deepenings_*.js`) niet wist te resolven binnen het
// page-bundle. De tabs zijn al `'use client'` en re-exporteren bestaande
// clients (`BudgetsClient`, `HoldingsPage`) — code-splitting won daar niets,
// want die bundles werden sowieso meegezogen door de tab-page.

import type { ComponentType } from 'react'
import type { AssetType } from '@/lib/asset-data'
import type { DebtType } from '@/lib/debt-data'
import { InvestmentHoldingsTab } from './deepenings/investment-holdings-tab'
import { CryptoHoldingsTab } from './deepenings/crypto-holdings-tab'
import { HypotheekplannerTab } from './deepenings/hypotheekplanner-tab'
import { VerhuurrendementTab } from './deepenings/verhuurrendement-tab'
import {
  CATEGORY_DEEPENINGS,
  findDeepenings,
  findDeepening,
  hasDeepening,
  getDeepeningSlug,
  getActiveAppKeys,
  countTrackedItems,
  type DeepeningTabProps,
  type DeepeningEntry,
} from '@/lib/category-deepening-keys'

// ── Re-exports (backwards-compat) ────────────────────────────
// Bestaande consumers importeren de keys/data/helpers historisch uit dit
// bestand. Re-exporteren houdt die imports werkend zonder wijziging; de shell
// gebruikt bewust de directe lib-import (`@/lib/category-deepening-keys`).
export {
  CATEGORY_DEEPENINGS,
  findDeepenings,
  findDeepening,
  hasDeepening,
  getDeepeningSlug,
  getActiveAppKeys,
  countTrackedItems,
}
export type { DeepeningTabProps, DeepeningEntry }

// ── Static tab components ────────────────────────────────────
//
// De tabs zijn directe imports (zie module header). De map hieronder is
// puur lookup-glue zodat callers nooit zelf hoeven te switchen op type/kind.
//
// Multi-app: bij meerdere entries voor één (type, kind) gebruiken we de
// optionele `slug`-parameter om de juiste app-component te kiezen. De map
// wordt dan een nested `Record<slug, ComponentType>` voor die categorie.

/**
 * Component-mapping per (kind, type). Voor categorieën met één app is de
 * waarde een `ComponentType<DeepeningTabProps>`. Voor categorieën met
 * meerdere apps is de waarde een `Record<slug, ComponentType>` zodat
 * `getDeepeningComponent()` op slug kan disambigueren.
 *
 * Schulden hebben (in deze fase) nog geen tab-componenten — die komen in
 * latere fases (Aflosstrategie, Hypotheekplanner) en worden hier dan
 * ingehaakt.
 */
type DeepeningComponentMap =
  | ComponentType<DeepeningTabProps>
  | Record<string, ComponentType<DeepeningTabProps>>

const DEEPENING_COMPONENTS: Partial<
  Record<'asset' | 'debt', Partial<Record<AssetType | DebtType, DeepeningComponentMap>>>
> = {
  asset: {
    investment: InvestmentHoldingsTab,
    crypto: CryptoHoldingsTab,
    // `eigen_huis` heeft één app (Hypotheekplanner) — single-component vorm.
    // Slug-disambiguation is hier niet nodig; toekomstige tweede app
    // (bv. Verzekerings-tab) zou de waarde naar de nested vorm migreren.
    eigen_huis: HypotheekplannerTab,
    // `real_estate` — Verhuurrendement-app. Single-component vorm; bij een
    // toekomstige tweede app (bv. Aankoop-checker) wordt dit een nested map.
    real_estate: VerhuurrendementTab,
  },
  debt: {
    // Sinds de v2-refactor heeft alleen `mortgage` nog een tab — de
    // Hypotheekplanner. Andere debt-types hebben geen verdieping; hun pagina
    // toont alleen de items-tab. Aflosstrategie leeft als globale kaart op
    // `/core/debts` en zit daarom niet meer in deze registry.
    mortgage: HypotheekplannerTab,
  },
}

/**
 * Resolveer de daadwerkelijke tab-component voor een (type, kind, slug?)
 * combinatie.
 *
 * Retourneert `undefined` als er geen tab-component voor deze categorie
 * bestaat — de categorie-pagina toont in dat geval alleen de items-tab.
 * Bij een module-uit toestand kun je alsnog een component terugkrijgen; de
 * tab is zelf verantwoordelijk voor het tonen van de tip-strip wanneer
 * `moduleActive === false` (en eventueel een korte teaser-uitleg).
 *
 * `slug` is optioneel:
 * - Bij categorieën met één app wordt `slug` genegeerd.
 * - Bij categorieën met meerdere apps wordt `slug` gebruikt om de juiste
 *   component te kiezen. Zonder `slug` valt de lookup terug op de eerste
 *   entry voor backwards-compat met legacy callers.
 */
export function getDeepeningComponent(
  type: AssetType | DebtType,
  kind: 'asset' | 'debt',
  slug?: string,
): ComponentType<DeepeningTabProps> | undefined {
  const entry = DEEPENING_COMPONENTS[kind]?.[type]
  if (!entry) return undefined

  // Single-component vorm — direct teruggeven, slug is irrelevant.
  if (typeof entry === 'function') return entry

  // Multi-app vorm: kies op slug, of fallback op de eerste registry-entry.
  if (slug) {
    return entry[slug]
  }
  const entries = findDeepenings(type, kind)
  const fallbackSlug = entries[0] ? getDeepeningSlug(entries[0]) : undefined
  return fallbackSlug ? entry[fallbackSlug] : undefined
}
