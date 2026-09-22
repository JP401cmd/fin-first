import { describe, it, expect, afterEach, vi } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MiniNetWorthChart } from './mini-networth-chart'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER, formatApproxCurrency, formatCurrency } from '@/lib/format'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import { deflate, factorAtAge } from '@/lib/euro-display'
import { buildSimNetWorthRows } from '@/lib/horizon/networth-rows'
import { localMonthStart } from '@/lib/month-range'
import { VrijheidsvoortgangWidget } from '@/components/widgets/vrijheidsvoortgang-widget'
import type { DashboardData } from '@/components/widgets/widget-renderer'

// MiniNetWorthChart rendert NetWorthHistorySheet onvoorwaardelijk (de `open`-prop
// gate't alleen zichtbaarheid); die child roept sinds de handmatige-historie-editor
// `useRouter()` aan. Zonder app-router-context crasht elke render hier — mock
// next/navigation zodat de chart-tests de sheet kunnen mounten.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

// De KRUIS-consistentietest (AC-F4/T13) rendert óók het /overzicht-widget dat
// hetzelfde FIRE-doel toont; dat widget leest het perspectief. Personal =
// hetzelfde gedrag als buiten de provider.
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

/**
 * Tests voor MiniNetWorthChart — compacte projectie-chart naast Health
 * Score. Gebruikt nu `simNetWorthRows` uit de loader (geprojecteerd VOLLEDIG
 * netto vermogen, incl. niet-liquide assets) zodat de projectielijn continu
 * doorloopt vanuit het Vandaag-punt (geen dip op huis-filterende modi). Tests
 * valideren render-states + reeks-injectie + Vrijheid-marker + de twee kaarten
 * (verleden → samengevoegd venster, toekomst → /toekomst) + geschatte historie.
 */

/**
 * De chart leest sinds OVZ-4 (eenvoudige weergave, fase 1) `useDisplayMode()`
 * voor de legenda-versobering. Buiten een provider valt die hook bewust terug
 * op 'simple'; de tests hieronder beschrijven het VOLLEDIG-beeld, dus rendert
 * deze wrapper standaard binnen een 'full'-provider. De Eenvoudig-variant heeft
 * een eigen describe-blok dat expliciet `'simple'` meegeeft.
 */
function render(ui: ReactElement, mode: DisplayMode = 'full') {
  return rtlRender(<DisplayModeProvider initialMode={mode}>{ui}</DisplayModeProvider>)
}

function buildHistory(values: number[]): { month: string; value: number }[] {
  return values.map((value, i) => {
    // localMonthStart: `new Date(2025, i, 1).toISOString()` gaf in NL (UTC+) de
    // vórige maand, dus de fixture liep een maand achter op zijn bedoeling.
    return { month: localMonthStart(new Date(2025, i, 1)).slice(0, 7), value }
  })
}

function buildSimRows(
  startAge: number,
  fireAge: number,
  startValue: number,
  growthRate = 0.07,
): { age: number; netWorth: number }[] {
  const rows: { age: number; netWorth: number }[] = []
  let value = startValue
  for (let age = startAge; age <= fireAge; age++) {
    value = value * (1 + growthRate)
    rows.push({ age, netWorth: Math.round(value) })
  }
  return rows
}

describe('MiniNetWorthChart — render-states', () => {
  it('toont empty-state placeholder bij currentAge=null', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={null}
        fireAge={null}
        endAge={null}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont empty-state placeholder bij endAge=null', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={35}
        fireAge={null}
        endAge={null}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont empty-state placeholder bij endAge ≤ currentAge', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={70}
        fireAge={null}
        endAge={65}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont empty-state placeholder zonder simRows zelfs met fireAge', () => {
    // simRows-null = simulatie mislukt server-side → empty-state, niet
    // een eigen lineaire benadering. Garandeert dat /overzicht nooit
    // afwijkt van /toekomst.
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={null}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont "pensioen"-label in empty-state bij isPensioenMode=true', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={null}
        fireAge={null}
        endAge={null}
        isPensioenMode={true}
      />,
    )
    expect(screen.getByText(/pensioen/)).toBeTruthy()
  })
})

