/**
 * Gedeelde definitie van de vier hefbomen — bezittingen, schulden,
 * cashflow, belasting — inclusief label, icoon en visuele tint.
 *
 * Eén bron van waarheid voor alle hefboom-tags in de app (BriefingPanel,
 * TipsLijst, HefbomenNav). Voorkomt dat de mapping op drie plekken
 * uit-sync raakt.
 */

import {
  Wallet,
  CreditCard,
  Banknote,
  Receipt,
  type LucideIcon,
} from 'lucide-react'

export type Hefboom = 'bezittingen' | 'schulden' | 'cashflow' | 'belasting'

export interface HefboomVisual {
  label: string
  /** Tailwind-class voor tekst + achtergrond, bv. 'text-emerald-700 bg-emerald-50'. */
  tint: string
  Icon: LucideIcon
}

export const HEFBOOM_CONFIG: Record<Hefboom, HefboomVisual> = {
  bezittingen: {
    label: 'Bezittingen',
    tint: 'text-emerald-700 bg-emerald-50',
    Icon: Wallet,
  },
  schulden: {
    label: 'Schulden',
    tint: 'text-amber-700 bg-amber-50',
    Icon: CreditCard,
  },
  // Sleutel blijft `cashflow` -- die staat in de scoreberekening, de
  // briefing-tags en de rondleidingstappen. Alleen wat de gebruiker ziet
  // verandert: de hefboom heet Budget en leidt naar de budgetpagina (UR3-28).
  cashflow: {
    label: 'Budget',
    tint: 'text-sky-700 bg-sky-50',
    Icon: Banknote,
  },
  belasting: {
    label: 'Belasting',
    tint: 'text-violet-700 bg-violet-50',
    Icon: Receipt,
  },
}

/**
 * Mapping van recommendation_type naar hefboom — gebruikt door TipsLijst
 * (en eventueel andere recommendation-views) om de juiste tag te kiezen.
 * Belasting heeft (nog) geen directe recommendation_type — een
 * 'tax_optimization'-type kan later worden toegevoegd.
 */
import type { RecommendationType } from './recommendation-data'

export const HEFBOOM_FOR_RECOMMENDATION: Record<RecommendationType, Hefboom> = {
  budget_optimization: 'cashflow',
  asset_reallocation: 'bezittingen',
  debt_acceleration: 'schulden',
  income_increase: 'cashflow',
  savings_boost: 'cashflow',
}
