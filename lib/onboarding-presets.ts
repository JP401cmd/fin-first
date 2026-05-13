/**
 * Spaardoel-presets voor de onboarding-stap "Spaardoel" (stap v.).
 *
 * Eén tile per preset met een vaste defaultkeuze voor naam, bedrag, kleur,
 * icoon en tijdshorizon. De gebruiker mag elk veld na selectie nog
 * aanpassen — de presets zijn een laagdrempelig startpunt, geen rigide
 * keuze. Het "Noodfonds"-bedrag is dynamisch: 3× maandelijkse uitgaven of
 * een fallback gebaseerd op 70% van het netto-inkomen wanneer de uitgaven
 * onbekend zijn.
 *
 * Bewuste keuze: ALLE presets gebruiken `goal_type: 'savings'`, óók het
 * noodfonds. De `emergency_fund`-enum gebruikt `unit: 'maanden'` (zie
 * `lib/goal-data.ts:88`), wat een ander UI-pad afdwingt op /will. Voor de
 * onboarding-context willen we een gewoon €-spaardoel zodat de figures op
 * `<DoelenStrook>` direct kloppen. De semantiek "Noodfonds" wordt
 * gecommuniceerd via het Shield-icoon + de naam, niet via de enum.
 */

import type { GoalType } from './goal-data'

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
    tagline: 'Drie maanden vaste lasten — een rustige buffer',
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
 * Formule: 3× de maandelijkse uitgaven, met een fallback van 3× (70% van
 * het netto-maandinkomen) wanneer de uitgaven (nog) niet bekend zijn. Het
 * resultaat wordt afgerond op €100 voor leesbaarheid in de UI.
 *
 * Als zowel inkomen als uitgaven 0 zijn (gebruiker heeft niets ingevuld)
 * retourneert deze 0 — de caller toont dan een leeg input-veld zonder
 * pre-fill, zodat de gebruiker zelf een bedrag invult.
 */
export function computeNoodfondsTarget(ctx: {
  monthlyIncome: number
  monthlyExpenses: number
}): number {
  // Beide context-velden ontbreken → geen pre-fill mogelijk.
  if (ctx.monthlyExpenses <= 0 && ctx.monthlyIncome <= 0) return 0

  const base = ctx.monthlyExpenses > 0 ? ctx.monthlyExpenses : ctx.monthlyIncome * 0.7
  const raw = base * 3
  // Afronden op €100 — voorkomt "€7.327,42" en houdt de UI rustig.
  return Math.round(raw / 100) * 100
}
