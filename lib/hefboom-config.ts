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
  /**
   * Tailwind-class voor tekst + achtergrond, bv. 'text-kern-700 bg-kern-50'.
   *
   * MOET een module-accenttoken zijn (kern/wil/horizon/fin) of een neutraal
   * ink-token — nooit een Tailwind-standaardkleur. Dat is de kleurconventie
   * uit CLAUDE.md, en hier was het tot UR3-32 letterlijk mis: de vier
   * hefbomen droegen emerald/amber/sky/violet, waarbij Bezittingen op 3,1
   * graden van het "op koers"-groen stond en Schulden exact de hex van box1
   * had. Geborgd door lib/hefboom-config.tint.test.ts.
   */
  tint: string
  Icon: LucideIcon
}

export const HEFBOOM_CONFIG: Record<Hefboom, HefboomVisual> = {
  bezittingen: {
    label: 'Bezittingen',
    // Bezittingen = het kern-accent (instelbaar op /mijn/uiterlijk).
    tint: 'text-kern-700 bg-kern-50',
    Icon: Wallet,
  },
  schulden: {
    label: 'Schulden',
    // Schulden = het wil-accent (instelbaar op /mijn/uiterlijk).
    tint: 'text-wil-700 bg-wil-50',
    Icon: CreditCard,
  },
  // Sleutel blijft `cashflow` -- die staat in de scoreberekening, de
  // briefing-tags en de rondleidingstappen. Alleen wat de gebruiker ziet
  // verandert: de hefboom heet Budget en leidt naar de budgetpagina (UR3-28).
  cashflow: {
    label: 'Budget',
    // Budget = het horizon-accent (instelbaar op /mijn/uiterlijk).
    tint: 'text-horizon-700 bg-horizon-50',
    Icon: Banknote,
  },
  belasting: {
    label: 'Belasting',
    // Belasting heeft bewust GEEN eigen accent (besluit UR3-32): de kleur is
    // daar functioneel per box (--color-box1/2/3-*) en de belasting-hub
    // neutraliseert het route-accent al naar ink. Neutraal dus, zodat de
    // tegel niet de kleur van een van zijn eigen boxen leent.
    tint: 'text-[var(--ink)] bg-[var(--subtle)]',
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
