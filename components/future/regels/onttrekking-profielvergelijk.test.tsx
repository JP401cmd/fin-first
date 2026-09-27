import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { accentClashesWithStatus } from '@/lib/color-palette'
import { BEHEER_REEKS_DONKER, BEHEER_REEKS_LICHT } from '@/components/app/beheer/gebruik/palet'
import {
  OnttrekkingProfielVergelijk,
  runProfielVergelijk,
  PROFIEL_VERGELIJK_KOPIJ,
  PROFIEL_INFO,
  PROFIEL_REEKS,
} from './onttrekking-profielvergelijk'

/**
 * ADR 0179 fase 3 — de profielvergelijking die uit de Strategieën-modal verhuisde. Pint
 * (a) dat de vier runs EXACT de injectie van de modal zijn (`withdrawal_profile_config:
 * { ...opgeslagen, profiel }` op dezelfde rauwe context, via de echte kern), en (b) dat het
 * scherm de uitkomst van díe run toont, niet een eigen som.
 */

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
  withdrawal_strategy: 'static',
  withdrawal_profile_config: { profiel: 'afnemend', gogo_tot: 75 },
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_custom_amount: null,
}

const ASSETS = [
  {
    id: 'inv',
    name: 'Beleggingen',
    asset_type: 'investment',
    current_value: 250_000,
    woz_value: null,
    expected_return: 6,
    monthly_contribution: 0,
    is_active: true,
    net_worth_inclusion_pct: 100,
    depreciation_rate: 0,
  },
] as unknown as Asset[]

const CONTEXT: ConvergentieRawContext = {
  profile: PROFIEL,
  assets: ASSETS,
  debts: [],
  lifeEvents: [] as LifeEvent[],
  aowRows: [],
  yearlyExpenses: 36_000,
}
const SNAPSHOT = { rawContext: CONTEXT } as unknown as RegelSimSnapshot

/** Precies wat de modal deed (strategie-modal.tsx, `simulations`). */
function modalRun(profiel: string) {
  const outcome = computeConvergentieProjection({
    rawContext: {
      ...CONTEXT,
      profile: { ...PROFIEL, withdrawal_profile_config: { ...(PROFIEL.withdrawal_profile_config as object), profiel } },
    },
  })
  return outcome.ok ? toSimResult(outcome.result) : null
}

describe('runProfielVergelijk', () => {
  it('is per profiel gelijk aan de injectie van de opgeheven modal (echte kern)', () => {
    const runs = runProfielVergelijk(SNAPSHOT)!
    expect(runs.map((r) => r.profiel)).toEqual(['vast', 'afnemend', 'oplopend', 'guardrails'])
    for (const { profiel, projectie } of runs) {
      const verwacht = modalRun(profiel)
      expect(verwacht).not.toBeNull()
      expect(projectie.sim?.fireAge).toBe(verwacht!.fireAge)
      expect(projectie.sim?.requiredFirePortfolio).toBe(verwacht!.requiredFirePortfolio)
      expect(projectie.sim?.rows.map((r) => r.endPortfolio)).toEqual(verwacht!.rows.map((r) => r.endPortfolio))
    }
  })

  it('laat de opgeslagen curve staan en wisselt alleen het profiel', () => {
    const runs = runProfielVergelijk(SNAPSHOT)!
    // Afnemend is het opgeslagen profiel: die run is de Tijdas-run zelf.
    const opgeslagen = computeConvergentieProjection({ rawContext: CONTEXT })
    expect(opgeslagen.ok).toBe(true)
    const tijdas = opgeslagen.ok ? toSimResult(opgeslagen.result) : null
    expect(runs.find((r) => r.profiel === 'afnemend')!.projectie.sim?.fireAge).toBe(tijdas!.fireAge)
  })

  it('zonder snapshot: niets', () => {
    expect(runProfielVergelijk(null)).toBeNull()
  })
})

