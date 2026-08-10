/**
 * Tests voor CashflowLandingCards — alles wat op de WEERGAVEMODUS flipt.
 *
 * In **Volledig** blijft de landing wat hij was: vier kaarten met KPI,
 * venster-regel, status-dot en chevron-uitklap. In **Eenvoudig** vervalt de
 * Forecast-kaart (CF-2), renderen de resterende drie compact (CF-1): één
 * regel met icoon + label, zonder cijfers, status-dot of drilldown, en blijft
 * ook het venster-label weg (CF-3, herzien 10 aug 2026 — zonder cijfer is er
 * geen venster te duiden).
 *
 * Elk van die drie is los te breken zonder dat de ander het merkt — de
 * `compact`-prop kan verdwijnen terwijl de filter blijft, of andersom — dus ze
 * krijgen elk hun eigen assertie i.p.v. één "ziet er eenvoudig uit"-check.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import {
  CashflowLandingCards,
  CashflowLandingCardsSkeleton,
} from './cashflow-landing-cards'
import type { CashflowCard } from '@/lib/cashflow-cards'

// Optimistische PUT bij modus geen echte netwerk-call.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const CARDS: CashflowCard[] = [
  {
    key: 'budget',
    label: 'Budget',
    href: '/overzicht/cashflow/budget',
    tooltip: 'Plan en volg je maandbudgetten.',
    kpi: '€ 1.000/mnd',
    status: 'good',
    subText: 'Onder budget',
    kpiWindow: null,
    detail: { label: 'Budgetdekking', value: '80%', tip: 'Je zit op koers.', actionLabel: 'Bekijk budget' },
  },
  {
    key: 'transacties',
    label: 'Transacties',
    href: '/overzicht/cashflow/transacties',
    tooltip: 'Inkomsten en uitgaven van deze maand.',
    kpi: '+€ 1.100',
    status: 'good',
    subText: 'Goed gespaard deze maand',
    kpiWindow: 'in augustus tot nu toe',
    detail: { label: 'augustus tot nu toe', value: '26% spaarquote', tip: 'Inkomen € 4.200 · uitgaven € 3.100.', actionLabel: 'Bekijk transacties' },
  },
  {
    key: 'vaste-lasten',
    label: 'Vaste lasten',
    href: '/overzicht/cashflow/vaste-lasten',
    tooltip: 'Abonnementen en terugkerende kosten.',
    kpi: '€ 1.400/mnd',
    status: 'warn',
    subText: '33% van inkomen',
    kpiWindow: null,
    detail: { label: 'Vaste lasten', value: '€ 16.800/jr', tip: '12 terugkerende posten.', actionLabel: 'Bekijk vaste lasten' },
  },
  {
    key: 'forecast',
    label: 'Forecast',
    href: '/overzicht/cashflow/forecast',
    tooltip: 'Verwachte kasstroom 6 maanden vooruit.',
    kpi: '€ 42.000',
    status: 'good',
    subText: 'Saldo groeit',
    kpiWindow: null,
    detail: { label: 'Netto per maand', value: '+€ 1.100', tip: 'Verwacht saldo na 6 maanden: € 42.000.', actionLabel: 'Bekijk forecast' },
  },
]

function renderCards(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <CashflowLandingCards cards={CARDS} />
    </DisplayModeProvider>,
  )
}

/** Vind de kaart-<a> op zijn href (de hele kaart is een Link). */
function cardByHref(container: HTMLElement, href: string): HTMLAnchorElement {
  const el = container.querySelector(`a[href="${href}"]`)
  if (!el) throw new Error(`Geen kaart met href ${href}`)
  return el as HTMLAnchorElement
}

// ── Volledig: ongewijzigd ────────────────────────────────────────────────────

describe('CashflowLandingCards — Volledig blijft ongewijzigd', () => {
  it('rendert alle vier de kaarten, inclusief Forecast', () => {
    const { container } = renderCards('full')
    expect(container.querySelectorAll('a').length).toBe(4)
    expect(screen.getByText('Forecast')).toBeTruthy()
  })

  it('toont de chevron-uitklap', () => {
    renderCards('full')
    expect(screen.queryByRole('button', { name: /Toon detail Budget/i })).toBeTruthy()
  })

  it('toont KPI + status-substext op de kaart', () => {
    const { container } = renderCards('full')
    const card = cardByHref(container, '/overzicht/cashflow/transacties')
    expect(within(card).getByText('+€ 1.100')).toBeTruthy()
    expect(within(card).getByText('Goed gespaard deze maand')).toBeTruthy()
  })

  it('CF-3 — toont de venster-regel onder de KPI van de Transacties-kaart', () => {
    const { container } = renderCards('full')
    const card = cardByHref(container, '/overzicht/cashflow/transacties')
    expect(within(card).getByText('in augustus tot nu toe')).toBeTruthy()
  })

  it('CF-3 — een kaart zonder venster (kpiWindow null) krijgt géén lege regel', () => {
    const { container } = renderCards('full')
    const card = cardByHref(container, '/overzicht/cashflow/vaste-lasten')
    expect(within(card).queryByText(/tot nu toe/)).toBeNull()
  })
})

