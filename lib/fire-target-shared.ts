/**
 * Shared FIRE-target compute helper.
 *
 * Dezelfde inputs als `useHorizonFireSim` (zie `lib/hooks/use-horizon-fire-sim.ts`)
 * en daardoor identieke output. Eén bron van waarheid voor het FIRE-doelbedrag —
 * gebruikt door de Kern (`core-data-loader.ts`) zodat het bedrag op `/core`
 * exact overeenkomt met wat Horizon toont, zonder afhankelijkheid van een DB-snapshot.
 *
 * ## Convergentie-set-oppervlak (FASE 5 stap 2b, ADR 0032 §6)
 * Dit is oppervlak 3 van de convergentie-set: de engine-keuze loopt via
 * `computeConvergentieProjection` achter de per-gebruiker-vlag
 * `horizon_kernel_convergentie` (uit `loadHorizonData().kernelConvergentie`).
 * Omdat de AI-context de Kern consumeert (`loadCoreData().fireTargetFromHorizon`
 * ← deze functie), flipt de vlag óók de AI mee — zónder extra code. Vlag uit →
 * byte-identiek aan de bestaande v2-run (de router draait dan letterlijk
 * `runSelectedProjection`).
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ageAtDate } from '@/lib/horizon-data'
import { toSimResult } from '@/lib/unified-projection'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { NL_AOW_AGE } from '@/lib/constants'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { computeConvergentieProjection } from '@/lib/horizon-kernel/convergentie-router'

/**
 * Compute het FIRE-doelbedrag identiek aan Horizon's `useHorizonFireSim`-hook.
 *
 * Retourneert `null` wanneer essentiële inputs ontbreken (geen geboortedatum,
 * geen yearly expenses) — de aanroeper toont dan een eigen fallback.
 *
 * Wrapped in React `cache()` zodat meerdere aanroepen binnen één request
 * (bv. Kern + dashboard widgets) dezelfde Promise hergebruiken.
 */
export const computeHorizonFireTarget = cache(async function computeHorizonFireTarget(
  supabase: SupabaseClient,
): Promise<number | null> {
  // ── Volledige Horizon-data via bestaande loader ──────────────
  // Hergebruikt assets, debts, life events, fire-strategy, withdrawal-strategy,
  // box3Method, hasPartner, unlinkedCash — alle inputs die de hook ook krijgt.
  let data
  try {
    data = await loadHorizonData(supabase)
  } catch {
    return null
  }

  // ── AOW-leeftijd: aparte query (zit niet in horizon-data-loader) ──
  // De opgehaalde rijen bewaren we óók als array voor de kernel-rawContext (de
  // select-kolommen volstaan voor `lookupAowAge`; de kernel gebruikt ze net zo).
  let aowAgeFractional = NL_AOW_AGE
  let aowRowsForContext: AowLeeftijdRow[] = []
  try {
    const { data: aowRows } = await supabase
      .from('aow_leeftijd')
      .select('birth_date_from, birth_date_through, aow_years, aow_months, is_definitive')
    aowRowsForContext = (aowRows as AowLeeftijdRow[] | null) ?? []
    aowAgeFractional = lookupAowAge(
      aowRowsForContext,
      data.effectiveInput.dateOfBirth,
    ).fractional
  } catch {
    // Fallback naar default — niet kritiek voor non-pensioen strategieën
  }

  // ── Inputs guard-clause: geboortedatum vereist ──────────────
  const dob = data.effectiveInput.dateOfBirth
  if ((dob ? ageAtDate(dob) : null) === null) return null

  // ── Cutover (C4/criterium 7, ADR 0016): gebruik DEZELFDE gedeelde input-
  // assemblage (`buildHorizonInput`) + flag-bewuste engine-selectie als de
  // /toekomst-hook en de /overzicht-loader. Daardoor leest de Kern (en alles
  // wat hierop hangt — AI-context, freedomPct, gezondheidsscore, sovereignty)
  // exact hetzelfde FIRE-doelbedrag als /toekomst en /overzicht. Bij v2 is dat
  // inclusief de perpetual+AOW-correctie (v1 overcrediteert levenslange AOW).
  const built = buildHorizonInput({
    horizonInput: data.effectiveInput,
    lifeEvents: data.events ?? [],
    fireStrategy: data.fireStrategy,
    withdrawalStrategy: data.withdrawalStrategy,
    grossReturn: data.fireParams.grossReturn,
    inflation: data.fireParams.inflationRate,
    aowAgeFractional,
    assets: data.assets,
    debts: data.debts,
    box3Method: data.box3Method,
    hasPartner: data.hasPartner,
    bankAccountCash: data.unlinkedCash,
    monthlySavingsOverride: data.monthlySavingsOverride,
    baseAnnualSavingsFromCashflow: data.baseAnnualSavingsFromCashflow,
    housingStrategy: data.housingStrategy,
    potRules: data.potRules,
    horizonEngineV2: data.horizonEngineV2,
  })
  if (!built) return null

  // Engine-keuze via de convergentie-router (zie module-doc): vlag uit → letterlijk
  // de bestaande v2-run (byte-identiek); vlag aan + rauwe context → horizon-kernel,
  // met schone v2-terugval bij een kernel-onondersteunde generieke liquidatie of een
  // kernel-fout (woning-strategieën zijn kernel-native).
  const outcome = computeConvergentieProjection({
    builtInput: built.input,
    strategyOptions: built.strategyOptions,
    v2FlagArg: data.horizonEngineV2,
    kernelEnabled: data.kernelConvergentie && !!data.rawProfile,
    rawContext: data.rawProfile
      ? {
          profile: data.rawProfile,
          assets: data.assets,
          debts: data.debts,
          lifeEvents: data.events ?? [],
          aowRows: aowRowsForContext,
          yearlyExpenses: built.input.yearlyExpenses,
        }
      : undefined,
  })
  const sim = toSimResult(outcome.result)

  if (built.isPensioen) {
    // Pensioen post-processing verschilt per motor:
    // • v2: gebruik het werkelijk geprojecteerde portfolio op AOW-leeftijd i.p.v.
    //   het binary-search-minimum (zie use-horizon-fire-sim, regel 124-137).
    // • kernel: de bridge levert voor de pensioen-eindstrategie
    //   `firePortfolioAtFire === requiredFirePortfolio` per constructie (de maand-
    //   bisectie stopt op de eerste toereikende maand — zie lib/horizon-kernel/
    //   bridge.ts), dus `requiredFirePortfolio` ís hier al het portfolio-op-FIRE.
    if (outcome.engine === 'v2') {
      const value = sim.firePortfolioAtFire ?? sim.requiredFirePortfolio
      return value > 0 ? value : null
    }
    return sim.requiredFirePortfolio > 0 ? sim.requiredFirePortfolio : null
  }

  return sim.requiredFirePortfolio > 0 ? sim.requiredFirePortfolio : null
})
