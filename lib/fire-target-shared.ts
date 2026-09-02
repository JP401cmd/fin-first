/**
 * De canonieke server-side FIRE-run — één kernel-solve per request, gedeeld door
 * élk oppervlak dat op de FIRE-projectie leunt.
 *
 * Dezelfde inputs als `useHorizonFireSim` (zie `lib/hooks/use-horizon-fire-sim.ts`)
 * en daardoor identieke output. Eén bron van waarheid voor het FIRE-doelbedrag —
 * gebruikt door de Kern (`core-data-loader.ts`, en via die weg de Fin-chat) zodat
 * het bedrag op `/core` exact overeenkomt met wat Horizon toont, zonder
 * afhankelijkheid van een DB-snapshot, én door de /overzicht-bundel
 * (`dashboard-data-loader.ts`) die hier de VOLLEDIGE uitkomst uit consumeert
 * (`computeHorizonFireSim`) i.p.v. een eigen tweede kernel-run te draaien.
 *
 * ## Convergentie-set-oppervlak (FASE 5 stap 2b, ADR 0032 §6)
 * Dit is oppervlak 3 van de convergentie-set: de engine-keuze loopt via
 * `computeConvergentieProjection` achter de per-gebruiker-vlag
 * `horizon_kernel_convergentie` (uit `loadHorizonRaw().kernelConvergentie`).
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
import { loadHorizonRaw } from '@/lib/horizon/raw-data-loader'
import type { Perspective } from '@/lib/household-data'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import type { SimResult } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { FactorRow } from '@/lib/euro-display'
import { computeRunwayFromRawContext, type RunwayResult } from '@/lib/horizon/runway'

/**
 * Beide FIRE-doel-grondslagen uit ÉÉN kernel-run (ADR 0034).
 *
 * De kernel berekent ze allebei; deze helper geeft ze allebei door zodat
 * consumenten de INCL.-woning noemer niet zelf hoeven te benaderen met
 * `inclHomeTargetFromScalar` (= de vandaag-offset). Dat was precies de drift
 * tussen de UI (kernel-waarde) en de Fin-chat (benadering) — WF-KRUIS-23.
 */
export interface HorizonFireTargets {
  /**
   * FIRE-doel EXCL. eigen woning / niet-liquide (Prognose!J@FIRE).
   * `null` wanneer de kernel-run niet kon draaien of ≤ 0 opleverde.
   */
  requiredFirePortfolio: number | null
  /**
   * FIRE-doel INCL. eigen woning (Prognose!I@FIRE) — de ECHTE, door de kernel
   * op de FIRE-maand geprojecteerde waarde (dus ná verdere hypotheekaflossing,
   * huiswaardeontwikkeling en woon-strategiewijzigingen tussen nu en FIRE).
   * `null` op stub-/preview-resultaten die het veld niet zetten of bij een
   * mislukte run — de aanroeper valt dan terug op `inclHomeTargetFromScalar`.
   */
  requiredFireNetWorth: number | null
}

/** Lege uitkomst — gedeelde constante zodat elke faal-tak dezelfde vorm teruggeeft. */
export const EMPTY_HORIZON_FIRE_TARGETS: HorizonFireTargets = {
  requiredFirePortfolio: null,
  requiredFireNetWorth: null,
}

/**
 * De VOLLEDIGE kernel-uitkomst uit de canonieke Horizon-run — één bron voor élk
 * oppervlak dat op de FIRE-projectie leunt (ADR 0034, WF-WILL-01).
 *
 * Vóór deze samenvoeging draaide `/overzicht` (dashboard-data-loader) een EIGEN,
 * onafhankelijke `computeConvergentieProjection` met zelf-afgeleide profiel-,
 * uitgaven- en strategie-inputs, terwijl de Kern + de Fin-chat via
 * `computeHorizonFireTarget` op de Horizon-run zaten. Twee runs = twee
 * FIRE-doelen = twee vrijheids-percentages (8,6pp verschil in productie).
 * `/overzicht` consumeert nu deze uitkomst i.p.v. te herberekenen.
 */
