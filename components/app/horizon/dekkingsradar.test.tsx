import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Dekkingsradar } from './dekkingsradar'
import type { RadarAs } from '@/lib/horizon/dekkingsradar'

/**
 * Unit-tests voor de Dekkingsradar (ronde 3, element ⑦).
 *
 * Puur presentational component → geen DisplayModeProvider nodig (tests draaien in
 * "full"; percentages zijn bovendien geen bedragen → geen masking). Gedekt:
 *   A. Rendering — 5 rijen (dimensielijst).
 *   B. Badge-tint per status (groen/amber/rood).
 *   C. Null-as toont "–" (geen badge) en een open stip in de SVG.
 *   D. Zwakste-as-cap kiest de laagste BEPAALBARE pct.
 *   E. i-box opent (a11y) en toont de formule + per-as-definities.
 */

const assen: RadarAs[] = [
  { key: 'brug-tot-aow', label: 'Brug tot AOW', pct: 84, status: 'rood', detail: 'brug krap.' },
  { key: 'pensioeninkomen', label: 'Pensioeninkomen', pct: 95, status: 'amber', detail: 'net krap.' },
  { key: 'wonen', label: 'Wonen', pct: 100, status: 'groen', detail: 'geborgd.' },
  { key: 'marktrisico', label: 'Marktrisico', pct: null, status: null, detail: 'zet MC aan.' },
  { key: 'eindstrategie', label: 'Eindstrategie', pct: 130, status: 'groen', detail: 'ruim.' },
]

describe('Dekkingsradar rendering', () => {
  it('rendert vijf dimensie-rijen met hun labels', () => {
    render(<Dekkingsradar assen={assen} />)
    const list = screen.getAllByRole('list')[0]
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    for (const a of assen) {
      expect(screen.getByText(a.label)).toBeInTheDocument()
    }
  })

  it('toont per status een badge met de juiste stoplicht-tint', () => {
    render(<Dekkingsradar assen={assen} />)
    const rood = screen.getByText('84%')
    const amber = screen.getByText('95%')
    const groen = screen.getByText('100%')
    expect(rood.className).toContain('text-red-700')
    expect(amber.className).toContain('text-amber-700')
    expect(groen.className).toContain('text-emerald-700')
  })

  it('toont "–" (geen badge) voor een niet-bepaalbare as + een open stip in de SVG', () => {
    const { container } = render(<Dekkingsradar assen={assen} />)
    // "–" in de lijst, ink-4-tint, geen percentage.
    const dash = screen.getByText('–')
    expect(dash.className).toContain('text-[var(--ink-4)]')
    // Open stip = cirkel met paper-fill + ink-3-stroke; precies één (de null-as).
    const openDots = Array.from(container.querySelectorAll('circle')).filter(
      (c) => c.getAttribute('fill') === 'var(--paper)' && c.getAttribute('stroke') === 'var(--ink-3)',
    )
    expect(openDots).toHaveLength(1)
  })

  it('benoemt in de cap-regel de zwakste BEPAALBARE as (laagste pct, null genegeerd)', () => {
    render(<Dekkingsradar assen={assen} />)
    // Laagste bepaalbare = Brug tot AOW (84%); null (Marktrisico) telt niet mee.
    expect(screen.getByText(/Brug tot AOW \(84%\)/)).toBeInTheDocument()
    expect(screen.getByText(/zwakste plek/)).toBeInTheDocument()
  })

  it('toont geen cap-regel wanneer geen enkele as bepaalbaar is', () => {
    const alleNull: RadarAs[] = assen.map((a) => ({ ...a, pct: null, status: null }))
    render(<Dekkingsradar assen={alleNull} />)
    expect(screen.queryByText(/zwakste plek/)).not.toBeInTheDocument()
  })

  it('opent de i-uitleg met formule + per-as-definities (a11y)', () => {
    render(<Dekkingsradar assen={assen} />)
    const info = screen.getByRole('button', { name: 'Uitleg dekkingsradar' })
    expect(info).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Hoe de vijf percentages ontstaan')).toBeInTheDocument()
    expect(screen.getByText(/behaald ÷ benodigd × 100%/)).toBeInTheDocument()
    // Per-as definitie-regel aanwezig (marktrisico noemt Monte-Carlo).
    expect(screen.getByText(/10e-percentiel-vermogen/)).toBeInTheDocument()
  })
})
