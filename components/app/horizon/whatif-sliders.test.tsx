import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { computeSliderUiRange, WhatIfSliders, type WhatIfOverrides } from './whatif-sliders'
import { formatCurrency } from '@/lib/format'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import { buildSliderEvent } from '@/lib/scenario-events'

/**
 * Gedeelde props-opstelling voor de vierde-knop-tests (task-6-brief.md): dezelfde baseline/
 * events/setEvents/currentAge die de bestaande describes hieronder losstaand al gebruiken.
 */
const basisProps: {
  baseline: WhatIfOverrides
  events: WhatIfEvent[]
  setEvents: (updater: (prev: WhatIfEvent[]) => WhatIfEvent[]) => void
  currentAge: number
} = {
  baseline: {
    monthlyIncome: 3000,
    workDaysPerWeek: 5,
    savingsRate: 20,
    expectedReturn: 6,
    extraContribution: 0,
  },
  events: [],
  setEvents: () => {},
  currentAge: 40,
}

/**
 * Unit-tests voor `computeSliderUiRange` — het ZICHTBARE (UI-)bereik per slidertype
 * (±20% rond de basisstand; rendement apart). Puur; de validatie-clamps (`SLIDER_RANGES`)
 * blijven ongewijzigd — dit helpertje raakt ze niet. Dekt de per-type-afronding/clamps,
 * de degenerate-vangnetten en het verbreed-tot-opgeslagen-waarde-gedrag.
 */
describe('computeSliderUiRange — maandinkomen', () => {
  it('±20% afgerond op €100 (basis €7.600 → [6000, 9200])', () => {
    expect(computeSliderUiRange('income', 7600, 7600)).toEqual({ min: 6000, max: 9200 })
  })

  it('afronding min omlaag / max omhoog (basis €3.050 → [2400, 3700])', () => {
    expect(computeSliderUiRange('income', 3050, 3050)).toEqual({ min: 2400, max: 3700 })
  })

  it('basis 0 ⇒ vangnet [0, 1000]', () => {
    expect(computeSliderUiRange('income', 0, 0)).toEqual({ min: 0, max: 1000 })
  })

  it('verbreedt tot een opgeslagen waarde boven de max', () => {
    expect(computeSliderUiRange('income', 7600, 12000)).toEqual({ min: 6000, max: 12000 })
  })

  it('verbreedt tot een opgeslagen waarde onder de min', () => {
    expect(computeSliderUiRange('income', 7600, 4000)).toEqual({ min: 4000, max: 9200 })
  })
})

describe('computeSliderUiRange — werkdagen (geclampt 1–5)', () => {
  it('basis 5 ⇒ [4, 5]', () => {
    expect(computeSliderUiRange('workdays', 5, 5)).toEqual({ min: 4, max: 5 })
  })
  it('basis 3 ⇒ [2, 4]', () => {
    expect(computeSliderUiRange('workdays', 3, 3)).toEqual({ min: 2, max: 4 })
  })
  it('basis 1 ⇒ [1, 2] (floor(0,8) clamp op 1)', () => {
    expect(computeSliderUiRange('workdays', 1, 1)).toEqual({ min: 1, max: 2 })
  })
})

describe('computeSliderUiRange — spaarquote (±15 procentpunt, geclampt 0–80; eigenaarskeuze 15 sep 2026)', () => {
  it('basis 50% ⇒ [35, 65]', () => {
    expect(computeSliderUiRange('savings', 50, 50)).toEqual({ min: 35, max: 65 })
  })
  it('klemt onderaan op 0 (basis 5 ⇒ [0, 20]; basis 0 ⇒ [0, 15])', () => {
    expect(computeSliderUiRange('savings', 5, 5)).toEqual({ min: 0, max: 20 })
    expect(computeSliderUiRange('savings', 0, 0)).toEqual({ min: 0, max: 15 })
  })
  it('klemt bovenaan op 80 (basis 80 ⇒ [65, 80]); een niet-afgeronde basis rondt eerst', () => {
    expect(computeSliderUiRange('savings', 80, 80)).toEqual({ min: 65, max: 80 })
    expect(computeSliderUiRange('savings', 46.4, 46.4)).toEqual({ min: 31, max: 61 })
  })
  it('verbreedt tot een opgeslagen waarde buiten de band', () => {
    expect(computeSliderUiRange('savings', 50, 75)).toEqual({ min: 35, max: 75 })
    expect(computeSliderUiRange('savings', 50, 10)).toEqual({ min: 10, max: 65 })
  })
})