// ── CF-2: Forecast-kaart verdwijnt in Eenvoudig ─────────────────────────────

describe('CashflowLandingCards — CF-2: Forecast-kaart alleen in Volledig', () => {
  it('rendert drie kaarten in Eenvoudig', () => {
    const { container } = renderCards('simple')
    expect(container.querySelectorAll('a').length).toBe(3)
  })

  it('verbergt de Forecast-kaart, en houdt de andere drie navigeerbaar', () => {
    const { container } = renderCards('simple')
    expect(screen.queryByText('Forecast')).toBeNull()
    expect(container.querySelector('a[href="/overzicht/cashflow/forecast"]')).toBeNull()
    expect(cardByHref(container, '/overzicht/cashflow/budget')).toBeTruthy()
    expect(cardByHref(container, '/overzicht/cashflow/transacties')).toBeTruthy()
    expect(cardByHref(container, '/overzicht/cashflow/vaste-lasten')).toBeTruthy()
  })
})

// ── CF-1: compacte one-liners in Eenvoudig ──────────────────────────────────

describe('CashflowLandingCards — CF-1: compacte kaarten in Eenvoudig', () => {
  it('toont geen KPI of status-substext meer', () => {
    renderCards('simple')
    expect(screen.queryByText('€ 1.000/mnd')).toBeNull()
    expect(screen.queryByText('+€ 1.100')).toBeNull()
    expect(screen.queryByText('Goed gespaard deze maand')).toBeNull()
    // Het label blijft staan.
    expect(screen.getByText('Transacties')).toBeTruthy()
  })

  // CF-3, HERZIEN 10 aug 2026 na een melding van een testgebruiker. Het
  // venster-label bestaat om het maandcijfer te onderscheiden van de
  // 30-dagen-cijfers op de transactiepagina — het hangt dus aan het CIJFER. In
  // Eenvoudig toont de compacte kaart sinds CF-1 geen KPI meer, dus staat het
  // label daar onder een kaal label zonder iets te duiden. Deze twee asserties
  // pinnen de herziening vast: weg in Eenvoudig, ongewijzigd in Volledig (zie
  // de suite hierboven).
  it('CF-3 — het venster-label staat NIET op de compacte kaart', () => {
    const { container } = renderCards('simple')
    expect(screen.queryByText('in augustus tot nu toe')).toBeNull()
    const card = cardByHref(container, '/overzicht/cashflow/transacties')
    expect(card.textContent).not.toContain('tot nu toe')
  })

  it('CF-3 — geen enkele compacte kaart draagt nog een venster-regel', () => {
    const { container } = renderCards('simple')
    for (const href of [
      '/overzicht/cashflow/budget',
      '/overzicht/cashflow/transacties',
      '/overzicht/cashflow/vaste-lasten',
    ]) {
      expect(cardByHref(container, href).textContent).not.toContain('augustus')
    }
  })

  it('toont geen status-dot meer (de compacte kaart draagt geen status)', () => {
    const { container } = renderCards('simple')
    const card = cardByHref(container, '/overzicht/cashflow/budget')
    expect(card.querySelector('span[aria-hidden="true"][class*="rounded-full"]')).toBeNull()
  })

  it('verbergt de chevron-uitklap', () => {
    renderCards('simple')
    expect(screen.queryByRole('button', { name: /Toon detail Budget/i })).toBeNull()
  })
})

// ── Skeleton volgt dezelfde modus (anders CLS bij de instroom) ──────────────

describe('CashflowLandingCardsSkeleton — volgt de weergavemodus', () => {
  function skeletonTiles(mode: DisplayMode) {
    const { container } = render(
      <DisplayModeProvider initialMode={mode}>
        <CashflowLandingCardsSkeleton />
      </DisplayModeProvider>,
    )
    return container.querySelectorAll('.animate-pulse > div')
  }

  it('reserveert vier tegels in Volledig', () => {
    expect(skeletonTiles('full').length).toBe(4)
  })

  it('reserveert drie tegels in Eenvoudig — evenveel als er daadwerkelijk komen', () => {
    expect(skeletonTiles('simple').length).toBe(3)
  })

  // Vormpin, niet alleen een telling: sinds de CF-3-herziening draagt de
  // compacte kaart één tekstregel (het label). Reserveert de skeleton er twee,
  // dan klapt elke tegel in zodra de echte kaarten binnenkomen — precies de CLS
  // die deze fallback moest voorkomen.
  it('reserveert in Eenvoudig één tekstregel per tegel (geen venster-regel meer)', () => {
    const tiles = skeletonTiles('simple')
    for (const tile of Array.from(tiles)) {
      const textColumn = tile.querySelector('.min-w-0')
      expect(textColumn).toBeTruthy()
      expect(textColumn!.children.length).toBe(1)
    }
  })
})
