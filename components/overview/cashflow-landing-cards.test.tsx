/**
 * Tests voor CashflowLandingCards — alles wat op de WEERGAVEMODUS flipt.
 *
 * In **Volledig** blijft de landing wat hij was: vier kaarten met KPI,
 * venster-regel, status-dot en chevron-uitklap.
 *
 * In **Eenvoudig** — HERZIEN 28 aug 2026 (S4 + S5) — dragen de kaarten hun
 * OORDEEL als primaire regel en hun kerngetal mét venster daaronder
 * (`verdict`-variant van LeverageCard), en staan er net als in Volledig VIER.
 * Daarmee vervallen CF-1 (compacte one-liner zonder cijfer), de CF-3-herziening
 * van 10 aug (venster alleen in Volledig — het venster hing aan het cijfer, en
 * het cijfer is terug) én CF-2 (Forecast-kaart weg; die was op mobiel de enige
 * ingang naar de forecastpagina).
 *
 * Elk onderdeel is los te breken zonder dat de ander het merkt — de `variant`
 * kan omvallen terwijl de CF-2-filter blijft, of andersom — dus ze krijgen elk
 * hun eigen assertie i.p.v. één "ziet er eenvoudig uit"-check.
 *
 * ── W-003 + W-002 (7 sep 2026) ──────────────────────────────────────────────
 * Twee dingen erbij, en ze breken los van elkaar:
 *  · **W-003** — in Eenvoudig draaien de kaarten op `dense`: kleinere padding,
 *    chip en typetrap, mét het oordeel. De verleiding was `variant="compact"`
 *    (de /toekomst-vorm), en dát gooit het oordeel weg — de eigenaar besliste
 *    anders. De suite pint daarom BEIDE kanten: de maten ÉN het oordeel.
 *  · **W-002** — naast de gestatuste kaarten staat een losse instellingen-tegel.
 *    Die is met opzet géén `CashflowCardKey` en draagt dus geen status-dot; een
 *    test die alleen "er staat een vierde tegel" zou zeggen laat precies die
 *    fout door.
 *
 * LET OP bij het lezen van de tel-asserties: de fixture hieronder draagt VIER
 * kaarten (inclusief Budget), terwijl de echte pagina er via `budgetSubCards`
 * drie doorgeeft. Het component telt niet zelf — het rendert wat het krijgt,
 * plus één instellingen-tegel. Vandaar `CARDS.length + 1` i.p.v. een kaal
 * getal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { PrivacyProvider, useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { LEVERAGE_STATUS_LABEL } from '@/lib/leverage-status'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import {
  CashflowLandingCards,
  CashflowLandingCardsSkeleton,
  BUDGET_INSTELLINGEN_HREF,
} from './cashflow-landing-cards'
import { BUDGET_SUBCARD_KEYS, type CashflowCard } from '@/lib/cashflow-cards'

/** Zet de privacy-toggle aan binnen een echte `PrivacyProvider`. */
function MaskToggle() {
  const { setMasked } = useMaskedAmounts()
  return (
    <button type="button" data-testid="mask-on" onClick={() => setMasked(true)}>
      masker
    </button>
  )
}

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
    href: '/overzicht/budget',
    tooltip: 'Plan en volg je maandbudgetten.',
    kpi: '€ 1.000/mnd',
    status: 'good',
    subText: 'Onder budget',
    // Productievorm sinds de budgetpagina-pariteit: buildCashflowCards vult
    // hier de Volledig-grondslag. S4 bewijst dat Eenvoudig desondanks de
    // venster-copy toont — een null-fixture zou die regressie stil maskeren.
    kpiWindow: 'van € 1.234 uitgavenbudget',
    detail: { label: 'Budgetdekking', value: '80%', tip: 'Je zit op koers.', actionLabel: 'Bekijk budget' },
  },
  {
    key: 'transacties',
    label: 'Transacties',
    href: '/overzicht/budget/transacties',
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
    href: '/overzicht/budget/vaste-lasten',
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
    href: '/overzicht/budget/forecast',
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

/**
 * De kaart-SHELL (het `<div>` met de rand en de padding). Bij een `LeverageCard`
 * is dat de ouder van de `<a>`; de instellingen-tegel IS zelf de `<a>`.
 */
function shellOf(card: HTMLAnchorElement): HTMLElement {
  return (card.className.includes('rounded-2xl') ? card : card.parentElement) as HTMLElement
}

// ── Volledig: ongewijzigd ────────────────────────────────────────────────────

describe('CashflowLandingCards — Volledig blijft ongewijzigd', () => {
  it('rendert alle vier de kaarten, inclusief Forecast', () => {
    const { container } = renderCards('full')
    // +1 = de instellingen-tegel (W-002); het component telt niet zelf, het
    // rendert wat het krijgt.
    expect(container.querySelectorAll('a').length).toBe(CARDS.length + 1)
    expect(screen.getByText('Forecast')).toBeTruthy()
  })

  it('toont de chevron-uitklap', () => {
    renderCards('full')
    expect(screen.queryByRole('button', { name: /Toon detail Budget/i })).toBeTruthy()
  })

  it('toont KPI + status-substext op de kaart', () => {
    const { container } = renderCards('full')
    const card = cardByHref(container, '/overzicht/budget/transacties')
    expect(within(card).getByText('+€ 1.100')).toBeTruthy()
    expect(within(card).getByText('Goed gespaard deze maand')).toBeTruthy()
  })

  it('CF-3 — toont de venster-regel onder de KPI van de Transacties-kaart', () => {
    const { container } = renderCards('full')
    const card = cardByHref(container, '/overzicht/budget/transacties')
    expect(within(card).getByText('in augustus tot nu toe')).toBeTruthy()
  })

  it('CF-3 — een kaart zonder venster (kpiWindow null) krijgt géén lege regel', () => {
    const { container } = renderCards('full')
    const card = cardByHref(container, '/overzicht/budget/vaste-lasten')
    expect(within(card).queryByText(/tot nu toe/)).toBeNull()
  })
})

// ── S5: CF-2 teruggedraaid — vier kaarten in béide modi ─────────────────────
//
// HERZIEN 28 aug 2026 (S5). Deze suite pinde CF-2 vast ("rendert drie kaarten in
// Eenvoudig", "verbergt de Forecast-kaart"). Beide asserties zijn omgedraaid.
// CF-2's argument was "Forecast is geen landingsbelofte", maar de werkelijke
// schade was een KAPOTTE VERWIJSKETEN: op mobiel is deze kaart de enige
// contextuele ingang naar de forecastpagina (het Cashflow-item in nav-config
// heeft geen children, dus de NavMenuSheet toont de sub-pagina's niet). Sinds
// FC-1 heeft die pagina bovendien een eigen Eenvoudig-vorm.

describe('CashflowLandingCards — S5: Forecast-kaart in béide modi', () => {
  it('rendert vier kaarten in Eenvoudig, inclusief Forecast', () => {
    const { container } = renderCards('simple')
    expect(container.querySelectorAll('a').length).toBe(CARDS.length + 1)
    expect(cardByHref(container, '/overzicht/budget/forecast')).toBeTruthy()
  })

  it('houdt alle vier de sub-pagina\'s navigeerbaar vanaf de hub', () => {
    const { container } = renderCards('simple')
    for (const href of [
      '/overzicht/budget',
      '/overzicht/budget/transacties',
      '/overzicht/budget/vaste-lasten',
      '/overzicht/budget/forecast',
    ]) {
      expect(cardByHref(container, href)).toBeTruthy()
    }
  })

  it('geeft de Forecast-kaart hetzelfde oordeel + cijfer + venster als de rest', () => {
    const { container } = renderCards('simple')
    const card = cardByHref(container, '/overzicht/budget/forecast')
    expect(within(card).getByText('Saldo groeit')).toBeTruthy()
    expect(card.textContent).toContain('€ 42.000')
    expect(card.textContent).toContain('verwacht over zes maanden')
  })
})

// ── S4: oordeel-kaarten in Eenvoudig (vervangt CF-1) ────────────────────────
//
// HERZIEN 28 aug 2026. De vorige suite pinde CF-1 vast: "toont geen KPI of
// status-substext meer" en "geen enkele compacte kaart draagt nog een
// venster-regel". Beide asserties zijn OMGEDRAAID — bewust, niet per ongeluk.
// De hub stelde een vraag en gaf drie kale knoppen terug; het richtingsbesluit
// van R5 (duiding boven reductie) draait dat om. De CF-3-herziening van 10 aug
// valt met haar eigen redenering: die hing het venster aan het cijfer, en het
// cijfer is terug — dus is het venster terug, nu op ELKE kaart.

describe('CashflowLandingCards — S4: oordeel-kaarten in Eenvoudig', () => {
  it('toont per kaart het oordeel als primaire regel', () => {
    const { container } = renderCards('simple')
    expect(
      within(cardByHref(container, '/overzicht/budget')).getByText('Onder budget'),
    ).toBeTruthy()
    expect(
      within(cardByHref(container, '/overzicht/budget/transacties')).getByText(
        'Goed gespaard deze maand',
      ),
    ).toBeTruthy()
  })

  it('geeft de vaste-lasten-kaart een WOORD als oordeel en de quote als meetlat', () => {
    // `subText` is daar een verhouding ("33% van inkomen"), geen oordeel. Zonder
    // deze omkering zou de status alleen nog via kleur bestaan — precies wat de
    // S1-regel verbiedt. Het woord komt uit dezelfde lijst als de
    // vaste-lasten-detailpagina (S2), zodat hub en pagina niet uiteenlopen.
    const { container } = renderCards('simple')
    const card = cardByHref(container, '/overzicht/budget/vaste-lasten')
    expect(within(card).getByText(LEVERAGE_STATUS_LABEL.warn)).toBeTruthy()
    expect(card.textContent).toContain('33% van inkomen')
    expect(card.textContent).toContain('€ 1.400/mnd')
  })

  it('S4 — élke kaart draagt haar cijfer MÉT venster (kpiWindow verplicht)', () => {
    const { container } = renderCards('simple')
    const budget = cardByHref(container, '/overzicht/budget')
    expect(budget.textContent).toContain('€ 1.000/mnd')
    expect(budget.textContent).toContain('nog te besteden deze maand')

    // Transacties gebruikt het CANONIEKE, datum-gedreven venster uit
    // buildCashflowCards — niet de vaste fallback-copy.
    const tx = cardByHref(container, '/overzicht/budget/transacties')
    expect(tx.textContent).toContain('+€ 1.100')
    expect(tx.textContent).toContain('in augustus tot nu toe')
  })

  it('toont de status-dot weer, decoratief (S1-regel: één drager)', () => {
    const { container } = renderCards('simple')
    const card = cardByHref(container, '/overzicht/budget')
    const dot = card.querySelector('span[aria-hidden="true"][class*="rounded-full"]')
    expect(dot).toBeTruthy()
    // Zichtbaar oordeel aanwezig → géén tweede, sr-only statusdrager.
    expect(card.querySelector('.sr-only')).toBeNull()
  })

  it('verbergt de chevron-uitklap', () => {
    renderCards('simple')
    expect(screen.queryByRole('button', { name: /Toon detail Budget/i })).toBeNull()
  })

  it('valt bij een lege staat terug op het oordeel, zonder lege cijferregel', () => {
    const leeg: CashflowCard[] = CARDS.map((c) =>
      c.key === 'budget'
        ? { ...c, kpi: null, subText: 'Nog geen budget', status: 'neutral' as const }
        : c,
    )
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <CashflowLandingCards cards={leeg} />
      </DisplayModeProvider>,
    )
    const card = cardByHref(container, '/overzicht/budget')
    expect(within(card).getByText('Nog geen budget')).toBeTruthy()
    expect(card.textContent).not.toContain('nog te besteden deze maand')
  })
})