describe('MiniNetWorthChart — projectie-render met simRows', () => {
  it('rendert chart-header "Netto vermogen door de tijd"', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000, 105_000, 110_000])}
        currentNetWorth={110_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 110_000)}
      />,
    )
    expect(screen.getByText('Netto vermogen door de tijd')).toBeTruthy()
  })

  it('rendert huidig bedrag in serif-font', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={187_400}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 187_400)}
      />,
    )
    expect(container.textContent).toContain('€')
    expect(container.textContent).toContain('187')
  })

  it('rendert vrijheid-marker label "Vrijheid X" wanneer fireAge in range', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        isPensioenMode={false}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    // Zonder simRequiredPortfolio staat het label zowel op de SVG-eindmarker
    // als (N2) in de legenda die de marker duidt — getAllByText i.p.v. getByText.
    expect(screen.getAllByText(/Vrijheid 52/).length).toBeGreaterThan(0)
  })

  it('rendert pensioen-marker bij isPensioenMode', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={67}
        endAge={67}
        isPensioenMode={true}
        simNetWorthRows={buildSimRows(35, 67, 100_000)}
      />,
    )
    expect(screen.getAllByText(/Pensioen 67/).length).toBeGreaterThan(0)
  })

  it('toont vandaag-leeftijd-label', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={42}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(42, 52, 100_000)}
      />,
    )
    expect(screen.getByText(/Vandaag.*42/)).toBeTruthy()
  })

  it('Link wijst naar /toekomst voor verdieping', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={null}
        fireAge={null}
        endAge={null}
      />,
    )
    const link = container.querySelector('a[href="/toekomst"]')
    expect(link).toBeTruthy()
  })

  it('toont GEEN "Benadering"-disclaimer (gebruikt nu echte simRows)', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    // Voorheen: "Benadering met X%/jaar groei". Sinds we de echte
    // unifiedProjection-rows gebruiken (zelfde data als /toekomst) is
    // dat geen benadering meer en is de disclaimer weg.
    expect(container.textContent).not.toMatch(/Benadering/)
  })

  it('toont het liquide vrijheidsdoel NIET meer op de kaart (staat op /toekomst)', () => {
    // Eigenaar-besluit tweedeling vermogenskaart (sep 2026): het label
    // "Vrijheidsdoel ca. € … liquide" vervalt uit de toekomst-kaart. Was:
    // "toont simRequiredPortfolio als APART liquide-vrijheidsdoel-label".
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
        simRequiredPortfolio={915_600}
      />,
    )
    expect(container.textContent).not.toMatch(/Vrijheidsdoel/)
    expect(container.textContent).not.toMatch(/liquide/)
    expect(container.textContent).not.toContain('920')
  })

  it('kop beschrijft het plan ("Vrij op 52") met het verwachte bedrag eronder, niet een doel (B4)', () => {
    // Was: "Vermogen bij vrijheid → €X". Eigenaar-besluit: de toekomst-kaart
    // opent met de kop van het plan; het bedrag op de knip-leeftijd staat
    // eronder als "ca. €X". De oude doel-copy "€X bij vrijheid" blijft verboden.
    const rows = buildSimRows(35, 52, 100_000)
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={rows}
      />,
    )
    expect(screen.getByText('Vrij op 52')).toBeTruthy()
    const eind = rows[rows.length - 1].netWorth + (100_000 - rows[0].netWorth)
    expect(screen.getByTestId('nw-toekomst-incl').textContent).toBe(formatApproxCurrency(eind))
    expect(container.textContent).not.toMatch(/€[\d.]+ bij vrijheid/)
  })

  it('rendert confidence-band als zachte gradient polygon (plan F-4)', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    // Band is een <path> met fill (geen stroke) en lage opacity
    const fillPaths = Array.from(container.querySelectorAll('path[fill]'))
      .filter((p) => p.getAttribute('fill') !== 'none')
    expect(fillPaths.length).toBeGreaterThan(0)
  })

  it('toont legenda-tekst "Onzekerheid (P40–P60)"', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    expect(screen.getByText(/Onzekerheid \(P40–P60\)/i)).toBeTruthy()
  })

  /**
   * OVZ-4 (eenvoudige weergave, fase 1): de legenda verliest het percentiel-
   * jargon en de vier regels vallen terug op "Verloop" + "Bandbreedte". De
   * grafiek zelf verandert niet — alleen wat eronder staat.
   */
  it('Eenvoudig: legenda toont "Verloop" + "Bandbreedte", geen P40–P60', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
      'simple',
    )
    expect(screen.getByText('Verloop')).toBeTruthy()
    expect(screen.getByText('Bandbreedte')).toBeTruthy()
    expect(screen.queryByText(/P40/)).toBeNull()
    expect(screen.queryByText(/^Historisch/)).toBeNull()
    expect(screen.queryByText('Projectie')).toBeNull()
  })

  it('Eenvoudig: geen kaal leeftijdsgetal meer in kop en legenda ("verloop tot 90")', () => {
    // fireAge <= currentAge → vrijheid bereikt: dit is precies de stand waarin
    // de kop "Vrijheid bereikt — verloop tot 90" toonde en de legenda "Tot 90".
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={62}
        fireAge={55}
        endAge={90}
        simNetWorthRows={buildSimRows(62, 90, 100_000)}
      />,
      'simple',
    )
    expect(screen.getByText(/Vrijheid bereikt$/)).toBeTruthy()
    expect(screen.queryByText(/verloop tot/i)).toBeNull()
    // "Tot 90" mag alléén nog als annotatie ÍN de grafiek staan (de as-markering
    // bij de eindmarker, net als "Vandaag (45)"); buiten het grafiekvlak — in
    // kop of legenda — hoort het kale leeftijdsgetal niet meer thuis. De labels
    // zijn sinds de tweedeling HTML in het grafiekdeel (geen vervormde svg-tekst
    // onder preserveAspectRatio="none"), dus de toets is "binnen [data-nw-plot]"
    // i.p.v. "is een <text>-element".
    const totEindleeftijd = screen.queryAllByText(/Tot 90/)
    expect(totEindleeftijd.length).toBeGreaterThan(0)
    expect(totEindleeftijd.every((el) => el.closest('[data-nw-plot]') != null)).toBe(true)
    // De horizon-marker houdt wél een legenda-regel — anders zweeft er een
    // gekleurde streep zonder betekenis in de grafiek.
    expect(screen.getByText('Tot je eindleeftijd')).toBeTruthy()
  })

  it('historische curve render als stippellijn (strokeDasharray)', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    // Zoek paths met stroke-dasharray (history is dashed, projectie niet)
    const paths = container.querySelectorAll('path[stroke-dasharray]')
    expect(paths.length).toBeGreaterThan(0)
  })
})

describe('MiniNetWorthChart — minimaal 3 maanden historie', () => {
  it('≥3 echte waarderingen → legenda "Historisch" zonder schattings-label', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
        monthlySavings={1_000}
      />,
    )
    expect(screen.getByText('Historisch')).toBeTruthy()
    expect(screen.queryByText(/deels geschat/)).toBeNull()
  })

  it('<3 echte waarderingen → maanden aangevuld met geschat verloop', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
        monthlySavings={1_000}
      />,
    )
    expect(screen.getByText(/Historisch \(deels geschat\)/)).toBeTruthy()
  })

  it('zonder enige waardering → volledig geschat verloop van 3 maanden', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
        monthlySavings={1_000}
      />,
    )
    expect(screen.getByText(/Historisch \(deels geschat\)/)).toBeTruthy()
  })
})

