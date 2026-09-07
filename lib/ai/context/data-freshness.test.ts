import { describe, it, expect } from 'vitest'
import { buildDataFreshnessLine } from './data-freshness'
import {
  TX_STALE_AFTER_MONTHS,
  monthKeyLabel,
  transactionFreshness,
} from '@/lib/transaction-staleness'

/**
 * UR3-22 — Fin kreeg nul freshness-signalen mee. Deze suite grendelt drie dingen:
 *  A. bij verouderde data staat er een voorbehoud IN de context, met de
 *     canonieke maand erin;
 *  B. het voorbehoud verbiedt expliciet de "deze maand"-lezing — zonder die
 *     instructie zegt het model gewoon "deze maand" over stilstaande cijfers;
 *  C. bij verse data (én zonder historie) staat er niets: geen ruis, geen
 *     tokens, en geen voorbehoud dat de gebruiker leert het te negeren.
 *
 * De drempel komt uit `TX_STALE_AFTER_MONTHS` — geen los getal in de test, zodat
 * scherm en AI per constructie op dezelfde grens omslaan.
 */

const NOW = new Date(2026, 7, 31) // 31 augustus 2026
const STALE_MONTH = '2026-03' // 5 maanden achterstand

describe('buildDataFreshnessLine — verouderde data', () => {
  it('noemt de jongste maand in gewone taal', () => {
    const line = buildDataFreshnessLine(STALE_MONTH, NOW)
    expect(line).toBeTruthy()
    expect(line).toContain(monthKeyLabel(STALE_MONTH))
  })

  it('noemt de leeftijd zoals de banner die noemt', () => {
    expect(buildDataFreshnessLine(STALE_MONTH, NOW)).toContain('5 maanden geleden')
  })

  it('verbiedt de "deze maand"-lezing en noemt de uitweg', () => {
    const line = buildDataFreshnessLine(STALE_MONTH, NOW)!
    expect(line).toMatch(/NOOIT als "deze maand"/)
    expect(line).toMatch(/importeren|koppelen/)
  })

  it('benoemt WELKE cijfers eronder op transacties rusten', () => {
    const line = buildDataFreshnessLine(STALE_MONTH, NOW)!
    for (const veld of ['maandinkomen', 'maanduitgaven', 'spaarquote', 'dagtarief']) {
      expect(line).toContain(veld)
    }
  })
})

describe('buildDataFreshnessLine — zwijgt wanneer er niets te melden is', () => {
  it('zegt niets bij verse data', () => {
    expect(buildDataFreshnessLine('2026-07', NOW)).toBeNull()
  })

  it('zegt niets zonder historie', () => {
    expect(buildDataFreshnessLine(null, NOW)).toBeNull()
    expect(buildDataFreshnessLine(undefined, NOW)).toBeNull()
  })

  it('slaat om op exact dezelfde drempel als het scherm', () => {
    // Maand-index van STALE_MONTH ('2026-03' → 2, want Date-maanden tellen vanaf 0).
    const laatsteMaandIndex = Number(STALE_MONTH.slice(5, 7)) - 1

    // Eén maand vóór de drempel: nog niets te melden.
    const netVers = new Date(2026, laatsteMaandIndex + TX_STALE_AFTER_MONTHS - 1, 15)
    expect(transactionFreshness(STALE_MONTH, netVers).state).toBe('fresh')
    expect(buildDataFreshnessLine(STALE_MONTH, netVers)).toBeNull()

    // Precies óp de drempel: wél.
    const netStale = new Date(2026, laatsteMaandIndex + TX_STALE_AFTER_MONTHS, 15)
    expect(transactionFreshness(STALE_MONTH, netStale).state).toBe('stale')
    expect(buildDataFreshnessLine(STALE_MONTH, netStale)).toBeTruthy()
  })
})
