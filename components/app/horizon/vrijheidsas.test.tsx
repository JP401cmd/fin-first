import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  Vrijheidsas,
  computeCoupledStopAge,
  fireDeltaLabel,
  formatMargeShort,
  computeMargeBandPct,
  MARGE_BAND_MIN_AMBER_PCT,
  clampLabelPct,
} from './vrijheidsas'
import { computeStopMarge } from '@/lib/horizon/stop-marge'

/**
 * Unit-tests voor de Vrijheidsas (mockup-blok ⑤ van de wat-als-scenariolaag — twee
 * vlakken: streep links, marge rechts).
 *
 * Puur presentational component → geen DisplayModeProvider nodig (tests draaien in
 * "full"). Gedekt:
 *   A. computeCoupledStopAge — koppel-semantiek als pure helper (marge constant, 0,5-stap,
 *      onbereikbaar → null).
 *   B. fireDeltaLabel — beslushulp-conventie (eerder/later/gelijk/onbereikbaar).
 *   C. computeMargeBandPct — strakke amber-buffer zodat VERWACHT/LAATST nooit botsen.
 *   D. Rendering — cijferrij, stopleeftijd-slider (aria), driezone-labels, marge-zonekleur.
 *   E. Stopleeftijd-regel — stopleeftijd + berekende (verwacht-)leeftijd + afwijking t.o.v.
 *      de basislijn op één regel, met de duiding gepind tegen `computeStopMarge`.
 */

