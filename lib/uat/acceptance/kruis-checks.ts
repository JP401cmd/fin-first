/**
 * Gedeelde engine-checks voor de UAT-KRUIS-acceptatiecriteria (`kruis.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *   1. `kruis.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *   2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-kruis.ts`):
 *      `assertEqual(actual, expected, label)` per check.
 *
 * KRUIS gaat over CONSISTENTIE/DELTA: hetzelfde kerngetal moet overal identiek
 * zijn en een bron-mutatie moet overal doorwerken. De meeste criteria zijn
 * daardoor 'consistency'/'direction'/'ui-only' (kernel-/loader-zwaar of pure UI)
 * en hebben hier GEEN check. Alleen de canonieke, PURE SSoT-functies die per
 * constructie één getal leveren — de kern van "consume, don't recompute" — zijn
 * exact toetsbaar en hebben een check:
 *   - WF-KRUIS-06 spaarquote  → `savingsRateFromAggregates`
 *   - WF-KRUIS-08 vrijheids-% → `computeFreedomProgress`
 *   - WF-KRUIS-09 grondslag   → `getFireEligibleNetWorth`
 *   - WF-KRUIS-14 SWR         → `computeEffectiveSwr`
 *   - WF-KRUIS-20 dagtarief   → `dailyExpenseRate` + `calculateFreedomTime`
 *   - WF-KRUIS-28 stop-anker  → `parseFirePlan` (ADR 0129 D2, F1 — engine-only,
 *     nog geen UI-oppervlak; zie het criterium voor de kanttekening)
 *
 * Deze checks gebruiken bewust VASTE fixture-getallen i.p.v. persona-brondata:
 * de KRUIS-consistentie is een algebraïsche identiteit (delta = 0 of delta = het
 * bewuste verschil), dus onafhankelijk van de `Math.random()`-gejitterde persona's.
 * Elke `run()` roept UITSLUITEND de échte canonieke rekenfunctie(s) aan.
 *
 * Alle imports zijn client-veilig (geen `server-only`/`next/headers`/
 * `@/lib/supabase/server` in hun import-graaf): `lib/savings-source.ts`,
 * `lib/core-metrics.ts`, `lib/housing-strategy.ts`, `lib/fire-params.ts` en
 * `lib/format.ts` zijn pure reken-/constanten-modules.
 */

import { savingsRateFromAggregates } from '@/lib/savings-source'
import { computeFreedomProgress } from '@/lib/core-metrics'
import { getFireEligibleNetWorth, type HousingContext } from '@/lib/housing-strategy'
import { computeEffectiveSwr } from '@/lib/fire-params'
import { dailyExpenseRate, calculateFreedomTime } from '@/lib/format'
import { parseFirePlan } from '@/lib/fire-strategy'
import { KRUIS_ACCEPTANCE } from './kruis'
import type { AcceptanceCriterion } from './types'

