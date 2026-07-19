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
import { getAowLeeftijden } from '@/lib/reference-cache'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildHorizonInput } from '@/lib/horizon/build-input'
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

  // ── AOW-leeftijd: gedeelde module-TTL-cache (zit niet in horizon-data-loader) ──
  // De opgehaalde rijen bewaren we óók als array voor de kernel-rawContext (de
  // kolommen uit de cache volstaan voor `lookupAowAge`; de kernel gebruikt ze net zo).
  let aowAgeFractional = NL_AOW_AGE
  let aowRowsForContext: AowLeeftijdRow[] = []
  try {
    aowRowsForContext = await getAowLeeftijden(supabase)
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

  // FASE 6 stap 5A — kernel-only. Gebruik DEZELFDE gedeelde metadata-assemblage
  // (`buildHorizonInput`, voor `yearlyExpenses`) + de horizon-kernel als de /toekomst-hook en
  // de /overzicht-loader. Daardoor leest de Kern (en alles wat hierop hangt — AI-context,
  // freedomPct, gezondheidsscore, sovereignty) exact hetzelfde FIRE-doelbedrag als /toekomst
  // en /overzicht.
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
  })
  if (!built) return null

  // Zonder rauwe profiel-rij kan de kernel-invoer niet worden samengesteld → geen doel.
  if (!data.rawProfile) return null

  // Horizon-kernel via de convergentie-router. De kernel resolvet pensioen/AOW zélf en levert
  // per constructie `firePortfolioAtFire === requiredFirePortfolio` op de FIRE-maand (de
  // bisectie stopt op de eerste toereikende maand — zie lib/horizon-kernel/bridge.ts), dus
  // `requiredFirePortfolio` ís hier al het portfolio-op-FIRE (óók voor pensioen).
  const outcome = computeConvergentieProjection({
    rawContext: {
      profile: data.rawProfile,
      assets: data.assets,
      debts: data.debts,
      lifeEvents: data.events ?? [],
      aowRows: aowRowsForContext,
      yearlyExpenses: built.input.yearlyExpenses,
    },
  })
  if (!outcome.ok) return null
  const sim = toSimResult(outcome.result)

  return sim.requiredFirePortfolio > 0 ? sim.requiredFirePortfolio : null
})
