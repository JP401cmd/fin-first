import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Vrijheidsas, computeCoupledStopAge, fireDeltaLabel, formatMargeShort } from './vrijheidsas'

/**
 * Unit-tests voor de Vrijheidsas (mockup-blok ⑤ van de wat-als-scenariolaag).
 *
 * Puur presentational component → geen DisplayModeProvider nodig (tests draaien in
 * "full"). Gedekt:
 *   A. computeCoupledStopAge — koppel-semantiek als pure helper (marge constant, 0,5-stap,
 *      onbereikbaar → null).
 *   B. fireDeltaLabel — beslushulp-conventie (eerder/later/gelijk/onbereikbaar).
 *   C. Rendering — cijferrij, stopleeftijd-slider (aria), driezone-labels, AOW-hairline,
 *      wat-als-marker alleen bij actief scenario, marge-zonekleur.
 */

const baseProps = {
  currentAge: 40,
  aowAge: 67,
  baseFireAge: 55,
  verwachtFireAge: 55,
  laatstFireAge: 58,
  hasScenario: false,
  stopAge: 60,
  onStopAgeChange: vi.fn(),
  stopKoppel: false,
  onStopKoppelChange: vi.fn(),
  zone: 'stevig' as const,
  margeJaren: 5,
}

describe('computeCoupledStopAge (koppel-semantiek)', () => {
  it('houdt de marge constant bij een verschuivende verwacht-FIRE', () => {
    // marge +3 vastgehouden; verwacht schuift van 55 → 52 ⇒ stop 55.
    expect(computeCoupledStopAge(52, 3)).toBe(55)
  })

  it('rondt af op de slider-stap (0,5)', () => {
    // 53.3 + 2 = 55.3 → 55.5
    expect(computeCoupledStopAge(53.3, 2)).toBe(55.5)
  })

  it('is inert wanneer verwacht onbereikbaar is (null → null)', () => {
    expect(computeCoupledStopAge(null, 3)).toBeNull()
  })

  it('respecteert negatieve marge (stop vóór vrij)', () => {
    expect(computeCoupledStopAge(60, -2)).toBe(58)
  })
})

describe('fireDeltaLabel (beslushulp-conventie)', () => {
  it('negatieve delta = eerder vrij (horizon-toon)', () => {
    expect(fireDeltaLabel(-30, true)).toEqual({ text: '30 mnd eerder vrij', tone: 'earlier' })
  })
  it('positieve delta = later vrij (kern-toon)', () => {
    expect(fireDeltaLabel(18, true)).toEqual({ text: '18 mnd later vrij', tone: 'later' })
  })
  it('<1 mnd = vrijheidsdatum gelijk', () => {
    expect(fireDeltaLabel(0, true)).toEqual({ text: 'vrijheidsdatum gelijk', tone: 'flat' })
  })
  it('onbereikbaar wanneer niet reachable of null', () => {
    expect(fireDeltaLabel(null, true)).toEqual({ text: 'onbereikbaar', tone: 'none' })
    expect(fireDeltaLabel(-30, false)).toEqual({ text: 'onbereikbaar', tone: 'none' })
  })
})

describe('formatMargeShort (adaptieve marge-eenheid)', () => {
  it('|marge| < 1 jaar → maanden met teken', () => {
    expect(formatMargeShort(0.667)).toBe('+8 mnd')
    expect(formatMargeShort(-0.333)).toBe('−4 mnd')
    expect(formatMargeShort(0)).toBe('+0 mnd')
  })
  it('|marge| ≥ 1 jaar → 1-decimaal jaren met NL-komma', () => {
    expect(formatMargeShort(2.5)).toBe('+2,5 jr')
    expect(formatMargeShort(-1)).toBe('−1,0 jr')
    expect(formatMargeShort(5)).toBe('+5,0 jr')
  })
})

describe('Vrijheidsas rendering', () => {
  it('toont de marge in maanden wanneer < 1 jaar (cijferrij + aria)', () => {
    render(<Vrijheidsas {...baseProps} margeJaren={0.5} zone="krap" />)
    expect(screen.getByText('marge +6 mnd')).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Gewenste stopleeftijd' })
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('+6 mnd'))
  })

  it('toont de vroegst–laatst-bandregel onder Wat-als-vrijheid wanneer beide randen bekend zijn', () => {
    render(<Vrijheidsas {...baseProps} vroegstFireAgeFractional={52.3} laatstFireAge={58} />)
    expect(screen.getByText('band 52,3 – 58,0 jr')).toBeInTheDocument()
  })

  it('toont GEEN bandregel wanneer de vroegste rand ontbreekt', () => {
    render(<Vrijheidsas {...baseProps} vroegstFireAgeFractional={null} />)
    expect(screen.queryByText(/^band /)).not.toBeInTheDocument()
  })

  it('toont de zone-duidende zin onder het zone-woord', () => {
    render(<Vrijheidsas {...baseProps} zone="stevig" />)
    expect(screen.getByText('ruim voorbij de voorzichtige rand — robuust')).toBeInTheDocument()
  })

  it('toont de stopleeftijd-slider met aria-label + marge-context in aria-valuetext', () => {
    render(<Vrijheidsas {...baseProps} />)
    const slider = screen.getByRole('slider', { name: 'Gewenste stopleeftijd' })
    expect(slider).toHaveAttribute('step', '0.5')
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('marge'))
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('stevig'))
  })

  it('rendert de driezone-tick-labels (verwacht/laatst) en stop-marker', () => {
    render(<Vrijheidsas {...baseProps} />)
    expect(screen.getByText('verwacht')).toBeInTheDocument()
    expect(screen.getByText('laatst')).toBeInTheDocument()
    expect(screen.getByText(/^stop\s/)).toBeInTheDocument()
  })

  it('toont de AOW-hairline met leeftijd-label', () => {
    render(<Vrijheidsas {...baseProps} />)
    expect(screen.getByText('AOW 67')).toBeInTheDocument()
  })

  it('toont GEEN wat-als-marker zonder actief scenario', () => {
    render(<Vrijheidsas {...baseProps} hasScenario={false} />)
    expect(screen.queryByLabelText(/Wat-als-vrijheidsleeftijd/)).not.toBeInTheDocument()
  })

  it('toont de wat-als-marker + delta bij een actief scenario', () => {
    render(
      <Vrijheidsas
        {...baseProps}
        hasScenario
        verwachtFireAge={52.5}
        margeJaren={7.5}
        zone="stevig"
      />,
    )
    // verwacht 52.5 vs basis 55 = 30 mnd eerder → label verschijnt (marker + cijferrij).
    expect(screen.getByLabelText(/Wat-als-vrijheidsleeftijd/)).toBeInTheDocument()
    expect(screen.getAllByText('30 mnd eerder vrij').length).toBeGreaterThan(0)
  })

  it('kleurt het marge-getal per zone (tekort = rood)', () => {
    render(<Vrijheidsas {...baseProps} zone="tekort" margeJaren={-2} />)
    const marge = screen.getByText(/^marge/)
    expect(marge.className).toContain('text-red-700')
  })

  it('koppel-checkbox roept onStopKoppelChange aan', () => {
    const onStopKoppelChange = vi.fn()
    render(<Vrijheidsas {...baseProps} onStopKoppelChange={onStopKoppelChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onStopKoppelChange).toHaveBeenCalledWith(true)
  })

  it('i-knop klapt de uitleg open (a11y)', () => {
    render(<Vrijheidsas {...baseProps} />)
    const info = screen.getByRole('button', { name: 'Uitleg vrijheidsas' })
    expect(info).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'true')
  })
})
