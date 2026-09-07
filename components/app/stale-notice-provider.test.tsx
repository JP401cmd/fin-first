import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StaleNoticeProvider, StaleNoticeDot } from './stale-notice-provider'
import { StaleNoticeBanner } from './stale-transactions-notice'
import { transactionFreshness, transactionAgeLabel } from '@/lib/transaction-staleness'
import {
  STALE_TX_NOTICE_MINIMIZE_KEY,
  STALE_TX_ESCALATION_MONTHS,
} from '@/lib/transaction-staleness-minimize'

/**
 * Gedrags-tests op het minimaliseren van de "Gegevens verouderd"-melding (B-015),
 * sinds UR3-22 op de gedeelde vorm: `StaleDataGuard` seedt de provider en de twee
 * plaatsbare vormen (`StaleNoticeBanner` + `StaleNoticeDot`) lezen 'm uit.
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
 *  F. verse data (geen achterstand) levert géén melding en géén punt;
 *  G. een mislukte PUT rolt de optimistische toestand terug;
 *  H. UR3-22 — de melding is niet meer half aan te zetten: zonder guard/provider
 *     rendert de banner niets, in plaats van een melding zonder terughaalpunt.
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

/** De canonieke achterstand + teksten voor deze invoer — geen losse getallen/strings. */
const FRESHNESS = transactionFreshness(LATEST_MONTH, NOW)
const MONTHS_BEHIND = FRESHNESS.monthsBehind
const LABEL = FRESHNESS.latestMonthLabel
const AGE_LABEL = transactionAgeLabel(MONTHS_BEHIND)

/** Wat `StaleDataGuard` server-side aan de provider meegeeft. */
function renderSeeded(
  monthsBehind: number | null,
  initialMinimizedMonths: number | null = null,
) {
  return render(
    <StaleNoticeProvider
      monthsBehind={monthsBehind}
      initialMinimizedMonths={initialMinimizedMonths}
      latestMonthLabel={monthsBehind == null ? null : LABEL}
      ageLabel={monthsBehind == null ? null : AGE_LABEL}
    >
      <StaleNoticeDot />
      <StaleNoticeBanner />
    </StaleNoticeProvider>,
  )
}

function setup(initialMinimizedMonths: number | null = null) {
  return renderSeeded(MONTHS_BEHIND, initialMinimizedMonths)
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

  it('noemt de canonieke maand en leeftijd uit de server-seed', () => {
    setup()
    const melding = screen.getByTestId('stale-transactions-warning')
    expect(melding.textContent).toContain('Gegevens verouderd')
    expect(melding.textContent).toContain(LABEL!)
    expect(melding.textContent).toContain(AGE_LABEL!)
  })

  it('wijst naar de uitweg — anders is het een melding zonder handeling', () => {
    setup()
    expect(
      screen.getByRole('link', { name: 'Transacties importeren' }).getAttribute('href'),
    ).toBe('/core/cash/import')
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
    renderSeeded(MONTHS_BEHIND! + 1, MONTHS_BEHIND)
    expect(screen.queryByTestId('stale-transactions-warning')).toBeNull()
  })

  it(`heropent bij +${STALE_TX_ESCALATION_MONTHS} maanden, ondanks de opgeslagen voorkeur`, () => {
    renderSeeded(MONTHS_BEHIND! + STALE_TX_ESCALATION_MONTHS, MONTHS_BEHIND)
    expect(screen.getByTestId('stale-transactions-warning')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })
})

describe('StaleNoticeBanner — verse data en ontbrekende guard', () => {
  it('rendert niets wanneer de guard geen achterstand meldt', () => {
    renderSeeded(null)
    expect(screen.queryByTestId('stale-transactions-warning')).toBeNull()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })

  it('rendert niets zonder guard/provider — de melding is niet half aan te zetten', () => {
    render(<StaleNoticeBanner />)
    expect(screen.queryByTestId('stale-transactions-warning')).toBeNull()
  })
})
