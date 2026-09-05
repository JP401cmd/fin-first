/**
 * Gedeelde engine-checks voor de UAT-Start-acceptatiecriteria (`start.ts`).
 *
 * PURE module — geen vitest/DOM/Supabase-afhankelijkheden — zodat dezelfde
 * lijst checks kan draaien onder:
 *  1. `start.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-start.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * Elke `run()` roept UITSLUITEND échte rekenfunctie(s)/constante(n) aan, op de
 * letterlijke getallen uit `docs/uat/uat-plan.md` §2.8 (testpersonen Sanne
 * Bakker / Jan de Vries / Eva Jansen). Geen Supabase, geen netwerk.
 *
 * TWEE MIRRORS (spiegelt de spaardoel-mirror in `budget-checks.ts` en de
 * figures-strip-mirror in `schuld-checks.ts`) — formules die inline in een
 * client-component leven, GEEN pure export hebben, en hier getrouw met
 * bronregel-verwijzing gereproduceerd worden (niet herïmplementeerd met eigen
 * aannames):
 *  - `bufferDekkingWizard` (mirror van `components/check/intake/steps/step-buffer.tsx`)
 *  - `resolveIngangsleeftijd` (mirror van `app/(onboarding)/onboarding/page.tsx` r610-620)
 *  - `nettoVermogenRecap` (mirror van `netWorthForKlaar`, dezelfde file — directe
 *    optelsom, geen aparte functie om te importeren)
 *
 * Alle geïmporteerde engine-functies zijn client-veilig (geen `server-only` /
 * `@/lib/supabase/server` / `next/headers` in hun import-graaf):
 * `lib/format.ts`, `lib/housing-strategy.ts` (alleen `getFireEligibleNetWorth`),
 * `lib/health-score-input.ts` (alleen `computeEmergencyFundMonths`),
 * `lib/savings-source.ts`, `lib/onboarding/retirement-prefill.ts`,
 * `lib/onboarding-presets.ts` (alleen `computeNoodfondsTarget`),
 * `lib/subscription-catalog.ts`, en voor WF-START-28 (stap "Jouw plan", ADR
 * 0129): `lib/horizon/plan-draft.ts` (validatie + kopij), `lib/onboarding-plan.ts`
 * (de route-toets van save-own-data), `app/(onboarding)/onboarding/
 * draft-persistence.ts` (concept-herstel; zod + pure helpers) en de geëxporteerde
 * `planDraftFromOnboarding` uit `components/onboarding/onboarding-eindstrategie.tsx`
 * (een 'use client'-module — de suite draait óók in de browser).
 */

import { dailyExpenseRate, calculateFreedomTime } from '@/lib/format'
import { getFireEligibleNetWorth, type HousingContext } from '@/lib/housing-strategy'
import { computeEmergencyFundMonths, type HealthScoreAsset } from '@/lib/health-score-input'
import { resolveSavingsSource } from '@/lib/savings-source'
import { computeRetirementPrefill } from '@/lib/onboarding/retirement-prefill'
import { computeNoodfondsTarget } from '@/lib/onboarding-presets'
import {
  ONBOARDING_HOUSING_MODE,
  computeFreedomTicker,
  freedomTickerBasis,
} from '@/lib/freedom-ticker'
import { ADDON_PLANS } from '@/lib/subscription-catalog'
import {
  defaultStopAge,
  endFormShowsEndAge,
  validatePlanDraft,
} from '@/lib/horizon/plan-draft'
import { resolveOnboardingPlanColumns, type OnboardingPlanInput } from '@/lib/onboarding-plan'
import { STOP_AGE_BEFORE_END_AGE_ERROR, type FireEndForm } from '@/lib/fire-strategy'
import { sanitizeStoredDraft } from '@/app/(onboarding)/onboarding/draft-persistence'
import {
  planDraftFromOnboarding,
  type OnboardingPlanValue,
} from '@/components/onboarding/onboarding-eindstrategie'
import { START_ACCEPTANCE } from './start'
import type { AcceptanceCriterion } from './types'