const baseProps = {
  currentAge: 40,
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

describe('computeMargeBandPct (strakke amber-buffer)', () => {
  it('houdt VERWACHT en LAATST minstens de buffer-breedte uit elkaar bij (bijna) samenvallende randen', () => {
    // vroegst≈laatst≈verwacht (het 47-47-defect): amber mag niet dichtklappen.
    const { amberStartPct, amberEndPct } = computeMargeBandPct(30, 30)
    expect(amberStartPct).toBe(30)
    expect(amberEndPct - amberStartPct).toBeGreaterThanOrEqual(MARGE_BAND_MIN_AMBER_PCT)
    // De twee label-posities vallen dus niet meer samen.
    expect(amberEndPct).not.toBe(amberStartPct)
  })

  it('volgt de echte voorzichtige rand wanneer die verder ligt dan de minimum-buffer', () => {
    const { amberStartPct, amberEndPct } = computeMargeBandPct(20, 55)
    expect(amberStartPct).toBe(20)
    expect(amberEndPct).toBe(55)
  })

  it('klemt de grenzen binnen 0–100 en behandelt een ontbrekende laatst-rand', () => {
    const { amberStartPct, amberEndPct } = computeMargeBandPct(98, null)
    expect(amberStartPct).toBe(98)
    expect(amberEndPct).toBe(100)
  })
})

describe('clampLabelPct (zwevende band-labels binnen het vlak)', () => {
  it('laat posities binnen de marge ongemoeid', () => {
    expect(clampLabelPct(50, 11)).toBe(50)
  })

  it('clampt extreme randposities naar binnen (links én rechts)', () => {
    expect(clampLabelPct(0.3, 11)).toBe(11)
    expect(clampLabelPct(99.7, 11)).toBe(89)
  })
})

describe('Vrijheidsas rendering', () => {
  it('toont de marge in maanden wanneer < 1 jaar (cijferrij + aria)', () => {
    render(<Vrijheidsas {...baseProps} margeJaren={0.5} zone="krap" />)
    expect(screen.getByText('marge +6 mnd')).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Gewenste stopleeftijd' })
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('+6 mnd'))
  })

  it('toont de drie hernoemde grootheden in de cijferrij en NIET meer de verwijderde figures', () => {
    render(<Vrijheidsas {...baseProps} />)
    // De drieslag blijft over…
    expect(screen.getByText('Basis-vrijheid')).toBeInTheDocument()
    expect(screen.getByText('Verwacht vrij')).toBeInTheDocument()
    expect(screen.getByText('Geambieerde vrijheid')).toBeInTheDocument()
    // …en de gedupliceerde figures zijn weg.
    expect(screen.queryByText('FIRE-leeftijd · verwacht')).not.toBeInTheDocument()
    expect(screen.queryByText('Marge · buffer')).not.toBeInTheDocument()
    expect(screen.queryByText('Stopleeftijd')).not.toBeInTheDocument()
  })

  it('houdt de middelste kicker "Verwacht vrij" — ook met een actief doel (het doel is de stopleeftijd rechts)', () => {
    render(<Vrijheidsas {...baseProps} doelActief />)
    expect(screen.getByText('Verwacht vrij')).toBeInTheDocument()
    expect(screen.queryByText('Doel-vrijheid')).not.toBeInTheDocument()
    expect(screen.queryByText('Wat-als-vrijheid')).not.toBeInTheDocument()
  })

  it('toont de basis-marker op de band wanneer de basis merkbaar los ligt van de verwacht-streep', () => {
    render(<Vrijheidsas {...baseProps} baseFireAge={48} verwachtFireAge={55} />)
    expect(screen.getByText('basis')).toBeInTheDocument()
  })

  it('verbergt de basis-marker wanneer basis en verwacht (bijna) samenvallen', () => {
    // baseProps: baseFireAge === verwachtFireAge === 55 → geen aparte basis-marker.
    render(<Vrijheidsas {...baseProps} />)
    expect(screen.queryByText('basis')).not.toBeInTheDocument()
  })

  it('verbergt de basis-marker óók bij een kleine-maar-echte gap (label-botsing met "verwacht")', () => {
    // Gap 1,5 jr op een as-span van 23 jr ≈ 6,5pp — kleiner dan BASIS_MARKER_MIN_GAP_PCT (12):
    // het gecentreerde basis-label zou dwars door het rechts-uitgelijnde verwacht-label lopen.
    render(<Vrijheidsas {...baseProps} baseFireAge={53.5} verwachtFireAge={55} />)
    expect(screen.queryByText('basis')).not.toBeInTheDocument()
  })

  it('toont de marge als overspanning-label met zone-woord (bracket op de band)', () => {
    render(<Vrijheidsas {...baseProps} margeJaren={7.9} zone="stevig" />)
    expect(screen.getByText('marge +7,9 jr · stevig')).toBeInTheDocument()
  })

  it('toont de onzekerheidszin met op halve jaren afgeronde randen wanneer beide bekend zijn', () => {
    render(
      <Vrijheidsas {...baseProps} vroegstFireAgeFractional={48.2} laatstFireAge={51.3} />,
    )
    // vroegst 48.2 → 48 (hele jaren), laatst 51.3 → 51,5 (halve-jaar-afronding zichtbaar).
    const zin = screen.getByText(/Waarschijnlijk ben je vrij tussen/)
    expect(zin.textContent).toBe(
      'Waarschijnlijk ben je vrij tussen 48 en 51,5 — afhankelijk van hoe de markten lopen.',
    )
  })

  it('toont GEEN onzekerheidszin wanneer laatstFireAge ontbreekt', () => {
    render(
      <Vrijheidsas {...baseProps} vroegstFireAgeFractional={48.2} laatstFireAge={null} />,
    )
    expect(screen.queryByText(/Waarschijnlijk ben je vrij tussen/)).not.toBeInTheDocument()
  })

  it('toont GEEN onzekerheidszin wanneer vroegstFireAgeFractional ontbreekt of niet eindig is', () => {
    const { rerender } = render(<Vrijheidsas {...baseProps} />)
    expect(screen.queryByText(/Waarschijnlijk ben je vrij tussen/)).not.toBeInTheDocument()

    rerender(<Vrijheidsas {...baseProps} vroegstFireAgeFractional={Infinity} />)
    expect(screen.queryByText(/Waarschijnlijk ben je vrij tussen/)).not.toBeInTheDocument()
  })

  it('degeneratie-guard: vroegst≈laatst na afronding → enkelvoudige zin i.p.v. "tussen X en X"', () => {
    render(<Vrijheidsas {...baseProps} vroegstFireAgeFractional={50} laatstFireAge={50} />)
    // De betekenisloze "tussen 50 en 50" komt niet meer voor…
    expect(screen.queryByText(/Waarschijnlijk ben je vrij tussen/)).not.toBeInTheDocument()
    // …maar er staat wel een enkelvoudige duiding.
    expect(screen.getByText(/rond je 50e/)).toBeInTheDocument()
  })

  it('toont de zone-duidende zin onder de band', () => {
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

  it('toont GEEN afwijking-duiding zonder actief scenario', () => {
    render(<Vrijheidsas {...baseProps} hasScenario={false} />)
    expect(screen.queryByText(/mnd (eerder|later) vrij/)).not.toBeInTheDocument()
  })

  it('zet stopleeftijd + berekende leeftijd + afwijking op ÉÉN regel, en pint de duiding tegen computeStopMarge', () => {
    // Canonieke engine-uitvoer voor exact dezelfde input als het component krijgt — zo valt
    // weergave-drift (verkeerd veld/grondslag) om, niet alleen "er staat een getal".
    const engine = computeStopMarge({
      stopAge: 60,
      verwachtFireAgeFractional: 52.5,
      laatstFireAgeFractional: 58,
      baseFireAgeFractional: 55,
    })
    expect(engine.deltaVsBasis).toBe(-2.5) // verwacht − basis
    const duiding = fireDeltaLabel(Math.round(engine.deltaVsBasis! * 12), true)
    expect(duiding.text).toBe('30 mnd eerder vrij')

    render(
      <Vrijheidsas
        {...baseProps}
        hasScenario
        verwachtFireAge={52.5}
        margeJaren={engine.margeJaren!}
        zone={engine.zone!}
      />,
    )

    // Één duiding in het hele blok — niet óók nog als sub in de cijferrij.
    const nodes = screen.getAllByText(duiding.text)
    expect(nodes).toHaveLength(1)

    // …en die plek is de stopleeftijd-regel: label, gekozen leeftijd, berekende (verwacht-)
    // leeftijd én afwijking zitten in één en dezelfde regel-container.
    const regel = screen.getByText('Gewenste stopleeftijd').parentElement!
    expect(regel).toContainElement(nodes[0])
    expect(regel.textContent).toContain('60') // gekozen stopleeftijd
    expect(regel.textContent).toContain('verwacht 52,5') // berekende leeftijd
  })

  it('toont de berekende (verwacht-)leeftijd op de stopregel, óók zonder actief scenario', () => {
    render(<Vrijheidsas {...baseProps} />)
    const regel = screen.getByText('Gewenste stopleeftijd').parentElement!
    expect(regel.textContent).toContain('verwacht 55')
    // Zonder scenario is er geen afwijking t.o.v. de basislijn om te duiden.
    expect(regel.textContent).not.toMatch(/mnd (eerder|later) vrij/)
  })

  it('laat de afwijking-duiding weg wanneer de verwacht-FIRE onbereikbaar is', () => {
    render(<Vrijheidsas {...baseProps} hasScenario verwachtFireAge={null} zone={null} margeJaren={null} />)
    const regel = screen.getByText('Gewenste stopleeftijd').parentElement!
    expect(regel.textContent).not.toContain('verwacht')
    expect(screen.queryByText('onbereikbaar')).not.toBeInTheDocument()
  })

  it('kleurt het marge-getal per zone (tekort = rood), zowel bracket als cijferrij-sub', () => {
    render(<Vrijheidsas {...baseProps} zone="tekort" margeJaren={-2} />)
    // Het marge-getal staat nu op twee semantisch onderscheiden plekken: de bracket op de
    // band en de cijferrij-sub. Beide dragen de zone-kleur.
    const margeNodes = screen.getAllByText(/^marge/)
    expect(margeNodes.length).toBeGreaterThanOrEqual(1)
    for (const node of margeNodes) expect(node.className).toContain('text-red-700')
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
