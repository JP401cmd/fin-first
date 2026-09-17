/**
 * Eindsituatie-melding op ECHTE kernel-runs (plan 17 sep, D) — per scenario de
 * melding zoals /toekomst en het totaalplan die opbouwen: dezelfde convergentie-run,
 * dezelfde detector-invoer, dezelfde copy. Persona "Tessa Compleet" met varianten.
 *
 * Zet `EINDSITUATIE_PRINT=1` om de meldingstekst per scenario te zien.
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { resolveFirePlanWithOverride } from '@/lib/fire-strategy'
import { detectEindsituatie, type EindsituatieDuiding } from './eindsituatie-duiding'
import { buildEindsituatieCopy } from './eindsituatie-copy'

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)
const JAARUITGAVEN = 30_000

const scale = (f: number): Asset[] => fx.assets.map((a) => ({ ...a, current_value: a.current_value * f }) as Asset)

const EXTRA_PENSIOEN = {
  id: 'evt-extra-pensioen', name: 'Extra pensioen', event_type: 'pensioen', target_age: 68,
  one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 4000, is_active: true, sort_order: 9, metadata: {},
} as unknown as LifeEvent

interface Scenario {
  naam: string
  profiel?: Partial<ConvergentieRawProfileRow>
  assets?: Asset[]
  lifeEvents?: LifeEvent[]
}

interface Uitkomst {
  duiding: EindsituatieDuiding | null
  tekst: string
  fireAge: number | null
}

function draai(sc: Scenario): Uitkomst {
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(PINNED_AGE),
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    ...sc.profiel,
  }
  const out = computeConvergentieProjection({
    rawContext: {
      profile,
      assets: sc.assets ?? fx.assets,
      debts: fx.debts,
      lifeEvents: sc.lifeEvents ?? fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: JAARUITGAVEN,
    },
  })
  if (!out.ok) throw new Error(`kernel faalde: ${sc.naam}`)
  const r = out.result
  const plan = resolveFirePlanWithOverride(profile as never)
  const duiding = detectEindsituatie({
    rows: r.rows,
    endForm: plan.endForm,
    endAge: r.displayEndAge ?? plan.endAge,
    legacyAmount: plan.legacyAmount,
    legacyIncludeIlliquid: profile.fire_legacy_include_illiquid === true,
    vastStopmoment: r.stopAnker != null,
    fireAgeFractional: r.fireAgeFractional,
    currentAge: PINNED_AGE,
    geenTekortLeningAan: profile.fire_no_deficit_loan !== false,
    jaarUitgavenNu: JAARUITGAVEN,
  })
  const eur = (b: { bedrag: number; inflationFactor: number }) =>
    `€ ${Math.round(b.bedrag / b.inflationFactor).toLocaleString('nl-NL')}`
  const tekst = duiding
    ? (() => {
        const c = buildEindsituatieCopy({ duiding, endForm: plan.endForm, bedragTekst: eur })
        return [c.kop, c.samenvatting, ...c.oorzaken.map((z) => `• ${z}`), c.context, c.onduidelijk ? `${c.onduidelijk} [Fin-knop: "${c.finVraag}"]` : null]
          .filter(Boolean)
          .join('\n')
      })()
    : '(geen melding)'
  if (process.env.EINDSITUATIE_PRINT) {
    console.log(`\n── ${sc.naam} — FIRE ${r.fireAgeFractional?.toFixed(1) ?? '—'} ──\n${tekst}`)
  }
  return { duiding, tekst, fireAge: r.fireAgeFractional }
}

const ids = (u: Uitkomst) => u.duiding?.oorzaken.map((o) => o.id) ?? []

describe('eindsituatie-melding op echte kernel-runs', () => {
  it('S1 — pensioen-gat, geen tekort-lening (standaard): dieptepunt bindt, later inkomen vult aan', () => {
    const u = draai({ naam: 'S1 pensioen-gat, standaard aan', assets: scale(0.1), lifeEvents: [...fx.lifeEvents, EXTRA_PENSIOEN] })
    expect(u.duiding).not.toBeNull()
    expect(ids(u)[0]).toBe('geen-tekort-lening')
    expect(ids(u)).toContain('later-inkomen')
    expect(u.duiding!.eenduidig).toBe(true)
    expect(u.tekst).toContain('geen tekort-lening gebruikt (standaard)')
  })

  it('S2 — zelfde plan, tekort-lening bewust toegestaan: geen melding (het eindbedrag bindt)', () => {
    const u = draai({ naam: 'S2 pensioen-gat, instelling uit', assets: scale(0.1), lifeEvents: [...fx.lifeEvents, EXTRA_PENSIOEN], profiel: { fire_no_deficit_loan: false } })
    expect(u.duiding).toBeNull()
  })

  it('S3 — vast stopmoment (AOW): nooit een melding', () => {
    const u = draai({ naam: 'S3 vast stopmoment op AOW', assets: scale(3), profiel: { fire_stop_anchor: 'aow' } })
    expect(u.duiding).toBeNull()
  })

  it('S4 — nu al vrij: de enige bindende oorzaak is "nu stoppen"', () => {
    const u = draai({ naam: 'S4 ruim vermogen, nu al vrij', assets: scale(30) })
    expect(u.duiding).not.toBeNull()
    expect(ids(u)[0]).toBe('nu-stoppen')
    expect(u.duiding!.eenduidig).toBe(true)
  })

  it('S5 — opeethypotheek naar behoefte: huis en opeetschuld apart benoemd', () => {
    const u = draai({
      naam: 'S5 opeethypotheek, standaard aan',
      assets: scale(0.1),
      lifeEvents: [...fx.lifeEvents, EXTRA_PENSIOEN],
      profiel: { housing_strategy_config: { mode: 'reverse_mortgage', trigger: 'on_depletion', triggerAge: 67, maxLoanPct: 0.5, interestRate: 0.055, monthlyPayout: null, depletionThresholdYears: 0 } },
    })
    expect(ids(u)).toEqual(['geen-tekort-lening', 'opeet-plafond', 'later-inkomen'])
    expect(u.duiding!.eenduidig).toBe(false) // → Fin-knop bij actieve AI
    expect(u.duiding!.context.huis).not.toBeNull()
    expect(u.duiding!.context.opeetschuld).not.toBeNull()
    expect(u.tekst).toContain('Hier spelen meerdere regels tegelijk')
  })

  it('S6 — nalatenschap met ruime marge: melding met nalatenschap-kop', () => {
    const u = draai({ naam: 'S6 nalatenschap', assets: scale(0.1), lifeEvents: [...fx.lifeEvents, EXTRA_PENSIOEN], profiel: { fire_end_strategy: 'legacy', fire_legacy_amount: 50_000 } })
    expect(u.tekst).toContain('nalatenschap die je koos')
    expect(ids(u)[0]).toBe('geen-tekort-lening')
  })

  it('S7 — "niet laten slinken": geen crash, tekst gedocumenteerd', () => {
    const u = draai({ naam: 'S7 niet laten slinken', assets: scale(0.5), lifeEvents: [...fx.lifeEvents, EXTRA_PENSIOEN], profiel: { fire_end_strategy: 'perpetual' } })
    expect(u.tekst).toContain('niet laten slinken')
    expect(ids(u)).toContain('geen-tekort-lening')
  })

  it('S8 — krap plan zonder extra pensioen: geen melding', () => {
    const u = draai({ naam: 'S8 krap plan', assets: scale(0.1) })
    expect(u.duiding).toBeNull()
  })
})
