/**
 * Rekenhulp — prefill-registry.
 *
 * Eén bron van waarheid voor de gebruikersdata-sleutels die een
 * calculator-formule (en input.prefill) mag gebruiken. Zowel de AI-prompt
 * (welke keys bestaan + wat ze betekenen) als de evaluator (de actuele
 * waarden) lezen hieruit, zodat ze nooit uit-sync raken.
 *
 * De waarden worden server-side afgeleid uit de bestaande
 * `loadHorizonData`-bundle (geen nieuwe queries).
 */

import { DEFAULT_RETURN, INFLATION } from '@/lib/constants'

export interface PrefillKeyMeta {
  key: string
  /** Korte omschrijving voor de AI-prompt. */
  description: string
  /** Eenheid-hint (euro/percent/years/number) voor de AI. */
  unit: 'euro' | 'percent' | 'years' | 'number'
}

/**
 * De whitelist. Voeg hier nieuwe keys toe + map ze in `buildPrefillValues`.
 * Houd `key` snake_case en stabiel — ze worden in opgeslagen definities
 * gebruikt.
 */
export const PREFILL_KEYS: PrefillKeyMeta[] = [
  { key: 'net_worth', description: 'Netto vermogen (bezittingen − schulden)', unit: 'euro' },
  { key: 'total_assets', description: 'Totale bezittingen', unit: 'euro' },
  { key: 'total_debts', description: 'Totale schulden', unit: 'euro' },
  { key: 'liquid_cash', description: 'Liquide cash + spaargeld', unit: 'euro' },
  { key: 'investment_total', description: 'Belegd vermogen (beleggen + crypto)', unit: 'euro' },
  { key: 'mortgage_balance', description: 'Openstaande hypotheekschuld', unit: 'euro' },
  { key: 'home_value', description: 'Woningwaarde (eigen huis)', unit: 'euro' },
  { key: 'monthly_income', description: 'Netto maandinkomen', unit: 'euro' },
  { key: 'monthly_expenses', description: 'Maandelijkse uitgaven', unit: 'euro' },
  { key: 'monthly_surplus', description: 'Maandelijks overschot (inkomen − uitgaven)', unit: 'euro' },
  { key: 'current_age', description: 'Huidige leeftijd', unit: 'years' },
  { key: 'gross_return', description: 'Aangenomen bruto jaarrendement (fractie, bv. 0.07)', unit: 'percent' },
  { key: 'inflation_rate', description: 'Aangenomen inflatie (fractie, bv. 0.02)', unit: 'percent' },
]

export const PREFILL_KEY_SET = new Set(PREFILL_KEYS.map((k) => k.key))

/** Numerieke waarden per prefill-key. Onbekende keys → undefined. */
export type PrefillValues = Record<string, number>

/**
 * Minimale subset van de horizon-data-bundle die we nodig hebben. We
 * typen 'm losjes zodat de loader-shape kan evolueren zonder hier te
 * breken; ontbrekende velden vallen terug op 0.
 */
export interface PrefillSource {
  effectiveInput?: {
    totalAssets?: number | null
    totalDebts?: number | null
    monthlyIncome?: number | null
    monthlyExpenses?: number | null
    dateOfBirth?: string | null
  } | null
  unlinkedCash?: number | null
  assets?: Array<{ asset_type?: string | null; current_value?: number | null }> | null
  housingContext?: { eigenHuisValue?: number | null; mortgageBalance?: number | null } | null
  fireParams?: { grossReturn?: number | null; inflationRate?: number | null } | null
}

function ageFromDob(dob: string | null | undefined): number {
  if (!dob) return 0
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}

function sumAssets(
  assets: PrefillSource['assets'],
  types: string[],
): number {
  if (!assets) return 0
  return assets
    .filter((a) => types.includes(a.asset_type ?? ''))
    .reduce((s, a) => s + Number(a.current_value ?? 0), 0)
}

/** Bouw de actuele prefill-waarden uit de horizon-data-bundle. */
export function buildPrefillValues(src: PrefillSource): PrefillValues {
  const ei = src.effectiveInput ?? {}
  const totalAssets = Number(ei.totalAssets ?? 0)
  const totalDebts = Number(ei.totalDebts ?? 0)
  const monthlyIncome = Number(ei.monthlyIncome ?? 0)
  const monthlyExpenses = Number(ei.monthlyExpenses ?? 0)
  const liquidCash =
    Number(src.unlinkedCash ?? 0) + sumAssets(src.assets, ['cash', 'savings', 'checking'])
  const investmentTotal = sumAssets(src.assets, ['investment', 'crypto'])
  const homeValue = Number(src.housingContext?.eigenHuisValue ?? 0)
  const mortgageBalance = Number(src.housingContext?.mortgageBalance ?? 0)

  return {
    net_worth: totalAssets - totalDebts,
    total_assets: totalAssets,
    total_debts: totalDebts,
    liquid_cash: liquidCash,
    investment_total: investmentTotal,
    mortgage_balance: mortgageBalance,
    home_value: homeValue,
    monthly_income: monthlyIncome,
    monthly_expenses: monthlyExpenses,
    monthly_surplus: monthlyIncome - monthlyExpenses,
    current_age: ageFromDob(ei.dateOfBirth),
    // Fallbacks = canonieke FIRE-aannames (lib/constants.ts), niet los 6%/2,5%.
    gross_return: Number(src.fireParams?.grossReturn ?? DEFAULT_RETURN),
    inflation_rate: Number(src.fireParams?.inflationRate ?? INFLATION),
  }
}