describe('MiniNetWorthChart — klikzones', () => {
  const props = {
    netWorthHistory: buildHistory([90_000, 95_000, 100_000]),
    currentNetWorth: 100_000,
    currentAge: 35,
    fireAge: 52,
    endAge: 67,
    simNetWorthRows: buildSimRows(35, 52, 100_000),
  }

  it('verleden-kaart is een button die het netto-vermogen-venster (met verloop) opent', () => {
    render(<MiniNetWorthChart {...props} />)
    const pastZone = screen.getByRole('button', {
      name: /verloop van je netto vermogen/i,
    })
    expect(pastZone).toBeTruthy()
    // Venster is dicht vóór klik. Was: titel "Netto vermogen — verloop"; het
    // verloop leeft nu in het samengevoegde venster "Netto vermogen", dus de
    // toets kijkt naar de maandtabel-kop van het verloop.
    expect(screen.queryByText('Stand · verschil')).toBeNull()
    fireEvent.click(pastZone)
    expect(screen.getByText('Stand · verschil')).toBeTruthy()
    expect(screen.getByText('Vandaag')).toBeTruthy()
  })

  it('toekomst-kaart is een link naar /toekomst', () => {
    // Was: `a[href="/toekomst"][aria-label*="projectie"]`. De naam komt nu uit
    // de zichtbare kop via aria-labelledby (een aria-label zou de bedragen
    // wegdrukken), dus de toets gaat via de toegankelijke naam.
    render(<MiniNetWorthChart {...props} />)
    const futureCard = screen.getByRole('link', { name: /projectie/i })
    expect(futureCard.getAttribute('href')).toBe('/toekomst')
    expect(futureCard.textContent).not.toBe('')
  })

  it('popup toont geschatte maanden met "geschat"-label', () => {
    render(
      <MiniNetWorthChart
        {...props}
        netWorthHistory={buildHistory([100_000])}
        monthlySavings={2_000}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /verloop van je netto vermogen/i }),
    )
    expect(screen.getAllByText('geschat').length).toBeGreaterThan(0)
  })
})

describe('MiniNetWorthChart — vrijheid bereikt → doorlopen tot eindleeftijd', () => {
  it('fireAge ≤ currentAge → projectie tot endAge met "Tot {endAge}"-marker', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([900_000, 950_000, 1_000_000])}
        currentNetWorth={1_000_000}
        currentAge={55}
        fireAge={50}
        endAge={90}
        simNetWorthRows={buildSimRows(55, 90, 1_000_000, 0.03)}
      />,
    )
    // "Tot 90" staat op de SVG-eindmarker én (N2, geen liquide doel) in de
    // duidende legenda — getAllByText. De header-tekst blijft uniek.
    expect(screen.getAllByText(/Tot 90/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Vrijheid bereikt — verloop tot 90/)).toBeTruthy()
  })

  it('fireAge in de toekomst → weergave stopt bij fireAge (geen endAge-marker)', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={90}
        simNetWorthRows={buildSimRows(35, 90, 100_000)}
      />,
    )
    expect(screen.getAllByText(/Vrijheid 52/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Tot 90/)).toBeNull()
  })
})

describe('MiniNetWorthChart — dubbele grondslag (excl. eigen woning)', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  const baseProps = {
    netWorthHistory: buildHistory([100_000]),
    currentNetWorth: 300_000,
    currentAge: 35,
    fireAge: 52,
    endAge: 67,
    simNetWorthRows: buildSimRows(35, 52, 300_000),
  }

  it('toont de "excl. eigen woning"-subregel wanneer showExclHome=true', () => {
    const { container } = render(
      <MiniNetWorthChart {...baseProps} netWorthExclHome={130_000} showExclHome />,
    )
    expect(container.textContent).toMatch(/excl\. eigen woning/i)
    expect(container.textContent).toContain('130')
  })

  it('toont GEEN excl.-regel wanneer showExclHome=false (byte-identiek default)', () => {
    const { container } = render(
      <MiniNetWorthChart {...baseProps} netWorthExclHome={130_000} showExclHome={false} />,
    )
    expect(container.textContent).not.toMatch(/excl\. eigen woning/i)
    expect(container.textContent).not.toContain('130')
  })

  it('toont GEEN excl.-regel wanneer netWorthExclHome ontbreekt (null)', () => {
    const { container } = render(
      <MiniNetWorthChart {...baseProps} netWorthExclHome={null} showExclHome />,
    )
    expect(container.textContent).not.toMatch(/excl\. eigen woning/i)
  })

  it('maskeert het excl.-bedrag bij privacy-masking (label blijft)', () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    const { container } = render(
      <PrivacyProvider>
        <MiniNetWorthChart {...baseProps} netWorthExclHome={130_000} showExclHome />
      </PrivacyProvider>,
    )
    expect(container.textContent).toMatch(/excl\. eigen woning/i)
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('130')
  })
})

