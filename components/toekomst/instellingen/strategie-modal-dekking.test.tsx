import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { ConvergentieRawContext, ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import { END_FORM_QUESTION, STOP_ANCHOR_QUESTION } from '@/lib/horizon/plan-draft'
import { StrategieEditors, type StrategieEditorsData } from '@/components/future/strategie/strategie-editors'
import { levensstrategieRijwaarde, rijwaardeTekst } from '@/lib/toekomst/instellingen-rijwaarden'
import { RIJ_META } from '@/lib/toekomst/instellingen-rij'
import { PROFIEL_VERGELIJK_KOPIJ } from '@/components/future/regels/onttrekking-profielvergelijk'
import { EINDSTRATEGIE_ANKER } from '@/lib/toekomst/instellingen-rij'

/**
 * Dekkingsbewijs vóór het opheffen van de Strategieën-modal (ADR 0179 fase 3, plan §3):
 * elke functie per tab van `components/app/horizon/strategie-modal.tsx` is via een rij in
 * katern Instellingen bereikbaar. Echte bodies (geen verklikkers), echte kern voor de
 * profielvergelijking; alleen fetch en navigatie zijn gestubd.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/toekomst/instellingen',
}))

import { InstellingenRijen, type InstellingenRijenProps } from './instellingen-rijen'

const PROFIEL: ConvergentieRawProfileRow = {
  date_of_birth: '1985-01-01',
  net_monthly_income: 5_000,
  estimated_monthly_expenses: 3_000,
  yearly_essential_expenses: 36_000,
  retirement_expense_method: 'current_expenses',
  expected_return: 0.06,
  inflation_rate: 0.02,
  box3_method: 'forfaitair',
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'guardrails',
  withdrawal_profile_config: { profiel: 'guardrails' },
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_custom_amount: null,
}
const CONTEXT: ConvergentieRawContext = {
  profile: PROFIEL,
  assets: [
    { id: 'inv', name: 'Beleggingen', asset_type: 'investment', current_value: 250_000, woz_value: null, expected_return: 6, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: 0 },
  ] as unknown as Asset[],
  debts: [],
  lifeEvents: [
    { id: 'e1', name: 'Wereldreis', event_type: 'custom', target_age: 70, is_active: true } as unknown as LifeEvent,
  ],
  aowRows: [],
  yearlyExpenses: 36_000,
}
const SNAPSHOT = {
  rawContext: CONTEXT,
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalStrategy: { strategy: 'guardrails', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  aowAgeInt: 68,
  aowFractional: 67.25,
} as unknown as RegelSimSnapshot

const PROPS: InstellingenRijenProps = {
  fireParams: { grossReturn: 0.06, inflationRate: 0.02, effectiveSwr: 0.034, box3Method: 'forfaitair', marginaalTarief: 0.37 },
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  firePlan: { anchor: { kind: 'aow' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalStrategy: { strategy: 'guardrails', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  withdrawalProfiel: 'guardrails',
  simSnapshot: SNAPSHOT,
  regelVoorkeuren: POT_RULES_DEFAULTS,
  potBalances: { spaargeld: 0, beleggingen: 250_000, pensioen: 0, vastgoed: 0, overig: 0 },
  box3HeffingvrijInkomen: null,
  events: [],
  housingStrategy: { mode: 'exclude_from_fire' },
  retirementMethod: 'essential_budgets',
  uitgaveNaPensioen: 36_000,
  geenTekortLening: true,
  tekortLeningRente: 0.05,
  dagtarief: 100,
}

const STRATEGIE_DATA = {
  baseline: null, dailyExpenses: 100, aowRows: [], dateOfBirth: '1985-01-01', grossYearlyIncome: 70_000,
  pensioenFactorA: 0, currentAge: 41, inflationRate: 0.02, currentNetMonthly: 5_000, housingPreview: null,
} as StrategieEditorsData

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/housing-strategy') {
        return new Response(JSON.stringify({ config: { mode: 'exclude_from_fire' }, context: { has_eigen_huis: true, woz_value: 400_000, estimated_equity: 300_000 } }))
      }
      if (url === '/api/withdrawal-strategy') {
        return new Response(JSON.stringify({ withdrawal_profile_config: { profiel: 'guardrails' } }))
      }
      return new Response(JSON.stringify({}))
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderRijen() {
  return render(
    <DisplayModeProvider initialMode="full">
      <InstellingenRijen {...PROPS} />
    </DisplayModeProvider>,
  )
}
const rij = (r: string) => document.querySelector(`button[data-rij="${r}"]`) as HTMLButtonElement

describe('StrategieModal → rijen: elke functie is bereikbaar (plan §3)', () => {
  it('kop-badges Stop · Eind · Onttrekking · Eigen woning → de rijwaarden', () => {
    renderRijen()
    expect(rij('stopmoment').textContent).toContain('op je AOW-leeftijd')
    expect(rij('eindleeftijd').textContent).toContain('tot 90')
    expect(rij('onttrekking').textContent).toContain('guardrails')
    // Eigen woning is sinds 27 sep een rij op Plan (LevensstrategieenBlok), met dezelfde waarde.
    expect(RIJ_META.huis.sectie).toBe('levensstrategieen')
    expect(rijwaardeTekst(levensstrategieRijwaarde('huis', PROPS), String)).toBe('uitsluiten van FIRE-pot')
  })

  it('tab Eind, vraag 1 (stop-anker) → rij Stopmoment', () => {
    renderRijen()
    fireEvent.click(rij('stopmoment'))
    expect(screen.getAllByText(STOP_ANCHOR_QUESTION).length).toBeGreaterThan(0)
    expect(document.getElementById(EINDSTRATEGIE_ANKER.stopmoment)).not.toBeNull()
  })

  it('tab Eind, vraag 2 (eindleeftijd, wat blijft over, nalatenschap) → rij "Tot welke leeftijd"', () => {
    renderRijen()
    fireEvent.click(rij('eindleeftijd'))
    expect(screen.getAllByText(END_FORM_QUESTION).length).toBeGreaterThan(0)
    expect(document.getElementById(EINDSTRATEGIE_ANKER.eindleeftijd)).not.toBeNull()
  })

  it('tab Onttrekking: vier profielkaarten, uitkomst per profiel, grafiek, samenvatting, bandbreedte → rij Onttrekking', async () => {
    renderRijen()
    fireEvent.click(rij('onttrekking'))
    // Kiezen en bewaren: de optiekaarten van de body.
    for (const p of ['Vast', 'Afnemend', 'Oplopend', 'Guardrails']) expect(screen.getAllByText(p).length).toBeGreaterThan(0)
    // Vergelijken: het verhuisde blok, met de echte kern.
    fireEvent.click(screen.getByRole('button', { name: PROFIEL_VERGELIJK_KOPIJ.knop }))
    const blok = await screen.findByTestId('profielvergelijk')
    for (const p of ['vast', 'afnemend', 'oplopend', 'guardrails']) {
      expect(within(blok).getByTestId(`profiel-uitkomst-${p}`).textContent).not.toBe('')
    }
    expect(within(blok).getByRole('img', { name: /per onttrekkingsprofiel/ })).toBeTruthy()
    expect(within(blok).getByTestId('profiel-samenvatting')).toBeTruthy()
    // Guardrails is het opgeslagen profiel en dus voorgeselecteerd: de bandbreedte staat er.
    await waitFor(() => expect(within(blok).getByRole('img', { name: /Bandbreedte/ })).toBeTruthy())
    expect(within(blok).getByText(PROFIEL_VERGELIJK_KOPIJ.disclaimer)).toBeTruthy()
  })

  it('tab Woning (HousingStrategySection) → rij Eigen woning (op Plan, dezelfde editor)', async () => {
    render(<StrategieEditors open="huis" onClose={() => {}} events={[]} data={STRATEGIE_DATA} snapshot={SNAPSHOT} />)
    expect(await screen.findByRole('button', { name: /Uitsluiten/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Opeethypotheek/ })).toBeTruthy()
  })

  it('opener in het lab ("Je plan-keuzes →") wijst naar Instellingen, niet naar de modal', () => {
    const src = readFileSync(path.join(process.cwd(), 'components/toekomst/doelen/doelen-lab.tsx'), 'utf8')
    expect(src).toContain('Je plan-keuzes')
    expect(src).not.toContain("setActiveModal('strategie')")
  })

  it('geen enkele redirect wijst nog naar ?regel= (de deeplinks landen op een rij)', async () => {
    const { default: nextConfig } = await import('../../../next.config')
    const doelen = (await nextConfig.redirects!()).map((r) => r.destination)
    expect(doelen.filter((d) => /[?&]regel=/.test(d))).toEqual([])
    expect(doelen).toContain('/toekomst/instellingen?rij=stopmoment')
  })
})
