import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LevensinkomenStrook, type CoverageNodeView } from './levensinkomen-strook'

/**
 * Mobiele breedte (fixronde C3, punt 1). Zestien knopen van 36 t/m 99 passen niet
 * op 360–390px: de rij duwde `main.scrollWidth` naar 712 en liet de hele pagina
 * horizontaal scrollen. De rij scrollt nu binnen de kaart, en elke knoop houdt
 * een raakgebied van 44px. jsdom rekent geen layout, dus we toetsen de klassen die
 * dat gedrag dragen — de visuele hercontrole toetst de gemeten breedte.
 */

const nodes: CoverageNodeView[] = Array.from({ length: 16 }, (_, i) => ({
  age: 36 + Math.round((i * 63) / 15),
  coveragePct: 100,
  status: 'green',
}))

describe('LevensinkomenStrook op een smal scherm', () => {
  it('laat de knoppenrij binnen de kaart scrollen, niet de pagina', () => {
    render(<LevensinkomenStrook nodes={nodes} activeAge={null} />)
    const rij = screen.getByRole('group', { name: 'Dekking per leeftijd' })
    const scroller = rij.parentElement as HTMLElement
    expect(scroller.className).toContain('overflow-x-auto')
    // De rij krimpt niet onder zijn inhoud: anders persen 16 knoppen zich tot
    // onleesbare smalle kolommen in plaats van te scrollen.
    expect(rij.className).toContain('min-w-max')
  })

  it('geeft elke knoop een raakgebied van minstens 44px', () => {
    render(<LevensinkomenStrook nodes={nodes} activeAge={null} />)
    const knoppen = screen.getAllByRole('button', { name: /jaar, dekking/ })
    expect(knoppen).toHaveLength(16)
    for (const k of knoppen) {
      expect(k.className).toContain('min-w-[44px]')
      expect(k.className).toContain('min-h-[44px]')
    }
  })
})