describe('OnttrekkingProfielVergelijk', () => {
  it('rekent pas bij openklappen en toont per profiel de uitkomst van de eigen run', () => {
    render(<OnttrekkingProfielVergelijk snapshot={SNAPSHOT} actiefProfiel="afnemend" withdrawalStrategy={WITHDRAWAL_DEFAULTS} />)
    expect(screen.queryByTestId('profielvergelijk')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: PROFIEL_VERGELIJK_KOPIJ.knop }))
    const blok = screen.getByTestId('profielvergelijk')
    for (const p of ['vast', 'afnemend', 'oplopend', 'guardrails']) {
      const sim = modalRun(p)!
      const tekst = within(blok).getByTestId(`profiel-uitkomst-${p}`).textContent
      expect(tekst).toBe(sim.fireReachable && sim.fireAge != null ? `vrij op ${sim.fireAge}` : 'niet binnen je plan')
    }
    expect(within(blok).getByRole('button', { name: /Afnemend/ }).textContent).toContain(PROFIEL_VERGELIJK_KOPIJ.actief)
    expect(within(blok).getByTestId('profiel-samenvatting')).toBeTruthy()
    expect(within(blok).getByRole('img', { name: /per onttrekkingsprofiel/ })).toBeTruthy()
  })

  it('guardrails gekozen: de bandbreedte verschijnt', () => {
    render(<OnttrekkingProfielVergelijk snapshot={SNAPSHOT} actiefProfiel="vast" withdrawalStrategy={WITHDRAWAL_DEFAULTS} />)
    fireEvent.click(screen.getByRole('button', { name: PROFIEL_VERGELIJK_KOPIJ.knop }))
    fireEvent.click(screen.getByRole('button', { name: /^Guardrails/ }))
    expect(screen.getByRole('img', { name: /Bandbreedte/ })).toBeTruthy()
  })

  it('zonder snapshot: de degradatiezin, geen crash', () => {
    render(<OnttrekkingProfielVergelijk snapshot={null} actiefProfiel="vast" />)
    fireEvent.click(screen.getByRole('button', { name: PROFIEL_VERGELIJK_KOPIJ.knop }))
    expect(screen.getByText(PROFIEL_VERGELIJK_KOPIJ.geenBasis)).toBeTruthy()
  })
})

describe('OnttrekkingProfielVergelijk — euro-weergave (ADR 0090/0093, review Y1)', () => {
  it('draagt de factorrijen van dezelfde run mee (geen eigen machtsverheffing)', () => {
    const runs = runProfielVergelijk(SNAPSHOT)!
    for (const { projectie } of runs) {
      expect(projectie.factorRijen?.length).toBeGreaterThan(0)
      expect(projectie.factorRijen![0].inflationFactor).toBeCloseTo(1, 6)
    }
  })

  it('in "huidige euro\'s" deelt elk bedrag precies één keer door de factor van zijn eigen leeftijd', () => {
    const runs = runProfielVergelijk(SNAPSHOT)!
    const vast = runs.find((r) => r.profiel === 'vast')!.projectie
    const eindRij = vast.sim!.rows[vast.sim!.rows.length - 1]
    const factor = vast.factorRijen!.find((f) => f.age === eindRij.age)!.inflationFactor
    expect(factor).toBeGreaterThan(1.2)
    const bedrag = (euro: 'real' | 'nominal') => {
      cleanup()
      render(
        <EuroViewProvider initialView={euro}>
          <OnttrekkingProfielVergelijk snapshot={SNAPSHOT} actiefProfiel="vast" withdrawalStrategy={WITHDRAWAL_DEFAULTS} />
        </EuroViewProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: PROFIEL_VERGELIJK_KOPIJ.knop }))
      const regel = within(screen.getByTestId('profiel-samenvatting')).getByTestId('vermogen-eind')
      return Number((regel.textContent ?? '').replace(/[^\d]/g, ''))
    }
    const nominaal = bedrag('nominal')
    const reeel = bedrag('real')
    // Alleen de cijfers (het teken zit in de opmaak): de grootte telt.
    expect(nominaal).toBe(Math.abs(Math.round(eindRij.endPortfolio)))
    expect(reeel).toBe(Math.abs(Math.round(eindRij.endPortfolio / factor)))
    expect(reeel).toBeLessThan(nominaal)
    expect(screen.getByTestId('profielvergelijk').textContent).toContain(PROFIEL_VERGELIJK_KOPIJ.euroRegel('real'))
  })
})

describe('OnttrekkingProfielVergelijk — profielkleuren (review: geen status-achtige losse hexen)', () => {
  it('gebruikt het categorische reekspalet; licht én donker botsen niet met de statuskleuren', () => {
    const src = readFileSync(path.join(process.cwd(), 'components/future/regels/onttrekking-profielvergelijk.tsx'), 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    for (const [profiel, reeks] of Object.entries(PROFIEL_REEKS)) {
      if (reeks == null) {
        expect(PROFIEL_INFO[profiel as keyof typeof PROFIEL_INFO].stroke).toBe('var(--ink-3)')
        continue
      }
      expect(PROFIEL_INFO[profiel as keyof typeof PROFIEL_INFO].stroke).toBe(`var(--beheer-reeks-${reeks})`)
      for (const hex of [BEHEER_REEKS_LICHT[reeks - 1], BEHEER_REEKS_DONKER[reeks - 1]]) {
        expect(accentClashesWithStatus(hex), `${profiel} ${hex}`).toBe('ok')
      }
    }
    expect(new Set(Object.values(PROFIEL_REEKS).filter((r) => r != null)).size).toBe(3)
  })
})
