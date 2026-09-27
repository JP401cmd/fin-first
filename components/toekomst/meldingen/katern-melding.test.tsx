import { render, screen, fireEvent, act, renderHook, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KaternMelding } from './katern-melding'
import { useKaternMeldingMinimize } from './use-katern-melding-minimize'
import type { KaternMelding as KaternMeldingData } from '@/lib/horizon/katern-meldingen'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const openWithMessage = vi.fn()
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContextOptional: () => ({ openWithMessage }),
}))

const AOW: KaternMeldingData = {
  id: 'instellingen-aow',
  katern: 'instellingen',
  ernst: 'warn',
  titel: 'Geen AOW op je tijdas',
  kort: 'AOW ontbreekt',
  uitleg: 'Er staat geen actieve AOW-gebeurtenis op je tijdas.',
  actie: { label: 'Naar je AOW-strategie', href: '/toekomst/instellingen?strategie=aow' },
}
const HUIS: KaternMeldingData = {
  id: 'instellingen-huis',
  katern: 'instellingen',
  ernst: 'neutral',
  titel: 'Je huis wordt in deze projectie nooit verkocht',
  kort: 'huis',
  actie: null,
}

describe('KaternMelding — slot', () => {
  it('toont alleen de eerste melding (hoogste ernst) uitgeklapt', () => {
    render(<KaternMelding meldingen={[AOW, HUIS]} display="expanded" onMinimize={() => {}} />)
    expect(screen.getByTestId('katern-melding-instellingen-aow')).toBeTruthy()
    expect(screen.queryByTestId('katern-melding-instellingen-huis')).toBeNull()
    // Desktop-kicker volgt de banner: warn = "Aandacht".
    expect(screen.getByText('Aandacht')).toBeTruthy()
  })

  it('de overige meldingen staan ingeklapt onder "Nog N" en blijven bereikbaar (fixronde C1 punt 1)', () => {
    const GEGEVENS: KaternMeldingData = {
      id: 'instellingen-gegevens',
      katern: 'instellingen',
      ernst: 'warn',
      titel: 'Vul je profiel aan',
      kort: 'Vul je profiel aan',
      actie: { label: 'Naar je profiel', href: '/mijn/profiel' },
    }
    render(<KaternMelding meldingen={[AOW, GEGEVENS, HUIS]} display="expanded" onMinimize={() => {}} />)
    const nog = screen.getByRole('button', { name: /Nog 2 meldingen/ })
    expect(nog.getAttribute('aria-expanded')).toBe('false')
    expect(nog.className).toContain('min-h-[44px]')
    expect(screen.queryByTestId('katern-melding-instellingen-gegevens')).toBeNull()
    expect(screen.queryByRole('link', { name: /Naar je profiel/ })).toBeNull()

    fireEvent.click(nog)
    expect(nog.getAttribute('aria-expanded')).toBe('true')
    const lijst = document.getElementById(nog.getAttribute('aria-controls')!)!
    expect(lijst).toBeTruthy()
    // Dezelfde kaart (PageStatusBannerBody compact), zonder eigen Minimaliseren.
    expect(screen.getByTestId('katern-melding-instellingen-gegevens')).toBeTruthy()
    expect(screen.getByTestId('katern-melding-instellingen-huis')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Naar je profiel/ })[0].getAttribute('href')).toBe('/mijn/profiel')
    expect(screen.getAllByRole('button', { name: 'Minimaliseren' })).toHaveLength(2) // alleen de bovenste
    // Uitklappen kondigt de live-regio niet aan: de lijst is aria-live="off".
    expect(lijst.closest('[aria-live="off"]')).toBeTruthy()

    fireEvent.click(nog)
    expect(screen.queryByTestId('katern-melding-instellingen-gegevens')).toBeNull()
  })

  it('één melding: geen "Nog"-knop; geminimaliseerd ook niet', () => {
    const { rerender } = render(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Nog / })).toBeNull()
    rerender(<KaternMelding meldingen={[AOW, HUIS]} display="minimized" onMinimize={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Nog / })).toBeNull()
  })

  it('geminimaliseerd: niets zichtbaars, wel de sr-aankondiging in de altijd gemounte live-regio', () => {
    render(<KaternMelding meldingen={[AOW]} display="minimized" onMinimize={() => {}} />)
    const regio = screen.getByRole('status')
    expect(regio.getAttribute('aria-live')).toBe('polite')
    expect(screen.queryByTestId('katern-melding-instellingen-aow')).toBeNull()
    expect(regio.textContent).toMatch(/Melding geminimaliseerd/)
  })

  it('de sr-tekst bij minimaliseren beschrijft het punt bij de kop van dít onderdeel, zonder vakwoord (C1 punt 4)', () => {
    render(<KaternMelding meldingen={[AOW]} display="minimized" onMinimize={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe(
      'Melding geminimaliseerd. Het punt op het tabblad Instellingen haalt de melding terug.',
    )
    expect(screen.getByRole('status').textContent).not.toMatch(/katern|activeer/i)
  })

  it("'none' en een lege lijst renderen alleen de lege live-regio", () => {
    const { rerender } = render(<KaternMelding meldingen={[AOW]} display="none" onMinimize={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('')
    rerender(<KaternMelding meldingen={[]} display="expanded" onMinimize={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('heropenen verschijnt in dezelfde live-regio (aangekondigd)', () => {
    const { rerender } = render(<KaternMelding meldingen={[AOW]} display="minimized" onMinimize={() => {}} />)
    const regio = screen.getByRole('status')
    rerender(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={() => {}} />)
    expect(screen.getByRole('status')).toBe(regio)
    expect(regio.textContent).toContain('Geen AOW op je tijdas')
  })

  it('mobiel: tik op de titel klapt de uitleg open en dicht (aria-expanded)', () => {
    render(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={() => {}} />)
    const titelKnop = screen.getByRole('button', { name: /Geen AOW op je tijdas/ })
    expect(titelKnop.getAttribute('aria-expanded')).toBe('false')
    expect(titelKnop.className).toContain('min-h-[44px]')
    fireEvent.click(titelKnop)
    expect(titelKnop.getAttribute('aria-expanded')).toBe('true')
    const id = titelKnop.getAttribute('aria-controls')!
    expect(document.getElementById(id)?.textContent).toBe(AOW.uitleg)
    fireEvent.click(titelKnop)
    expect(document.getElementById(id)).toBeNull()
  })

  it('zonder uitleg is de titel geen knop; zonder actie geen link', () => {
    render(<KaternMelding meldingen={[HUIS]} display="expanded" onMinimize={() => {}} />)
    expect(screen.queryByRole('button', { name: /nooit verkocht/ })).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('actie wijst naar precies één plek (mobiel en desktop dezelfde href)', () => {
    render(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={() => {}} />)
    const hrefs = new Set(screen.getAllByRole('link').map((a) => a.getAttribute('href')))
    expect([...hrefs]).toEqual(['/toekomst/instellingen?strategie=aow'])
  })

  it('een tweede actie: desktop in de actie-rij, mobiel onder de uitleg na een tik (C1 punt 6)', () => {
    const NIET_HAALBAAR: KaternMeldingData = {
      id: 'plan-niet-haalbaar',
      katern: 'plan',
      ernst: 'bad',
      titel: 'Plan nog niet haalbaar',
      kort: 'Plan nog niet haalbaar',
      actie: { label: 'Verken je opties', href: '/toekomst/doelen' },
      tweedeActie: { label: 'Stopmoment', href: '/toekomst/instellingen?regel=eindstrategie' },
    }
    render(<KaternMelding meldingen={[NIET_HAALBAAR]} display="expanded" onMinimize={() => {}} />)
    // jsdom past geen CSS toe: we tellen per breedte via de `lg:hidden`-voorouder.
    const alleenMobiel = (a: HTMLElement) => a.closest('.lg\\:hidden') != null
    const stopmoment = () => screen.getAllByRole('link', { name: /Stopmoment/ })
    // Desktop (lg-blok): precies één "Stopmoment" in de actie-rij, naast de eerste actie.
    const desktop = stopmoment().filter((a) => !alleenMobiel(a))
    expect(desktop).toHaveLength(1)
    expect(desktop[0].getAttribute('href')).toBe('/toekomst/instellingen?regel=eindstrategie')
    // Mobiel: zonder uitleg wordt de titel een knop; na een tik staat de tweede actie eronder.
    const titelKnop = screen.getByRole('button', { name: /Plan nog niet haalbaar/ })
    expect(titelKnop.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(titelKnop)
    const uitleg = document.getElementById(titelKnop.getAttribute('aria-controls')!)!
    const mobiel = within(uitleg).getByRole('link', { name: /Stopmoment/ })
    expect(mobiel.getAttribute('href')).toBe('/toekomst/instellingen?regel=eindstrategie')
    expect(mobiel.className).toContain('min-h-[44px]')
    expect(stopmoment().every((a) => a.getAttribute('href') === '/toekomst/instellingen?regel=eindstrategie')).toBe(true)
    // Elke actie wijst naar één plek: twee hrefs in totaal.
    const hrefs = new Set(screen.getAllByRole('link').map((a) => a.getAttribute('href')))
    expect([...hrefs].sort()).toEqual(['/toekomst/doelen', '/toekomst/instellingen?regel=eindstrategie'])
  })

  it('een Fin-actie als tweede: opent de chat met onderwerp, context en vraag; 44px (eigenaarsbesluit 26 sep)', () => {
    const TEKORT: KaternMeldingData = {
      id: 'plan-tekort-lening',
      katern: 'plan',
      ernst: 'warn',
      titel: 'Je plan dekt vanaf je 61e een tekort met een lening.',
      kort: 'tekort-lening',
      uitleg: 'Waarom.',
      actie: { label: 'Naar de instelling', href: '/toekomst/instellingen?regel=eindstrategie' },
      tweedeActie: { kind: 'fin', onderwerp: 'Tekort', detail: 'Context zonder bedragen.', vraag: 'Hoe komt dat?' },
    }
    render(<KaternMelding meldingen={[TEKORT]} display="expanded" onMinimize={() => {}} />)
    const alleenMobiel = (el: HTMLElement) => el.closest('.lg\\:hidden') != null
    const desktop = screen.getAllByRole('button', { name: /met Fin/ }).filter((b) => !alleenMobiel(b))
    expect(desktop).toHaveLength(1)
    expect(desktop[0].className).toContain('min-h-[44px]')
    fireEvent.click(desktop[0])
    expect(openWithMessage).toHaveBeenCalledTimes(1)
    const bericht = openWithMessage.mock.calls[0][0] as string
    expect(bericht).toContain('"Tekort"')
    expect(bericht).toContain('Context zonder bedragen.')
    expect(bericht).toContain('Hoe komt dat?')
    // Mobiel: onder de uitleg, na een tik op de titel.
    const titelKnop = screen.getByRole('button', { name: /Je plan dekt vanaf je 61e/ })
    fireEvent.click(titelKnop)
    const uitleg = document.getElementById(titelKnop.getAttribute('aria-controls')!)!
    expect(within(uitleg).getByRole('button', { name: /met Fin/ }).className).toContain('min-h-[44px]')
    // Geen tweede href: de Fin-actie is geen link.
    expect(new Set(screen.getAllByRole('link').map((a) => a.getAttribute('href')))).toEqual(
      new Set(['/toekomst/instellingen?regel=eindstrategie']),
    )
  })

  it('minimaliseren roept de host aan; canMinimize=false verbergt de knoppen', () => {
    const onMinimize = vi.fn()
    const { rerender } = render(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={onMinimize} />)
    const knoppen = screen.getAllByRole('button', { name: 'Minimaliseren' })
    expect(knoppen).toHaveLength(2) // mobiel + desktop
    expect(knoppen[0].className).toContain('touch-target')
    fireEvent.click(knoppen[0])
    expect(onMinimize).toHaveBeenCalledTimes(1)
    rerender(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={onMinimize} canMinimize={false} />)
    expect(screen.queryAllByRole('button', { name: 'Minimaliseren' })).toHaveLength(0)
  })

  it('streep in stoplichtkleur (geen accent), informatief in de horizon-toon', () => {
    const { rerender } = render(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={() => {}} />)
    expect(screen.getByTestId('katern-melding-instellingen-aow').innerHTML).toContain('bg-amber-500')
    rerender(<KaternMelding meldingen={[HUIS]} display="expanded" onMinimize={() => {}} />)
    expect(screen.getByTestId('katern-melding-instellingen-huis').innerHTML).toContain('bg-horizon-500')
  })

  it('bevat geen h1', () => {
    const { container } = render(<KaternMelding meldingen={[AOW]} display="expanded" onMinimize={() => {}} />)
    expect(container.querySelector('h1')).toBeNull()
  })
})

// ── Hook ─────────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useKaternMeldingMinimize — bestaand pref-pad per katern-route', () => {
  it('minimaliseren schrijft het niveau onder de katern-route; heropenen schrijft null', async () => {
    const { result } = renderHook(() => useKaternMeldingMinimize({ katern: 'instellingen', hoogsteErnst: 'warn' }))
    expect(result.current.display).toBe('expanded')
    await act(async () => {
      result.current.minimize()
    })
    expect(result.current.display).toBe('minimized')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/overzicht/page-status')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ route: '/toekomst/instellingen', level: 'warn' })
    await act(async () => {
      result.current.restore()
    })
    expect(result.current.display).toBe('expanded')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ route: '/toekomst/instellingen', level: null })
  })

  it('informatief minimaliseert op info; plan-katern gebruikt /toekomst', async () => {
    const { result } = renderHook(() => useKaternMeldingMinimize({ katern: 'plan', hoogsteErnst: 'neutral' }))
    await act(async () => {
      result.current.minimize()
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ route: '/toekomst', level: 'info' })
  })

  it('server-seed start geminimaliseerd zonder fetch; escalatie klapt weer uit', () => {
    const { result, rerender } = renderHook(
      ({ ernst }: { ernst: 'warn' | 'bad' }) =>
        useKaternMeldingMinimize({ katern: 'doelen', hoogsteErnst: ernst, initialLevel: 'warn' }),
      { initialProps: { ernst: 'warn' } },
    )
    expect(result.current.display).toBe('minimized')
    expect(fetchMock).not.toHaveBeenCalled()
    rerender({ ernst: 'bad' })
    expect(result.current.display).toBe('expanded')
  })

  it('een nieuwe server-seed wint van de lokale stand', () => {
    const { result, rerender } = renderHook(
      ({ seed }: { seed: 'warn' | null }) =>
        useKaternMeldingMinimize({ katern: 'plan', hoogsteErnst: 'warn', initialLevel: seed }),
      { initialProps: { seed: null as 'warn' | null } },
    )
    expect(result.current.display).toBe('expanded')
    rerender({ seed: 'warn' })
    expect(result.current.display).toBe('minimized')
    rerender({ seed: null })
    expect(result.current.display).toBe('expanded')
  })

  it('zonder melding: none, en minimaliseren doet niets', async () => {
    const { result } = renderHook(() => useKaternMeldingMinimize({ katern: 'plan', hoogsteErnst: null }))
    expect(result.current.display).toBe('none')
    await act(async () => {
      result.current.minimize()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rolt terug wanneer de PUT faalt (ok:false en netwerkfout)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => useKaternMeldingMinimize({ katern: 'plan', hoogsteErnst: 'bad' }))
    await act(async () => {
      result.current.minimize()
    })
    expect(result.current.display).toBe('expanded')
    fetchMock.mockRejectedValueOnce(new Error('netwerk'))
    await act(async () => {
      result.current.minimize()
    })
    expect(result.current.display).toBe('expanded')
  })

  it('gebruikt geen localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useKaternMeldingMinimize({ katern: 'plan', hoogsteErnst: 'warn' }))
    await act(async () => {
      result.current.minimize()
    })
    expect(setItem).not.toHaveBeenCalled()
  })
})
