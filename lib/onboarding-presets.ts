/**
 * Spaardoel-presets voor de onboarding-stap "Spaardoel" (stap v.).
 *
 * Eén tile per preset met een vaste defaultkeuze voor naam, bedrag, kleur,
 * icoon en tijdshorizon. De gebruiker mag elk veld na selectie nog
 * aanpassen — de presets zijn een laagdrempelig startpunt, geen rigide
 * keuze. Het "Noodfonds"-bedrag is dynamisch: 6× maandelijkse uitgaven of
 * een fallback gebaseerd op 70% van het netto-inkomen wanneer de uitgaven
 * onbekend zijn — via de gedeelde bron `lib/goals/standaard-doelen.ts` zodat
 * onboarding, de Doelen-tab en de noodfonds-widget dezelfde grondslag hanteren.
 *
 * Bewuste keuze: ALLE presets gebruiken `goal_type: 'savings'`, óók het
 * noodfonds. De `emergency_fund`-enum gebruikt `unit: 'maanden'` (zie
 * `lib/goal-data.ts:88`), wat een ander UI-pad afdwingt. Voor de
 * onboarding-context willen we een gewoon €-spaardoel zodat de figures op
 * de doelenkaarten direct kloppen. De semantiek "Noodfonds" wordt
 * gecommuniceerd via het Shield-icoon + de naam, niet via de enum.
 */

import type { GoalType } from './goal-data'
import { computeNoodfondsTarget as computeStandaardNoodfondsTarget } from './goals/standaard-doelen'

export type SpaardoelPresetKey =
  | 'noodfonds'
  | 'vakantie'
  | 'auto'
  | 'aanbetaling'
  | 'groei'
  | 'custom'

export interface SpaardoelPreset {
  key: SpaardoelPresetKey
  label: string
  /** Lucide icon naam (ShieldCheck, Sun, Car, Home, BookOpen, Target). */
  icon: string
  /** Kleur-token zoals geaccepteerd door de `goals`-tabel (`teal`, `amber`, ...). */
  color: 'teal' | 'amber' | 'blue' | 'purple' | 'emerald' | 'red'
  /** Altijd 'savings' — zie module-docs hierboven voor de motivatie. */
  goalType: GoalType
  /** Default-horizon in maanden. `null` voor 'custom' (gebruiker vult zelf). */
  defaultMonthsAhead: number | null
  /**
   * Default-streefbedrag in euro's. `null` voor 'custom' en 'noodfonds'
   * (de noodfonds-waarde wordt dynamisch berekend uit het profiel via
   * `computeNoodfondsTarget`).
   */
  defaultTarget: number | null
  /** Tagline-zin onder de tile (italic Source Serif). Houd < 60 chars. */
  tagline: string
}

export const SPAARDOEL_PRESETS: Record<SpaardoelPresetKey, SpaardoelPreset> = {
  noodfonds: {
    key: 'noodfonds',
    label: 'Noodfonds',
    icon: 'ShieldCheck',
    color: 'teal',
    goalType: 'savings',
    defaultMonthsAhead: 12,
    defaultTarget: null,
    tagline: 'Zes maanden vaste lasten — een rustige buffer',
  },
  vakantie: {
    key: 'vakantie',
    label: 'Vakantie',
    icon: 'Sun',
    color: 'amber',
    goalType: 'savings',
    defaultMonthsAhead: 12,
    defaultTarget: 2500,
    tagline: 'Iets om naartoe te leven',
  },
  auto: {
    key: 'auto',
    label: 'Auto',
    icon: 'Car',
    color: 'blue',
    goalType: 'savings',
    defaultMonthsAhead: 24,
    defaultTarget: 10000,
    tagline: 'Een nieuwe of betrouwbare tweedehands',
  },
  aanbetaling: {
    key: 'aanbetaling',
    label: 'Aanbetaling huis',
    icon: 'Home',
    color: 'purple',
    goalType: 'savings',
    defaultMonthsAhead: 36,
    defaultTarget: 30000,
    tagline: 'De eerste stap richting een eigen plek',
  },
  groei: {
    key: 'groei',
    label: 'Groei',
    icon: 'BookOpen',
    color: 'emerald',
    goalType: 'savings',
    defaultMonthsAhead: 12,
    defaultTarget: 5000,
    tagline: 'Cursus, opleiding, of zelfontwikkeling',
  },
  custom: {
    key: 'custom',
    label: 'Iets anders',
    icon: 'Target',
    color: 'teal',
    goalType: 'savings',
    defaultMonthsAhead: null,
    defaultTarget: null,
    tagline: 'Vul zelf in waarvoor je spaart',
  },
}

/**
 * Bereken het pre-fill-bedrag voor het noodfonds-tile.
 *
 * Delegeert naar de gedeelde bron `lib/goals/standaard-doelen.ts` (6× maanduitgaven,
 * fallback 6× 70%-inkomen, afgerond op €100, 0 bij geen data) zodat onboarding
 * exact hetzelfde noodfonds-bedrag hanteert als de Doelen-tab en de widget. Behouden
 * als dunne wrapper voor de bestaande call-sites + regressietests.
 */
export function computeNoodfondsTarget(ctx: {
  monthlyIncome: number
  monthlyExpenses: number
}): number {
  return computeStandaardNoodfondsTarget(ctx)
}