describe('MiniNetWorthChart — privacy-masking voor saldi', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  function renderMasked(ui: ReactElement) {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    return render(<PrivacyProvider>{ui}</PrivacyProvider>)
  }

  it('toont het netto-vermogen + eindbedrag zichtbaar wanneer NIET gemaskeerd', () => {
    const rows = buildSimRows(35, 52, 187_400)
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={187_400}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={rows}
        simRequiredPortfolio={915_600}
      />,
    )
    // Het huidige vermogen blijft exact (gerealiseerd); het eindbedrag is een
    // prognose en staat sinds M5 afgerond. Was: '920' (het vrijheidsdoel-label,
    // dat sinds de tweedeling niet meer op de kaart staat).
    expect(container.textContent).toContain('187')
    const eind = rows[rows.length - 1].netWorth + (187_400 - rows[0].netWorth)
    expect(container.textContent).toContain(formatApproxCurrency(eind))
  })

  it('maskeert het netto-vermogen-headline en het eindbedrag bij privacy aan', () => {
    const { container } = renderMasked(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={187_400}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 187_400)}
        simRequiredPortfolio={915_600}
      />,
    )
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('187')
    expect(container.textContent).not.toContain('920')
  })

  it('houdt leeftijd-labels (Vrijheid / Vandaag) zichtbaar bij masking', () => {
    const { container } = renderMasked(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={187_400}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 187_400)}
      />,
    )
    // Leeftijden zijn geen saldo en blijven leesbaar.
    expect(container.textContent).toMatch(/Vrijheid 52/)
    expect(container.textContent).toMatch(/Vandaag.*35/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EURO-WEERGAVE (wave 3, brok F)
//
// Deze blokken pinnen drie dingen die alleen zichtbaar zijn als je ze narekent:
//   1. de D7-VOLGORDE: eerst her-ankeren in nominale ruimte, dán delen. Draai je
//      die om, dan wijkt het eindbedrag af met `anchorOffset × (1 − 1/factor)` —
//      op 20 jaar duizenden euro's onder een label dat er plausibel uitziet.
//      Daarom draagt de fixture bewust een NIET-NUL anchorOffset; met offset 0
//      is de fout onzichtbaar en bewijst de test niets.
//   2. de NAAD: jaar 0 draagt factor 1.0, dus het Vandaag-punt is in beide
//      weergaven exact `currentNetWorth` en de projectielijn begint precies op
//      de Vandaag-marker (geen knik).
//   3. KRUIS-consistentie (AC-F4/T13): één deflator per FIRE-doel. Het
//      LOSSTAANDE doel-label van de mini-grafiek komt op exact het bedrag uit
//      dat /toekomst toont; het voortgangs-PAAR van het widget (ring + "van €X"
//      + "Nog te gaan") blijft daarentegen NOMINAAL, omdat het de noemer van de
//      ring deelt en anders twee grondslagen naast elkaar zou zetten.
// ─────────────────────────────────────────────────────────────────────────────

const EV_CURRENT_AGE = 40
const EV_FIRE_AGE = 60
/** Vandaag-vermogen ≠ eerste engine-rij ⇒ anchorOffset = €50.000. */
const EV_CURRENT_NET_WORTH = 250_000
const EV_FIRST_ROW_NET_WORTH = 200_000
const EV_ANCHOR_OFFSET = EV_CURRENT_NET_WORTH - EV_FIRST_ROW_NET_WORTH
const EV_REQUIRED_PORTFOLIO = 800_000

/**
 * Kernelrijen-fixture met een OPLOPENDE `inflationFactor` (2% per jaar,
 * jaar 0 = exact 1.0) — precies de vorm die de loader levert. Fixture-waarde,
 * geen weergave-berekening.
 */
function buildFactorRows(): { age: number; netWorth: number; inflationFactor: number }[] {
  const rows: { age: number; netWorth: number; inflationFactor: number }[] = []
  for (let age = EV_CURRENT_AGE; age <= EV_FIRE_AGE; age++) {
    const k = age - EV_CURRENT_AGE
    rows.push({
      age,
      netWorth: Math.round(EV_FIRST_ROW_NET_WORTH * Math.pow(1.06, k)),
      inflationFactor: Math.pow(1.02, k),
    })
  }
  return rows
}

function renderMiniChart(rows: ReturnType<typeof buildFactorRows>, view: 'nominal' | 'real') {
  return render(
    <EuroViewProvider initialView={view}>
      <MiniNetWorthChart
        netWorthHistory={buildHistory([230_000, 240_000, EV_CURRENT_NET_WORTH])}
        currentNetWorth={EV_CURRENT_NET_WORTH}
        currentAge={EV_CURRENT_AGE}
        fireAge={EV_FIRE_AGE}
        endAge={90}
        simNetWorthRows={rows}
        simRequiredPortfolio={EV_REQUIRED_PORTFOLIO}
      />
    </EuroViewProvider>,
  )
}

describe("MiniNetWorthChart — euro-weergave (huidige euro's)", () => {
  it('deflateert het projectie-eindbedrag NA de her-ankering (D7-volgorde)', () => {
    const rows = buildFactorRows()
    const last = rows[rows.length - 1]
    // Canoniek: (netWorth + offset) / factor. De omgekeerde volgorde
    // (netWorth / factor + offset) geeft hier een ander bedrag — dat is precies
    // wat deze assertie moet vangen.
    const expected = (last.netWorth + EV_ANCHOR_OFFSET) / last.inflationFactor
    const wrongOrder = last.netWorth / last.inflationFactor + EV_ANCHOR_OFFSET
    expect(Math.round(expected)).not.toBe(Math.round(wrongOrder))

    const { container } = renderMiniChart(rows, 'real')
    // M5 — het eindbedrag is een PROGNOSE-kopgetal en staat afgerond op het
    // scherm. De D7-volgorde blijft aantoonbaar: de twee volgordes liggen ver
    // genoeg uiteen om ook ná afronding te verschillen (€470.000 vs €480.000).
    expect(formatApproxCurrency(expected)).not.toBe(formatApproxCurrency(wrongOrder))
    expect(container.textContent).toContain(formatApproxCurrency(expected))
    expect(container.textContent).not.toContain(formatApproxCurrency(wrongOrder))
  })

  it("toont in 'nominal' het onbewerkte eindbedrag (byte-identiek aan vandaag)", () => {
    const rows = buildFactorRows()
    const last = rows[rows.length - 1]
    const { container } = renderMiniChart(rows, 'nominal')
    expect(container.textContent).toContain(
      formatApproxCurrency(last.netWorth + EV_ANCHOR_OFFSET),
    )
  })

  it('houdt het Vandaag-punt in beide weergaven gelijk aan currentNetWorth (naad zonder knik)', () => {
    for (const view of ['nominal', 'real'] as const) {
      const { container, unmount } = renderMiniChart(buildFactorRows(), view)
      // Het kopgetal is gerealiseerd vermogen → exempt, nooit gedeeld.
      expect(container.textContent).toContain(formatCurrency(EV_CURRENT_NET_WORTH))

      // De naad zonder knik, sinds de tweedeling over TWEE svg's met een
      // gedeelde Y-schaal (was: één svg met circle cx=109 en een projectiepad
      // dat op M109.0 begon): het verleden eindigt op x=100 van zijn deel, de
      // projectie begint op x=0 van het hare, beide op dezelfde y — en de
      // Vandaag-stip op de naad staat op precies die y.
      const projPath = container.querySelector('path[data-nw-line="toekomst"]')
      const pastPath = container.querySelector('path[data-nw-line="verleden"]')
      expect(projPath).toBeTruthy()
      expect(pastPath).toBeTruthy()
      const [projFirstX, projFirstY] = (projPath!.getAttribute('d') ?? '')
        .split(' ')[0]
        .slice(1)
        .split(',')
      const pastPts = (pastPath!.getAttribute('d') ?? '').split(' ')
      const [pastLastX, pastLastY] = pastPts[pastPts.length - 1].slice(1).split(',')
      expect(projFirstX).toBe('0.0')
      expect(pastLastX).toBe('100.0')
      expect(projFirstY).toBe(pastLastY)
      expect(screen.getAllByTestId('nw-vandaag-punt')[0].getAttribute('data-y')).toBe(projFirstY)
      unmount()
    }
  })

  it('draagt zelf geen euro-weergave-status — die hangt app-breed in de sidebar', () => {
    // ADR 0094: de weergave-status staat op één plek (`EuroViewBadge`,
    // altijd zichtbaar) en de schakelaar in het zoekscherm; grafieken dragen
    // geen eigen badge meer. Deze assertie is de vangrail tegen terugkeer van
    // een per-grafiek-markering — in BEIDE standen, want juist in 'real' stond
    // hij er vroeger wél.
    for (const view of ['nominal', 'real'] as const) {
      const { container, unmount } = renderMiniChart(buildFactorRows(), view)
      expect(container.querySelectorAll('button[aria-label*="Weergave"]').length).toBe(0)
      unmount()
    }
  })
})

describe('KRUIS-consistentie (AC-F4 / UAT-KRUIS-27) — één FIRE-doel, één deflator', () => {
  /** Minimale bundel: alleen de velden die het widget daadwerkelijk leest. */
  function makeWidgetData(
    rows: ReturnType<typeof buildFactorRows>,
  ): DashboardData {
    return {
      netWorth: EV_CURRENT_NET_WORTH,
      fireEligibleNetWorth: EV_CURRENT_NET_WORTH,
      fireTarget: 0,
      freedomPct: 31.25,
      simRequiredPortfolio: EV_REQUIRED_PORTFOLIO,
      fireAgeFractional: EV_FIRE_AGE,
      simRows: rows.map(r => ({
        age: r.age,
        endPortfolio: r.netWorth,
        phase: 'accumulation',
        flowIn: 0,
        flowOut: 0,
        oneTimeNet: 0,
        inflationFactor: r.inflationFactor,
      })),
      simFireCountdown: null,
      netWorthDelta: null,
      householdOverrides: null,
      partnerOverrides: null,
      fireProjResult: {
        fireTarget: 0, netWorth: 0, freedomPercentage: 0, fireAge: EV_FIRE_AGE, currentAge: EV_CURRENT_AGE,
        fireDate: '2046', countdownDays: 0, countdownYears: 20, countdownMonths: 0,
        freedomYears: 0, freedomMonths: 0, monthlyPassiveIncome: 0, monthlySavings: 0, savingsRate: 0,
      },
    } as unknown as DashboardData
  }

  // De mini-grafiek toonde tot de tweedeling van de vermogenskaart (sep 2026)
  // óók een losstaand vrijheidsdoel-label, en drie tests hier pinden dat dat
  // label met de FIRE-jaarfactor deflateerde. Dat label is per eigenaar-besluit
  // vervallen (het doel staat op /toekomst); die tests zijn vervangen door deze
  // ene die bewaakt dat het ook in 'real' niet terugkomt. De widget-kant van
  // KRUIS-27 blijft hieronder onverkort getoetst.
  it('de mini-grafiek toont in geen enkele weergave nog een los vrijheidsdoel', () => {
    for (const view of ['nominal', 'real'] as const) {
      const chart = renderMiniChart(buildFactorRows(), view)
      expect(chart.container.textContent).not.toMatch(/Vrijheidsdoel/)
      chart.unmount()
    }
  })

  it('het voortgangs-PAAR van het widget blijft NOMINAAL (doel-label deelt de noemer van het percentage)', () => {
    // Het widget toont geen losstaand doel: "van €X" en "Nog te gaan" horen bij
    // de ring, en die ring vult op de canonieke `freedomPct` met een NOMINALE
    // noemer. Een gedeflateerd doel-label zou het paar met exact de deflator uit
    // elkaar trekken (hier ≈ 1,49× op 20 jaar) — een ring op 31,25% naast een
    // breuk die 46% leest. Daarom blijft het paar in één grondslag staan.
    const rows = buildFactorRows()
    const gedeflateerd = deflate(
      EV_REQUIRED_PORTFOLIO,
      factorAtAge(
        rows.map(r => ({ age: r.age, inflationFactor: r.inflationFactor })),
        EV_FIRE_AGE,
      ),
      'real',
    )
    expect(Math.round(gedeflateerd)).not.toBe(EV_REQUIRED_PORTFOLIO)

    const widget = render(
      <EuroViewProvider initialView="real">
        <VrijheidsvoortgangWidget size="full" data={makeWidgetData(rows)} />
      </EuroViewProvider>,
    )
    expect(widget.container.textContent).toContain(formatCurrency(EV_REQUIRED_PORTFOLIO))
    expect(widget.container.textContent).not.toContain(formatCurrency(gedeflateerd))
    // De uitzondering is voor de lezer benoemd — een nominaal bedrag op een
    // pagina in "huidige euro's" mag niet stilzwijgend blijven.
    expect(widget.container.textContent).toContain("in toekomstige euro's")
  })

  it("het widget toont in 'nominal' het onbewerkte doelbedrag", () => {
    const rows = buildFactorRows()
    const widget = render(
      <VrijheidsvoortgangWidget size="full" data={makeWidgetData(rows)} />,
    )
    expect(widget.container.textContent).toContain(formatCurrency(EV_REQUIRED_PORTFOLIO))
    // In de standaardweergave hoort er géén grondslag-noot te staan.
    expect(widget.container.textContent).not.toContain("in toekomstige euro's")
  })
})

/**
 * ADR 0034-addendum op het scherm — /overzicht en /toekomst tonen hetzelfde
 * vermogen op het vrijheidsmoment.
 *
 * Given  een gebruiker met een FRACTIONELE vrijheidsleeftijd (50,75), eigen
 *        woning op `exclude_from_fire` en de euro-weergave op "huidige euro's";
 *        de kernelreeks komt uit `buildSimNetWorthRows` op de ECHTE `SimRow`-
 *        vorm (`startPortfolio` = stand ÓP die leeftijd, `endPortfolio` = stand
 *        een jaar later), zoals `dashboard-data-loader` hem aanlevert.
 * When   de toekomst-kaart van de mini-vermogensgrafiek "Vrij op … · ca. €…" rendert.
 * Then   dat bedrag is het geprojecteerde netto vermogen op de afgeronde
 *        vrijheidsleeftijd (51) en valt — na de "ca."-afronding op twee
 *        significante cijfers — samen met het doel-incl-woning dat /toekomst
 *        toont (`requiredFireNetWorth`, gedeflateerd met dezelfde rij-factor).
 *
 * Echte eigenaar-cijfers (probe 27-08-2026): stand vandaag €265.401 op leeftijd
 * 46, requiredFireNetWorth €562.833 nominaal. Vóór de leeftijd-uitlijning las de
 * grafiek de eindejaarsstand en toonde ze "ca. €470.000" naast "ca. €510.000"
 * op /toekomst.
 */
describe('MiniNetWorthChart — vermogen bij vrijheid == FIRE-doel incl. woning (ADR 0034)', () => {
  const NW_AT_AGE: Record<number, number> = {
    46: 265_401, 47: 329_170, 48: 399_066, 49: 472_725,
    50: 550_269, 51: 565_847, 52: 584_482,
  }
  const START_AGE = 46
  const FIRE_DISPLAY_AGE = 51 // fireAgeForDisplay(50,75)
  const REQUIRED_FIRE_NET_WORTH = 562_833

  it('toont hetzelfde afgeronde bedrag als het /toekomst-doel incl. woning', () => {
    const kernelRows = Array.from({ length: 6 }, (_, i) => {
      const age = START_AGE + i
      return {
        age,
        startPortfolio: NW_AT_AGE[age],
        endPortfolio: NW_AT_AGE[age + 1],
        inflationFactor: Math.pow(1.02, i),
      }
    })
    // Exact het loader-pad: de bundelreeks komt uit de canonieke engine, niet
    // uit een met de hand nagebouwde reeks.
    const simNetWorthRows = buildSimNetWorthRows({
      simRows: kernelRows,
      currentNetWorth: NW_AT_AGE[START_AGE],
      housingStrategy: { mode: 'exclude_from_fire' },
      houseInLedger: true,
      assets: [],
      debts: [],
      dateOfBirth: null,
    })

    const { container } = render(
      <EuroViewProvider initialView="real">
        <MiniNetWorthChart
          netWorthHistory={buildHistory([240_000, 250_000, NW_AT_AGE[START_AGE]])}
          currentNetWorth={NW_AT_AGE[START_AGE]}
          currentAge={START_AGE}
          fireAge={FIRE_DISPLAY_AGE}
          endAge={93}
          simNetWorthRows={simNetWorthRows}
          simRequiredPortfolio={201_813}
        />
      </EuroViewProvider>,
    )

    // /toekomst rekent hetzelfde doel om met de rij-factor op diezelfde
    // weergave-leeftijd (horizon-client#viewFireTargetInclHome).
    const factorRows = simNetWorthRows.map((r) => ({ age: r.age, inflationFactor: r.inflationFactor }))
    const toekomstDoel = deflate(
      REQUIRED_FIRE_NET_WORTH,
      factorAtAge(factorRows, FIRE_DISPLAY_AGE),
      'real',
    )

    // Was: `Vermogen bij vrijheid → ${bedrag}` in de kop. Sinds de tweedeling
    // staat hetzelfde bedrag onder de plan-kop van de toekomst-kaart.
    expect(screen.getByText(`Vrij op ${FIRE_DISPLAY_AGE}`)).toBeTruthy()
    expect(screen.getByTestId('nw-toekomst-incl').textContent).toBe(
      formatApproxCurrency(toekomstDoel),
    )
    // En het is niet toevallig gelijk doordat álles op dezelfde afronding valt:
    // de eindejaarsstand (de oude, foute grondslag) rondt aantoonbaar ánders af.
    const oudeFouteGrondslag = deflate(
      NW_AT_AGE[FIRE_DISPLAY_AGE + 1] - (NW_AT_AGE[START_AGE + 1] - NW_AT_AGE[START_AGE]),
      factorAtAge(factorRows, FIRE_DISPLAY_AGE),
      'real',
    )
    expect(formatApproxCurrency(oudeFouteGrondslag)).not.toBe(formatApproxCurrency(toekomstDoel))
    expect(container.textContent).not.toContain(formatApproxCurrency(oudeFouteGrondslag))
  })
})

/**
 * Tweedeling van de vermogenskaart (eigenaar-besluit sep 2026): een
 * verleden-kaart (button → samengevoegd venster) en een toekomst-kaart
 * (link → /toekomst), met de plan-kop, de bedragen op de knip-leeftijd en —
 * onder een vast stopanker — de dekking van het plan.
 */
describe('MiniNetWorthChart — tweedeling in verleden- en toekomst-kaart', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  const baseProps = {
    netWorthHistory: buildHistory([90_000, 95_000, 100_000]),
    currentNetWorth: 100_000,
    currentAge: 35,
    fireAge: 52,
    endAge: 67,
    simNetWorthRows: buildSimRows(35, 52, 100_000),
  }

  it('heeft precies twee benoemde klikdoelen, zonder geneste interactieve elementen', () => {
    render(<MiniNetWorthChart {...baseProps} />)
    const past = screen.getByTestId('nw-kaart-verleden')
    const future = screen.getByTestId('nw-kaart-toekomst')
    expect(past.tagName).toBe('BUTTON')
    expect(future.tagName).toBe('A')
    expect(future.getAttribute('href')).toBe('/toekomst')
    // Geen genest klikdoel: het kopgetal is geen eigen knop meer.
    expect(past.querySelector('a, button')).toBeNull()
    expect(future.querySelector('a, button')).toBeNull()
    expect(screen.queryByTestId('netto-vermogen-kopgetal')).toBeNull()
    // In de a11y-boom: één knop en één link (de mobiele grafiekzones zijn
    // aria-hidden duplicaten buiten de tabvolgorde).
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByTestId('nw-zone-verleden').getAttribute('tabindex')).toBe('-1')
    expect(screen.getByTestId('nw-zone-toekomst').getAttribute('tabindex')).toBe('-1')
  })

  it('draagt het exacte bedrag in de toegankelijke naam van de verleden-kaart', () => {
    render(<MiniNetWorthChart {...baseProps} netWorthExclHome={40_000} showExclHome />)
    const past = screen.getByTestId('nw-kaart-verleden')
    const naam = (past.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(naam).toContain('Netto vermogen')
    expect(naam).toContain(formatCurrency(100_000))
    expect(naam).toContain(formatCurrency(40_000))
  })

  it('opent ÉÉN venster met eerst de opbouw (kassabon) en daaronder het verloop', () => {
    render(
      <MiniNetWorthChart
        {...baseProps}
        vermogenOpbouw={{ bezittingen: 160_000, schulden: 60_000 }}
      />,
    )
    expect(screen.queryByTestId('vermogen-kassabon-totaal')).toBeNull()
    fireEvent.click(screen.getByTestId('nw-kaart-verleden'))
    const opbouw = screen.getByTestId('netto-vermogen-venster-opbouw')
    const verloopKop = screen.getByText('Stand · verschil')
    expect(screen.getByTestId('vermogen-kassabon-totaal').textContent).toContain(
      formatCurrency(100_000),
    )
    // Volgorde: de opbouw staat vóór het verloop in het document.
    expect(
      opbouw.compareDocumentPosition(verloopKop) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Eén venster, geen tweede "— verloop"-sheet.
    expect(screen.queryByText('Netto vermogen — verloop')).toBeNull()
  })

  it('de mobiele grafiekzone opent hetzelfde venster', () => {
    render(<MiniNetWorthChart {...baseProps} />)
    fireEvent.click(screen.getByTestId('nw-zone-verleden'))
    expect(screen.getByText('Stand · verschil')).toBeTruthy()
  })

  it('kop per modus: vrij · pensioen · vast stopanker · bereikt', () => {
    const vrij = render(<MiniNetWorthChart {...baseProps} />)
    expect(screen.getByText('Vrij op 52')).toBeTruthy()
    vrij.unmount()

    const pensioen = render(
      <MiniNetWorthChart
        {...baseProps}
        fireAge={67}
        isPensioenMode
        simNetWorthRows={buildSimRows(35, 67, 100_000)}
      />,
    )
    expect(screen.getByText('Pensioen op 67')).toBeTruthy()
    pensioen.unmount()

    const stop = render(
      <MiniNetWorthChart
        {...baseProps}
        fireAge={58}
        endAge={90}
        stopAnchorFixed
        stopAge={58}
        framing="anchored"
        simNetWorthRows={buildSimRows(35, 90, 100_000)}
        planCoveragePct={72.4}
      />,
    )
    expect(screen.getByText('Stoppen op 58')).toBeTruthy()
    expect(screen.getByTestId('nw-toekomst-dekking').textContent).toBe('dekt 72% van je plan')
    stop.unmount()

    render(
      <MiniNetWorthChart
        {...baseProps}
        currentAge={62}
        fireAge={55}
        endAge={90}
        simNetWorthRows={buildSimRows(62, 90, 100_000)}
      />,
    )
    expect(screen.getByText('Vrijheid bereikt — verloop tot 90')).toBeTruthy()
    // Bij "bereikt" geen bedragregel (zoals de vroegere kop).
    expect(screen.queryByTestId('nw-toekomst-incl')).toBeNull()
  })

  it('toont de dekking alleen onder een vast stopanker', () => {
    render(<MiniNetWorthChart {...baseProps} planCoveragePct={72} />)
    expect(screen.queryByTestId('nw-toekomst-dekking')).toBeNull()
  })

  describe('plan-stoplicht (15 sep 2026)', () => {
    const stopProps = {
      ...baseProps,
      fireAge: 48,
      endAge: 90,
      stopAnchorFixed: true,
      stopAge: 48,
      framing: 'anchored' as const,
      simNetWorthRows: buildSimRows(35, 90, 100_000),
    }

    it('vast stopmoment met een groot tekort: rood punt én rode dekkingsregel', () => {
      render(<MiniNetWorthChart {...stopProps} planCoveragePct={5} planStatus="bad" />)
      expect(screen.getByTestId('nw-toekomst-status').getAttribute('data-status')).toBe('bad')
      expect(screen.getByTestId('nw-toekomst-status').className).toContain('bg-red-500')
      expect(screen.getByTestId('nw-toekomst-dekking').className).toContain('text-red-700')
    })

    it('krappe marge kleurt oranje', () => {
      render(<MiniNetWorthChart {...stopProps} planCoveragePct={95} planStatus="warn" />)
      expect(screen.getByTestId('nw-toekomst-status').className).toContain('bg-amber-500')
      expect(screen.getByTestId('nw-toekomst-dekking').className).toContain('text-amber-700')
    })

    it('zo vroeg mogelijk en haalbaar: groen punt, geen oordeelregel, statuswoord voor de schermlezer', () => {
      render(<MiniNetWorthChart {...baseProps} planStatus="good" />)
      expect(screen.getByTestId('nw-toekomst-status').className).toContain('bg-emerald-500')
      expect(screen.queryByTestId('nw-toekomst-onhaalbaar')).toBeNull()
      const kaart = screen.getByTestId('nw-kaart-toekomst')
      const ids = (kaart.getAttribute('aria-labelledby') ?? '').split(' ')
      const woorden = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      expect(woorden).toContain('Goed op koers')
    })

    it('zo vroeg mogelijk en niet haalbaar binnen de horizon: rode tekst op de kaart', () => {
      render(<MiniNetWorthChart {...baseProps} planStatus="bad" />)
      const regel = screen.getByTestId('nw-toekomst-onhaalbaar')
      expect(regel.textContent).toBe('niet haalbaar binnen je horizon')
      expect(regel.className).toContain('text-red-700')
    })

    it('zo vroeg mogelijk, haalbaar, maar het vastgelegde doel reikt niet: oranje tekst op de kaart (ADR 0175)', () => {
      render(<MiniNetWorthChart {...baseProps} planStatus="warn" />)
      expect(screen.getByTestId('nw-toekomst-status').className).toContain('bg-amber-500')
      const regel = screen.getByTestId('nw-toekomst-doel-nog-niet')
      expect(regel.textContent).toBe('haalbaar, je doel nog niet')
      expect(regel.className).toContain('text-amber-700')
      expect(screen.queryByTestId('nw-toekomst-onhaalbaar')).toBeNull()
      // De zichtbare regel draagt het oordeel; het sr-only-statuswoord vervalt dan.
      const ids = (screen.getByTestId('nw-kaart-toekomst').getAttribute('aria-labelledby') ?? '').split(' ')
      const woorden = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      expect(woorden).toContain('haalbaar, je doel nog niet')
    })

    it('vast stopmoment met oranje status: de dekkingsregel, niet de doelregel', () => {
      render(<MiniNetWorthChart {...stopProps} planCoveragePct={95} planStatus="warn" />)
      expect(screen.queryByTestId('nw-toekomst-doel-nog-niet')).toBeNull()
      expect(screen.getByTestId('nw-toekomst-dekking')).toBeTruthy()
    })

    it('zonder oordeel (neutral) geen punt en de dekking in inkt — ongewijzigd gedrag', () => {
      render(<MiniNetWorthChart {...stopProps} planCoveragePct={72} />)
      expect(screen.queryByTestId('nw-toekomst-status')).toBeNull()
      expect(screen.getByTestId('nw-toekomst-dekking').className).toContain('text-[var(--ink-3)]')
    })
  })

  it('excl.-woning-bedrag: eerst dezelfde nominale anchorOffset, DAARNA de rij-factor (D7)', () => {
    const rows = buildFactorRows().map((r) => ({
      ...r,
      // Fixture: de excl.-grondslag ligt een vast bedrag onder de incl.-reeks.
      netWorthExclHome: r.netWorth - 150_000,
    }))
    const last = rows[rows.length - 1]
    const verwacht = (last.netWorthExclHome + EV_ANCHOR_OFFSET) / last.inflationFactor
    const verkeerdeVolgorde = last.netWorthExclHome / last.inflationFactor + EV_ANCHOR_OFFSET
    // Anders bewijst de test niets.
    expect(formatApproxCurrency(verwacht)).not.toBe(formatApproxCurrency(verkeerdeVolgorde))

    render(
      <EuroViewProvider initialView="real">
        <MiniNetWorthChart
          netWorthHistory={buildHistory([230_000, 240_000, EV_CURRENT_NET_WORTH])}
          currentNetWorth={EV_CURRENT_NET_WORTH}
          currentAge={EV_CURRENT_AGE}
          fireAge={EV_FIRE_AGE}
          endAge={90}
          simNetWorthRows={rows}
          netWorthExclHome={100_000}
          showExclHome
        />
      </EuroViewProvider>,
    )
    const incl = (last.netWorth + EV_ANCHOR_OFFSET) / last.inflationFactor
    expect(screen.getByTestId('nw-toekomst-incl').textContent).toBe(
      `${formatApproxCurrency(incl)} incl. woning`,
    )
    expect(screen.getByTestId('nw-toekomst-excl').textContent).toBe(
      `${formatApproxCurrency(verwacht)} excl. woning`,
    )
  })

  it('zonder dubbele grondslag één bedrag zonder "incl. woning", en geen excl.-regel', () => {
    const rows = buildSimRows(35, 52, 100_000).map((r) => ({
      ...r,
      netWorthExclHome: r.netWorth - 50_000,
    }))
    render(<MiniNetWorthChart {...baseProps} simNetWorthRows={rows} showExclHome={false} />)
    expect(screen.getByTestId('nw-toekomst-incl').textContent).not.toMatch(/woning/)
    expect(screen.queryByTestId('nw-toekomst-excl')).toBeNull()
  })

  it('zonder excl.-veld op de rij geen excl.-bedrag, ook niet bij showExclHome', () => {
    render(<MiniNetWorthChart {...baseProps} netWorthExclHome={40_000} showExclHome />)
    expect(screen.queryByTestId('nw-toekomst-excl')).toBeNull()
    expect(screen.getByTestId('nw-toekomst-incl').textContent).not.toMatch(/woning/)
  })

  it('maskeert de toekomst-bedragen bij privacy aan', () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    const rows = buildSimRows(35, 52, 100_000).map((r) => ({
      ...r,
      netWorthExclHome: r.netWorth - 50_000,
    }))
    render(
      <PrivacyProvider>
        <MiniNetWorthChart
          {...baseProps}
          simNetWorthRows={rows}
          netWorthExclHome={50_000}
          showExclHome
        />
      </PrivacyProvider>,
    )
    expect(screen.getByTestId('nw-toekomst-incl').textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(screen.getByTestId('nw-toekomst-excl').textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
  })
})
