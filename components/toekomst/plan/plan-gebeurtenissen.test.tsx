/**
 * De levensgebeurtenissen van Plan op twee plekken (eigenaarsbesluit 27 sep):
 *  - `kolom` naast de grafiek (desktop, compact, met de jaar-op-jaar-tabel eronder);
 *  - `pagina` onder het Plan-paneel (`lg:hidden`).
 * Eén plek per breekpunt; het anker `#gebeurtenissen` hoort bij de zichtbare plek.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const h = vi.hoisted(() => ({
  isLg: false,
  props: [] as Record<string, unknown>[],
  setSimModalOpen: vi.fn(),
  simResult: { fireAge: 55 } as Record<string, unknown> | null,
  gebeurtenissen: { events: [] } as Record<string, unknown> | null,
}))

vi.mock('@/lib/hooks/use-media-query', () => ({
  useIsLgUp: () => h.isLg,
  useMediaQuery: () => h.isLg,
}))
vi.mock('./gebeurtenissen-met-hoofdrun', () => ({
  GebeurtenissenMetHoofdrun: (props: Record<string, unknown>) => {
    h.props.push(props)
    return <div data-testid="gebeurtenissen-stub" data-compact={String(!!props.compact)} />
  },
}))
// De levensstrategieën hebben een eigen test (levensstrategieen-blok.test.tsx).
vi.mock('./levensstrategieen-blok', () => ({
  LevensstrategieenBlok: ({ plek }: { plek: string }) => <div data-testid={`levensstrategieen-stub-${plek}`} />,
}))
vi.mock('@/components/app/hide-in-simple', () => ({
  HideInSimple: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstBron: () => ({ gebeurtenissen: h.gebeurtenissen }),
  useToekomstOverlayContext: () => ({ setSimModalOpen: h.setSimModalOpen }),
  useToekomstSimContext: () => ({ simResult: h.simResult }),
}))

import { PlanGebeurtenissen, PlanJaartabelLink } from './plan-gebeurtenissen'

beforeEach(() => {
  h.isLg = false
  h.props = []
  h.simResult = { fireAge: 55 }
  h.gebeurtenissen = { events: [] }
  h.setSimModalOpen.mockClear()
})
afterEach(cleanup)

describe('PlanGebeurtenissen — twee plekken, één per breekpunt', () => {
  it('pagina: lg:hidden, volle weergave; kolom: altijd in de DOM (de canvas toont hem vanaf lg), compact', () => {
    render(
      <>
        <PlanGebeurtenissen plek="kolom" />
        <PlanGebeurtenissen plek="pagina" />
      </>,
    )
    const pagina = document.querySelector('[data-gebeurtenissen-plek="pagina"]') as HTMLElement
    const kolom = document.querySelector('[data-gebeurtenissen-plek="kolom"]') as HTMLElement
    expect(pagina.className).toContain('lg:hidden')
    expect(kolom.className).not.toContain('lg:hidden')
    expect(h.props.map((p) => !!p.compact)).toEqual([true, false])
  })

  it('het anker hoort bij de zichtbare plek (mobiel: pagina, desktop: kolom)', () => {
    render(
      <>
        <PlanGebeurtenissen plek="kolom" />
        <PlanGebeurtenissen plek="pagina" />
      </>,
    )
    expect(screen.getByTestId('plan-gebeurtenissen').id).toBe('gebeurtenissen')
    expect(screen.getByTestId('plan-gebeurtenissen-kolom').id).toBe('')
    cleanup()
    h.isLg = true
    render(
      <>
        <PlanGebeurtenissen plek="kolom" />
        <PlanGebeurtenissen plek="pagina" />
      </>,
    )
    expect(screen.getByTestId('plan-gebeurtenissen-kolom').id).toBe('gebeurtenissen')
    expect(screen.getByTestId('plan-gebeurtenissen').id).toBe('')
  })

  it('kolom: de jaar-op-jaar-tabel direct onder de gebeurtenissen; de pagina-link is lg:hidden', () => {
    render(<PlanGebeurtenissen plek="kolom" />)
    fireEvent.click(screen.getByTestId('plan-jaar-op-jaar-kolom'))
    expect(h.setSimModalOpen).toHaveBeenCalledWith(true)
    cleanup()
    render(<PlanJaartabelLink />)
    expect((screen.getByTestId('plan-jaar-op-jaar').parentElement as HTMLElement).className).toContain('lg:hidden')
  })

  it('zonder run geen jaar-op-jaar-tabel; zonder gebeurtenissen-data geen lijst', () => {
    h.simResult = null
    h.gebeurtenissen = null
    render(
      <>
        <PlanGebeurtenissen plek="kolom" />
        <PlanJaartabelLink />
      </>,
    )
    expect(screen.queryByTestId('plan-jaar-op-jaar-kolom')).toBeNull()
    expect(screen.queryByTestId('plan-jaar-op-jaar')).toBeNull()
    expect(screen.queryByTestId('gebeurtenissen-stub')).toBeNull()
  })

  it('de levensstrategieën staan op beide plekken direct onder de lijst, vóór de jaartabel (27 sep)', () => {
    render(
      <>
        <PlanGebeurtenissen plek="kolom" />
        <PlanGebeurtenissen plek="pagina" />
      </>,
    )
    const kolomBlok = screen.getByTestId('levensstrategieen-stub-kolom')
    expect(screen.getByTestId('levensstrategieen-stub-pagina')).toBeTruthy()
    const lijst = screen.getAllByTestId('gebeurtenissen-stub')[0]
    expect(lijst.compareDocumentPosition(kolomBlok) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const tabel = screen.queryByTestId('plan-jaar-op-jaar-kolom')
    if (tabel) expect(kolomBlok.compareDocumentPosition(tabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
