/**
 * Render-test CanvasLegenda (blok N): pint de getoonde rendementen van de
 * scenario-legenda tegen de canonieke bron (`fireParams.grossReturn` +
 * `SCENARIO_VARIANTS[i].delta`), de voetnoot tegen `STRATEGY_LABELS` en de
 * strategie-hint tegen `ankerTitel` — plus dat de knoppen de host-setters raken.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SCENARIO_VARIANTS, type ScenarioOverlay } from '@/components/app/horizon/sim-chart'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { ankerTitel, type AnkerStop } from '@/lib/horizon/anker-copy'
import type { SimResult } from '@/lib/fire-simulation'
import type { FireParams } from '@/lib/fire-params'
import { CanvasLegenda, type CanvasLegendaProps } from './canvas-legenda'

const simResult = { strategy: 'deplete', displayEndAge: 90 } as unknown as SimResult
const fireParams = { grossReturn: 0.068 } as unknown as FireParams
const scenarioData = SCENARIO_VARIANTS.map((v) => ({ name: v.name, label: v.label, color: v.color })) as unknown as ScenarioOverlay[]

function renderLegenda(props: Partial<CanvasLegendaProps> = {}) {
  const setActiveModal = vi.fn()
  const setSimModalOpen = vi.fn()
  render(
    <CanvasLegenda
      scenariosExpanded={false}
      scenarioData={null}
      fireParams={fireParams}
      setActiveModal={setActiveModal}
      mcExpanded={false}
      mcData={null}
      mcMarge={null}
      liquidWealthPoints={undefined}
      simResult={simResult}
      setSimModalOpen={setSimModalOpen}
      isFixedAnchorMode={false}
      ankerStop={null}
      {...props}
    />,
  )
  return { setActiveModal, setSimModalOpen }
}

describe('CanvasLegenda', () => {
  it('toont per scenario het rendement uit grossReturn + de canonieke delta', () => {
    const { setActiveModal } = renderLegenda({ scenariosExpanded: true, scenarioData })
    for (const v of SCENARIO_VARIANTS) {
      const verwacht = `${((fireParams.grossReturn + v.delta) * 100).toFixed(1)}%`
      expect(screen.getByText(verwacht)).toBeTruthy()
      expect(screen.getByText(v.label)).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: /Verdiepen/ }))
    expect(setActiveModal).toHaveBeenCalledWith('scenarios')
  })

  it('verbergt de scenario-legenda zolang de pil uit staat', () => {
    renderLegenda({ scenariosExpanded: false, scenarioData })
    expect(screen.queryByText(SCENARIO_VARIANTS[0].label)).toBeNull()
  })

  it('de voetnoot noemt strategie en eindleeftijd en opent de jaar-op-jaar-tabel', () => {
    const { setSimModalOpen } = renderLegenda()
    expect(screen.getByText(new RegExp(STRATEGY_LABELS.deplete.name))).toBeTruthy()
    expect(screen.getByText(/Weergave t\/m leeftijd 89 \(eindleeftijd 90\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open de jaar-op-jaar-tabel' }))
    expect(setSimModalOpen).toHaveBeenCalledWith(true)
  })

  it('de strategie-hint volgt het anker', () => {
    const ankerStop: AnkerStop = { kind: 'age', stopAge: 55 }
    const { setActiveModal } = renderLegenda({ isFixedAnchorMode: true, ankerStop })
    expect(screen.getByText(new RegExp(ankerTitel(ankerStop)))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Stopmoment wijzigen/ }))
    expect(setActiveModal).toHaveBeenCalledWith('strategie')
  })

  it('zonder vast anker biedt de hint een eigen stopmoment aan', () => {
    renderLegenda()
    expect(screen.getByRole('button', { name: /Zelf een stopmoment kiezen/ })).toBeTruthy()
  })
})
