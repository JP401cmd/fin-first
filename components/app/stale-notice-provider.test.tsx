import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StaleNoticeProvider, StaleNoticeDot } from './stale-notice-provider'
import { StaleTransactionsBanner } from './stale-transactions-banner'
import { transactionFreshness } from '@/lib/transaction-staleness'
import {
  STALE_TX_NOTICE_MINIMIZE_KEY,
  STALE_TX_ESCALATION_MONTHS,
} from '@/lib/transaction-staleness-minimize'

/**
 * Gedrags-tests op het minimaliseren van de "Gegevens verouderd"-melding (B-015).
 *
 * Wat hier bewezen moet worden (en wat de pure unit-test op
 * `resolveStaleNoticeDisplay` NIET dekt):
 *  A. de banner en het statuspunt delen ÉÉN toestand — het punt verschijnt pas
 *     als de banner verdwijnt, en omgekeerd;
 *  B. minimaliseren schrijft het aantal MAANDEN naar het BESTAANDE pref-schrijfpad
 *     (`PUT /api/overzicht/page-status`) onder `/overzicht/gegevens-verouderd` —
 *     geen nieuwe route, geen localStorage;
 *  C. het geschreven getal is de UITVOER VAN DE CANONIEKE MOTOR voor dezelfde
 *     invoer (`transactionFreshness(...).monthsBehind`), niet "een getal";
 *  D. een server-geseede waarde maakt de melding meteen geminimaliseerd — al op
 *     de EERSTE render, dus zonder flits;
 *  E. escalatie (+STALE_TX_ESCALATION_MONTHS) heropent, één maand extra niet;
 *  F. zónder provider blijft de melding uitgeklapt en is minimaliseren niet
 *     aangeboden (geen knop die niets onthoudt);
 *  G. een mislukte PUT rolt de optimistische toestand terug.
 */

// next/link → simpele anchor (geen router-context nodig in jsdom).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

/** De datum van de oorspronkelijke bugmelding (UR2-13); 5 maanden achterstand. */
const NOW = new Date(2026, 7, 31)
const LATEST_MONTH = '2026-03'

/** De canonieke achterstand voor deze invoer — geen los getal in de test. */
const MONTHS_BEHIND = transactionFreshness(LATEST_MONTH, NOW).monthsBehind

function setup(initialMinimizedMonths: number | null = null) {
  return render(
    <StaleNoticeProvider
      monthsBehind={MONTHS_BEHIND}
      initialMinimizedMonths={initialMinimizedMonths}
    >
      <StaleNoticeDot />
      <StaleTransactionsBanner latestTransactionMonth={LATEST_MONTH} now={NOW} />
    </StaleNoticeProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StaleNoticeProvider — uitgeklapt ↔ geminimaliseerd', () => {
  it('toont de banner en géén statuspunt zolang er niet geminimaliseerd is', () => {
    setup()
    expect(screen.getByTestId('stale-transactions-warning')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })

  it('klapt na "Minimaliseren" in tot het statuspunt', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    expect(screen.queryByTestId('stale-transactions-warning')).toBeNull()
    expect(screen.getByRole('button', { name: /toon de melding/i })).toBeTruthy()
  })

  it('heropent via het statuspunt', () => {
    setup(MONTHS_BEHIND)
    fireEvent.click(screen.getByRole('button', { name: /toon de melding/i }))
    expect(screen.getByTestId('stale-transactions-warning')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })
})

describe('StaleNoticeProvider — statuspunt (a11y + kleur)', () => {
  it('is een echte knop met een aria-label en een stoplicht-oranje punt', () => {
    const { container } = setup(MONTHS_BEHIND)
    const knop = screen.getByRole('button', { name: /toon de melding/i })
    expect(knop.tagName).toBe('BUTTON')
    expect(knop.getAttribute('aria-label')).toMatch(/Aandacht/)
    // Stoplichtkleur, GEEN module-accent (CLAUDE.md-kleurconventie).
    expect(container.querySelector('.bg-amber-500')).toBeTruthy()
  })
})

describe('StaleNoticeProvider — server-side onthouden', () => {
  it('schrijft de canonieke achterstand naar het gedeelde pref-schrijfpad', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/overzicht/page-status')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({
      route: STALE_TX_NOTICE_MINIMIZE_KEY,
      level: MONTHS_BEHIND,
    })
    // De grendel: het geschreven niveau is de motor-uitvoer, niet een los getal.
    expect(MONTHS_BEHIND).toBe(transactionFreshness(LATEST_MONTH, NOW).monthsBehind)
  })

  it('wist de voorkeur (level null) bij heropenen', () => {
    setup(MONTHS_BEHIND)
    fireEvent.click(screen.getByRole('button', { name: /toon de melding/i }))
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      route: STALE_TX_NOTICE_MINIMIZE_KEY,
      level: null,
    })
  })

  it('een server-geseede waarde is al op de EERSTE render ingeklapt (geen flits)', () => {
    // Geen act()/effect-ronde ertussen: de eerste render moet het punt al tonen.
    setup(MONTHS_BEHIND)
    expect(screen.queryByTestId('stale-transactions-warning')).toBeNull()
    expect(screen.getByRole('button', { name: /toon de melding/i })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rolt terug wanneer de PUT faalt', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(screen.getByTestId('stale-transactions-warning')).toBeTruthy()
  })
})

describe('StaleNoticeProvider — escalatie heropent', () => {
  it('blijft ingeklapt bij één maand extra (de kalender is geen escalatie)', () => {
    render(
      <StaleNoticeProvider
        monthsBehind={MONTHS_BEHIND! + 1}
        initialMinimizedMonths={MONTHS_BEHIND}
      >
        <StaleNoticeDot />
        <StaleTransactionsBanner latestTransactionMonth={LATEST_MONTH} now={NOW} />
      </StaleNoticeProvider>,
    )
    expect(screen.queryByTestId('stale-transactions-warning')).toBeNull()
  })

  it(`heropent bij +${STALE_TX_ESCALATION_MONTHS} maanden, ondanks de opgeslagen voorkeur`, () => {
    render(
      <StaleNoticeProvider
        monthsBehind={MONTHS_BEHIND! + STALE_TX_ESCALATION_MONTHS}
        initialMinimizedMonths={MONTHS_BEHIND}
      >
        <StaleNoticeDot />
        <StaleTransactionsBanner latestTransactionMonth={LATEST_MONTH} now={NOW} />
      </StaleNoticeProvider>,
    )
    expect(screen.getByTestId('stale-transactions-warning')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })
})

describe('StaleTransactionsBanner — zonder provider', () => {
  it('blijft uitgeklapt en biedt geen minimaliseer-knop aan', () => {
    render(<StaleTransactionsBanner latestTransactionMonth={LATEST_MONTH} now={NOW} />)
    expect(screen.getByTestId('stale-transactions-warning')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Minimaliseren' })).toBeNull()
  })
})
