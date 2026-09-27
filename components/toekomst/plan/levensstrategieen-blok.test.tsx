import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { LifeEvent } from '@/lib/horizon-data'
import { RIJ_LABEL, INSTELLINGEN_SECTIE_KOP } from '@/lib/toekomst/instellingen-rijwaarden'

/**
 * De levensstrategieën op katern Plan (eigenaarsbesluit 27 sep 2026): dezelfde rijen als tot
 * dan in Instellingen, en één editor-host op de page voor beide plekken. Bewaakt het
 * URL-contract (`/toekomst?rij=<key>`, `?strategie=pensioen` → factor-A) en dat een klik op
 * een rij de editor opent zonder factor-A-uitvraag.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.search,
  usePathname: () => '/toekomst',
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}))
const lg = vi.hoisted(() => ({ waarde: false }))
vi.mock('@/lib/hooks/use-media-query', () => ({ useIsLgUp: () => lg.waarde }))

const ev = (e: Partial<LifeEvent>) => ({ id: 'x', is_active: true, target_age: null, metadata: null, ...e }) as LifeEvent
const bron = vi.hoisted(() => ({ events: [] as LifeEvent[], zonderBron: false }))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstBron: () => ({
    initialData: {
      events: bron.events,
      housingStrategy: { mode: 'include_full' },
      rawProfile: { housing_strategy_config: null },
    },
    gebeurtenissen: bron.zonderBron ? null : { events: bron.events, strategieData: { baseline: null } },
  }),
}))
vi.mock('@/components/future/strategie/strategie-editors', () => ({
  StrategieEditors: (p: { open: string | null; autoOpenJaarruimte?: boolean; snapshot?: unknown; onClose: () => void }) => (
    <div>
      <div data-testid="strategie-open">{p.open ?? 'none'}</div>
      <div data-testid="strategie-jaarruimte">{String(Boolean(p.autoOpenJaarruimte))}</div>
      <div data-testid="strategie-snapshot">{p.snapshot ? 'snap' : 'geen'}</div>
      <button type="button" onClick={p.onClose}>
        editor-sluiten
      </button>
    </div>
  ),
}))

import { LevensstrategieenBlok } from './levensstrategieen-blok'
import { LevensstrategieEditorsHost } from './levensstrategie-editors-host'

const SNAP = { rawContext: {} } as never
const rijKnop = (r: string) => document.querySelector(`button[data-rij="${r}"]`) as HTMLButtonElement

beforeEach(() => {
  nav.search = new URLSearchParams()
  lg.waarde = false
  bron.events = []
  bron.zonderBron = false
  window.history.replaceState(null, '', '/toekomst')
})
afterEach(cleanup)

describe('LevensstrategieenBlok — de vier rijen bij de gebeurtenissen', () => {
  it('een h2 met de vier rijen; het anker op de zichtbare plek', () => {
    const { container } = render(<LevensstrategieenBlok plek="pagina" />)
    expect(screen.getByRole('heading', { level: 2, name: INSTELLINGEN_SECTIE_KOP.levensstrategieen })).toBeTruthy()
    for (const r of ['aow', 'pensioen', 'werk', 'huis'] as const) {
      expect(rijKnop(r).textContent, r).toContain(`${RIJ_LABEL[r]}: `)
    }
    // Onder lg is de pagina-plek de zichtbare: daar staat het anker.
    expect(container.querySelector('#levensstrategieen')).not.toBeNull()
    cleanup()
    const kolom = render(<LevensstrategieenBlok plek="kolom" />)
    expect(kolom.container.querySelector('#levensstrategieen')).toBeNull()
    expect(document.querySelector('h1')).toBeNull()
  })

  it('ontbrekende strategieën: "Toevoegen"; een ingestelde AOW: ✎ met de waarde', () => {
    render(<LevensstrategieenBlok plek="pagina" />)
    expect(rijKnop('aow').textContent).toContain('nog niet op je tijdas')
    expect(rijKnop('aow').textContent).toContain('Toevoegen')
    // Geen eigen woonstrategie op het profiel: de standaard.
    expect(rijKnop('huis').textContent).toContain('standaard')
    cleanup()
    bron.events = [ev({ event_type: 'aow', metadata: { leefsituatie: 'alleenstaand' } as never })]
    render(<LevensstrategieenBlok plek="pagina" />)
    expect(rijKnop('aow').textContent).toContain('wettelijke leeftijd')
    expect(rijKnop('aow').textContent).toContain('aanpassen')
  })

  it('een klik op een rij opent de editor in de host, zonder factor-A-uitvraag', () => {
    render(
      <>
        <LevensstrategieenBlok plek="kolom" />
        <LevensstrategieEditorsHost snapshot={SNAP} />
      </>,
    )
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
    fireEvent.click(rijKnop('pensioen'))
    expect(screen.getByTestId('strategie-open').textContent).toBe('pensioen')
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe('false')
    expect(screen.getByTestId('strategie-snapshot').textContent).toBe('snap')
    fireEvent.click(screen.getByText('editor-sluiten'))
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
  })
})

describe('LevensstrategieEditorsHost — URL-contract', () => {
  it.each([
    ['rij=aow', 'aow', 'false'],
    ['rij=werk', 'werk', 'false'],
    ['strategie=huis', 'huis', 'false'],
    ['rij=pensioen', 'pensioen', 'true'],
    ['strategie=pensioen', 'pensioen', 'true'],
  ])('?%s opent %s (factor-A: %s) en ruimt de param op met behoud van de hash', (q, open, jaarruimte) => {
    window.history.replaceState(null, '', `/toekomst?${q}&x=1#levensstrategieen`)
    nav.search = new URLSearchParams(`${q}&x=1`)
    render(<LevensstrategieEditorsHost snapshot={SNAP} />)
    expect(screen.getByTestId('strategie-open').textContent).toBe(open)
    expect(screen.getByTestId('strategie-jaarruimte').textContent).toBe(jaarruimte)
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/toekomst?x=1#levensstrategieen')
  })

  it('een rij van Instellingen (?rij=stopmoment) is niet van deze host', () => {
    window.history.replaceState(null, '', '/toekomst?rij=stopmoment')
    nav.search = new URLSearchParams('rij=stopmoment')
    render(<LevensstrategieEditorsHost snapshot={SNAP} />)
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
    expect(window.location.search).toBe('?rij=stopmoment')
  })

  it('met ?planreview= of ?modal= wacht de deeplink op hun eigen opruimer', () => {
    nav.search = new URLSearchParams('modal=strategie&rij=aow')
    const { rerender } = render(<LevensstrategieEditorsHost snapshot={SNAP} />)
    expect(screen.getByTestId('strategie-open').textContent).toBe('none')
    nav.search = new URLSearchParams('rij=aow')
    act(() => rerender(<LevensstrategieEditorsHost snapshot={SNAP} />))
    expect(screen.getByTestId('strategie-open').textContent).toBe('aow')
  })
})

describe('LevensstrategieEditorsHost — review 27 sep', () => {
  it('klikken gaan niet verloren zolang de snapshot nog komt; een open editor sluit niet als hij binnenkomt', async () => {
    let klaar: (s: unknown) => void = () => {}
    const belofte = new Promise<never>((r) => {
      klaar = r as (s: unknown) => void
    })
    render(
      <>
        <LevensstrategieenBlok plek="kolom" />
        <LevensstrategieEditorsHost snapshot={belofte} />
      </>,
    )
    fireEvent.click(rijKnop('aow'))
    expect(screen.getByTestId('strategie-open').textContent).toBe('aow')
    expect(screen.getByTestId('strategie-snapshot').textContent).toBe('geen')
    await act(async () => {
      klaar(SNAP)
      await belofte
    })
    expect(screen.getByTestId('strategie-open').textContent).toBe('aow')
    expect(screen.getByTestId('strategie-snapshot').textContent).toBe('snap')
  })

  it('zonder gebeurtenissen-bron rendert de host niets, maar ruimt de deeplink wel op', () => {
    bron.zonderBron = true
    window.history.replaceState(null, '', '/toekomst?rij=aow')
    nav.search = new URLSearchParams('rij=aow')
    render(<LevensstrategieEditorsHost snapshot={SNAP} />)
    expect(screen.queryByTestId('strategie-open')).toBeNull()
    expect(window.location.search).toBe('')
  })
})
