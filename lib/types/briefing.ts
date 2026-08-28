// ── Briefing data-contracten ───────────────────────────
// Canonieke datavorm-definities voor de wekelijkse briefing. Verhuisd uit
// components/overview/briefing-panel.tsx en components/app/budget-sparkline.tsx
// zodat de import-richting UI→lib is (lib mag deze contracten importeren zonder
// terug naar components te reiken). Zuiver type-only: geen runtime.

import type { Hefboom } from '@/lib/hefboom-config'

export type BriefingCategory =
  | 'observation'
  | 'tip'
  | 'upcoming'
  | 'heads_up'
  | 'milestone'
  | 'market'

export type BriefingSpan = 'narrow' | 'wide'

/**
 * Waarom de handmatige ververs van de briefing wel/niet beschikbaar is (L9).
 *
 * De regel is "1x per kalenderdag" en de server weet altijd welke van de twee
 * geldt (`snapshot.lastManualRefresh` vs. de Amsterdam-datum). Tot L9 werd dat
 * onderweg naar de client platgeslagen tot een kale `canRefresh: boolean`,
 * waardoor "niet van toepassing" en "vandaag al gebruikt, morgen weer" op het
 * scherm niet meer uit elkaar te houden waren: bij een verse mount verdween de
 * knop volledig in plaats van uitgeschakeld te blijven staan met de reden.
 */
export type BriefingRefreshState = 'available' | 'used_today'

/** Backwards-compatible alias — gedeelde definitie staat in
 *  `lib/hefboom-config.ts`. */
export type HefboomTag = Hefboom

export interface BriefingEntry {
  /** Unieke key voor React-list-key. */
  id: string
  category: BriefingCategory
  /** Eén-zin body — primaire boodschap. */
  text: string
  /** Optionele href voor doorklikken naar context. */
  href?: string
  /** Visuele span — 'wide' = 2-kolom-card, 'narrow' = 1-kolom (default). */
  span?: BriefingSpan
  /** Optionele hefboom-tag. Wanneer aanwezig: mini-icoon naast kicker. */
  hefboom?: HefboomTag
  /** Optionele impact-metadata (freedom-days + EUR-effect uit recommendation). */
  impact?: {
    freedomDaysPerYear?: number | null
    euroPerYear?: number | null
  }
}

/** Eén afgesloten week uit de briefing-historie (bewaard in de snapshot,
 *  gecapt — zie lib/briefing/snapshot.ts). */
export interface BriefingWeekHistoryItem {
  /** ISO-week-sleutel 'YYYY-Www'. */
  week: string
  headline?: string
  entries: BriefingEntry[]
  /** Vrijheidsdagen-stand van die week (voor de mini-samenvatting). */
  freedomDays?: number
}

export type SparklineDataPoint = {
  month: string  // YYYY-MM-DD
  label: string  // e.g. 'jan', 'feb'
  spent: number
}