describe('computeSliderUiRange — meer salaris (±30% van het basis-maandinkomen, ook omlaag)', () => {
  it('inkomen €7.600 ⇒ [−2300, 2300] (30% op €50)', () => {
    expect(computeSliderUiRange('extra_inleg', 7600, 0)).toEqual({ min: -2300, max: 2300 })
  })
  it('geen inkomen ⇒ vangnet [−500, 500]', () => {
    expect(computeSliderUiRange('extra_inleg', 0, 0)).toEqual({ min: -500, max: 500 })
  })
  it('verbreedt tot een opgeslagen waarde buiten de band, aan beide kanten', () => {
    expect(computeSliderUiRange('extra_inleg', 7600, 3000)).toEqual({ min: -2300, max: 3000 })
    expect(computeSliderUiRange('extra_inleg', 7600, -3000)).toEqual({ min: -3000, max: 2300 })
  })
})

/**
 * D-01 (a11y) — elke range-input in een SliderRow moet een toegankelijke naam
 * (aria-label = parameter-label) én een aria-valuetext (geformatteerde waarde)
 * hebben, zodat een screenreader zowel de parameter als de leesbare waarde
 * benoemt i.p.v. de kale numerieke value. Vergelijk whatif-market-assumptions.tsx
 * dat dit al doet op de master-slider.
 */
describe('WhatIfSliders — a11y: slider heeft naam + valuetext', () => {
  const baseline: WhatIfOverrides = {
    monthlyIncome: 3000,
    workDaysPerWeek: 5,
    savingsRate: 20,
    expectedReturn: 6,
    extraContribution: 0,
  }

  function renderSliders() {
    render(
      <WhatIfSliders
        baseline={baseline}
        events={[]}
        setEvents={() => {}}
        currentAge={40}
      />,
    )
  }

  it('drie draaiknoppen in vaste volgorde: 1 Meer salaris, 2 Spaarquote, 3 Minder werken — alle drie zichtbaar', () => {
    renderSliders()
    const namen = screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))
    expect(namen).toEqual(['Meer salaris', 'Spaarquote', 'Minder werken'])
    expect(screen.queryByRole('slider', { name: 'Maandinkomen' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Minder werken/ })).toBeNull()
  })

  it('Meer salaris toont euro, Spaarquote procenten, Minder werken dagen', () => {
    renderSliders()
    expect(screen.getByRole('slider', { name: 'Meer salaris' })).toHaveAttribute('aria-valuetext', formatCurrency(0))
    expect(screen.getByRole('slider', { name: 'Spaarquote' })).toHaveAttribute('aria-valuetext', '20%')
    expect(screen.getByRole('slider', { name: 'Minder werken' })).toHaveAttribute('aria-valuetext', '5 dagen')
  })

  it('Spaarquote zet het bedrag minder uitgeven eronder zodra de knop afwijkt (0 op de basis → geen regel)', () => {
    const { rerender } = render(<WhatIfSliders baseline={baseline} events={[]} setEvents={() => {}} currentAge={40} />)
    expect(screen.queryByText(/minder uitgeven/)).toBeNull()
    const ev = buildSliderEvent('savings', 24, baseline, 40)
    rerender(<WhatIfSliders baseline={baseline} events={ev ? [ev] : []} setEvents={() => {}} currentAge={40} />)
    // 3000 × 5/5 × 4pp = €120
    expect(screen.getByText('+€ 120/mnd minder uitgeven')).toBeInTheDocument()
  })

  it('de randlabels van Spaarquote zijn hele procenten, ook als een opgeslagen stand de band verbreedt', () => {
    const ev = buildSliderEvent('savings', 52.008244023083265, baseline, 40)
    render(<WhatIfSliders baseline={baseline} events={ev ? [ev] : []} setEvents={() => {}} currentAge={40} />)
    expect(screen.getAllByText('52%').length).toBeGreaterThan(0)
    expect(screen.queryByText(/52\.00/)).toBeNull()
  })

  it('Spaarquote schuift in procentpunten onder de motorkap (event-shape ongewijzigd)', () => {
    const setEvents = vi.fn()
    render(<WhatIfSliders baseline={baseline} events={[]} setEvents={setEvents} currentAge={40} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Spaarquote' }), { target: { value: '24' } })
    expect(setEvents).toHaveBeenCalled()
    const updater = setEvents.mock.calls[0][0] as (prev: WhatIfEvent[]) => WhatIfEvent[]
    const next = updater([])
    expect(next[0]?.scenario_origin).toBe('slider:savings')
    expect(next[0]?.monthly_cost_change).toBe(-120) // 3000 × 5/5 × 4pp (savingsRate 20 → range 16-24, jsdom clamps to max)
  })
})

