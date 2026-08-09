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
