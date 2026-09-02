/**
 * Server-side Horizon-bundel — **AFGELEIDE LAAG** (ADR 0107).
 *
 * `loadHorizonData` = de rauwe laag (`lib/horizon/raw-data-loader.ts`) PLUS de
 * cijfers die uit de canonieke kernel-run komen: `freedomPct`,
 * `requiredPortfolioExclHome`, `fireAgeFractional`, `healthScoreInput` en
 * `healthScore`.
 *
 * ## Waarom deze laag bestaat
 * Vóór ADR 0107 leidde de loader die cijfers zélf af met een closed-form
 * benadering (`computeFireTarget` + `inclHomeTargetFromScalar`), omdat de
 * canonieke kernel-run (`computeHorizonFireSim`) op zijn beurt de loader nodig
 * had — een structurele recursie. Gevolg: TWEE noemers voor één metriek
 * (gemeten: ~€108k doel-verschil, 8,6pp vrijheids-% op persona *compleet*), en
 * daardoor een /overzicht-hero + gezondheidsgetal die een ánder antwoord gaven
 * dan de widget-rail, /toekomst en de Fin-chat (bevinding H21).
 *
 * De recursie is geknipt door de loader in tweeën te delen:
 *
 *   lib/horizon/raw-data-loader.ts  →  queries + rauwe afleidingen (geen kernel)
 *          ↑                                      ↑
 *   lib/fire-target-shared.ts               DEZE MODULE
 *   (computeHorizonFireSim)                 (raw + kernel = afgeleid)
 *
 * Eén richting, geen module-cyclus. **CONSUME, DON'T RECOMPUTE**: schrijf hier
 * nooit een tweede FIRE-som; alles wat de kernel al weet komt uit
 * `computeHorizonFireSim`.
 *
 * ## De scalar-terugval
 * De closed-form benadering is niet verdwenen — ze is gedegradeerd tot wat ze
 * altijd had moeten zijn: de terugval voor de tak waarin de kernel NIET kán
 * draaien (geen geboortedatum, negatief netto vermogen, mislukte run). Zolang
 * de kernel een doel oplevert, wint de kernel. Dat is exact de gate die
 * `dashboard-data-loader.ts` al hanteert, zodat beide bundels per constructie
 * dezelfde noemer dragen.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { computeFreedomProgressWithBasis, computeRunwayCoveragePct, inclHomeTargetFromScalar } from '@/lib/core-metrics'
import { eindMaandVan } from '@/lib/horizon-kernel/gap'
import { ageAtDate } from '@/lib/horizon-data'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { loadHorizonRaw, type HorizonRawData } from '@/lib/horizon/raw-data-loader'

// ── Doorgeef-luik: alles wat consumenten historisch uit deze module haalden ──
// De rauwe laag is een implementatiedetail; het IMPORTPAD blijft
// `@/lib/horizon-data-loader`. Nieuwe consumenten die géén kernel-cijfers nodig
// hebben mogen rechtstreeks `loadHorizonRaw` gebruiken (scheelt een kernel-solve).
export {
  loadHorizonRaw,
  HORIZON_SETUP_COMPLETED_SLUG,
  HORIZON_WELCOME_SHOWN_SLUG,
  HORIZON_EXIT_NOTICE_DISMISSED_SLUG,
  HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG,
} from '@/lib/horizon/raw-data-loader'
export type { SnapshotForTrend, HorizonRawData } from '@/lib/horizon/raw-data-loader'

/**
 * De volledige Horizon-bundel: rauwe data + de kernel-afgeleide cijfers.
 *
 * Consumenten kunnen dit type ongewijzigd blijven gebruiken — de velden die
 * vroeger scalar-afgeleid waren dragen nu de kernel-waarde.
 */
export interface HorizonPageData extends HorizonRawData {
  /** Health score computed server-side (5 or 6 pillars) — kernel-genoemde vrijheids-pijler. */
  healthScore: HealthScore
  /** Health score input data for client-side recomputation (incl. kernel-`freedomPct`). */
  healthScoreInput: HealthScoreInput
  /**
   * Canonieke vrijheidsvoortgang (0..100) — teller en noemer uit DEZELFDE
   * kernel-run als /toekomst, de widget-rail en de Fin-chat. Valt terug op de
   * closed-form benadering wanneer de kernel-run niet kon draaien.
   */
  freedomPct: number
  /**
   * FIRE-doel: benodigde LIQUIDE portefeuille excl. eigen woning
   * (Prognose!J@FIRE uit de kernel-run). `null` wanneer er geen doel te
   * berekenen is. Voedt óók de progressieve first paint van /toekomst.
   */
  requiredPortfolioExclHome: number | null
  /**
   * Fractionele FIRE-/vrijheidsleeftijd uit de kernel-run. `null` wanneer de run
   * niet kon draaien of FIRE binnen de horizon onbereikbaar is.
   *
   * Dit veld verving de snapshot-afgeleide first paint van /toekomst
   * (`net_worth_snapshots.fire_age`, geschreven door de rauwe scalar-lus): die
   * kwam uit een ándere motor, dus de getoonde leeftijd sprong zodra de
   * client-worker landde. Eén motor, geen sprong.
   */
  fireAgeFractional: number | null
  /**
   * Welke motor de bovenstaande cijfers leverde — `'kernel'` of `'scalar'`
   * (terugval). Bewust zichtbaar: een oppervlak dat een grondslag benoemt moet
   * kunnen zeggen wélke, en de regressietests pinnen erop dat de gewone tak
   * `'kernel'` is.
   */
  fireEngine: 'kernel' | 'scalar'
}

