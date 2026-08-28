import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { JaarruimteRekensom } from './jaarruimte-rekensom'
import {
  JAARRUIMTE_OPBOUW_PCT,
  JAARRUIMTE_FRANCHISE_2026,
  JAARRUIMTE_MAX_2026,
  JAARRUIMTE_FACTOR_A_IMPUTATIE,
} from '@/lib/jaarruimte'

/**
 * S12 — de rekensom van het jaarruimte-uitlegblok (/overzicht/belasting/box1).
 *
 * Eigenaarsbesluit 26-08-2026 (optie A): Volledig houdt de formule inline,
 * Eenvoudig krijgt één gewone zin + de uitklap "Zo rekenen we je jaarruimte".
 *
 * De bedragen worden hier bewust NIET tegen literals getest maar tegen de
 * constanten uit `lib/jaarruimte.ts` — dat is precies de eis die de kaart
 * moest garanderen: geen tweede bron voor een fiscaal getal.
 */

function renderIn(mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <JaarruimteRekensom />
    </DisplayModeProvider>,
  )
}

const opbouwPct = String(Math.round(JAARRUIMTE_OPBOUW_PCT * 100))
/** `formatCurrency` gebruikt nbsp + punt-duizendtallen; alleen de cijfergroep matchen. */
const franchiseCijfers = new Intl.NumberFormat('nl-NL').format(JAARRUIMTE_FRANCHISE_2026)
const maxCijfers = new Intl.NumberFormat('nl-NL').format(JAARRUIMTE_MAX_2026)
const franchiseRondCijfers = new Intl.NumberFormat('nl-NL').format(
  Math.round(JAARRUIMTE_FRANCHISE_2026 / 1000) * 1000,
)
const maxRondCijfers = new Intl.NumberFormat('nl-NL').format(
  Math.round(JAARRUIMTE_MAX_2026 / 100) * 100,
)

describe('JaarruimteRekensom — Volledig', () => {
  it('toont de exacte formule inline, zonder uitklap', () => {
    const { container } = renderIn('full')
    const tekst = container.textContent ?? ''
    expect(tekst).toContain(`${opbouwPct}%`)
    expect(tekst).toContain(franchiseCijfers)
    expect(tekst).toContain(String(JAARRUIMTE_FACTOR_A_IMPUTATIE))
    expect(tekst).toContain(maxCijfers)
    expect(container.querySelector('details')).toBeNull()
  })
})

describe('JaarruimteRekensom — Eenvoudig', () => {
  it('vervangt de formule door één gewone zin met afgeronde, afgeleide bedragen', () => {
    const { container } = renderIn('simple')
    const tekst = container.textContent ?? ''
    expect(tekst).toContain(franchiseRondCijfers)
    expect(tekst).toContain(maxRondCijfers)
    expect(tekst).toMatch(/min wat je via je werkgever al aan pensioen opbouwt/i)
  })

  it('zet de exacte formule achter een dichte <details>-uitklap', () => {
    const { container } = renderIn('simple')
    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    // Dicht bij eerste render — de expert-som is er wél, maar niet in beeld.
    expect((details as HTMLDetailsElement).open).toBe(false)
    expect(screen.getByText(/Zo rekenen we je jaarruimte/i)).toBeTruthy()
    const detailsTekst = details?.textContent ?? ''
    expect(detailsTekst).toContain(franchiseCijfers)
    expect(detailsTekst).toContain(maxCijfers)
    expect(detailsTekst).toContain(String(JAARRUIMTE_FACTOR_A_IMPUTATIE))
  })

  it('houdt de formule uit de zichtbare zin (die staat alleen in de uitklap)', () => {
    renderIn('simple')
    const zin = screen.getByText(/De regel:/i).textContent ?? ''
    expect(zin).not.toContain(franchiseCijfers)
    expect(zin).not.toContain(String(JAARRUIMTE_FACTOR_A_IMPUTATIE))
  })

  // Wft: "Indicatie, geen advies" hoort in béide modi zichtbaar te blijven en
  // mag dus NOOIT in dit component (en daarmee in de uitklap) belanden — hij
  // staat één niveau hoger, onderaan het uitlegblok.
  it('draagt de Wft-regel bewust niet (die staat buiten de uitklap)', () => {
    const { container } = renderIn('simple')
    expect(container.textContent ?? '').not.toMatch(/Indicatie, geen advies/i)
  })
})