export interface StartEngineCheck {
  /** 'WF-START-06' */
  workflow: string
  /** 'UAT-START-06' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in start.ts — gooit als start.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = START_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — start.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in start.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Mirror van de buffer-dekkingsformule in
 *  components/check/intake/steps/step-buffer.tsx: afgerond op 1 decimaal. */
function bufferDekkingWizard(buffer: number, maanduitgaven: number): number {
  return Math.round((buffer / maanduitgaven) * 10) / 10
}

/** Mirror van de jaarpreview-formule in
 *  components/check/intake/steps/step-inkomen.tsx. */
function jaarpreviewInkomen(maandinkomen: number): number {
  return Math.round(maandinkomen * 12)
}

/** Mirror van de spaarquote-preview-formule in
 *  components/onboarding/onboarding-inkomen.tsx (previewRate). */
function spaarquotePreview(maandinkomen: number, maanduitgaven: number): number {
  return Math.round(((maandinkomen - maanduitgaven) / maandinkomen) * 100)
}

/** Mirror van de ingangsleeftijd-klem in app/(onboarding)/onboarding/page.tsx
 *  (buildPensionParseResult): geldig binnen [50,75] blijft ongewijzigd, anders
 *  de AOW-fallback (de AOW-leeftijd van de gebruiker, zelf ook geklemd op
 *  [50,75]; zonder geboortedatum/AOW-rijen 67). */
function resolveIngangsleeftijd(raw: number | undefined, aowFallback = 67): number {
  const safeFallback =
    Number.isFinite(aowFallback) && aowFallback >= 50 && aowFallback <= 75
      ? Math.round(aowFallback)
      : 67
  return raw !== undefined && Number.isFinite(raw) && raw >= 50 && raw <= 75
    ? raw
    : safeFallback
}

/** Mirror van `netWorthForKlaar` (app/(onboarding)/onboarding/page.tsx): directe
 *  som bezittingen − som schulden, geen aparte pure export om te importeren. */
function nettoVermogenRecap(bezittingen: number[], schulden: number[]): number {
  const totaalBezittingen = bezittingen.reduce((s, v) => s + v, 0)
  const totaalSchulden = schulden.reduce((s, v) => s + v, 0)
  return totaalBezittingen - totaalSchulden
}

// ── Checks — één per 'exact'-workflow in START_ACCEPTANCE ──────────────────

export const START_ENGINE_CHECKS: StartEngineCheck[] = [
  {
    workflow: 'WF-START-04',
    scenarioId: 'UAT-START-04',
    label: 'Prijs-consistentie (ADDON_PLANS "ai"-tier == marketing "Pro €9/maand")',
    run: () => {
      criterion('WF-START-04')
      const plan = ADDON_PLANS.find((p) => p.tier === 'ai')!
      return {
        expected: 'priceEur=9',
        actual: `priceEur=${plan.priceEur}`,
      }
    },
  },
  {
    workflow: 'WF-START-06',
    scenarioId: 'UAT-START-06',
    label: 'Vrijheidscheck (Sanne): jaarpreview inkomen, bufferdekking, live vrijgekocht-teller vóór/na bezittingen',
    run: () => {
      criterion('WF-START-06')
      const jaarInkomen = jaarpreviewInkomen(3200)
      const bufferMaanden = bufferDekkingWizard(6600, 2200)
      const rate = dailyExpenseRate(2200)
      const naBuffer = calculateFreedomTime(6600, rate)
      const naBezit = calculateFreedomTime(6600 + 15000 + 8000, rate)
      return {
        expected: 'jaarInkomen=38400; bufferMaanden=3; tickerNaBufferJaren=0; tickerNaBufferMaanden=3; tickerNaBezitJaren=1; tickerNaBezitMaanden=1',
        actual: `jaarInkomen=${jaarInkomen}; bufferMaanden=${bufferMaanden}; tickerNaBufferJaren=${naBuffer.years}; tickerNaBufferMaanden=${naBuffer.months}; tickerNaBezitJaren=${naBezit.years}; tickerNaBezitMaanden=${naBezit.months}`,
      }
    },
  },
  {
    workflow: 'WF-START-08',
    scenarioId: 'UAT-START-08',
    label: 'Vrijheidsrapport (Sanne): FIRE-eligible netto vermogen + canonieke buffer-maanden',
    run: () => {
      criterion('WF-START-08')
      const context: HousingContext = {
        eigenHuisValue: 0,
        wozValue: 0,
        mortgageBalance: 0,
        mortgageMonthlyPayment: 0,
        hasEigenHuis: false,
        eigenHuisMortgages: [],
        eigenHuisAssets: [],
      }
      const netWorth = getFireEligibleNetWorth(29600, context, { mode: 'exclude_from_fire' })
      const assets: HealthScoreAsset[] = [
        { asset_type: 'cash', current_value: 6600 },
        { asset_type: 'savings', current_value: 15000 },
        { asset_type: 'investment', current_value: 8000 },
      ]
      // Norm-grondslag = netto maandsalaris (€3.200), niet de maanduitgaven:
      // 21.600 / 3.200 = 6,75 maandsalarissen tegen een norm van 3.
      const bufferMaanden = computeEmergencyFundMonths(assets, 0, 3200, 2200)
      return {
        expected: 'netWorth=29600; bufferMaandenCanoniek=6.75',
        actual: `netWorth=${netWorth}; bufferMaandenCanoniek=${fx(bufferMaanden, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-START-10',
    scenarioId: 'UAT-START-10',
    label: 'Spaarquote na check-activatie (Sanne, resolveSavingsSource op handmatige bron)',
    run: () => {
      criterion('WF-START-10')
      const r = resolveSavingsSource({
        incomeSource: 'manual',
        expensesSource: 'manual',
        netMonthlyIncome: 3200,
        estimatedAnnualIncome: 0,
        estimatedMonthlyExpenses: 2200,
        savingsRate6m: 0,
      })
      return {
        expected: 'effectiveAnnualIncome=38400; effectiveSavingsRatePct=31.25; baseAnnualSavings=12000',
        actual: `effectiveAnnualIncome=${r.effectiveAnnualIncome}; effectiveSavingsRatePct=${fx(r.effectiveSavingsRatePct, 2)}; baseAnnualSavings=${r.baseAnnualSavings}`,
      }
    },
  },
  {
    workflow: 'WF-START-18',
    scenarioId: 'UAT-START-18',
    label: 'Onboarding (Jan de Vries): spaarquote-preview, pensioen-/noodfonds-prefill, recap-nettovermogen',
    run: () => {
      criterion('WF-START-18')
      const spaarquote = spaarquotePreview(3000, 2100)
      const pensioenPrefill = computeRetirementPrefill({ monthlyExpenses: 2100 }).amount
      const noodfondsPrefill = computeNoodfondsTarget({ monthlyIncome: 3000, monthlyExpenses: 2100 })
      const netto = nettoVermogenRecap([2500, 18000, 12000], [9000])
      // Meelopende vrijheidstijd-teller (bevinding H12): dezelfde persona, na
      // de derde bezitting en MET de studieschuld erbij — op de intake-
      // grondslag (excl. eigen woning, schulden niet afgetrokken) mag die
      // schuld het getal niet verlagen.
      const teller = computeFreedomTicker({
        monthlyIncome: 3000,
        monthlyExpenses: 2100,
        assets: [2500, 18000, 12000].map((value) => ({ value, isHome: false })),
        debts: 9000,
        basis: freedomTickerBasis(ONBOARDING_HOUSING_MODE),
      })
      return {
        expected:
          'spaarquotePreview=30; pensioenPrefill=20160; noodfondsPrefill=12600; nettoVermogenRecap=23500; vrijheidsteller=1j 3m; tellerBedrag=32500',
        actual: `spaarquotePreview=${spaarquote}; pensioenPrefill=${pensioenPrefill}; noodfondsPrefill=${noodfondsPrefill}; nettoVermogenRecap=${netto}; vrijheidsteller=${teller?.label ?? 'geen'}; tellerBedrag=${teller?.amount ?? 0}`,
      }
    },
  },
  {
    workflow: 'WF-START-19',
    scenarioId: 'UAT-START-19',
    label: 'Bezittingen+schulden (Eva Jansen, incl. huis+hypotheek): totalen en netto vermogen',
    run: () => {
      criterion('WF-START-19')
      const totaalBezittingen = 1800 + 10000 + 340000
      const totaalSchulden = 280000 + 8000
      const netto = nettoVermogenRecap([1800, 10000, 340000], [280000, 8000])
      return {
        expected: 'totaalBezittingen=351800; totaalSchulden=288000; nettoVermogen=63800',
        actual: `totaalBezittingen=${totaalBezittingen}; totaalSchulden=${totaalSchulden}; nettoVermogen=${netto}`,
      }
    },
  },
  {
    workflow: 'WF-START-20',
    scenarioId: 'UAT-START-20',
    label: 'Pensioen-ingangsleeftijd-klem (geldige bovengrens 75 vs. ontbrekende invoer → AOW-fallback)',
    run: () => {
      criterion('WF-START-20')
      const geldig = resolveIngangsleeftijd(75, 68)
      // Ontbrekend → AOW-leeftijd van de gebruiker (hier 68); zonder
      // AOW-data blijft 67 de laatste fallback.
      const ontbrekendMetAow = resolveIngangsleeftijd(undefined, 68)
      const ontbrekendZonderAow = resolveIngangsleeftijd(undefined)
      return {
        expected: 'ingangsleeftijdGeldig=75; ingangsleeftijdAowFallback=68; ingangsleeftijdDefault=67',
        actual: `ingangsleeftijdGeldig=${geldig}; ingangsleeftijdAowFallback=${ontbrekendMetAow}; ingangsleeftijdDefault=${ontbrekendZonderAow}`,
      }
    },
  },
  {
    workflow: 'WF-START-21',
    scenarioId: 'UAT-START-21',
    label: 'Noodfonds-spaardoel-prefill (computeNoodfondsTarget, inkomen 2800/uitgaven 1900)',
    run: () => {
      criterion('WF-START-21')
      const prefill = computeNoodfondsTarget({ monthlyIncome: 2800, monthlyExpenses: 1900 })
      return {
        expected: 'noodfondsPrefill=11400',
        actual: `noodfondsPrefill=${prefill}`,
      }
    },
  },
  {
    workflow: 'WF-START-28',
    scenarioId: 'UAT-START-28',
    label: 'Stap "Jouw plan" (ADR 0129): standaardpad, AOW, eigen stopleeftijd (geldig/geblokkeerd), bedrag, perpetual en legacy-concept-herstel',
    run: () => {
      criterion('WF-START-28')
      // De route-toets van POST /api/onboarding/save-own-data, één keer opgelost
      // (resolveOnboardingPlanColumns) → "anker/eind-vorm/eindleeftijd/stopleeftijd".
      const kolommen = (input: OnboardingPlanInput): string => {
        const r = resolveOnboardingPlanColumns(input)
        return 'error' in r
          ? `route400:${r.error}`
          : `${r.fire_stop_anchor}/${r.fire_end_strategy}/${r.fire_end_age}/${r.fire_stop_age}`
      }
      // De vijf plan-velden zoals INITIAL_HORIZON_DATA ze aanreikt (standaardpad).
      const basis: OnboardingPlanValue = {
        fire_end_strategy: 'deplete',
        fire_end_age: 90,
        fire_legacy_amount: '',
        fire_stop_anchor: 'solved',
        fire_stop_age: null,
      }
      // (a) standaardpad + (b) AOW-anker — client-validatie is triviaal, de route schrijft.
      const standaard = kolommen({ strategy: 'deplete', anchor: 'solved', stopAge: null, endAge: 90 })
      const aow = kolommen({ strategy: 'deplete', anchor: 'aow', stopAge: null, endAge: 90 })
      // (c) eigen stopleeftijd: de voorinvulling bij 40 jaar (currentAge + 5, geen
      // gesolvede vrijheidsleeftijd in de onboarding) en een geldige 62,5.
      const standaardStop = defaultStopAge({ currentAge: 40, endAge: 90 })
      const ageDraft = planDraftFromOnboarding({ ...basis, fire_stop_anchor: 'age', fire_stop_age: 62.5 })
      const ageGeldig = `${validatePlanDraft(ageDraft).ok ? 'ok' : 'fout'}/${kolommen({ strategy: 'deplete', anchor: 'age', stopAge: 62.5, endAge: 90 })}`
      // (d) geblokkeerd: stop ≥ eind (veld + route), leeg, geen half jaar.
      const stopNaEind = validatePlanDraft({ ...ageDraft, stopAge: 90 }).errors.stopAge
      const routeStopNaEind = resolveOnboardingPlanColumns({ strategy: 'deplete', anchor: 'age', stopAge: 90, endAge: 90 })
      const ageStopNaEind = `${stopNaEind}|${'error' in routeStopNaEind && routeStopNaEind.error === STOP_AGE_BEFORE_END_AGE_ERROR ? 'route400' : 'route-ok'}`
      const ageLeeg = validatePlanDraft({ ...ageDraft, stopAge: null }).errors.stopAge
      const ageGeenHalfJaar = validatePlanDraft({ ...ageDraft, stopAge: 62.3 }).errors.stopAge
      // (e) legacy: leeg bedrag → NaN → blokkade; "250.000" → 250000.
      const legacyLeeg = validatePlanDraft(planDraftFromOnboarding({ ...basis, fire_end_strategy: 'legacy' })).errors.legacyAmount
      const legacyDraft = planDraftFromOnboarding({ ...basis, fire_end_strategy: 'legacy', fire_legacy_amount: '250.000' })
      const legacy = `${validatePlanDraft(legacyDraft).ok ? 'ok' : 'fout'}/${legacyDraft.legacyAmount}`
      // (f) perpetual verbergt het eindleeftijd-veld; deplete toont het.
      const veld = (form: FireEndForm) => (endFormShowsEndAge(form) ? 'zichtbaar' : 'verborgen')
      // (g) concept van vóór 5 sep 2026 (legacy-label 'pensioen') → anker aow × deplete,
      // client-side (sanitizeStoredDraft) én server-side (route) identiek.
      const concept = sanitizeStoredDraft({ version: 1, horizon: { fire_end_strategy: 'pensioen', fire_end_age: 90 } })!.horizon
      const conceptPensioen = `${concept.fire_stop_anchor}/${concept.fire_end_strategy}`
      const routePensioen = kolommen({ strategy: 'pensioen', endAge: 90 })
      return {
        expected:
          'standaard=solved/deplete/90/null; aow=aow/deplete/90/null; standaardStopleeftijdBij40=45; ageGeldig=ok/age/deplete/90/62.5; ageStopNaEind=Je stopleeftijd moet vóór de eindleeftijd van je plan (90) liggen.|route400; ageLeeg=Kies een stopleeftijd.; ageGeenHalfJaar=In stappen van een half jaar.; legacyLeeg=Een bedrag boven nul.; legacy=ok/250000; perpetualEindleeftijdVeld=verborgen; depleteEindleeftijdVeld=zichtbaar; conceptPensioen=aow/deplete; routePensioen=aow/deplete/100/null',
        actual: `standaard=${standaard}; aow=${aow}; standaardStopleeftijdBij40=${standaardStop}; ageGeldig=${ageGeldig}; ageStopNaEind=${ageStopNaEind}; ageLeeg=${ageLeeg}; ageGeenHalfJaar=${ageGeenHalfJaar}; legacyLeeg=${legacyLeeg}; legacy=${legacy}; perpetualEindleeftijdVeld=${veld('perpetual')}; depleteEindleeftijdVeld=${veld('deplete')}; conceptPensioen=${conceptPensioen}; routePensioen=${routePensioen}`,
      }
    },
  },
]
