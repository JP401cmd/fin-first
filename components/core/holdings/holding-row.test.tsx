/**
 * Component-test voor de 52-weeks bereikstrook in `HoldingRow`.
 *
 * De strook is de enige plek in de app waar een kale koers context krijgt:
 * "€ 208" betekent iets heel anders naast een jaarbereik van € 61–€ 330 dan
 * naast € 200–€ 215. Precies daarom moet hij zwijgen zodra de meting zélf niet
 * klopt — de kolommen `fifty_two_week_high`/`_low` zijn NULL tot de
 * eerstvolgende koersvernieuwing, en een lege strook zou een bereik suggereren
 * dat niemand gemeten heeft.
 *
 * Wat hier vastligt:
 *  1. verborgen bij NULL (beide, en elk apart);
 *  2. verborgen bij `high <= low` en bij een koers buiten het bereik;
 *  3. het percentage tot de top is de gerénderde uitkomst van (high − koers) /
 *     high — niet "er staat een percentage";
 *  4. privacy-modus verbergt de bedragen maar houdt het percentage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoldingRow, type HoldingRowData } from './holding-row'

// Privacy-vlag als mutable stub: de echte provider hydrateert pas in een effect,
// en de rij hoeft die timing niet te bewijzen — alleen dat hij de vlag volgt.
const privacy = vi.hoisted(() => ({ masked: false }))
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: privacy.masked, setMasked: () => {}, toggle: () => {} }),
}))

// next/link zonder App-Router-context: een kale <a> volstaat, de rij test geen
// navigatie.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function holding(over: Partial<HoldingRowData> = {}): HoldingRowData {
  return {
    id: 'h-1',
    name: 'ASML Holding',
    ticker: 'ASML',
    units: 4,
    currentPrice: 208,
    avgPurchasePrice: 150,
    currency: 'EUR',
    dailyChangePercent: 0.4,
    lastPriceUpdate: '2026-08-10T09:00:00Z',
    isStale: false,
    isWinner: false,
    fiftyTwoWeekLow: 61,
    fiftyTwoWeekHigh: 330,
    ...over,
  }
}

function renderRow(over: Partial<HoldingRowData> = {}) {
  const data = holding(over)
  return render(
    <HoldingRow
      holding={data}
      weightPct={12.5}
      formattedValue="€ 832"
      formatLastUpdate={() => '10 aug'}
      onTransaction={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      onManualOverride={() => {}}
    />,
  )
}

/** De bereikstrook van de standaard-fixture, of `null` wanneer hij zwijgt. */
function strip() {
  return screen.queryByTestId('holding-52w-h-1')
}

beforeEach(() => {
  privacy.masked = false
})

describe('HoldingRow — 52-weeks bereik', () => {
  it('toont laag, hoog en de afstand tot de top', () => {
    renderRow()

    const bar = strip()
    expect(bar).not.toBeNull()
    // Regex met \s: formatteerders zetten een nbsp tussen € en bedrag.
    expect(bar).toHaveTextContent(/€\s*61,00/)
    expect(bar).toHaveTextContent(/€\s*330,00/)
    expect(screen.getByTestId('holding-52w-h-1-marker')).toBeInTheDocument()
  })

  // Given koers 208 in een bereik 61–330;
  // When de strook het gat tot de jaartop benoemt;
  // Then is dat (330 − 208) / 330 = 36,97% → "37,0% onder de top". Gepind op de
  // uitkomst, niet op "er staat een percentage": een verkeerde grondslag
  // (bijvoorbeeld delen door de koers, of door de bandbreedte) geeft óók een
  // net percentage en zou anders ongemerkt doorgaan.
  it('rekent de afstand tot de top over de jaartop, niet over de koers', () => {
    renderRow()

    const expected = ((330 - 208) / 330) * 100
    expect(expected.toFixed(1)).toBe('37.0')
    expect(strip()).toHaveTextContent('37,0% onder de top')
  })

  it('noemt de stand "op de jaartop" wanneer de koers de top raakt', () => {
    renderRow({ currentPrice: 330 })
    expect(strip()).toHaveTextContent('op de jaartop')
  })

  it('zet de marker op de relatieve positie binnen het bereik', () => {
    renderRow()
    // (208 − 61) / (330 − 61) = 54,6%
    const marker = screen.getByTestId('holding-52w-h-1-marker')
    expect(marker.style.left.startsWith('54.6')).toBe(true)
  })
})

describe('HoldingRow — 52-weeks bereik zwijgt bij onbruikbare data', () => {
  it('verbergt de strook wanneer het bereik nog niet is opgehaald (NULL)', () => {
    renderRow({ fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null })
    expect(strip()).toBeNull()
  })

  it('verbergt de strook wanneer alleen de bovengrens ontbreekt', () => {
    renderRow({ fiftyTwoWeekHigh: null })
    expect(strip()).toBeNull()
  })

  it('verbergt de strook wanneer alleen de ondergrens ontbreekt', () => {
    renderRow({ fiftyTwoWeekLow: null })
    expect(strip()).toBeNull()
  })

  it('verbergt de strook wanneer de velden helemaal niet meekomen', () => {
    const { fiftyTwoWeekHigh: _h, fiftyTwoWeekLow: _l, ...bare } = holding()
    render(
      <HoldingRow
        holding={bare as HoldingRowData}
        weightPct={12.5}
        formattedValue="€ 832"
        formatLastUpdate={() => '10 aug'}
        onTransaction={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onManualOverride={() => {}}
      />,
    )
    expect(strip()).toBeNull()
  })

  it('verbergt de strook wanneer high <= low', () => {
    renderRow({ fiftyTwoWeekHigh: 90, fiftyTwoWeekLow: 90 })
    expect(strip()).toBeNull()

    screen.getByTestId('holding-item-h-1') // sanity: de rij zelf staat er wél
  })

  it('verbergt de strook wanneer de koers boven het bereik ligt', () => {
    renderRow({ currentPrice: 400 })
    expect(strip()).toBeNull()
  })

  it('verbergt de strook wanneer de koers onder het bereik ligt', () => {
    renderRow({ currentPrice: 20 })
    expect(strip()).toBeNull()
  })

  it('verbergt de strook bij een uitverkochte positie', () => {
    renderRow({ units: 0 })
    expect(strip()).toBeNull()
  })
})

describe('HoldingRow — 52-weeks bereik onder privacy-modus', () => {
  it('toont geen bedragen maar behoudt de vorm en het percentage', () => {
    privacy.masked = true
    renderRow()

    const bar = strip()
    expect(bar).not.toBeNull()
    expect(bar).not.toHaveTextContent(/61,00/)
    expect(bar).not.toHaveTextContent(/330,00/)
    // Een percentage is geen bedrag: het verklapt de omvang van de portefeuille
    // niet en mag dus blijven staan.
    expect(bar).toHaveTextContent('37,0% onder de top')
    expect(bar?.getAttribute('aria-label')).not.toMatch(/61,00|330,00/)
  })
})
