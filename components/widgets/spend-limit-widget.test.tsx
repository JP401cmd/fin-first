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
    expect(links[0].getAttribute('href')).toBe('/overzicht/cashflow/transacties?limit=POT-1')
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