export interface HorizonFireSim {
  /** Kernel-resultaat (rijen, FIRE-leeftijd, beide doelbedragen, eindleeftijd). */
  sim: SimResult
  /**
   * De rauwe kernel-context die déze run voedde. Wordt doorgegeven als
   * `RegelSimSnapshot.rawContext` zodat de /toekomst-Voorkeuren-editors per
   * constructie op dezelfde baseline draaien als de getoonde curve.
   */
  rawContext: ConvergentieRawContext
  /** Huidige eindstrategie (weergave + editor-baseline). */
  fireStrategy: FireStrategyConfig
  /** Huidige onttrekkingsstrategie (weergave + editor-baseline). */
  withdrawalStrategy: WithdrawalStrategyConfig
  /** AOW-leeftijd afgerond omhoog (weergave). */
  aowAgeInt: number
  /** Fractionele AOW-leeftijd (weergave). */
  aowAgeFractional: number
  /**
   * Kernelrijen van DEZE run, teruggebracht tot de canonieke WEERGAVE-DEFLATOR
   * per jaar: `UnifiedProjectionRow.inflationFactor` (jaar 0 = exact 1.0).
   *
   * Waaróm deze naad bestaat (ADR 0090, besluit "de factor verlaat de kernel via
   * `computeHorizonFireSim`"): `SimResult`/`SimRow` dragen de factor NIET, terwijl
   * `UnifiedProjectionResult.rows` dat wél doen — die blijven vandaag binnen deze
   * functie. Zonder deze naad zou elke server-consument (de /overzicht-bundel, de
   * AI-context) de factor zelf moeten narekenen met een eigen `Math.pow(1 + i, n)`.
   * Dát is precies de drift die de euro-weergave opheft: CONSUME, DON'T RECOMPUTE.
   *
   * Bewust COMPACT (`{ age, inflationFactor }`) en niet de volledige
   * `UnifiedProjectionRow[]`: de rijen reizen mee in de RSC-payload naar de client
   * en de rest van de rij is daar niet nodig. `SimRow` uitbreiden is verworpen —
   * dat type wordt óók door niet-kernel-paden (stubs, previews, what-if) gemaakt,
   * waar de factor verzonnen zou moeten worden.
   *
   * CONSUME-ONLY: voer deze rijen aan `buildFactorByAge` / `factorAtAge` /
   * `buildFactorByOffset` (`lib/euro-display.ts`). Deel er nooit met de hand mee.
   * Leeg wanneer de run geen rijen opleverde — de helpers vallen dan terug op
   * factor 1 (= geen deflatie), nooit op een verzonnen getal.
   */
  unifiedRows: FactorRow[]
}

/**
 * Draai de canonieke Horizon-FIRE-projectie — identiek aan Horizon's
 * `useHorizonFireSim`-hook — en geef de volledige uitkomst terug.
 *
 * `null` wanneer essentiële inputs ontbreken (geen geboortedatum, geen yearly
 * expenses, geen profielrij) of de kernel-run faalde; de aanroeper valt dan op
 * zijn eigen fallback terug.
 *
 * Wrapped in React `cache()` zodat élke consumer binnen één request (Kern,
 * AI-context, /overzicht-bundel) dezelfde Promise — en dus letterlijk dezelfde
 * cijfers — hergebruikt.
 *
 * ## Perspectief (ADR 0107)
 * De run is PERSPECTIEF-BEWUST: `personal` (default, byte-identiek aan
 * voorheen), `household` of `partner`. De perspectief-rijen komen uit
 * `loadHorizonRaw(...).fireAssets` / `.fireDebts` — de kernel rekent per
 * asset-rij, dus zónder die rijen zou een huishoud-run stil op de persoonlijke
 * potten draaien en dus hetzelfde antwoord geven als de eigen blik.
 * De cache-sleutel bevat het perspectief; een blikwissel kost één extra solve.
 *
 * BEKENDE GRENS (bewust, volgt uit de rauwe laag): de UITGAVEN-kant blijft in
 * huishoud-/partnerblik persoonlijk (`effectiveInput.monthlyExpenses` /
 * `yearlyMustExpenses` komen uit de eigen transacties/budgetten). Dat was óók
 * de grondslag van de vervangen closed-form benadering, dus deze wijziging
 * introduceert die scheefheid niet — ze erft 'm. Huishoud-uitgaven zijn belegd
 * bij de vervolgkaarten (M22/H6).
 *
 * ## Waaróm deze module de RAUWE laag leest
 * `loadHorizonData` (de afgeleide laag) consumeert op zijn beurt DEZE functie.
 * Zou hier `loadHorizonData` staan, dan was dat oneindige recursie — precies
 * de reden dat er ooit een tweede, closed-form FIRE-benadering ontstond.
 */