const loadHorizonDataCached = cache(async function loadHorizonDataInner(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<HorizonPageData> {
  // Beide zijn React-`cache()`'d en `computeHorizonFireSim` leest ZELF
  // `loadHorizonRaw(supabase, perspective)` — dezelfde cache-entry, dus geen
  // tweede query-set. Parallel starten scheelt alleen latentie.
  const [raw, run] = await Promise.all([
    loadHorizonRaw(supabase, perspective),
    computeHorizonFireSim(supabase, perspective).catch(() => null),
  ])

  const { homeExcludedFromFire, netWorthInclHome, fireEligibleNetWorth, scalarRequiredPortfolioExclHome } =
    raw.freedomBasis

  // ── Noemer: kernel wint, scalar is terugval ────────────────────────────────
  // Zelfde gate/vorm als `dashboard-data-loader.ts` (simRequiredPortfolio /
  // simRequiredNetWorth) zodat /overzicht-hero, widget-rail, /toekomst en de
  // Fin-chat letterlijk hetzelfde paar cijfers consumeren.
  // ADR 0127 D4 — 'nu-stoppen': FIRE op maand 0, "benodigd" = huidig vermogen ⇒ geen
  // doel. Beide noemers op null (de grafiekgeometrie laat de doellijn dan al weg).
  const isNuStoppen = run?.sim.requiredFireIsStartPortfolio === true
  const kernelPortfolio =
    run && !isNuStoppen && run.sim.requiredFirePortfolio > 0 ? run.sim.requiredFirePortfolio : null
  const kernelNetWorth =
    run && !isNuStoppen && (run.sim.requiredFireNetWorth ?? 0) > 0 ? run.sim.requiredFireNetWorth! : null
  const requiredPortfolioExclHome = isNuStoppen ? null : (kernelPortfolio ?? scalarRequiredPortfolioExclHome)
  const requiredNetWorthInclHome = isNuStoppen
    ? null
    : (kernelNetWorth ??
      inclHomeTargetFromScalar(requiredPortfolioExclHome, netWorthInclHome, fireEligibleNetWorth))

  // ADR 0127 D5 — vrijheids-%: onder 'nu-stoppen' TIJDSDEKKING (uitputtingsmaand ÷
  // eindmaand) uit het bridge-veld `kernelDepletionMonth`; anders de vulling-van-het-
  // doel. Eén home per definitie (lib/core-metrics.ts), strategie-bewust gekozen.
  // Alleen nodig onder 'nu-stoppen'; optioneel gelezen zodat een gedegradeerde/gemockte
  // rauwe laag zonder `effectiveInput` het gewone pad niet laat struikelen.
  const startAge =
    isNuStoppen && raw.effectiveInput?.dateOfBirth ? ageAtDate(raw.effectiveInput.dateOfBirth) : null
  const freedomPct =
    isNuStoppen && run && startAge != null
      ? computeRunwayCoveragePct({
          kernelDepletionMonth: run.sim.kernelDepletionMonth ?? null,
          eindMaand: eindMaandVan(run.sim.displayEndAge, startAge),
        })
      : computeFreedomProgressWithBasis({
          homeExcludedFromFire,
          netWorthInclHome,
          fireEligibleNetWorth,
          requiredNetWorthInclHome,
          requiredPortfolioExclHome,
        })

  // De vrijheids-pijler van de gezondheidsscore erft dezelfde noemer; zonder
  // deze stap zou de score op een ándere FIRE-grondslag draaien dan de hero
  // erboven (bevinding H4 punt 2, dezelfde oorzaak vanaf de /overzicht-kant).
  const healthScoreInput: HealthScoreInput = {
    ...raw.healthScoreInputBase,
    freedomPct,
    // Kernel-koers voor de peer-relatieve fire_progress-pijler — zelfde bron
    // als het `fireAgeFractional`-veld dat deze bundel hieronder exposeert.
    fireAgeFractional: run?.sim.fireAgeFractional ?? null,
  }
  // Canonieke gezondheidsscore (ADR 0008/0010) — de ÉNE bron voor zowel de
  // /overzicht-hero als de Gezondheid-widget (die 'm consumeert via
  // withCanonicalOverviewFigures i.p.v. de eigen bundel-score te herberekenen).
  // TRENDLOOS (previousMonth=null): de hero toonde nooit een trend, en de widget
  // lijnt daar mee uit — één cijfer, één presentatie.
  const healthScore = computeHealthScoreFromInputs(healthScoreInput, raw.budgetingActive)

  return {
    ...raw,
    healthScore,
    healthScoreInput,
    freedomPct,
    requiredPortfolioExclHome,
    fireAgeFractional: run?.sim.fireAgeFractional ?? null,
    fireEngine: kernelPortfolio != null ? 'kernel' : 'scalar',
  }
})

/**
 * Server-side loader voor de Horizon-bundel (rauw + kernel-afgeleid),
 * request-gededuped via React `cache()`.
 *
 * De default wordt hiér genormaliseerd (niet in de gecachte functie): cache()
 * keyt op de argumentenlijst, dus `loadHorizonData(sb)` en
 * `loadHorizonData(sb, 'personal')` moeten dezelfde entry raken.
 */
export async function loadHorizonData(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<HorizonPageData> {
  return loadHorizonDataCached(supabase, perspective)
}
