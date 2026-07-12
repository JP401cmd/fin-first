/**
 * Gedeelde engine-checks voor de UAT-Mijn-acceptatiecriteria (`mijn.ts`).
 *
 * PURE module — geen vitest/DOM/Supabase-afhankelijkheden — zodat dezelfde
 * lijst checks kan draaien onder:
 *  1. `mijn.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-mijn.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * Elke `run()` roept UITSLUITEND échte rekenfunctie(s)/constante(n) aan — op de
 * échte persona-brondata (`lib/test-personas.ts`, persona 'compleet' = Tessa)
 * of op de canonieke commerciële catalogus. Geen herimplementatie van
 * bedrijfslogica, geen Supabase, geen netwerk.
 *
 * MIJN is een UI/interactie-zware zone; slechts DRIE criteria zijn 'exact'
 * hand-narekenbaar:
 *  - WF-MIJN-03: jaarruimte per persoon — het netto maandinkomen uit het
 *    huishoudprofiel voedt (via de canonieke bruto-afleiding) `computeJaarruimte`;
 *    `resolvePensionFactorA` bewijst de NULL≠0-semantiek van factor A.
 *  - WF-MIJN-08: de gedeelde-budget-split via `computeSharePct` (LIVE-BLOCKED —
 *    de engine-check bewijst alleen de reken-split, spiegelt schuld-checks
 *    WF-SCHULD-18).
 *  - WF-MIJN-11: de add-on-prijzen uit `ADDON_PLANS` (spiegelt start-checks
 *    WF-START-04).
 *
 * Alle geïmporteerde functies zijn client-veilig (geen `server-only` /
 * `@/lib/supabase/server` / `next/headers` in hun import-graaf):
 * `lib/jaarruimte.ts`, `lib/household-data.ts`, `lib/subscription-catalog.ts`.
 */

import { PERSONAS } from '@/lib/test-personas'
import {
  box1JaarruimteStatus,
  computeJaarruimte,
  resolvePensionFactorA,
} from '@/lib/jaarruimte'
import { computeSharePct } from '@/lib/household-data'
import { ADDON_PLANS } from '@/lib/subscription-catalog'
import { MIJN_ACCEPTANCE } from './mijn'
import type { AcceptanceCriterion } from './types'

const compleet = PERSONAS.compleet

export interface MijnEngineCheck {
  /** 'WF-MIJN-03' */
  workflow: string
  /** 'UAT-MIJN-03' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s)/constante(n) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in mijn.ts — gooit als mijn.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = MIJN_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — mijn.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in mijn.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

// ── Checks — één per 'exact'-workflow in MIJN_ACCEPTANCE ───────────────────

export const MIJN_ENGINE_CHECKS: MijnEngineCheck[] = [
  {
    workflow: 'WF-MIJN-03',
    scenarioId: 'UAT-MIJN-03',
    label: 'Jaarruimte per persoon (Tessa): bruto-afleiding → computeJaarruimte 2026 (geplafonneerd) + resolvePensionFactorA (NULL≠0)',
    run: () => {
      criterion('WF-MIJN-03')
      // Netto maandinkomen + marginaal tarief zijn de persona-bron; de
      // bruto-afleiding (netto×12 / (1−marginaal)) loopt via de canonieke
      // box1JaarruimteStatus (dezelfde afleiding als de Belasting-pagina).
      const netMonthly = Number(compleet.profile.net_monthly_income)
      const marginaalTarief = Number(compleet.profile.marginaal_tarief)
      const { grossYearly } = box1JaarruimteStatus({ netMonthly, marginaalTarief })
      // PersonaProfile modelleert factor A niet → onbekend (NULL ≠ €0), factorA 0.
      const resolved = resolvePensionFactorA({ pension_factor_a: null })
      const jr = computeJaarruimte(grossYearly, resolved.factorA, 2026)
      return {
        expected: 'jaarruimte2026=35588; factorA=0; factorAKnown=false',
        actual: `jaarruimte2026=${jr.jaarruimte}; factorA=${resolved.factorA}; factorAKnown=${resolved.isKnown}`,
      }
    },
  },
  {
    workflow: 'WF-MIJN-08',
    scenarioId: 'UAT-MIJN-08',
    label: 'Gedeelde-budget-split via computeSharePct (equal/custom/one_carries_all) op een gedeeld budget van €600',
    run: () => {
      criterion('WF-MIJN-08')
      const budget = 600
      const equalPct = computeSharePct(
        { splitMode: 'equal', customSplitPct: null, primaryPayerId: 'user-a' },
        'user-a',
      )
      const customPct = computeSharePct(
        { splitMode: 'custom', customSplitPct: 60, primaryPayerId: 'user-a' },
        'user-a',
      )
      const customPartnerPct = computeSharePct(
        { splitMode: 'custom', customSplitPct: 60, primaryPayerId: 'user-a' },
        'user-b',
      )
      const carriesPct = computeSharePct(
        { splitMode: 'one_carries_all', customSplitPct: null, primaryPayerId: 'user-a' },
        'user-a',
      )
      const carriesPartnerPct = computeSharePct(
        { splitMode: 'one_carries_all', customSplitPct: null, primaryPayerId: 'user-a' },
        'user-b',
      )
      const equalEuro = (budget * equalPct) / 100
      const customEuro = (budget * customPct) / 100
      return {
        expected: 'equalPct=50; customPct=60; customPartnerPct=40; carriesPct=100; carriesPartnerPct=0; equalEuro=300; customEuro=360',
        actual: `equalPct=${equalPct}; customPct=${customPct}; customPartnerPct=${customPartnerPct}; carriesPct=${carriesPct}; carriesPartnerPct=${carriesPartnerPct}; equalEuro=${equalEuro}; customEuro=${customEuro}`,
      }
    },
  },
  {
    workflow: 'WF-MIJN-11',
    scenarioId: 'UAT-MIJN-11',
    label: 'Add-on-prijzen (ADDON_PLANS): AI-tier €9 + Connected-tier €4',
    run: () => {
      criterion('WF-MIJN-11')
      const ai = ADDON_PLANS.find((p) => p.tier === 'ai')!
      const connected = ADDON_PLANS.find((p) => p.tier === 'connected')!
      return {
        expected: 'aiPriceEur=9; connectedPriceEur=4',
        actual: `aiPriceEur=${ai.priceEur}; connectedPriceEur=${connected.priceEur}`,
      }
    },
  },
]
