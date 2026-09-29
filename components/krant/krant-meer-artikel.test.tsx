/**
 * /krant/meer — de weg omhoog naar het Geheel (Krant 2D fase 1, besluit B12).
 *
 * Wat hier vastligt:
 *  - de koppen: een h2 als aanhef (PageOpening), secties h2, onderdelen h3 — en
 *    nergens een h1 (ADR 0110: de shell draagt de enige h1);
 *  - de kopij blijft beschrijvend: geen AI-claim, geen prijs of eurobedrag,
 *    geen "bespaar"/adviestaal, geen koop-metafoor (ADR 0165) — óók niet in de
 *    info-knop of de bevestiging;
 *  - de knop opent eerst een bevestiging; pas "Aanzetten" doet
 *    PUT /api/modules met product 'geheel' en navigeert daarna naar /overzicht;
 *  - een account met het volledige TriFinity krijgt geen knop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { KrantMeerArtikel, GEHEEL_ONDERDELEN } from './krant-meer-artikel'
import { MeerTriFinityKnop, NA_OVERSTAP_HREF } from './meer-trifinity-knop'
import { getPageInfo } from '@/lib/page-info-content'

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true, modules: [], homeScreen: 'overzicht' }), { status: 200 }),
    ),
  )
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Woorden en tekens die niet in deze kopij horen. */
const VERBODEN: Array<[string, RegExp]> = [
  ['AI-claim', /\bAI\b/],
  ['eurobedrag', /€/],
  // "per maand" mag (het budget gaat over maanden); een tarief ("/maand",
  // "abonnement", "kosten") niet.
  ['prijs', /\bprijs|\/\s?maand|abonnement|\bkost(en|t)\b|\bbetaal/i],
  ['gratis', /\bgratis\b/i],
  ['bespaar-taal', /bespa(a)?r/i],
  ['adviestaal', /\badvies|adviseer|je moet|zou moeten|raden (we|wij) aan/i],
  ['koop-metafoor (ADR 0165)', /vrijgekocht|terugkop|vrijkop|gekochte tijd/i],
  ['belofte', /gegarandeerd|garantie|beloven/i],
]

function toetsKopij(tekst: string) {
  for (const [naam, patroon] of VERBODEN) {
    expect(tekst, `${naam} in: ${tekst}`).not.toMatch(patroon)
  }
}

describe('KrantMeerArtikel — koppen', () => {
  it('opent met een h2, secties h2, onderdelen h3 — en geen h1', () => {
    const { container } = render(<KrantMeerArtikel isKrant />)

    expect(container.querySelector('h1')).toBeNull()
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2s[0]).toContain('je eigen geld')
    expect(h2s).toEqual(expect.arrayContaining(['Wat je dan ziet', 'Wat er verandert']))
    const h3s = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(h3s).toEqual(GEHEEL_ONDERDELEN.map((o) => o.titel))
  })
})

describe('KrantMeerArtikel — kopij binnen de grens', () => {
  it('de pagina zelf: geen AI, prijs, eurobedrag, bespaar- of adviestaal', () => {
    const { container } = render(<KrantMeerArtikel isKrant />)
    toetsKopij(container.textContent ?? '')
  })

  it('de info-knop (page-info /krant/meer) houdt dezelfde grens', () => {
    const info = getPageInfo('/krant/meer')
    toetsKopij(`${info.insight} ${info.grip}`)
  })

  it('de bevestiging houdt dezelfde grens', () => {
    render(<MeerTriFinityKnop navigeer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Meer TriFinity' }))
    toetsKopij(screen.getByRole('dialog').textContent ?? '')
  })

  it('noemt "er wordt niets gewist" en de weg terug via support', () => {
    const { container } = render(<KrantMeerArtikel isKrant />)
    const tekst = container.textContent ?? ''
    expect(tekst).toContain('Er wordt niets gewist')
    expect(tekst).toContain('via support')
  })
})

describe('MeerTriFinityKnop — bevestigen en omzetten', () => {
  it('de knop opent eerst een bevestiging en schrijft nog niets', () => {
    render(<KrantMeerArtikel isKrant />)
    fireEvent.click(screen.getByRole('button', { name: 'Meer TriFinity' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Meer TriFinity aanzetten?')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("Aanzetten → PUT /api/modules met product 'geheel', daarna naar /overzicht", async () => {
    const navigeer = vi.fn()
    render(<MeerTriFinityKnop navigeer={navigeer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Meer TriFinity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aanzetten' }))

    await vi.waitFor(() => expect(navigeer).toHaveBeenCalledWith(NA_OVERSTAP_HREF))
    expect(NA_OVERSTAP_HREF).toBe('/overzicht')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/modules')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ product: 'geheel' })
  })

  it('bij een fout blijft de bevestiging open met de melding, en er wordt niet genavigeerd', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Er ging iets mis' }), { status: 500 })),
    )
    const navigeer = vi.fn()
    render(<MeerTriFinityKnop navigeer={navigeer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Meer TriFinity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aanzetten' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Er ging iets mis')
    expect(navigeer).not.toHaveBeenCalled()
  })

  it('een account met het volledige TriFinity krijgt geen knop', () => {
    render(<KrantMeerArtikel isKrant={false} />)
    expect(screen.queryByRole('button', { name: 'Meer TriFinity' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Naar je overzicht' })).toHaveAttribute('href', '/overzicht')
  })
})
