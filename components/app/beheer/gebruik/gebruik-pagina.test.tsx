/**
 * Presentatielaag van /beheer/gebruik (ADR 0153). De database-functie staat
 * nog niet overal, dus de pagina wordt hier getest op een handgemaakt
 * view-model. Vastgelegd: de drie staten, dat onderdrukte cellen nooit als 0 of
 * als balk verschijnen, dat kleur de indeling volgt en niet de rangorde, dat
 * percentages exact de canonieke `aandeel()` volgen mét noemer, de
 * cohortmarkeringen en het koppencontract (geen h1, niets overgeslagen).
 */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { aandeel } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { GEBRUIK_BANDEN } from '@/lib/beheer/gebruik-analyse/loader'
import { GebruikPagina, gebruikHref } from './gebruik-pagina'
import { maakFixture, w } from './fixture'

function renderOk(mut?: (d: ReturnType<typeof maakFixture>) => void) {
  const data = maakFixture()
  mut?.(data)
  return { data, ...render(<GebruikPagina resultaat={{ status: 'ok', data }} />) }
}

describe('GebruikPagina — staten', () => {
  it('niet-uitgerold: nette lege staat, geen kerncijfers en geen nullen, filters blijven werken', () => {
    const { container } = render(
      <GebruikPagina resultaat={{ status: 'niet-uitgerold', vensterDagen: 30, intern: true }} />,
    )
    expect(screen.getByTestId('staat-niet-uitgerold')).toHaveTextContent('Nog niet uitgerold')
    expect(screen.queryByText('Wie gebruikt de app')).toBeNull()
    expect(container.querySelector('svg[role="img"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Laatste 30 dagen' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Alleen intern' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '30–89 dagen geleden' })).toHaveAttribute('href', '/beheer/gebruik?dagen=90&intern=1')
    expect(screen.getByRole('link', { name: '90–364 dagen geleden' })).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('link', { name: '30 dagen' })).toBeNull()
    expect(screen.getByTestId('banden-uitleg')).toHaveTextContent('Banden overlappen niet')
    expect(screen.getByTestId('nog-niet-gemeten')).toHaveTextContent('ADR 0154')
  })

  it('fout: foutstaat, geen cijfers', () => {
    render(<GebruikPagina resultaat={{ status: 'fout', vensterDagen: 90, intern: false }} />)
    expect(screen.getByTestId('staat-fout')).toBeInTheDocument()
    expect(screen.queryByTestId('staat-niet-uitgerold')).toBeNull()
    expect(screen.queryByText('Wie gebruikt de app')).toBeNull()
  })

  it('bouwt filterlinks zonder intern-parameter voor het standaardsegment', () => {
    expect(gebruikHref(365, false)).toBe('/beheer/gebruik?dagen=365')
    expect(gebruikHref(30, true)).toBe('/beheer/gebruik?dagen=30&intern=1')
  })
})

describe('GebruikPagina — inhoud', () => {
  it('toont het meetbereik als leesbare ISO-week', () => {
    renderOk()
    const regel = screen.getByTestId('gemeten-sinds')
    expect(regel).toHaveTextContent('week 30, 2026')
    expect(regel).toHaveTextContent('week 38, 2026')
    expect(screen.getByRole('link', { name: 'Extern' })).toHaveAttribute('aria-current', 'page')
  })

  it('kerncijfers per band: segment, actief en nieuw in deze band; geen vaste vandaag/7/30-tegels meer', () => {
    const { data } = renderOk()
    expect(screen.queryByText('Actief vandaag')).toBeNull()
    expect(screen.queryByText(/Actief, 7 dagen/)).toBeNull()

    const a = aandeel(data.kerncijfers.actiefVenster, data.kerncijfers.segmentTotaal)!
    const actief = screen.getByText('Actief in deze band').parentElement!
    expect(actief).toHaveTextContent('77')
    expect(actief).toHaveTextContent('30–89 dagen geleden')
    expect(actief).toHaveTextContent(`${Math.round(a.fractie * 100)}% van 120 in het segment`)
    const nieuw = screen.getByText('Nieuw in deze band').parentElement!
    expect(nieuw).toHaveTextContent('31')
    expect(nieuw).toHaveTextContent('30–89 dagen geleden')
  })

  it('laatst actief: balken per moment, onderdrukte cel nooit als balk of 0, band-onafhankelijk', () => {
    renderOk()
    const lijst = screen.getByTestId('laatst-actief-balken')
    expect(within(lijst).getAllByRole('listitem').map((li) => li.querySelector('span')?.textContent)).toEqual([
      'Vandaag',
      '1–6 dagen geleden',
      '7–29 dagen geleden',
      '30–89 dagen geleden',
      '90 dagen of langer geleden',
      'Nooit (in de bewaartermijn)',
    ])
    const vandaag = within(lijst).getByText('Vandaag').closest('li')!
    expect(vandaag).toHaveTextContent('verborgen')
    expect(vandaag.querySelector('[data-soort="waarde"]')).toBeNull()
    expect(vandaag.querySelector('[data-soort="verborgen"]')).not.toBeNull()
    const kl = within(lijst).getByText('30–89 dagen geleden').closest('li')!
    expect(kl).toHaveTextContent('< 5')
    expect(kl).not.toHaveTextContent('%')
    expect(screen.getByText(/hangt niet van de gekozen band af/)).toBeInTheDocument()
    expect(screen.getByText('Actief per week in deze band')).toBeInTheDocument()
  })

  it('ritme: band 30 met ritme 30 → "band ligt te dichtbij voor dit ritme"; band 90 toont het percentage', () => {
    renderOk((d) => {
      d.vensterDagen = 30
      d.band = GEBRUIK_BANDEN[30]
    })
    const vermogen = screen.getByTestId('ritme-vermogen')
    expect(within(vermogen).getByTestId('band-te-dichtbij')).toHaveTextContent('band ligt te dichtbij voor dit ritme')
    expect(vermogen).not.toHaveTextContent('%')
    // Budget (ritme 7) past wél in band 30.
    expect(within(screen.getByTestId('ritme-budget')).queryByTestId('band-te-dichtbij')).toBeNull()
  })

  it('small multiples: één paneel per stroom, gedeelde schaal, onderdrukte weken gearceerd over de volle hoogte', () => {
    const { container } = renderOk()
    const panelen = within(screen.getByTestId('stroom-small-multiples')).getAllByRole('listitem')
    expect(panelen).toHaveLength(5)
    // Gedeelde schaal: grootste zichtbare stroomwaarde 27 → as 0–50 in élk paneel.
    expect(screen.getByText(/Gedeelde schaal: 0 tot 50 gebruikers/)).toBeInTheDocument()

    const grip = container.querySelector('[data-testid="weekkolommen-stroom-grip"]')!
    const markeringen = grip.querySelectorAll('rect[data-soort]')
    expect([...markeringen].map((r) => r.getAttribute('data-soort'))).toEqual(['klein', 'verborgen'])
    for (const r of markeringen) {
      expect(r.getAttribute('y')).toBe('0')
      expect(r.getAttribute('fill')).toMatch(/^url\(#arcering-/)
    }
    // Een 0-week tekent geen balk, maar heeft wel een tooltip.
    const vermogen = container.querySelector('[data-testid="weekkolommen-stroom-vermogen"]')!
    expect(vermogen.querySelectorAll('rect[data-soort="waarde"]')).toHaveLength(2)
    expect([...vermogen.querySelectorAll('title')].map((t) => t.textContent)).toContain('week 37, 2026: 0 gebruikers')
  })

  it('kleur volgt kleurIndex, niet de rangorde', () => {
    const { container } = renderOk((d) => {
      // Fin staat op positie 4 maar krijgt hier de grootste aantallen.
      d.stroomWeken[4].weken[2].actief = w(40)
    })
    const fin = container.querySelector('[data-testid="weekkolommen-stroom-fin"] rect[data-soort="waarde"]')!
    expect(fin.getAttribute('fill')).toBe('var(--beheer-reeks-5)')
    const vermogen = container.querySelector('[data-testid="weekkolommen-stroom-vermogen"] rect[data-soort="waarde"]')!
    expect(vermogen.getAttribute('fill')).toBe('var(--beheer-reeks-1)')
    // Geen instelbare accenten en geen stoplicht in de grafieken.
    expect(container.innerHTML).not.toMatch(/--color-(kern|wil|horizon|fin)-|--module-active-500[^)]*\)" data-soort|text-positive|text-negative/)
  })

  it('dominante stroom: "geen" als eigen rij, verborgen cel zonder balk', () => {
    renderOk()
    const lijst = screen.getByTestId('dominant-balken')
    const geen = within(lijst).getByText('Geen dominante stroom').closest('li')!
    expect(geen).toHaveTextContent('6')
    const budget = within(lijst).getByText('Budget').closest('li')!
    expect(budget).toHaveTextContent('verborgen')
    expect(budget.querySelector('[data-soort="waarde"]')).toBeNull()
    expect(budget.querySelector('[data-soort="verborgen"]')).not.toBeNull()
    // Een echte 0 tekent geen balk, maar blijft "0".
    const fin = within(lijst).getByText('Fin').closest('li')!
    expect(fin.querySelector('[data-soort]')).toBeNull()
    expect(fin).toHaveTextContent('0')
  })

  it('overlap benoemt "alle stromen"', () => {
    renderOk()
    expect(within(screen.getByTestId('overlap-balken')).getByText('Alle 5 stromen')).toBeInTheDocument()
  })

  it('ritme: percentage met n en waarschuwing; stroom zonder ritme toont alleen de mediaan', () => {
    const { data } = renderOk()
    const vermogen = screen.getByTestId('ritme-vermogen')
    const a = aandeel(data.ritme[0].terug!, data.ritme[0].geschikt)!
    expect(vermogen).toHaveTextContent(`${Math.round(a.fractie * 100)}%`)
    expect(vermogen).toHaveTextContent('10 van 25')
    expect(vermogen).toHaveTextContent('n < 40')
    expect(vermogen).toHaveTextContent('12,5 dagen')

    const toekomst = screen.getByTestId('ritme-toekomst')
    expect(toekomst).toHaveTextContent('geen terugkeerritme verwacht')
    expect(toekomst).not.toHaveTextContent('%')
    expect(toekomst).toHaveTextContent('41 dagen')

    const budget = screen.getByTestId('ritme-budget')
    expect(budget).toHaveTextContent('< 5 van 9')
    expect(budget).not.toHaveTextContent('%')
    expect(budget).toHaveTextContent('te weinig gebruikers')
  })

  it('doorstroom: de losse stroom→stroom-matrix is weg (zijn nullen pinden Sankey-cellen vast)', () => {
    renderOk()
    expect(screen.queryByTestId('doorstroom-matrix')).toBeNull()
  })

  it('samen: paren gesorteerd, meeste eerst, onderdrukt achteraan', () => {
    renderOk()
    const items = within(screen.getByTestId('samen-paren')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Overzicht + Toekomst'),
      expect.stringContaining('Budget en transacties + Overzicht'),
      expect.stringContaining('Grip + Overzicht'),
    ])
  })

  it('levenscyclus: "Eerder" vóór de meting, "deels gemeten", "nog niet verstreken" — nooit een nul-percentage', () => {
    renderOk()
    const eerder = screen.getByTestId('cohort-eerder')
    expect(eerder).toHaveTextContent('Eerder')
    expect(within(eerder).getByTestId('voor-de-meting')).toHaveTextContent('vóór de meting')
    expect(eerder).not.toHaveTextContent('0%')

    const juli = screen.getByTestId('cohort-2026-07')
    expect(juli).toHaveTextContent('juli 2026')
    expect(within(juli).getByTestId('deels-gemeten')).toBeInTheDocument()
    expect(juli).toHaveTextContent('92% van 12 gemeten') // 11/12
    expect(juli).toHaveTextContent('< 5')
    expect(juli).toHaveTextContent('verborgen')

    const sep = screen.getByTestId('cohort-2026-09')
    expect(within(sep).getAllByTestId('nog-niet-verstreken')).toHaveLength(2)
    expect(sep).toHaveTextContent('90% van 31') // 28/31
  })

  it('levenscyclus: een maand zonder aanmelders krijgt "—", niet "nog niet verstreken" (eindreview B)', () => {
    renderOk((d) => {
      d.cohorten.splice(1, 0, {
        maand: '2026-08',
        dekking: 'geen',
        aangemeld: w(0),
        onboardingAfgerond: w(0),
        gemeten: w(0),
        eersteDag: w(0),
        tweedeDag: w(0),
        week25Noemer: w(0),
        week25: w(0),
        maand2Noemer: w(0),
        maand2: w(0),
      })
      d.cohorten.push({
        maand: '2026-10',
        dekking: 'volledig',
        aangemeld: w(8),
        onboardingAfgerond: w(6),
        gemeten: w(0),
        eersteDag: w(0),
        tweedeDag: w(0),
        week25Noemer: w(0),
        week25: w(0),
        maand2Noemer: w(0),
        maand2: w(0),
      })
    })
    const aug = screen.getByTestId('cohort-2026-08')
    expect(within(aug).queryByTestId('nog-niet-verstreken')).toBeNull()
    expect(aug).toHaveTextContent('—')
    // Wel aanmelders maar niemand gemeten: ook dan geen "nog niet verstreken".
    const okt = screen.getByTestId('cohort-2026-10')
    expect(within(okt).queryByTestId('nog-niet-verstreken')).toBeNull()
  })

  it('percentages onder n = 40 dragen overal de waarschuwing, ook in staafverdelingen en kerncijfers (eindreview A)', () => {
    renderOk((d) => {
      d.kerncijfers.segmentTotaal = w(22)
      d.eersteErvaring.totaal = w(22)
      d.eersteErvaring.gids = {
        totaal: w(22),
        verdeling: [
          { stand: 'niet_gestart', gebruikers: w(16) },
          { stand: 'afgesloten', gebruikers: w(6) },
          { stand: '0_stappen', gebruikers: w(0) },
          { stand: '1_3_stappen', gebruikers: w(0) },
          { stand: '4_plus_stappen', gebruikers: w(0) },
        ],
      }
    })
    expect(within(screen.getByTestId('gids-balken')).getByText(/73% van 22 \(n < 40, lees als richting\)/)).toBeInTheDocument()
    // Geen enkel "x% van n" met n < 40 zonder waarschuwing op de hele pagina.
    const tekst = document.body.textContent ?? ''
    for (const m of tekst.matchAll(/\d+% van (\d+)(?:\s+\S+)?/g)) {
      const n = Number(m[1])
      if (n < 40) expect(tekst.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 40)).toMatch(/n < 40/)
    }
  })

  it('eerste ervaring: labels, gids-kanttekening en uitgestelde velden', () => {
    renderOk()
    expect(within(screen.getByTestId('rondleiding-balken')).getByText('Nog tegoed')).toBeInTheDocument()
    expect(within(screen.getByTestId('gids-balken')).getByText('4 of meer stappen')).toBeInTheDocument()
    expect(screen.getByText(/“Afgerond” is niet uit de database te bepalen/)).toBeInTheDocument()
    expect(within(screen.getByTestId('uitgesteld-balken')).getByText('Inkomen')).toBeInTheDocument()
    expect(within(screen.getByTestId('weergave-balken')).getByText('Eenvoudig')).toBeInTheDocument()
    const checkin = screen.getByText('Minstens één check-in').parentElement!
    expect(checkin).toHaveTextContent('< 5')
    expect(checkin).not.toHaveTextContent('%')
  })

  it('lege data: lege staten per sectie in plaats van nullen', () => {
    renderOk((d) => {
      d.weektrend = []
      d.stroomWeken = []
      d.cohorten = []
      d.samen.paren = []
    })
    expect(screen.getByText('Nog geen weken met metingen in deze band.')).toBeInTheDocument()
    expect(screen.getByText('Nog geen stroomactiviteit gemeten in deze band.')).toBeInTheDocument()
    expect(screen.getByText('Nog geen aanmeldcohorten in dit segment.')).toBeInTheDocument()
  })

  it('elke grafiek heeft een tabelweergave en de regels staan onderaan', () => {
    const { container } = renderOk()
    expect(container.querySelectorAll('details').length).toBeGreaterThanOrEqual(3)
    const regels = screen.getByTestId('regels')
    expect(regels).toHaveTextContent('k = 5')
    expect(regels).toHaveTextContent('@test.trifinity.nl')
  })

  it('koppencontract: geen h1, precies één h2, en geen overgeslagen niveau', () => {
    const { container } = renderOk()
    expect(container.querySelector('h1')).toBeNull()
    expect(container.querySelectorAll('h2')).toHaveLength(1)
    const niveaus = [...container.querySelectorAll('h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]))
    for (let i = 1; i < niveaus.length; i++) {
      expect(niveaus[i] - niveaus[i - 1]).toBeLessThanOrEqual(1)
    }
  })
})