// ── Privacy-masking (S4, risico 8) ──────────────────────────────────────────
//
// Dit pad had er geen: de bedragen zijn server-side al tot strings
// geformatteerd, dus MaskedAmount/formatMaskedCurrency kwamen er niet bij. Met
// de cijfers terug in Eenvoudig — de standaardmodus voor nieuwe accounts — zou
// de privacy-toggle er stilzwijgend langs lopen.

describe('CashflowLandingCards — privacy-masking', () => {
  function renderMasked(mode: DisplayMode) {
    return render(
      <PrivacyProvider>
        <DisplayModeProvider initialMode={mode}>
          <MaskToggle />
          <CashflowLandingCards cards={CARDS} />
        </DisplayModeProvider>
      </PrivacyProvider>,
    )
  }

  it('maskeert de bedragen in Eenvoudig en laat de duiding staan', () => {
    const { container } = renderMasked('simple')
    fireEvent.click(screen.getByTestId('mask-on'))
    const card = cardByHref(container, '/overzicht/budget/transacties')
    expect(card.textContent).not.toContain('1.100')
    expect(card.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // Oordeel en venster zijn geen bedrag en blijven leesbaar.
    expect(card.textContent).toContain('Goed gespaard deze maand')
    expect(card.textContent).toContain('in augustus tot nu toe')
  })

  it('maskeert óók in Volledig (het gat was niet modus-specifiek)', () => {
    const { container } = renderMasked('full')
    fireEvent.click(screen.getByTestId('mask-on'))
    const card = cardByHref(container, '/overzicht/budget/vaste-lasten')
    expect(card.textContent).not.toContain('1.400')
    expect(card.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // Een percentage is geen bedrag en wordt niet gemaskeerd.
    expect(card.textContent).toContain('33% van inkomen')
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

  // HERZIEN 7 sep 2026 (W-003, bijvangst). Hier stond `toBe(4)` als kaal getal,
  // in béide modi — geschreven toen de hub vier gestatuste kaarten toonde. ADR
  // 0135 bracht de budgetpagina op DRIE (`budgetSubCards`) en deze fallback bleef
  // op vier staan: één tegel te veel reserveren is dezelfde CLS als er één te
  // weinig reserveren, alleen de andere kant op. De telling komt nu uit
  // `BUDGET_SUBCARD_KEYS` + de instellingen-tegel, dus hij kan niet opnieuw
  // wegdrijven van de kaartenset.
  for (const mode of ['full', 'simple'] as const) {
    it(`reserveert in ${mode} evenveel tegels als er komen (${BUDGET_SUBCARD_KEYS.length} kaarten + instellingen)`, () => {
      expect(skeletonTiles(mode).length).toBe(BUDGET_SUBCARD_KEYS.length + 1)
    })
  }

  // Vormpin, niet alleen een telling — HERZIEN 28 aug 2026 (S4 + S5), aangevuld
  // 7 sep 2026 (W-002). De status-tegel is geen one-liner maar een
  // verdict-kaart: icoon-chip + label + oordeel + bedrag/venster, vier blokken
  // onder elkaar. De instellingen-tegel heeft er DRIE — geen cijferregel, want
  // hij draagt geen KPI. Reserveert de skeleton de verkeerde vorm, dan groeit of
  // krimpt de tegel zodra de echte kaarten binnenkomen.
  it('reserveert in Eenvoudig vier blokken per status-tegel en drie voor instellingen', () => {
    const tiles = Array.from(skeletonTiles('simple'))
    const status = tiles.slice(0, BUDGET_SUBCARD_KEYS.length)
    const instellingen = tiles[tiles.length - 1]!
    for (const tile of status) {
      expect(tile.children.length).toBe(4)
    }
    expect(instellingen.children.length).toBe(3)
  })

  // W-003: de skeleton moet de dense-maat van de echte tegel spiegelen. Bleef
  // hij op `p-3 sm:p-4` staan, dan krimpt elke tegel bij de instroom.
  it('gebruikt in Eenvoudig de dense-padding, in Volledig de volle', () => {
    for (const tile of Array.from(skeletonTiles('simple'))) {
      expect(tile.className).toContain('p-2')
      expect(tile.className).not.toContain('p-3 sm:p-4')
    }
    for (const tile of Array.from(skeletonTiles('full'))) {
      expect(tile.className).toContain('p-3 sm:p-4')
    }
  })

  it('gebruikt in béide modi hetzelfde raster als de echte kaartenrij', () => {
    for (const mode of ['simple', 'full'] as const) {
      const { container, unmount } = render(
        <DisplayModeProvider initialMode={mode}>
          <CashflowLandingCardsSkeleton />
        </DisplayModeProvider>,
      )
      const grid = container.querySelector('.animate-pulse')
      expect(grid?.className).toContain('grid-cols-2')
      expect(grid?.className).toContain('md:grid-cols-4')
      unmount()
    }
  })
})

// ── W-003: kleiner in Eenvoudig, MÉT het oordeel ────────────────────────────
//
// De melder vroeg om "minimaliseren, zoals op de toekomst pagina". Daar staat
// `variant="compact"` — icoon + label, verder niets. De eigenaar besliste
// anders: kleiner mag, het oordeel blijft. Deze suite pint beide helften, want
// ze vallen los om: je kunt de maten terugdraaien zonder het oordeel te raken,
// en je kunt naar `compact` overstappen met dezelfde maten.

describe('CashflowLandingCards — W-003: dense in Eenvoudig', () => {
  it('geeft de kaart in Eenvoudig de dense-maten (padding, chip, typetrap)', () => {
    const { container } = renderCards('simple')
    const card = cardByHref(container, '/overzicht/budget/transacties')
    const shell = shellOf(card)

    expect(shell.className).toContain('p-2 sm:p-3')
    expect(shell.className).not.toContain('p-3 sm:p-4')
    // Chip 28/32px i.p.v. 32/36px.
    expect(card.querySelector('.w-7')).toBeTruthy()
    expect(card.querySelector('.w-9')).toBeNull()
    // Label en oordeel één typetrap lager.
    expect(within(card).getByText('Transacties').className).toContain('text-xs')
    expect(within(card).getByText('Goed gespaard deze maand').className).toContain('text-xs')
  })

  it('houdt Volledig op de volle maat — dense raakt alleen de verdict-tak', () => {
    const { container } = renderCards('full')
    const shell = shellOf(cardByHref(container, '/overzicht/budget/transacties'))
    expect(shell.className).toContain('p-3 sm:p-4')
    expect(shell.className).not.toContain('p-2 sm:p-3')
  })

  it('kleiner betekent NIET kaler: oordeel, cijfer, venster en status-dot blijven', () => {
    // Dit is de hele reden dat W-003 geen `variant="compact"` werd. Valt deze
    // test om, dan is het R5-richtingsbesluit stilletjes teruggedraaid.
    const { container } = renderCards('simple')
    const card = cardByHref(container, '/overzicht/budget/transacties')
    expect(within(card).getByText('Goed gespaard deze maand')).toBeTruthy()
    expect(card.textContent).toContain('+€ 1.100')
    expect(card.textContent).toContain('in augustus tot nu toe')
    expect(card.querySelector('span[aria-hidden="true"][class*="rounded-full"]')).toBeTruthy()
  })
})

// ── W-002: de vierde tegel is een INGANG, geen vierde kaart ─────────────────

describe('CashflowLandingCards — W-002: instellingen-tegel', () => {
  for (const mode of ['simple', 'full'] as const) {
    it(`staat er in ${mode} en wijst naar de instellingenpagina`, () => {
      const { container } = renderCards(mode)
      const tile = cardByHref(container, BUDGET_INSTELLINGEN_HREF)
      expect(tile.textContent).toContain('Instellingen')
      expect(tile.textContent).toContain('Schattingen en rekeningen')
    })
  }

  it('draagt GEEN status-dot en GEEN cijfer — hij meet niets', () => {
    // Zou de tegel als `CashflowCardKey`/LeverageCard zijn ingehangen, dan kreeg
    // hij een (lege) stip mee door de hele app, tot in de sidebar. Deze assertie
    // is het enige wat dat hard houdt.
    const { container } = renderCards('simple')
    const tile = cardByHref(container, BUDGET_INSTELLINGEN_HREF)
    expect(tile.querySelector('span[class*="rounded-full"]')).toBeNull()
    expect(tile.textContent).not.toMatch(/€/)
  })

  it('krimpt mee in Eenvoudig, net als de kaarten ernaast', () => {
    const { container: simple } = renderCards('simple')
    expect(shellOf(cardByHref(simple, BUDGET_INSTELLINGEN_HREF)).className).toContain('p-2 sm:p-3')
    const { container: full } = renderCards('full')
    expect(shellOf(cardByHref(full, BUDGET_INSTELLINGEN_HREF)).className).toContain('p-3 sm:p-4')
  })
})
