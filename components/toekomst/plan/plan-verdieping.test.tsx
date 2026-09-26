/**
 * PlanVerdieping — "Wat het betekent" op mobiel ingeklapt, vanaf `sm` open (ADR 0179,
 * addendum 26 sep; spec §4.3, D6), en de preset-gate "in beeld ÉN open".
 *
 * De inhoud staat altijd in de DOM; op mobiel verbergt `hidden sm:block` hem zolang de
 * sectie dicht is. `onDuidingInView` (de gate van de preset-batch onder `solved`) gaat
 * pas af als de sectie in beeld is én open staat.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/components/app/horizon/scenario-kaarten', () => ({
  ScenarioKaarten: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="scenario-kaarten">{isLoading ? 'laden' : 'klaar'}</div>
  ),
}))

import { PlanVerdieping, type PlanVerdiepingProps } from './plan-verdieping'

let breed = false
let intersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null

beforeEach(() => {
  breed = false
  intersect = null
  window.matchMedia = ((query: string) => ({
    matches: breed,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
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

function renderVerdieping(over: Partial<PlanVerdiepingProps> = {}) {
  const onDuidingInView = vi.fn()
  const props: PlanVerdiepingProps = {
    hasRun: true,
    scenarioPresets: null,
    scenarioPresetsLoading: false,
    viewScenarioPresets: null,
    personalHeroProjection: null,
    onDuidingInView,
    ...over,
  }
  render(
    <DisplayModeProvider initialMode="full">
      <PlanVerdieping {...props} />
    </DisplayModeProvider>,
  )
  return { onDuidingInView }
}

const inBeeld = () => act(() => intersect?.([{ isIntersecting: true }]))

describe('PlanVerdieping — mobiel ingeklapt', () => {
  it('staat op mobiel dicht: de toggle zegt aria-expanded=false en de inhoud is verborgen', () => {
    renderVerdieping()
    const toggle = screen.getByTestId('plan-wat-het-betekent-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('plan-wat-het-betekent')!.className).toContain('hidden sm:block')
  })

  it('de toggle is een tap-target van minstens 44px en opent de inhoud', () => {
    renderVerdieping()
    const toggle = screen.getByTestId('plan-wat-het-betekent-toggle')
    expect(toggle.className).toContain('min-h-[44px]')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('plan-wat-het-betekent')!.className).not.toContain('hidden')
  })

  it('staat vanaf sm open', () => {
    breed = true
    renderVerdieping()
    expect(screen.getByTestId('plan-wat-het-betekent-toggle').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('PlanVerdieping — de preset-gate is "in beeld ÉN open"', () => {
  it('op mobiel dicht: in beeld komen start de batch niet; openen wel', () => {
    const { onDuidingInView } = renderVerdieping()
    inBeeld()
    expect(onDuidingInView).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('plan-wat-het-betekent-toggle'))
    expect(onDuidingInView).toHaveBeenCalled()
  })

  it('open maar nog niet in beeld: nog geen batch', () => {
    breed = true
    const { onDuidingInView } = renderVerdieping()
    expect(onDuidingInView).not.toHaveBeenCalled()
    inBeeld()
    expect(onDuidingInView).toHaveBeenCalled()
  })

  it('de sectie mount op de hoofdrun, ook zonder kaarten (anders haakt de observer nooit aan)', () => {
    renderVerdieping({ scenarioPresets: null, scenarioPresetsLoading: false })
    expect(screen.getByTestId('plan-wat-het-betekent')).toBeTruthy()
    expect(screen.queryByTestId('scenario-kaarten')).toBeNull()
  })

  it('zonder hoofdrun geen sectie', () => {
    renderVerdieping({ hasRun: false })
    expect(screen.queryByTestId('plan-wat-het-betekent')).toBeNull()
  })

  it('toont de kaarten zodra de batch loopt', () => {
    renderVerdieping({ scenarioPresetsLoading: true })
    expect(screen.getByTestId('scenario-kaarten').textContent).toBe('laden')
  })
})
