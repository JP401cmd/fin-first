/**
 * De kolommen van `HorizonRawData.rawProfile` — wat de lezers van die rij echt gebruiken.
 *
 * WAAROM: `loadHorizonRaw` spreidde de volledige `profiles`-rij (`getOwnProfile` doet
 * `select('*')`) in `rawProfile`. Die rij verlaat de server langs twee wegen: als prop van
 * de katern-layout van /toekomst (Next serialiseert hem volledig in de RSC-payload) en via
 * `RegelSimSnapshot.rawContext.profile` in API-antwoorden. Daarmee reisden onder meer
 * `role`, `weekly_briefing_email`, `onboarding_idempotency_key`, `full_name` en
 * `financial_context` mee naar de browser, terwijl geen enkele lezer ze nodig heeft.
 * Zelfde gedachte als `ASSET_CLIENT_COLUMNS` in `lib/asset-data.ts`: een expliciete
 * kolomlijst, geen `*`.
 *
 * WIE LEEST WAT:
 *  - de kernel-adapter (`buildConvergentieAdapterProfile`) en alles wat
 *    `ConvergentieRawProfileRow` typeert (runway, totaalplan, lab, AI-plancontext);
 *  - de plan-review (`lib/plan-review/overzicht.ts`, via `/api/plan-review`), die daarnaast
 *    de grondslagkeuze `income_source` / `expenses_source` leest.
 * `raw-profile-kolommen.test.ts` scant beide bronnen; een nieuw gelezen veld dat hier
 * ontbreekt maakt die test rood. Het type hieronder dwingt af dat elk veld van
 * `ConvergentieRawProfileRow` in de lijst staat.
 */

import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

/** De rij zoals `HorizonRawData.rawProfile` hem draagt: het kernelcontract plus de grondslagkeuze. */
export interface HorizonRawProfileRow extends ConvergentieRawProfileRow {
  /** Grondslagkeuze inkomen (ADR 0103) — gelezen door de plan-review. */
  income_source?: string | null
  /** Grondslagkeuze uitgaven (ADR 0103) — gelezen door de plan-review. */
  expenses_source?: string | null
}

export const RAW_PROFILE_KOLOMMEN = [
  'date_of_birth',
  'net_monthly_income',
  'estimated_monthly_expenses',
  'income_source',
  'expenses_source',
  'expected_return',
  'inflation_rate',
  'box3_method',
  'box3_heffingvrij_inkomen',
  'fire_end_strategy',
  'fire_end_age',
  'fire_legacy_amount',
  'fire_legacy_include_illiquid',
  'fire_stop_anchor',
  'fire_stop_age',
  'fire_no_deficit_loan',
  'deficit_loan_rate',
  'feature_preferences',
  'withdrawal_strategy',
  'withdrawal_profile_config',
  'guardrail_floor',
  'guardrail_ceiling',
  'guardrail_cut_step',
  'housing_strategy_config',
  'pot_rules',
  'retirement_expense_method',
  'retirement_expense_custom_amount',
] as const satisfies readonly (keyof HorizonRawProfileRow)[]

type RawProfileKolom = (typeof RAW_PROFILE_KOLOMMEN)[number]

/**
 * Compile-time: elk veld van het contract staat in de lijst. `yearly_essential_expenses` is
 * geen kolom; de loader injecteert de al-berekende waarde.
 */
type Ontbrekend = Exclude<keyof HorizonRawProfileRow, RawProfileKolom | 'yearly_essential_expenses'>
const LIJST_IS_VOLLEDIG: [Ontbrekend] extends [never] ? true : Ontbrekend = true
void LIJST_IS_VOLLEDIG

/**
 * Neem alleen de kolommen uit `RAW_PROFILE_KOLOMMEN` over. Een kolom die de rij niet
 * had, blijft afwezig (niet `undefined`), zodat "niet opgehaald" en "leeg" niet vermengen.
 */
export function kiesRawProfileKolommen(rij: Record<string, unknown>): HorizonRawProfileRow {
  const uit: Record<string, unknown> = {}
  for (const kolom of RAW_PROFILE_KOLOMMEN) {
    if (kolom in rij) uit[kolom] = rij[kolom]
  }
  return uit as HorizonRawProfileRow
}
