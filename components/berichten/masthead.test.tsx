/**
 * NWS-1 — de krant-masthead in Eenvoudig: datum + "N artikelen", zonder
 * editienummer, jaargang of de bronartikelen-grondslag. In Volledig blijft de
 * volledige colofon staan.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §7 (/berichten & /nieuws).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Masthead } from './masthead'

describe('Masthead — hideEdition (NWS-1)', () => {
  afterEach(cleanup)

  it('toont editie + jaargang wanneer hideEdition uit staat', () => {
    render(<Masthead editionNr={12} jaargang={2} articleCount={5} />)
    expect(screen.getByText('Jaargang 2 · Editie 12')).toBeInTheDocument()
  })

  it('laat editie + jaargang weg wanneer hideEdition aan staat', () => {
    render(<Masthead editionNr={12} jaargang={2} articleCount={5} hideEdition />)
    expect(screen.queryByText(/Editie/)).toBeNull()
    expect(screen.queryByText(/Jaargang/)).toBeNull()
  })

  it('houdt datum en artikel-telling wél in beeld', () => {
    render(
      <Masthead editionNr={12} jaargang={2} articleCount={5} dateline="maandag 9 augustus 2026" hideEdition />,
    )
    expect(screen.getByText('Maandag 9 augustus 2026')).toBeInTheDocument()
    expect(screen.getByText(/5 artikelen/)).toBeInTheDocument()
  })

  it('laat een expliciete metaLeft (berichtencentrum) altijd winnen', () => {
    render(<Masthead metaLeft="3 ongelezen" editionNr={12} hideEdition />)
    expect(screen.getByText('3 ongelezen')).toBeInTheDocument()
  })
})

/**
 * ADR 0110 — binnen de app-shell draagt `mobile-stack-shell.tsx` de enige
 * <h1> (de sr-only paginanaam). Deze masthead rendert op /berichten, /nieuws
 * en het nieuwsarchief, allemaal ín die shell; hij droeg daar een tweede
 * <h1> ("TriFinity ."), dezelfde klasse als UR3-17 #26 op de check-in.
 * De gate `npm run check:headings` vangt een terugval ook, maar die kijkt naar
 * de bronregel — deze toets kijkt naar wat er werkelijk gerenderd wordt.
 */
describe('Masthead — koppenconventie (ADR 0110)', () => {
  afterEach(cleanup)

  it('rendert de wordmark als h2, niet als h1', () => {
    render(<Masthead editionNr={12} jaargang={2} />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('TriFinity')
  })
})

/**
 * Snelheid E (CLS op mobiel) — op /nieuws komt de colofon pas na een
 * client-fetch binnen. Met `reserveColophon` staat de regel al in de eerste
 * render, met een vaste hoogte (2 regels op xs, 1 vanaf sm), zodat hij de
 * pagina daarna niet meer omlaag duwt.
 */
describe('Masthead — gereserveerde colofon (Snelheid E, CLS)', () => {
  afterEach(cleanup)

  it('rendert zonder reservering en zonder gegevens geen colofonregel (ongewijzigd)', () => {
    render(<Masthead editionNr={12} />)
    expect(screen.queryByTestId('masthead-colophon')).toBeNull()
  })

  it('reserveert de colofon-hoogte al vóór er gegevens zijn', () => {
    render(<Masthead editionNr={12} reserveColophon />)
    const colophon = screen.getByTestId('masthead-colophon')
    expect(colophon).toHaveTextContent('')
    expect(colophon).toHaveAttribute('aria-hidden', 'true')
    expect(colophon.className).toContain('min-h-[28px]')
    expect(colophon.className).toContain('sm:min-h-[14px]')
    expect(colophon.className).toContain('leading-[14px]')
  })

  it('houdt dezelfde hoogte als de gegevens binnenkomen', () => {
    render(<Masthead editionNr={12} reserveColophon articleCount={5} sourceNote="Gebaseerd op 38 bronartikelen" />)
    const colophon = screen.getByTestId('masthead-colophon')
    expect(colophon).toHaveTextContent(/5 artikelen/)
    expect(colophon).not.toHaveAttribute('aria-hidden')
    expect(colophon.className).toContain('min-h-[28px]')
  })
})
