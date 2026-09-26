/**
 * Het lab op twee plekken (ADR 0179 D7, fase 4):
 *  - `kolom` naast de grafiek (desktop, knopvorm `knopWeergave.desktop`, standaard harp);
 *  - `onder-koppen` direct onder de katern-koppen (mobiel, `lg:hidden`, `knopWeergave.mobiel`,
 *    standaard rad), met de opslaan-actie in de action-bar van de shell.
 * Het anker `#verken-je-aannames` hoort bij de plek die op dit breekpunt zichtbaar is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { LabOpslaanToestand } from '@/components/app/horizon/lab-opslaan-balk'

const h = vi.hoisted(() => ({
  isLg: false,
  lab: [] as Record<string, unknown>[],
  bar: [] as unknown[],
  setKnopWeergave: vi.fn(),
  toestand: 'nieuw' as string,
  saving: false,
}))

vi.mock('@/lib/hooks/use-media-query', () => ({
  useIsLgUp: () => h.isLg,
  useMediaQuery: () => h.isLg,
}))
vi.mock('@/components/app/shell/use-live-action-bar', () => ({
  useLiveActionBar: (config: unknown) => {
    h.bar.push(config)
  },
}))
vi.mock('@/components/app/horizon/lab-knoppen', () => ({
  LabKnoppen: (props: Record<string, unknown>) => {
    h.lab.push(props)
    return <div data-testid="lab-knoppen-stub" data-weergave={String(props.weergave)} />
  },
}))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstBron: () => ({ initialData: {} }),
  useToekomstPerspectiefContext: () => ({ verkenSectieZichtbaar: true }),
  useToekomstOverlayContext: () => ({ verkenSectionRef: { current: null } }),
  useToekomstScenarioContext: () => ({
    knopWeergave: { desktop: 'harp', mobiel: 'rad' },
    setKnopWeergave: h.setKnopWeergave,
    doelBlok: null,
    setDoelSheetOpen: vi.fn(),
    doelSaving: h.saving,
    setDoelLoslatenOpen: vi.fn(),
    setStopPlanConfirmOpen: vi.fn(),
    stopPlanSaving: false,
    setStopPlanError: vi.fn(),
    firstDragHintVisible: false,
    dismissFirstDragHint: vi.fn(),
    doelVastleggenMogelijk: true,
    doelBijwerkenMogelijk: true,
    effectiveStopAge: 60,
    planEindVorm: 'deplete',
    labGrenzenPending: false,
    labZone: null,
    planIsDezeStop: true,
    handleScenarioReset: vi.fn(),
    labOpslaanToestand: h.toestand as LabOpslaanToestand,
    handleDoelHerstellen: vi.fn(),
    labKnoppen: {},
    labFormatters: {},
  }),
  useToekomstSimContext: () => ({ simResult: { fireAge: 55 }, heroVraag: 'Wanneer kun je stoppen?' }),
  useToekomstEuroContext: () => ({ labUitkomstRegel: null }),
}))

import { DoelenKaternLab } from './doelen-katern-lab'

beforeEach(() => {
  h.isLg = false
  h.lab = []
  h.bar = []
  h.toestand = 'nieuw'
  h.saving = false
  h.setKnopWeergave.mockClear()
})
afterEach(cleanup)

const laatsteBar = () => h.bar[h.bar.length - 1] as { primary: { label: string; disabled?: boolean }; secondary?: { label: string } } | null

describe('DoelenKaternLab — twee plekken', () => {
  it('kolom: desktop-vorm (harp), altijd in de DOM; de CSS-zichtbaarheid komt van de zijkolom', () => {
    render(<DoelenKaternLab plek="kolom" />)
    expect(screen.getByTestId('lab-knoppen-stub').getAttribute('data-weergave')).toBe('harp')
    const wrapper = document.querySelector('[data-lab-plek="kolom"]') as HTMLElement
    expect(wrapper.className).not.toContain('lg:hidden')
    ;(h.lab[0].onWeergaveChange as (v: string) => void)('vijfhoek')
    expect(h.setKnopWeergave).toHaveBeenCalledWith('desktop', 'vijfhoek')
    expect(h.lab[0].weergaveKiezer).toBe('menu')
  })

  it('onder de koppen: mobiele vorm (rad), lg:hidden, schrijft de mobiele sleutel', () => {
    render(<DoelenKaternLab plek="onder-koppen" />)
    expect(screen.getByTestId('lab-knoppen-stub').getAttribute('data-weergave')).toBe('rad')
    const wrapper = document.querySelector('[data-lab-plek="onder-koppen"]') as HTMLElement
    expect(wrapper.className).toContain('lg:hidden')
    ;(h.lab[0].onWeergaveChange as (v: string) => void)('balk')
    expect(h.setKnopWeergave).toHaveBeenCalledWith('mobiel', 'balk')
  })

  it('het anker hoort bij de zichtbare plek', () => {
    h.isLg = false
    render(
      <>
        <DoelenKaternLab plek="kolom" />
        <DoelenKaternLab plek="onder-koppen" />
      </>,
    )
    expect(screen.getByTestId('doelen-lab-onder-koppen').id).toBe('verken-je-aannames')
    expect(screen.getByTestId('doelen-lab-kolom').id).toBe('')
    cleanup()
    h.isLg = true
    render(
      <>
        <DoelenKaternLab plek="kolom" />
        <DoelenKaternLab plek="onder-koppen" />
      </>,
    )
    expect(screen.getByTestId('doelen-lab-kolom').id).toBe('verken-je-aannames')
    expect(screen.getByTestId('doelen-lab-onder-koppen').id).toBe('')
  })
})

describe('DoelenKaternLab — de opslaan-actie in de shell-action-bar (mobiel)', () => {
  it('nieuw → "Maak dit mijn doel" + "Terug naar basis"', () => {
    h.toestand = 'nieuw'
    render(<DoelenKaternLab plek="onder-koppen" />)
    expect(laatsteBar()?.primary.label).toBe('Maak dit mijn doel')
    expect(laatsteBar()?.secondary?.label).toBe('Terug naar basis')
  })

  it('gewijzigd → "Doel bijwerken" + "Herstel mijn doel"', () => {
    h.toestand = 'gewijzigd'
    render(<DoelenKaternLab plek="onder-koppen" />)
    expect(laatsteBar()?.primary.label).toBe('Doel bijwerken')
    expect(laatsteBar()?.secondary?.label).toBe('Herstel mijn doel')
  })

  it('rust, opgeslagen, nu-anker → geen bar (de nav-pill komt terug)', () => {
    for (const t of ['rust', 'opgeslagen', 'nu-anker']) {
      h.toestand = t
      h.bar = []
      render(<DoelenKaternLab plek="onder-koppen" />)
      expect(laatsteBar()).toBeNull()
      cleanup()
    }
  })

  it('tijdens opslaan is de primaire knop uitgeschakeld', () => {
    h.saving = true
    render(<DoelenKaternLab plek="onder-koppen" />)
    expect(laatsteBar()?.primary.disabled).toBe(true)
  })

  it('de kolom (desktop) registreert nooit een bar', () => {
    render(<DoelenKaternLab plek="kolom" />)
    expect(h.bar.every((c) => c === null)).toBe(true)
  })
})
