import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpendLimitWidget } from './spend-limit-widget'
import { calculateFreedomTime, formatFreedomTimeString, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { SpendLimitWidgetData } from '@/lib/spend-limits/widget-data'
import type { WidgetSize } from '@/lib/widget-catalog'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt budget-fav-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
global.ResizeObserver = MockObserver as unknown as typeof ResizeObserver

/** Alle vijf de formaten — inclusief `mini`, die alleen via downsize ontstaat. */
const ALL_SIZES: WidgetSize[] = ['mini', 'quarter', 'half', 'full', 'xl']

function makeLimit(overrides: Partial<SpendLimitWidgetData> = {}): SpendLimitWidgetData {
  return {
    id: 'POT-1',
    name: 'Tankstations',
    ruleType: 'counterparty',
    period: 'month',
    isActive: true,
    limitAmount: 200,
    currentPeriodKey: '2026-08',
    currentPeriodLabel: 'augustus 2026',
    currentMatchedAmount: 120,
    currentHeadroom: 80,
    currentOverAmount: 0,
    status: 'within',
    isNearLimit: false,
    // Default GEEN tempo — dat is de stand van een dag/week-pot en van elke pot
    // vóór ADR 0119; de tempo-tests zetten hem expliciet.
    pace: null,
    currentStreak: 4,
    longestStreak: 7,
    closedPeriodCount: 12,
    exceededPeriodCount: 3,
    withinPeriodCount: 9,
    sparkClosedMatchedAmounts: [100, 130, 90, 150, 110, 120],
    trendDirection: 'improving',
    score: 82,
    scoreLabel: 'strak',
    scoreHitRatePct: 75,
    scoreBasisPeriodCount: 12,
    aggregateTruncationSuspected: false,
    ...overrides,
  }
}

describe('SpendLimitWidget — vijf rendertakken', () => {
  it.each(ALL_SIZES)('%s rendert zonder te crashen en toont de potnaam', size => {
    const { container } = render(<SpendLimitWidget size={size} limit={makeLimit()} dailyExp={50} />)
    expect(container.textContent ?? '').toContain('Tankstations')
  })

  it('mini toont statuswoord + huidige reeks (geen bedrag)', () => {
    // Mini ontstaat via downsizeForMobile(quarter → mini) en is de vaakst
    // vergeten tak: zonder hem rendert de standaard quarter-widget op telefoon kapot.
    const { container } = render(<SpendLimitWidget size="mini" limit={makeLimit()} dailyExp={50} />)
    const text = container.textContent ?? ''
    expect(text).toContain('binnen je grens')
    expect(text).toContain('4')
    expect(text).not.toContain('€')
  })

  it('quarter toont het lopende bedrag tegen de grens', () => {
    const { container } = render(<SpendLimitWidget size="quarter" limit={makeLimit()} dailyExp={50} />)
    const text = (container.textContent ?? '').replace(/ /g, ' ')
    expect(text).toMatch(/€\s*120/)
    expect(text).toMatch(/€\s*200/)
  })

  it('xl toont de vier reeks-getallen en "binnen je grens X/Y"', () => {
    const { container } = render(<SpendLimitWidget size="xl" limit={makeLimit()} dailyExp={50} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Huidige reeks')
    expect(text).toContain('Langste reeks')
    expect(text).toContain('Afgesloten')
    expect(text).toContain('Eroverheen')
    expect(text).toContain('9/12')
  })

  it('full toont de trendrichting uit het rapport, nooit een eigen gemiddelde', () => {
    const { container } = render(
      <SpendLimitWidget size="full" limit={makeLimit({ trendDirection: 'worsening' })} dailyExp={50} />,
    )
    expect(container.textContent ?? '').toContain('je geeft meer uit dan daarvoor')
  })

  it('full zonder genoeg historie: "nog niet genoeg historie", geen NaN', () => {
    const { container } = render(
      <SpendLimitWidget
        size="full"
        limit={makeLimit({ trendDirection: 'unknown', sparkClosedMatchedAmounts: [], closedPeriodCount: 1, withinPeriodCount: 1, exceededPeriodCount: 0 })}
        dailyExp={50}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('nog niet genoeg historie')
    expect(text).not.toContain('NaN')
  })
})

describe('SpendLimitWidget — status komt uit de motor, niet uit een eigen drempel', () => {
  it('near-vlag aan ⇒ "dicht bij je grens", ook al is de status within', () => {
    const { container } = render(
      <SpendLimitWidget
        size="quarter"
        limit={makeLimit({ currentMatchedAmount: 170, currentHeadroom: 30, isNearLimit: true })}
        dailyExp={50}
      />,
    )
    expect(container.textContent ?? '').toContain('dicht bij je grens')
  })

  it('near-vlag UIT bij hetzelfde bedrag ⇒ gewoon "binnen je grens"', () => {
    // Zelfde 85%-verhouding, andere motor-uitkomst. Zou de widget zelf 0,8
    // rekenen, dan stond hier alsnog "dicht bij je grens" — dát is de bug die
    // deze twee tests samen uitsluiten.
    const { container } = render(
      <SpendLimitWidget
        size="quarter"
        limit={makeLimit({ currentMatchedAmount: 170, currentHeadroom: 30, isNearLimit: false })}
        dailyExp={50}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('binnen je grens')
    expect(text).not.toContain('dicht bij je grens')
  })

  it('exceeded ⇒ "boven je grens" met het overschrijdingsbedrag', () => {
    const { container } = render(
      <SpendLimitWidget
        size="half"
        limit={makeLimit({ currentMatchedAmount: 260, currentHeadroom: 0, currentOverAmount: 60, status: 'exceeded' })}
        dailyExp={50}
      />,
    )
    const text = (container.textContent ?? '').replace(/ /g, ' ')
    expect(text).toContain('boven je grens')
    expect(text).toMatch(/€\s*60/)
    expect(text).toContain('eroverheen')
  })
})

describe('SpendLimitWidget — vrijheidstijd (Geld is opgeslagen tijd)', () => {
  it('half: ruimte over ≈ exact de canonieke vrijheidstijd van de headroom', () => {
    const limit = makeLimit() // headroom = 80
    const dailyExp = 40
    const expected = formatFreedomTimeString(calculateFreedomTime(limit.currentHeadroom, dailyExp), 'short')
    const { container } = render(<SpendLimitWidget size="half" limit={limit} dailyExp={dailyExp} />)
    expect(container.textContent ?? '').toContain(`≈ ${expected} vrijheid over`)
  })

  it('half bij overschrijding: de overschrijding zelf in vrijheidstijd', () => {
    const limit = makeLimit({ currentMatchedAmount: 260, currentHeadroom: 0, currentOverAmount: 60, status: 'exceeded' })
    const dailyExp = 40
    const expected = formatFreedomTimeString(calculateFreedomTime(60, dailyExp), 'short')
    const { container } = render(<SpendLimitWidget size="half" limit={limit} dailyExp={dailyExp} />)
    expect(container.textContent ?? '').toContain(`≈ ${expected} vrijheid eroverheen`)
  })

  it('geen dagtarief (mock-/empty-bundel) ⇒ geen vrijheidsregel, geen verzonnen /30', () => {
    const { container } = render(<SpendLimitWidget size="xl" limit={makeLimit()} />)
    expect(container.textContent ?? '').not.toContain('vrijheid')
  })
})

describe('SpendLimitWidget — maskering', () => {
  it.each(ALL_SIZES)('%s: elk bedrag maskeert, reeks-getallen blijven zichtbaar', size => {
    mockPrivacy.masked = true
    const { container } = render(<SpendLimitWidget size={size} limit={makeLimit()} dailyExp={50} />)
    const text = container.textContent ?? ''
    // Geen enkel euroteken/bedrag mag overblijven.
    expect(text).not.toContain('€')
    expect(text).not.toMatch(/\b120\b/)
    expect(text).not.toMatch(/\b200\b/)
    // Reeks-getallen zijn AANTALLEN periodes, geen bedragen: die blijven staan.
    expect(text).toContain('4')
    if (size !== 'mini') expect(text).toContain(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('gemaskeerd: status en periode-context blijven leesbaar', () => {
    mockPrivacy.masked = true
    const { container } = render(<SpendLimitWidget size="xl" limit={makeLimit()} dailyExp={50} />)
    const text = container.textContent ?? ''
    expect(text).toContain('binnen je grens')
    expect(text).toContain('9/12')
    expect(text).toContain('augustus 2026')
  })
})

describe('SpendLimitWidget — deeplink', () => {
  it.each(ALL_SIZES)('%s linkt naar de transactiepagina met ?limit=<id>', size => {
    const { container } = render(<SpendLimitWidget size={size} limit={makeLimit()} dailyExp={50} />)
    const links = Array.from(container.querySelectorAll('a'))
    // Precies één href per tegel — de link staat op één plek in het component.
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('href')).toBe('/overzicht/budget/transacties?limit=POT-1')
  })
})

describe('SpendLimitWidget — truncatie-kanarie', () => {
  it('toont een betrouwbaarheids-melding i.p.v. een stil te laag getal', () => {
    const { container } = render(
      <SpendLimitWidget size="quarter" limit={makeLimit({ aggregateTruncationSuspected: true })} dailyExp={50} />,
    )
    expect(container.textContent ?? '').toContain('Dit bedrag kan onvolledig zijn.')
  })

  it('zonder kanarie geen melding', () => {
    const { container } = render(<SpendLimitWidget size="quarter" limit={makeLimit()} dailyExp={50} />)
    expect(container.textContent ?? '').not.toContain('Dit bedrag kan onvolledig zijn.')
  })
})

describe('SpendLimitWidget — alias', () => {
  it('toont de weergavenaam uit de copy-bron (default grenzenpot)', () => {
    // Buiten de provider valt useSpendLimitCopy terug op de default-alias; de
    // widget draagt dus nooit een eigen hardgecodeerde naam.
    render(<SpendLimitWidget size="quarter" limit={makeLimit()} dailyExp={50} />)
    expect(screen.getByText(/grenzenpot/i)).toBeInTheDocument()
  })

  it('gepauzeerde pot is als zodanig gemarkeerd', () => {
    const { container } = render(
      <SpendLimitWidget size="quarter" limit={makeLimit({ isActive: false })} dailyExp={50} />,
    )
    expect(container.textContent ?? '').toContain('gepauzeerd')
  })
})

/**
 * TEMPO-MARKERING + PROGNOSE (ADR 0119).
 *
 * De tegel rekent hier NIETS: de fracties en het bedrag komen kant-en-klaar uit
 * `limit.pace`. Wat de tests bewaken is dus of de juiste tak het juiste blok
 * toont — en, belangrijker, of het bedrag maskeert terwijl de tempo-regel
 * (percentages, geen bedrag) leesbaar blijft.
 */
const PACE_MET_BEDRAG: NonNullable<SpendLimitWidgetData['pace']> = {
  periodDays: 31,
  elapsedDays: 1,
  remainingDays: 30,
  elapsedFraction: 1 / 31,
  usedFraction: 0.6,
  baselineDailyAmount: 3.0978260869565215,
  basisPeriodCount: 3,
  projectedAmount: 212.93478260869566,
  projectedExceeds: true,
}

const PACE_ZONDER_BEDRAG: NonNullable<SpendLimitWidgetData['pace']> = {
  ...PACE_MET_BEDRAG,
  baselineDailyAmount: null,
  basisPeriodCount: 1,
  projectedAmount: null,
  projectedExceeds: null,
}

describe('SpendLimitWidget — tempo van de lopende periode', () => {
  it.each<WidgetSize>(['quarter', 'half', 'full', 'xl'])(
    'toont de tempo-regel op %s',
    (size) => {
      const { container } = render(
        <SpendLimitWidget size={size} limit={makeLimit({ pace: PACE_MET_BEDRAG })} dailyExp={50} />,
      )
      const text = container.textContent ?? ''
      expect(text).toContain('3% van augustus 2026 voorbij')
      expect(text).toContain('60% van je grens gebruikt')
    },
  )

  it('toont op mini niets extra — daar is geen ruimte voor', () => {
    const { container } = render(
      <SpendLimitWidget size="mini" limit={makeLimit({ pace: PACE_MET_BEDRAG })} dailyExp={50} />,
    )
    expect(container.textContent ?? '').not.toContain('voorbij')
  })

  it('houdt het prognosebedrag weg van de kleinste tegel, maar toont het op half en groter', () => {
    const quarter = render(
      <SpendLimitWidget size="quarter" limit={makeLimit({ pace: PACE_MET_BEDRAG })} dailyExp={50} />,
    )
    expect(quarter.container.textContent ?? '').not.toContain('op weg naar')
    quarter.unmount()

    for (const size of ['half', 'full', 'xl'] as WidgetSize[]) {
      const { container, unmount } = render(
        <SpendLimitWidget size={size} limit={makeLimit({ pace: PACE_MET_BEDRAG })} dailyExp={50} />,
      )
      expect(container.textContent ?? '').toContain('op weg naar')
      unmount()
    }
  })

  it('zet de tempo-markering op de balk, op de verstreken fractie', () => {
    const { container } = render(
      <SpendLimitWidget size="full" limit={makeLimit({ pace: PACE_MET_BEDRAG })} dailyExp={50} />,
    )
    // `calc(3.2258…% - 1px)` — de markering hangt aan pace.elapsedFraction en
    // niet aan het bedrag; zonder pace staat er geen enkele marker.
    const marker = container.querySelector('[style*="calc("]')
    expect(marker).not.toBeNull()
    expect((marker as HTMLElement).style.left).toContain('3.2258')
  })

  it('toont zonder tempo (dag/week-pot) geen regel en geen markering', () => {
    const { container } = render(
      <SpendLimitWidget size="full" limit={makeLimit({ pace: null })} dailyExp={50} />,
    )
    expect(container.textContent ?? '').not.toContain('voorbij')
    expect(container.querySelector('[style*="calc("]')).toBeNull()
  })

  it('laat het bedrag weg zolang de historie-poort dicht staat, de markering blijft', () => {
    const { container } = render(
      <SpendLimitWidget size="full" limit={makeLimit({ pace: PACE_ZONDER_BEDRAG })} dailyExp={50} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('3% van augustus 2026 voorbij')
    expect(text).not.toContain('op weg naar')
  })

  it('maskeert het prognoseBEDRAG maar houdt de tempo-regel leesbaar', () => {
    mockPrivacy.masked = true
    const { container } = render(
      <SpendLimitWidget size="full" limit={makeLimit({ pace: PACE_MET_BEDRAG })} dailyExp={50} />,
    )
    const text = container.textContent ?? ''
    // Percentages zijn geen bedrag en blijven staan (NFR-B2-04).
    expect(text).toContain('3% van augustus 2026 voorbij')
    expect(text).toContain('60% van je grens gebruikt')
    // Het bedrag zelf niet.
    expect(text).toContain('op weg naar')
    expect(text).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(text).not.toContain('212')
  })
})

describe('SpendLimitWidget — veilige centrering bij overloop', () => {
  // Op een smalle mobiele kaart kan de bedragregel wrappen en wordt de inhoud
  // hoger dan de vaste kaarthoogte. `justify-center` knipt dan boven ÉN onder
  // tekst half af (bug /overzicht 31 aug); auto-marges (`my-auto`) vallen bij
  // overloop terug op 0, zodat alleen de onderste (minst belangrijke) regel
  // wegvalt en de potnaam/status leesbaar blijven.
  it.each(['quarter', 'half'] as const)('%s centreert via my-auto, niet via justify-center', size => {
    const { container } = render(<SpendLimitWidget size={size} limit={makeLimit()} dailyExp={50} />)
    // De kicker-rail van de shell mag centreren (één kort label); de
    // content-kolom — herkenbaar aan de euro-bedragen — niet.
    const offenders = Array.from(container.querySelectorAll('.justify-center')).filter(el =>
      (el.textContent ?? '').includes('€'),
    )
    expect(offenders).toHaveLength(0)
    expect(container.querySelector('.my-auto')).not.toBeNull()
  })

  it('quarter houdt de bedragregel op een regel (compact, geen wrap)', () => {
    // Op een smalle mobiele cel (~136px content) wrapte "€ 55 van / € 100"
    // naar twee regels, waardoor de inhoud de vaste kaarthoogte overschreed
    // en er regels wegvielen. De quarter-bedragregel is daarom compact
    // (kleinere corpsen) en hard op een regel geklemd.
    const { container } = render(<SpendLimitWidget size="quarter" limit={makeLimit()} dailyExp={50} />)
    expect(container.querySelector('p.truncate.whitespace-nowrap')).not.toBeNull()
  })
})
