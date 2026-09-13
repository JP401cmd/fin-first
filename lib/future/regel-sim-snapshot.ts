/**
 * De `RegelSimSnapshot` zoals hij naar de BROWSER gaat — één home (TPR-15).
 *
 * De snapshot draagt de rauwe kernel-context die de Tijdas-run voedde, zodat een
 * editor client-side exact dezelfde baseline draait (`runRegelProjection`). De enige
 * client-consument is die projectie; alles in de context wat de kernel niet leest, is
 * dode payload in een RSC-prop of API-response. Daarom:
 *
 *  - PROFIEL: alleen de kolommen die `buildConvergentieAdapterProfile` leest
 *    (`PROFIEL_KERNEL_KOLOMMEN`). `getOwnProfile` selecteert `*`, dus zonder whitelist
 *    reisden o.a. `onboarding_draft`, `briefing_snapshot`, `full_name` en `role` mee
 *    (security-gate 13 sep 2026). Eigen rij, geen cross-user-pad — wel overbodig.
 *    `regel-sim-snapshot.test.ts` meet met een Proxy welke velden de adapter leest en
 *    wordt rood zodra hij een veld leest dat hier ontbreekt.
 *  - PARTNERBLOK: weg (`rawContextZonderPartner`, TPR-07).
 *  - BEZITTINGEN/SCHULDEN: vangrail op `*_encrypted`/`*_hash`. De fetchers selecteren
 *    vandaag al `ASSET_CLIENT_COLUMNS` (assets) en schulden hebben zulke kolommen niet, dus
 *    dit haalt nu niets weg; het vangt een latere `select('*')`. Een kolom-whitelist per
 *    rijtype is een open restpunt (TPR-15-plan).
 *
 * Gebruikt door `dashboard-data-loader` (Voorkeuren-pagina) en
 * `GET /api/plan-review/editor-context` (de plan-review-wizard). Pure module.
 */

import {
  rawContextZonderPartner,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import type { HorizonFireSim } from '@/lib/fire-target-shared'
import type { RegelSimSnapshot } from './regel-sim'

/** De profielkolommen die de kernel-adapter leest (`buildConvergentieAdapterProfile`). */
export const PROFIEL_KERNEL_KOLOMMEN = [
  'date_of_birth',
  'net_monthly_income',
  'estimated_monthly_expenses',
  'yearly_essential_expenses',
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
  'feature_preferences',
  'withdrawal_strategy',
  'guardrail_floor',
  'guardrail_ceiling',
  'guardrail_cut_step',
  'withdrawal_profile_config',
  'deficit_loan_rate',
  'housing_strategy_config',
  'pot_rules',
  'retirement_expense_method',
  'retirement_expense_custom_amount',
] as const satisfies readonly (keyof ConvergentieRawProfileRow)[]

const SERVER_ONLY_KOLOM = /_(encrypted|hash)$/

/** Kopie van een rij zonder `*_encrypted`/`*_hash`-sleutels. */
export function zonderServerOnlyKolommen<T extends object>(row: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!SERVER_ONLY_KOLOM.test(key)) out[key] = value
  }
  return out as T
}

/** Kopie van de profielrij met alleen de kernel-kolommen (afwezig blijft afwezig). */
export function alleenKernelProfiel(profile: ConvergentieRawProfileRow): ConvergentieRawProfileRow {
  const bron = profile as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const kolom of PROFIEL_KERNEL_KOLOMMEN) {
    if (kolom in bron) out[kolom] = bron[kolom]
  }
  return out as ConvergentieRawProfileRow
}

export function buildClientRegelSimSnapshot(
  shared: Pick<HorizonFireSim, 'rawContext' | 'fireStrategy' | 'withdrawalStrategy' | 'aowAgeInt' | 'aowAgeFractional'>,
): RegelSimSnapshot {
  const context = rawContextZonderPartner(shared.rawContext)
  return {
    rawContext: {
      ...context,
      profile: alleenKernelProfiel(context.profile),
      assets: context.assets.map(zonderServerOnlyKolommen),
      debts: context.debts.map(zonderServerOnlyKolommen),
    },
    fireStrategy: shared.fireStrategy,
    withdrawalStrategy: shared.withdrawalStrategy,
    aowAgeInt: shared.aowAgeInt,
    aowFractional: shared.aowAgeFractional,
  }
}
