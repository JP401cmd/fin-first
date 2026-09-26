/**
 * AnderePaden — de scenario-kaarten in katern Doelen (ADR 0179 fase 4), met de preset-gate
 * die meeverhuisde uit de Plan-verdieping (ADR 0145 D7a, kaart V1): `onDuidingInView`
 * (de gate van de preset-batch onder `solved`) gaat pas af als de sectie in beeld is.
 * Doelen klapt de sectie niet in; alleen Volledig.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { ANDERE_PADEN_KOP } from '@/lib/horizon/katern-copy'

vi.mock('@/components/app/horizon/scenario-kaarten', () => ({
  ScenarioKaarten: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="scenario-kaarten">{isLoading ? 'laden' : 'klaar'}</div>
  ),
}))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstSimContext: () => ({}),
  useToekomstEuroContext: () => ({}),
}))

import { AnderePaden, type AnderePadenProps } from './andere-paden'

let intersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null

beforeEach(() => {
  intersect = null
  class IO {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      intersect = cb
    }
    observe() {}
    disconnect() {}
  }
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = IO
})
afterEach(cleanup)

function renderPaden(over: Partial<AnderePadenProps> = {}, mode: 'full' | 'simple' = 'full') {
  const onDuidingInView = vi.fn()
  const props: AnderePadenProps = {
    hasRun: true,
    scenarioPresets: null,
    scenarioPresetsLoading: false,
    viewScenarioPresets: null,
    onDuidingInView,
    ...over,
  }
  render(
    <DisplayModeProvider initialMode={mode}>
      <AnderePaden {...props} />
    </DisplayModeProvider>,
  )
  return { onDuidingInView }
}

const inBeeld = () => act(() => intersect?.([{ isIntersecting: true }]))

describe('AnderePaden — de preset-gate is "in beeld"', () => {
  it('niet in beeld: geen batch; in beeld: één melding aan de ouder', () => {
    const { onDuidingInView } = renderPaden()
    expect(onDuidingInView).not.toHaveBeenCalled()
    inBeeld()
    expect(onDuidingInView).toHaveBeenCalledTimes(1)
  })

  it('de sectie mount op de hoofdrun, ook zonder kaarten (anders haakt de observer nooit aan)', () => {
    renderPaden({ scenarioPresets: null, scenarioPresetsLoading: false })
    expect(screen.getByTestId('doelen-andere-paden')).toBeTruthy()
    expect(screen.queryByTestId('scenario-kaarten')).toBeNull()
  })

  it('mislukte of lege batch: geen kop en geen intro, maar de observer-sectie blijft', () => {
    for (const leeg of [
      { scenarioPresets: null, viewScenarioPresets: null },
      { scenarioPresets: [], viewScenarioPresets: [] },
    ]) {
      const { onDuidingInView } = renderPaden(leeg)
      const sectie = screen.getByTestId('doelen-andere-paden')
      expect(sectie.getAttribute('data-leeg')).toBe('true')
      expect(screen.queryByRole('heading', { name: ANDERE_PADEN_KOP })).toBeNull()
      expect(sectie.textContent).toBe('')
      inBeeld()
      expect(onDuidingInView).toHaveBeenCalled()
      cleanup()
    }
  })

  it('met kaarten: kop, intro en kaarten', () => {
    const kaart = {} as unknown as NonNullable<AnderePadenProps['scenarioPresets']>[number]
    renderPaden({ scenarioPresets: [kaart], viewScenarioPresets: [kaart] })
    expect(screen.getByTestId('scenario-kaarten').textContent).toBe('klaar')
    expect(screen.getByTestId('doelen-andere-paden').getAttribute('data-leeg')).toBeNull()
  })

  it('zonder hoofdrun geen sectie', () => {
    renderPaden({ hasRun: false })
    expect(screen.queryByTestId('doelen-andere-paden')).toBeNull()
  })

  it('toont de kaarten zodra de batch loopt', () => {
    renderPaden({ scenarioPresetsLoading: true })
    expect(screen.getByTestId('scenario-kaarten').textContent).toBe('laden')
  })

  it('draagt de kop als h2 (de shell draagt de h1, ADR 0110)', () => {
    renderPaden({ scenarioPresetsLoading: true })
    expect(screen.getByRole('heading', { level: 2, name: ANDERE_PADEN_KOP })).toBeTruthy()
  })
})

describe('AnderePaden — alleen Volledig (spec §4.7)', () => {
  it('in Eenvoudig geen sectie en dus geen batch', () => {
    const { onDuidingInView } = renderPaden({}, 'simple')
    expect(screen.queryByTestId('doelen-andere-paden')).toBeNull()
    inBeeld()
    expect(onDuidingInView).not.toHaveBeenCalled()
  })
})
