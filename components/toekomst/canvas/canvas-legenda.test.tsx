/**
 * Render-test CanvasLegenda (blok N, fase 2): de legenda-regel van spec §4.9 — alleen
 * bij twee of meer reeksen — plus de getoonde rendementen tegen de canonieke bron
 * (`fireParams.grossReturn` + `SCENARIO_VARIANTS[i].delta`). De voetnoot en de hint
 * "Stopmoment wijzigen" zijn vervallen (spec §7.3, de aannamesregel neemt ze over).
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SCENARIO_VARIANTS, type ScenarioOverlay } from '@/components/app/horizon/sim-chart'
import type { FireParams } from '@/lib/fire-params'
import type { MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import { LAAG_LABEL } from '@/lib/horizon/katern-copy'
import { CanvasLegenda, type CanvasLegendaProps } from './canvas-legenda'
import { aantalReeksen, toonLegendaBij } from './canvas-stand'

const fireParams = { grossReturn: 0.068 } as unknown as FireParams
const scenarioData = SCENARIO_VARIANTS.map((v) => ({ name: v.name, label: v.label, color: v.color })) as unknown as ScenarioOverlay[]
const mcData = { ok: true, runs: 500, marge: null, vrijheidsleeftijden: null } as unknown as Extract<MarktcheckOutcome, { ok: true }>

function renderLegenda(props: Partial<CanvasLegendaProps> = {}) {
  const setActiveModal = vi.fn()
  render(
    <CanvasLegenda
      aantalReeksen={2}
      rendementScenarios={false}
      scenarioData={null}
      fireParams={fireParams}
      setActiveModal={setActiveModal}
      marktcheck={false}
      mcData={null}
      mcMarge={null}
      mcPending={false}
      mcFailed={false}
      liquidWealthPoints={undefined}
      {...props}
    />,
  )
  return { setActiveModal }
}

describe('legenda-regel (spec §4.9)', () => {
  it('telt de hoofdlijn plus elke actieve extra reeks; markers tellen niet', () => {
    const niets = { doelscenario: false, marktcheck: false, rendementScenarios: false, metHuis: false }
    expect(aantalReeksen(niets)).toBe(1)
    expect(aantalReeksen({ ...niets, doelscenario: true })).toBe(2)
    expect(aantalReeksen({ doelscenario: true, marktcheck: true, rendementScenarios: true, metHuis: true })).toBe(5)
  })

  it('toont een legenda pas vanaf twee reeksen', () => {
    expect(toonLegendaBij(1)).toBe(false)
    expect(toonLegendaBij(2)).toBe(true)
  })

  it('rendert niets bij één reeks, ook als er rendementsdata klaarligt', () => {
    renderLegenda({ aantalReeksen: 1, rendementScenarios: true, scenarioData })
    expect(screen.queryByTestId('canvas-legenda')).toBeNull()
  })
})

describe('CanvasLegenda', () => {
  it('toont per scenario het rendement uit grossReturn + de canonieke delta', () => {
    const { setActiveModal } = renderLegenda({ rendementScenarios: true, scenarioData })
    for (const v of SCENARIO_VARIANTS) {
      const verwacht = `${((fireParams.grossReturn + v.delta) * 100).toFixed(1)}%`
      expect(screen.getByText(verwacht)).toBeTruthy()
      expect(screen.getByText(v.label)).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: /Verdiepen/ }))
    expect(setActiveModal).toHaveBeenCalledWith('scenarios')
  })

  it('verbergt de rendementsregel zolang die laag uit staat', () => {
    renderLegenda({ rendementScenarios: false, scenarioData })
    expect(screen.queryByText(SCENARIO_VARIANTS[0].label)).toBeNull()
  })

  it('noemt de band Marktcheck, zonder het jargon p25–p75, met het aantal marktverlopen', () => {
    const { setActiveModal } = renderLegenda({ marktcheck: true, mcData })
    expect(screen.getByText(LAAG_LABEL.marktcheck)).toBeTruthy()
    expect(screen.queryByText(/p25/)).toBeNull()
    expect(screen.getByText('500')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Verdiepen/ }))
    expect(setActiveModal).toHaveBeenCalledWith('simulations')
  })

  it('heeft geen voetnoot en geen stopmoment-hint meer', () => {
    renderLegenda({ rendementScenarios: true, scenarioData })
    expect(screen.queryByText(/jaar-op-jaar-tabel/)).toBeNull()
    expect(screen.queryByText(/Stopmoment wijzigen/)).toBeNull()
    expect(screen.queryByText(/Zelf een stopmoment kiezen/)).toBeNull()
  })
})