export interface KruisEngineCheck {
  /** 'WF-KRUIS-06' */
  workflow: string
  /** 'UAT-KRUIS-06' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte canonieke rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in kruis.ts — gooit als kruis.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = KRUIS_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — kruis.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in kruis.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Minimale, volledig getypeerde HousingContext — alleen de velden die
 *  `getFireEligibleNetWorth` leest (eigenHuisValue, mortgageBalance) wijken af. */
function makeHousingContext(eigenHuisValue: number, mortgageBalance: number): HousingContext {
  return {
    eigenHuisValue,
    wozValue: eigenHuisValue,
    mortgageBalance,
    mortgageMonthlyPayment: 0,
    hasEigenHuis: eigenHuisValue > 0,
    eigenHuisMortgages: [],
    eigenHuisAssets: [],
  }
}

// ── Checks — één per 'exact'-workflow in KRUIS_ACCEPTANCE ───────────────────

export const KRUIS_ENGINE_CHECKS: KruisEngineCheck[] = [
  {
    workflow: 'WF-KRUIS-06',
    scenarioId: 'UAT-KRUIS-06',
    label: 'Spaarquote-kernformule (savingsRateFromAggregates): 30% + income>0-guard',
    run: () => {
      criterion('WF-KRUIS-06')
      const spaarquote = savingsRateFromAggregates(36000, 27000, 1800) // (10800/36000)*100 = 30
      const nulInkomen = savingsRateFromAggregates(0, 27000, 1800) // income<=0 → 0
      return {
        expected: 'spaarquote=30; nulInkomen=0',
        actual: `spaarquote=${fx(spaarquote, 0)}; nulInkomen=${nulInkomen}`,
      }
    },
  },
  {
    workflow: 'WF-KRUIS-08',
    scenarioId: 'UAT-KRUIS-08',
    label: 'Vrijheids-% (computeFreedomProgress): 60 + cap 100 + negatief 0 + geen doel 0',
    run: () => {
      criterion('WF-KRUIS-08')
      const pct60 = computeFreedomProgress({ fireEligibleNetWorth: 300000, requiredPortfolio: 500000 })
      const cap100 = computeFreedomProgress({ fireEligibleNetWorth: 600000, requiredPortfolio: 500000 })
      const negatief = computeFreedomProgress({ fireEligibleNetWorth: -5000, requiredPortfolio: 500000 })
      const geenDoel = computeFreedomProgress({ fireEligibleNetWorth: 300000, requiredPortfolio: null })
      return {
        expected: 'pct60=60; cap100=100; negatief=0; geenDoel=0',
        actual: `pct60=${pct60}; cap100=${cap100}; negatief=${negatief}; geenDoel=${geenDoel}`,
      }
    },
  },
  {
    workflow: 'WF-KRUIS-09',
    scenarioId: 'UAT-KRUIS-09',
    label: 'Grondslag-verschil (getFireEligibleNetWorth): Δ0 volledig vs. Δ=overwaarde uitsluiten',
    run: () => {
      criterion('WF-KRUIS-09')
      const nettoVermogen = 800000
      const ctx = makeHousingContext(650000, 400000) // overwaarde 250000
      const equity = 650000 - 400000
      const volledig = getFireEligibleNetWorth(nettoVermogen, ctx, { mode: 'include_full' })
      const uitsluiten = getFireEligibleNetWorth(nettoVermogen, ctx, { mode: 'exclude_from_fire' })
      const deltaVolledig = nettoVermogen - volledig
      const deltaUitsluiten = nettoVermogen - uitsluiten
      return {
        expected: 'nettoVermogen=800000; volledig=800000; deltaVolledig=0; uitsluiten=550000; deltaUitsluiten=250000; equity=250000',
        actual: `nettoVermogen=${nettoVermogen}; volledig=${volledig}; deltaVolledig=${deltaVolledig}; uitsluiten=${uitsluiten}; deltaUitsluiten=${deltaUitsluiten}; equity=${equity}`,
      }
    },
  },
  {
    workflow: 'WF-KRUIS-14',
    scenarioId: 'UAT-KRUIS-14',
    label: 'Effectieve SWR (computeEffectiveSwr): 2,840% default + vloer 0,100%',
    run: () => {
      criterion('WF-KRUIS-14')
      const swrDefault = computeEffectiveSwr(0.07, 0.02) // 0.07 − BOX3_DRAG(0.0216) − 0.02 = 0.0284
      const swrVloer = computeEffectiveSwr(0.01, 0.05) // max(0.001, negatief) = 0.001
      return {
        expected: 'swrDefault=0.02840; swrVloer=0.00100',
        actual: `swrDefault=${fx(swrDefault, 5)}; swrVloer=${fx(swrVloer, 5)}`,
      }
    },
  },
  {
    workflow: 'WF-KRUIS-20',
    scenarioId: 'UAT-KRUIS-20',
    label:
      'Eén dagtarief (dailyExpenseRate + calculateFreedomTime): €98,6301/dag → 365 dagen bij €36.000, en dezelfde Box 3-heffing geeft op elk oppervlak hetzelfde dagenaantal',
    run: () => {
      criterion('WF-KRUIS-20')
      const dagtarief = dailyExpenseRate(3000) // 3000×12/365 = 98.6301369863
      const vrijheidsdagenBij36000 = calculateFreedomTime(36000, dagtarief).totalDays // 36000/(36000/365) = 365

      // BRON-ASSERTIE (M22). De check hierboven toetste alleen de FORMULE; een
      // oppervlak dat diezelfde formule een ándere teller voedde — of zelf ÷30
      // deed — glipte er per constructie langs. Dat is precies wat er gebeurde:
      // lib/household-tax.ts leidde `dailyExpenses` af uit budget-LIMIETEN ÷ 30,
      // waardoor €569 op /overzicht/belasting/box3 3 vrijheidsdagen was en op de
      // optimizer 17.
      //
      // We kunnen hier geen DB raken (deze checks zijn puur en client-veilig),
      // dus toetsen we de IDENTITEIT die de fix garandeert: het tarief dat de
      // Box 3-keten gebruikt ís het canonieke tarief, dus beide takken geven
      // hetzelfde dagenaantal. De oude noemer wordt als CONTRAST meegerekend om
      // vast te leggen dat hij een ander antwoord gaf. De structurele bewaking
      // van "geen tweede noemer meer" zit in scripts/check-freedom-time-basis.mjs.
      const heffing = 569
      const dagenCanoniek = Math.round(heffing / dagtarief)
      const dagenBox3Keten = Math.round(heffing / dailyExpenseRate(3000))
      const dagenOudeNoemer = Math.round(heffing / (3000 / 30))
      const box3DagenDelta = dagenBox3Keten - dagenCanoniek

      return {
        expected: 'dagtarief=98.6301; vrijheidsdagenBij36000=365; box3DagenDelta=0',
        actual:
          `dagtarief=${fx(dagtarief, 4)}; vrijheidsdagenBij36000=${vrijheidsdagenBij36000}; ` +
          `box3DagenDelta=${box3DagenDelta}` +
          (dagenOudeNoemer === dagenCanoniek
            ? ''
            : ` (contrast: maand÷30 gaf ${dagenOudeNoemer} i.p.v. ${dagenCanoniek})`),
      }
    },
  },
  {
    workflow: 'WF-KRUIS-28',
    scenarioId: 'UAT-KRUIS-28',
    label: 'Stop-anker-tegenspraak-regel (parseFirePlan, ADR 0129 D2): de oude kolom wint',
    run: () => {
      criterion('WF-KRUIS-28')
      // De gevaarlijkste rij die tijdens de F1-backfill kan bestaan: de oude kolom
      // draagt nog een anker ('pensioen'/'nu-stoppen'), de nieuwe kolom staat al op
      // de default 'solved' (nog niet gebackfilld). Zou de nieuwe kolom winnen, dan
      // wisselt een AOW-plan halverwege de migratie stil naar een gesolvede bisectie.
      const halverwege = parseFirePlan({
        fire_end_strategy: 'pensioen',
        fire_stop_anchor: 'solved',
        fire_end_age: 100,
      }).anchor.kind
      const nuStoppenLegacy = parseFirePlan({
        fire_end_strategy: 'nu-stoppen',
        fire_stop_anchor: 'solved',
      }).anchor.kind
      const nieuweKolomLeidtBijEindVorm = parseFirePlan({
        fire_end_strategy: 'legacy',
        fire_stop_anchor: 'aow',
      }).anchor.kind
      // TOLERANT LEZEN (B6): een reeds opgeslagen 58,3 wordt bij het LEZEN naar de
      // dichtstbijzijnde halve jaar gebracht (58,5) — dat ís afronden, en heet hier ook
      // zo. De DB-CHECK garandeert halve jaren, dus dit is een vangnet voor rijen die
      // buiten de route om zijn ontstaan. SCHRIJVEN is streng: de PUT-route wijst
      // dezelfde 58,3 met 400 af (route.stop-anker.test.ts) — een keuze mag niet stil
      // verschuiven. Zie de docstring bij `normalizeStopAge` in lib/fire-strategy.ts.
      const tolerantGelezen = parseFirePlan({
        fire_stop_anchor: 'age',
        fire_stop_age: 58.3,
      }).anchor
      return {
        expected: 'halverwege=aow; nuStoppenLegacy=now; nieuweKolomLeidtBijEindVorm=aow; tolerantGelezen58.3=age58.5',
        actual:
          `halverwege=${halverwege}; nuStoppenLegacy=${nuStoppenLegacy}; ` +
          `nieuweKolomLeidtBijEindVorm=${nieuweKolomLeidtBijEindVorm}; ` +
          `tolerantGelezen58.3=${tolerantGelezen.kind === 'age' ? `age${tolerantGelezen.age}` : tolerantGelezen.kind}`,
      }
    },
  },
]
