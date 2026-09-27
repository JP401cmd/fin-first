/**
 * Het lab op twee plekken (ADR 0179 D7, fase 4):
 *  - `kolom` naast de grafiek (desktop, knopvorm `knopWeergave.desktop`, standaard harp);
 *  - `onder-koppen` direct onder de grafiek (mobiel, `lg:hidden`, `knopWeergave.mobiel`,
 *    standaard rad), met de opslaan-actie in de action-bar van de shell.
 * Het anker `#verken-je-aannames` hoort bij de plek die op dit breekpunt zichtbaar is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { LabOpslaanToestand } from '@/components/app/horizon/lab-opslaan-balk'

const h = vi.hoisted(() => ({
  isLg: false,
  lab: [] as Record<string, unknown>[],
  bar: [] as unknown[],
  setKnopWeergave: vi.fn(),
  toestand: 'nieuw' as string,
  saving: false,
  planIsDezeStop: true,
  stopConfirm: vi.fn(),
  loslaten: vi.fn(),
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
vi.mock('@/components/app/horizon/lab-knoppen', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/horizon/lab-knoppen')>()),
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
    setDoelLoslatenOpen: h.loslaten,
    setStopPlanConfirmOpen: h.stopConfirm,
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
    planIsDezeStop: h.planIsDezeStop,
    handleScenarioReset: vi.fn(),
    labOpslaanToestand: h.toestand as LabOpslaanToestand,
    handleDoelHerstellen: vi.fn(),
    labKnoppen: {},
    labFormatters: {},
  }),
  useToekomstSimContext: () => ({ simResult: { fireAge: 55 }, heroVraag: 'Wanneer kun je stoppen?' }),
  useToekomstEuroContext: () => ({ labUitkomstRegel: null }),
}))

import { DoelenKaternLab, DoelenKaternLabActies } from './doelen-katern-lab'

beforeEach(() => {
  h.isLg = false
  h.lab = []
  h.bar = []
  h.toestand = 'nieuw'
  h.saving = false
  h.planIsDezeStop = true
  h.setKnopWeergave.mockClear()
  h.stopConfirm.mockClear()
  h.loslaten.mockClear()
})
afterEach(cleanup)

type Extra = { label: string; onClick?: () => void; href?: string; disabled?: boolean }
const laatsteBar = () =>
  h.bar[h.bar.length - 1] as {
    primary: { label: string; disabled?: boolean }
    secondary?: { label: string }
    extra?: Extra[]
  } | null

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

  it('mobiel, onder de grafiek: mobiele vorm (rad), lg:hidden, schrijft de mobiele sleutel', () => {
    render(<DoelenKaternLab plek="onder-koppen" />)
    expect(screen.getByTestId('lab-knoppen-stub').getAttribute('data-weergave')).toBe('rad')
    const wrapper = document.querySelector('[data-lab-plek="onder-koppen"]') as HTMLElement
    expect(wrapper.className).toContain('lg:hidden')
    // Compact (één-scherm-eis): geen kicker, en de vormkeuze staat in de actierij.
    expect(h.lab[0].kicker).toBe(false)
    expect(h.lab[0].onWeergaveChange).toBeUndefined()
    cleanup()
    render(<>{h.lab[0].stopSlot as React.ReactNode}</>)
    fireEvent.change(screen.getByTestId('lab-weergave-menu'), { target: { value: 'balk' } })
    expect(h.setKnopWeergave).toHaveBeenCalledWith('mobiel', 'balk')
  })

  it('kolom: kicker en keuzelijst naast de vraag', () => {
    render(<DoelenKaternLab plek="kolom" />)
    expect(h.lab[0].kicker).toBe(true)
    expect(typeof h.lab[0].onWeergaveChange).toBe('function')
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

describe('DoelenKaternLab — één plek per actie (27 sep)', () => {
  const stopSlot = () => {
    cleanup()
    render(<>{h.lab[0].stopSlot as React.ReactNode}</>)
  }

  it('met bar: stopmoment en plan-keuzes staan in de extra rij; nieuw heeft geen Loslaten', () => {
    h.planIsDezeStop = false
    h.toestand = 'nieuw'
    render(<DoelenKaternLab plek="onder-koppen" />)
    const extra = laatsteBar()?.extra ?? []
    expect(extra.map((e) => e.label)).toEqual(['Maak 60 mijn stopmoment', 'Je plan-keuzes →'])
    expect(extra[1].href).toBe('/toekomst/instellingen')
    extra[0].onClick?.()
    expect(h.stopConfirm).toHaveBeenCalledWith(true)
  })

  it('met bar in gewijzigd: Loslaten erbij; de stop-actie alleen als de knop van het plan afwijkt', () => {
    h.toestand = 'gewijzigd'
    render(<DoelenKaternLab plek="onder-koppen" />)
    const extra = laatsteBar()?.extra ?? []
    expect(extra.map((e) => e.label)).toEqual(['Je plan-keuzes →', 'Doel loslaten'])
    extra[1].onClick?.()
    expect(h.loslaten).toHaveBeenCalledWith(true)
  })

  it('stopmoment én Loslaten: de plan-keuzes-link valt weg (drie acties lopen op 360 px over twee regels)', () => {
    h.planIsDezeStop = false
    h.toestand = 'gewijzigd'
    render(<DoelenKaternLab plek="onder-koppen" />)
    const extra = laatsteBar()?.extra ?? []
    expect(extra.map((e) => e.label)).toEqual(['Maak 60 mijn stopmoment', 'Doel loslaten'])
  })

  it('tijdens opslaan zijn de extra acties uitgeschakeld', () => {
    h.planIsDezeStop = false
    h.toestand = 'gewijzigd'
    h.saving = true
    render(<DoelenKaternLab plek="onder-koppen" />)
    const extra = laatsteBar()?.extra ?? []
    expect(extra.find((e) => e.label === 'Doel loslaten')?.disabled).toBe(true)
  })

  it('met bar: op de pagina alleen de weergavekeuze en de statusregel, geen knoppen', () => {
    h.planIsDezeStop = false
    h.toestand = 'gewijzigd'
    render(<DoelenKaternLab plek="onder-koppen" />)
    const balk = screen.getByTestId('lab-opslaan-balk')
    expect(balk.querySelectorAll('button')).toHaveLength(0)
    stopSlot()
    expect(screen.getByTestId('lab-weergave-menu')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /mijn stopmoment/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Je plan-keuzes/ })).toBeNull()
  })

  it('zonder bar (opgeslagen): alles blijft op de pagina, de nav-pill blijft staan', () => {
    h.planIsDezeStop = false
    h.toestand = 'opgeslagen'
    render(<DoelenKaternLab plek="onder-koppen" />)
    expect(laatsteBar()).toBeNull()
    expect(screen.getByRole('button', { name: 'Doel loslaten' })).toBeTruthy()
    stopSlot()
    expect(screen.getByRole('button', { name: 'Maak 60 mijn stopmoment' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Je plan-keuzes/ })).toBeTruthy()
  })

  it('kolom (desktop): alleen het lab — geen acties, geen opslaan-balk', () => {
    h.planIsDezeStop = false
    render(<DoelenKaternLab plek="kolom" />)
    expect(h.lab[0].stopSlot).toBeNull()
    expect(screen.queryByTestId('lab-opslaan-balk')).toBeNull()
  })

  it('de actierij (desktop): stopmoment, plan-keuzes en de opslaan-balk met zijn knoppen', () => {
    h.planIsDezeStop = false
    h.toestand = 'gewijzigd'
    render(<DoelenKaternLabActies />)
    const rij = screen.getByTestId('doelen-lab-actierij')
    expect(rij.textContent).toContain('Maak 60 mijn stopmoment')
    expect(screen.getByRole('link', { name: /Je plan-keuzes/ }).getAttribute('href')).toBe('/toekomst/instellingen')
    const knoppen = Array.from(screen.getByTestId('lab-opslaan-balk').querySelectorAll('button')).map((b) => b.textContent)
    expect(knoppen).toEqual(['Doel bijwerken', 'Herstel mijn doel', 'Doel loslaten'])
    fireEvent.click(screen.getByRole('button', { name: 'Maak 60 mijn stopmoment' }))
    expect(h.stopConfirm).toHaveBeenCalledWith(true)
    // De actierij registreert geen shell-bar.
    expect(h.bar).toEqual([])
  })
})