/**
 * Spec antwoorden-naast-sliders (15 sep 2026) — het antwoord staat onder de knop waar het
 * over gaat, beschreven door die range (aria-describedby), met een knop die alleen op klik
 * iets doet; zonder antwoord geen regel. Boven bereik: extra regel binnen hetzelfde id.
 */
describe('WhatIfSliders — antwoorden naast de knoppen', () => {
  const baseline: WhatIfOverrides = {
    monthlyIncome: 3000,
    workDaysPerWeek: 5,
    savingsRate: 20,
    expectedReturn: 6,
    extraContribution: 0,
  }

  it('zet elk antwoord onder zijn eigen knop en koppelt het via aria-describedby', () => {
    const onClick = vi.fn()
    render(
      <WhatIfSliders
        baseline={baseline}
        events={[]}
        setEvents={() => {}}
        currentAge={40}
        antwoorden={{
          extra_inleg: { tekst: "Zo'n €500/mnd meer salaris hoort bij een gedekt plan.", bovenBereik: false, knop: { label: 'Reken hiermee', onClick } },
          savings: { tekst: "Zo'n €500/mnd minder uitgeven hoort bij een gedekt plan.", bovenBereik: true, knop: { label: 'Reken met maximum', onClick: () => {} } },
        }}
      />,
    )
    const salaris = screen.getByRole('slider', { name: 'Meer salaris' })
    const salarisRegel = screen.getByText("Zo'n €500/mnd meer salaris hoort bij een gedekt plan.")
    expect(salaris).toHaveAttribute('aria-describedby', salarisRegel.id)
    const spaar = screen.getByRole('slider', { name: 'Spaarquote' })
    const spaarRegel = document.getElementById(spaar.getAttribute('aria-describedby') ?? '')
    // boven bereik: de extra regel zit binnen het beschreven element
    expect(spaarRegel?.textContent).toBe("Zo'n €500/mnd minder uitgeven hoort bij een gedekt plan.Meer dan deze knop toelaat.")
    expect(screen.getByRole('slider', { name: 'Minder werken' })).not.toHaveAttribute('aria-describedby')
    expect(screen.getAllByTestId('slider-antwoord')).toHaveLength(2)
    // accessible name begint met het zichtbare label (WCAG 2.5.3)
    expect(screen.getByRole('button', { name: /^Reken met maximum: / })).toBeInTheDocument()
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Reken hiermee: Zo'n €500\/mnd meer/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('privacy-weergave (knop null): de zin blijft, geen knop', () => {
    render(
      <WhatIfSliders
        baseline={baseline}
        events={[]}
        setEvents={() => {}}
        currentAge={40}
        antwoorden={{ extra_inleg: { tekst: "Zo'n ••••••/mnd meer salaris hoort bij een gedekt plan.", bovenBereik: false, knop: null } }}
      />,
    )
    expect(screen.getByText(/hoort bij een gedekt plan/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('zonder antwoorden: geen regel en geen describedby', () => {
    render(<WhatIfSliders baseline={baseline} events={[]} setEvents={() => {}} currentAge={40} />)
    expect(screen.queryByTestId('slider-antwoord')).toBeNull()
    for (const s of screen.getAllByRole('slider')) expect(s).not.toHaveAttribute('aria-describedby')
  })
})

/**
 * iOS (bugmelding 13 sep 2026, "lastig te pakken"): Safari op iOS verschuift een range
 * alléén vanaf het 18px-bolletje. Given een iPhone, When de vinger ergens op de baan
 * tikt of zijwaarts veegt, Then springt de slider naar die plek (zoals Android native
 * doet) en komt de wijziging via de gewone onChange-route in de scenario-events terecht.
 * Een verticale scroll over de slider laat de waarde staan. Buiten iOS blijft het native
 * gedrag leidend en doet de handler niets.
 */
describe('WhatIfSliders — iOS: tik op de baan verschuift de slider', () => {
  const baseline: WhatIfOverrides = {
    monthlyIncome: 3000,
    workDaysPerWeek: 5,
    savingsRate: 20,
    expectedReturn: 6,
    extraContribution: 0,
  }
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubNavigator(userAgent: string, maxTouchPoints: number) {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent, platform: '', maxTouchPoints })
  }

  function renderWithSpy() {
    const setEvents = vi.fn()
    render(<WhatIfSliders baseline={baseline} events={[]} setEvents={setEvents} currentAge={40} />)
    const slider = screen.getByRole('slider', { name: 'Spaarquote' })
    // Baan van 218px (bruikbaar traject 200px met een 18px-bolletje).
    slider.getBoundingClientRect = () =>
      ({ left: 0, width: 218, top: 0, height: 19, right: 218, bottom: 19, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    return { setEvents, slider }
  }

  it('Given een iPhone, When een tik aan de rechterrand van de baan, Then de spaarquote verschuift', () => {
    stubNavigator(IPHONE_UA, 5)
    const { setEvents, slider } = renderWithSpy()
    fireEvent.touchStart(slider, { touches: [{ clientX: 218, clientY: 5 }] })
    fireEvent.touchEnd(slider, { touches: [] })
    expect(setEvents).toHaveBeenCalled()
  })

  it('Given een iPhone, When de duim over de slider heen scrolt, Then blijft de waarde staan', () => {
    stubNavigator(IPHONE_UA, 5)
    const { setEvents, slider } = renderWithSpy()
    fireEvent.touchStart(slider, { touches: [{ clientX: 218, clientY: 5 }] })
    fireEvent.touchMove(slider, { touches: [{ clientX: 214, clientY: 60 }] })
    fireEvent.touchEnd(slider, { touches: [] })
    expect(setEvents).not.toHaveBeenCalled()
  })

  it('Given Android, When een tik op de baan, Then doet de handler niets (native gedrag)', () => {
    stubNavigator('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128.0', 5)
    const { setEvents, slider } = renderWithSpy()
    fireEvent.touchStart(slider, { touches: [{ clientX: 218, clientY: 5 }] })
    fireEvent.touchEnd(slider, { touches: [] })
    expect(setEvents).not.toHaveBeenCalled()
  })
})

/**
 * Vierde draaiknop — Uitgave na pensioen (spec 2026-09-18, ADR 0160). Optionele prop:
 * alleen /toekomst levert 'm, en alleen onder een vast stopmoment. Task 7 (horizon-client)
 * bedraadt de host; hier alleen de knop zelf.
 */
describe('vierde knop — Uitgave na pensioen', () => {
  it('verschijnt niet zonder de prop', () => {
    render(<WhatIfSliders {...basisProps} />)
    expect(screen.queryByLabelText('Uitgave na pensioen')).toBeNull()
  })

  it('toont de knop, de sliderstap en de maandvertaling', () => {
    render(<WhatIfSliders {...basisProps} uitgaveNaPensioen={{ waarde: 30_000, basis: 30_000, onChange: () => {} }} />)
    expect(screen.getByLabelText('Uitgave na pensioen')).toHaveAttribute('step', '600')
    expect(screen.getByText(/€\s2\.500\/mnd/)).toBeInTheDocument()
  })

  it('geeft de nieuwe waarde door', () => {
    const onChange = vi.fn()
    render(<WhatIfSliders {...basisProps} uitgaveNaPensioen={{ waarde: 30_000, basis: 30_000, onChange }} />)
    fireEvent.change(screen.getByLabelText('Uitgave na pensioen'), { target: { value: '24000' } })
    expect(onChange).toHaveBeenCalledWith(24_000)
  })

  it('verbreedt de band naar de HUIDIGE stand, niet naar de basis', () => {
    // basis 10.000 geeft een eigen band van [6.000, 13.800]; het vangnet verbreedt de
    // bovengrens naar de gezette waarde 40.000, maar de ONDERGRENS blijft op de
    // basis-band (6.000) staan — dat is precies het verschil met de omgekeerde
    // aanroep: uitgaveNaPensioenRange(waarde, basis) omgedraaid rekent zijn eigen band
    // uit vanaf 40.000 (ondergrens 24.000) en verbreedt die dan naar 10.000, wat op deze
    // render een min van 10.000 zou geven i.p.v. 6.000. Alleen de min discrimineert hier
    // aantoonbaar tussen de twee argumentvolgordes (geverifieerd: op de max alleen
    // faalt de omgekeerde aanroep NIET, want de vangnet-verbreding naar 40.000 domineert
    // in beide volgordes — zie task-6-report.md, fix-ronde 1).
    render(<WhatIfSliders {...basisProps} uitgaveNaPensioen={{ waarde: 40_000, basis: 10_000, onChange: () => {} }} />)
    const slider = screen.getByLabelText('Uitgave na pensioen')
    expect(Number(slider.getAttribute('min'))).toBe(6_000)
    expect(Number(slider.getAttribute('max'))).toBe(40_000)
  })

  it('rendert het antwoord onder zijn eigen knop', () => {
    render(
      <WhatIfSliders
        {...basisProps}
        uitgaveNaPensioen={{ waarde: 30_000, basis: 30_000, onChange: () => {} }}
        antwoorden={{
          uitgave_na_pensioen: {
            tekst: `Zo'n ${formatCurrency(24_000)} per jaar uitgeven hoort bij een gedekt plan.`,
            bovenBereik: false,
            knop: null,
          },
        }}
      />,
    )
    expect(screen.getByText(/€\s24\.000 per jaar uitgeven/)).toBeInTheDocument()
  })
})
