/**
 * Sankey "van actieve dag naar actieve dag" op /beheer/gebruik (ADR 0153).
 * Vastgelegd: zichtbare overgang → banden met tooltip en kleur van de van-knoop;
 * verborgen overgang → gearceerde zone en géén banden; onderdrukte knopen nooit
 * geschaald of als 0; stopt als neutraal stompje; de staten; koppencontract.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GebruikPagina } from './gebruik-pagina'
import { maakFixture, maakSankeyFixture } from './fixture'

function renderMet(sankey: ReturnType<typeof maakFixture>['sankey']) {
  const data = maakFixture()
  data.sankey = sankey
  return render(<GebruikPagina resultaat={{ status: 'ok', data }} />)
}

describe('DoorstroomSankey', () => {
  it('zichtbare overgang dag 1 → 2: banden met tooltip, kleur van de van-knoop', () => {
    renderMet({ status: 'ok', data: maakSankeyFixture() })
    const sankey = screen.getByTestId('sankey')
    const banden = sankey.querySelectorAll('path[data-testid="sankey-band"]')
    // vermogen→vermogen, vermogen→budget, toekomst→toekomst, toekomst→vermogen, toekomst→meerdere, meerdere→geen
    expect(banden).toHaveLength(6)
    const titels = [...banden].map((b) => b.querySelector('title')?.textContent)
    expect(titels).toContain('Vermogen → Budget: 5 gebruikers')
    const vermogenBudget = [...banden].find((b) => b.querySelector('title')?.textContent === 'Vermogen → Budget: 5 gebruikers')!
    expect(vermogenBudget.getAttribute('fill')).toBe('var(--beheer-reeks-1)')
    // Een 0-overgang (budget → budget) tekent geen band.
    expect(titels.some((t) => t?.startsWith('Budget → Budget'))).toBe(false)
  })

  it('stopt is een neutraal inkt-stompje met aantal in de tooltip, geen stoplichtkleur', () => {
    renderMet({ status: 'ok', data: maakSankeyFixture() })
    const stompjes = screen.getByTestId('sankey').querySelectorAll('rect[data-testid="sankey-stopt"]')
    expect(stompjes.length).toBe(4)
    for (const s of stompjes) expect(s.getAttribute('fill')).toBe('url(#sankey-stopt)')
    expect([...stompjes].map((s) => s.querySelector('title')?.textContent)).toContain(
      'Budget, dag 1: 10 gebruikers stopt (geen volgende actieve dag)',
    )
    expect(screen.getByTestId('sankey').innerHTML).not.toMatch(/--(positive|negative|score-bad|color-(kern|wil|horizon|fin))/)
  })

  it('verborgen overgang: gearceerde zone met uitleg en géén banden tussen die kolommen', () => {
    renderMet({ status: 'ok', data: maakSankeyFixture() })
    const zone = screen.getByTestId('sankey-verborgen-2')
    expect(zone).toHaveTextContent('doorstroom verborgen')
    expect(zone).toHaveTextContent('(te weinig gebruikers)')
    expect(screen.getByTestId('sankey-verborgen-3')).toBeInTheDocument()
    expect(screen.queryByTestId('sankey-verborgen-1')).toBeNull()

    // Nu ook 1 → 2 verborgen: dan bestaat er geen enkele band meer.
    const d = maakSankeyFixture()
    d.overgangen[0] = { vanStap: 1, zichtbaar: false, cellen: [] }
    const { container } = renderMet({ status: 'ok', data: d })
    const tweede = container.querySelectorAll('[data-testid="sankey"]')
    expect(tweede[tweede.length - 1].querySelectorAll('path[data-testid="sankey-band"]')).toHaveLength(0)
  })

  it('onderdrukte knopen: vaste gearceerde balk met label, nooit geschaald of als 0', () => {
    renderMet({ status: 'ok', data: maakSankeyFixture() })
    const sankey = screen.getByTestId('sankey')
    const knoop = within(sankey).getByTestId('sankey-knoop-3-vermogen')
    expect(knoop).toHaveTextContent('Vermogen · verborgen')
    const balk = knoop.querySelector('rect')!
    expect(balk.getAttribute('data-soort')).toBe('verborgen')
    expect(balk.getAttribute('fill')).toBe('url(#sankey-arcering)')
    expect(balk.getAttribute('height')).toBe('10')
    // Alle onderdrukte knopen dezelfde vaste hoogte, ongeacht de dag.
    const onderdrukt = sankey.querySelectorAll('rect[data-soort="verborgen"], rect[data-soort="klein"]')
    expect(onderdrukt.length).toBe(10)
    for (const r of onderdrukt) expect(r.getAttribute('height')).toBe('10')
    // Knopen met 0 gebruikers worden niet getekend.
    expect(within(sankey).queryByTestId('sankey-knoop-1-grip')).toBeNull()
    // Kolomkop draagt het totaal via celTekst.
    expect(sankey.querySelector('svg')!.textContent).toContain('Dag 4')
    expect(sankey.querySelector('svg')!.textContent).toContain('totaal verborgen')
  })

  it('één schaal: dezelfde waarde heeft in elke kolom dezelfde hoogte', () => {
    renderMet({ status: 'ok', data: maakSankeyFixture() })
    const sankey = screen.getByTestId('sankey')
    const h = (id: string) => Number(within(sankey).getByTestId(id).querySelector('rect')!.getAttribute('height'))
    // meerdere = 6 op dag 1 en dag 2
    expect(h('sankey-knoop-1-_meerdere')).toBeCloseTo(h('sankey-knoop-2-_meerdere'))
    expect(h('sankey-knoop-1-toekomst')).toBeGreaterThan(h('sankey-knoop-2-toekomst'))
  })

  it('dagenverdeling als balken met aandeel en tabelweergave met verborgen overgang', () => {
    renderMet({ status: 'ok', data: maakSankeyFixture() })
    const dagen = screen.getByTestId('sankey-dagen')
    expect(within(dagen).getByText('5 of meer dagen')).toBeInTheDocument()
    expect(dagen).toHaveTextContent('39% van 77') // 30/77
    const sankey = screen.getByTestId('sankey')
    expect(within(sankey).getAllByText('doorstroom verborgen (te weinig gebruikers)').length).toBe(2)
  })

  it('staten: niet-uitgerold en fout laten de rest van de sectie staan', () => {
    renderMet({ status: 'niet-uitgerold' })
    expect(screen.getByTestId('sankey-niet-uitgerold')).toHaveTextContent('Doorstroom per dag: nog niet uitgerold')
    expect(screen.queryByTestId('sankey')).toBeNull()
    expect(screen.getByTestId('samen-paren')).toBeInTheDocument()
  })

  it('staat fout: korte foutregel, de rest van de sectie blijft', () => {
    renderMet({ status: 'fout' })
    expect(screen.getByTestId('sankey-fout')).toBeInTheDocument()
    expect(screen.getByTestId('samen-paren')).toBeInTheDocument()
  })

  it('koppencontract met Sankey: geen h1, geen overgeslagen niveau', () => {
    const { container } = renderMet({ status: 'ok', data: maakSankeyFixture() })
    expect(container.querySelector('h1')).toBeNull()
    const niveaus = [...container.querySelectorAll('h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]))
    expect(niveaus[0]).toBe(2)
    for (let i = 1; i < niveaus.length; i++) expect(niveaus[i] - niveaus[i - 1]).toBeLessThanOrEqual(1)
    expect(screen.getByText(/fase 2 \(ADR 0154/)).toBeInTheDocument()
  })
})