const computeHorizonFireSimCached = cache(async function computeHorizonFireSimInner(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<HorizonFireSim | null> {
  // ── Rauwe Horizon-data (queries + rauwe afleidingen, GEEN kernel) ──────────
  // Hergebruikt assets, debts, life events, fire-strategy, withdrawal-strategy,
  // box3Method, hasPartner, unlinkedCash — alle inputs die de hook ook krijgt.
  let data
  try {
    data = await loadHorizonRaw(supabase, perspective)
  } catch {
    return null
  }

  // ── Weiger een run op rijen die de kernel niet eerlijk kán modelleren ──────
  // Staat het privacyniveau van de partner op "totalen", dan levert de
  // huishoud-/partnerblik één synthetische aggregaatrij zónder asset_type,
  // rendement of inclusion-percentage. Een SOM is daarmee eerlijk; een POT niet
  // — de kernel zou dat bedrag in een willekeurige categorie met een verzonnen
  // rendement laten landen en er een FIRE-leeftijd op bouwen. Liever géén
  // kernel-antwoord: de afgeleide laag valt dan terug op de closed-form
  // benadering op de perspectief-TOTALEN (het gedrag van vóór ADR 0107) en
  // meldt dat via `fireEngine: 'scalar'`.
  if (!data.fireRowsComplete) return null

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
    // Perspectief-rijen (in de eigen blik identiek aan `assets`/`debts`).
    assets: data.fireAssets,
    debts: data.fireDebts,
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
  const rawContext: ConvergentieRawContext = {
    profile: data.rawProfile,
    assets: data.fireAssets,
    debts: data.fireDebts,
    lifeEvents: data.events ?? [],
    aowRows: aowRowsForContext,
    yearlyExpenses: built.input.yearlyExpenses,
  }
  const outcome = computeConvergentieProjection({ rawContext })
  if (!outcome.ok) return null

  // Weergave-deflator per jaar uit DEZELFDE run (geen tweede bron, geen eigen som):
  // lees `inflationFactor` van de kernelrijen en gooi de rest weg. De `?? []`-tak
  // dekt gedegradeerde/stub-resultaten die deze naad bereiken zonder rijen te
  // zetten — dezelfde tolerantie die `requiredFireNetWorth?` al draagt. Zonder
  // rijen is er geen factor en valt élke consument terug op 1 (= nominaal tonen),
  // wat exact het bestaande `factorAtAge`-gedrag is.
  const unifiedRows: FactorRow[] = (outcome.result.rows ?? []).map((row) => ({
    age: row.age,
    inflationFactor: row.inflationFactor,
  }))

  return {
    sim: toSimResult(outcome.result),
    rawContext,
    fireStrategy: data.fireStrategy,
    withdrawalStrategy: data.withdrawalStrategy,
    aowAgeInt: built.aowAgeInt,
    aowAgeFractional,
    unifiedRows,
  }
})

/**
 * De canonieke server-side FIRE-run. Zie de doc op `computeHorizonFireSimCached`.
 *
 * Het perspectief wordt HIER genormaliseerd (niet in de gecachte functie):
 * `cache()` keyt op de argumentenlijst, dus `computeHorizonFireSim(sb)` en
 * `computeHorizonFireSim(sb, 'personal')` moeten dezelfde entry — en dus
 * letterlijk dezelfde cijfers — raken.
 */
export function computeHorizonFireSim(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<HorizonFireSim | null> {
  return computeHorizonFireSimCached(supabase, perspective)
}

/**
 * De "stop nu"-runway (ADR 0126, PR B) op de PERSPECTIEF-CORRECTE rauwe context van
 * de gedeelde FIRE-run: één extra `evaluateFireAt` op FIRE-maand 0, gelezen door
 * `depletionMonth` en geduid in lib/horizon/runway.ts.
 *
 * Bewust een EIGEN `cache()`-naad náást `computeHorizonFireSim` en NIET een veld op
 * `HorizonFireSim`: dan zou élke consument van de gedeelde run (AI-context,
 * freedomPct, gezondheidsscore) een extra engine-run betalen die alleen de kop nodig
 * heeft. De rauwe context wordt wél gedeeld — dezelfde rijen, hetzelfde perspectief,
 * dus kop en vrijheidsleeftijd komen uit één model. Geen basisrun (geen
 * geboortedatum, onvolledige perspectief-rijen, kern-fout) ⇒ `unavailable/geen-basisrun`.
 */
const computeHorizonRunwayCached = cache(async function computeHorizonRunwayInner(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<RunwayResult> {
  const run = await computeHorizonFireSim(supabase, perspective)
  if (!run) return { kind: 'unavailable', reason: 'geen-basisrun' }
  return computeRunwayFromRawContext(run.rawContext)
})

/** Perspectief-normalisatie buiten de cache — zie `computeHorizonFireSim`. */
export function computeHorizonRunway(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<RunwayResult> {
  return computeHorizonRunwayCached(supabase, perspective)
}

/**
 * Compute het FIRE-doelbedrag identiek aan Horizon's `useHorizonFireSim`-hook.
 *
 * Dunne afleiding van `computeHorizonFireSim` — géén eigen kernel-run. Retourneert
 * beide grondslagen op `null` wanneer essentiële inputs ontbreken (geen
 * geboortedatum, geen yearly expenses) of de run faalde; de aanroeper toont dan
 * een eigen fallback.
 */
const computeHorizonFireTargetCached = cache(async function computeHorizonFireTargetInner(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<HorizonFireTargets> {
  const run = await computeHorizonFireSim(supabase, perspective)
  if (!run) return EMPTY_HORIZON_FIRE_TARGETS
  const { sim } = run
  // ADR 0127 D4 — 'nu-stoppen': FIRE op maand 0, het "benodigde" bedrag is het huidige
  // vermogen en geen doel. Zelfde gate als de loaders (`simRequiredPortfolio` → null).
  if (sim.requiredFireIsStartPortfolio) return EMPTY_HORIZON_FIRE_TARGETS
  // Beide grondslagen uit DEZELFDE run doorgeven (ADR 0034). Zelfde gate/vorm als
  // `dashboard-data-loader` (simRequiredPortfolio/simRequiredNetWorth) zodat de Kern,
  // de AI-context en /overzicht letterlijk hetzelfde paar cijfers consumeren.
  return {
    requiredFirePortfolio: sim.requiredFirePortfolio > 0 ? sim.requiredFirePortfolio : null,
    requiredFireNetWorth: (sim.requiredFireNetWorth ?? 0) > 0 ? sim.requiredFireNetWorth! : null,
  }
})

/** Perspectief-normalisatie buiten de cache — zie `computeHorizonFireSim`. */
export function computeHorizonFireTarget(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<HorizonFireTargets> {
  return computeHorizonFireTargetCached(supabase, perspective)
}
