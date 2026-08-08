import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MiniNetWorthChart } from './mini-networth-chart'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER, formatCurrency } from '@/lib/format'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import { deflate, factorAtAge } from '@/lib/euro-display'
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
 * valideren render-states + reeks-injectie + Vrijheid-marker + het aparte
 * liquide-vrijheidsdoel-label + de twee klikzones + geschatte historie.
 */

function buildHistory(values: number[]): { month: string; value: number }[] {
  return values.map((value, i) => {
    const d = new Date(2025, i, 1)
    return { month: d.toISOString().slice(0, 7), value }
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

  it('toont simRequiredPortfolio als APART liquide-vrijheidsdoel-label', () => {
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
    // Het liquide vrijheidsdoel (€915.600) wordt APART getoond als label, niet
    // als marker-hoogte op de netto-vermogen-as. Het bedrag blijft zichtbaar.
    // Het label maakt expliciet dat het om een LIQUIDE doel gaat (B3).
    expect(container.textContent).toContain('915')
    expect(container.textContent).toMatch(/Vrijheidsdoel/)
    expect(container.textContent).toMatch(/liquide/)
  })

  it('header beschrijft de líjn ("Vermogen bij vrijheid →"), niet een doel (B4)', () => {
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
    // Nieuwe formulering: "Vermogen bij vrijheid → €X" beschrijft het verloop
    // van de lijn, niet een spaardoel. De oude copy "→ €X bij vrijheid" (die een
    // leek als doel kon lezen) mag niet meer voorkomen.
    expect(container.textContent).toMatch(/Vermogen bij vrijheid →/)
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

  it('verleden-zone is een button die de verloop-popup opent', () => {
    render(<MiniNetWorthChart {...props} />)
    const pastZone = screen.getByRole('button', {
      name: /verloop van je netto vermogen/i,
    })
    expect(pastZone).toBeTruthy()
    // Popup is dicht vóór klik
    expect(screen.queryByText('Netto vermogen — verloop')).toBeNull()
    fireEvent.click(pastZone)
    // Popup toont titel + maandtabel-kop
    expect(screen.getByText('Netto vermogen — verloop')).toBeTruthy()
    expect(screen.getByText('Vandaag')).toBeTruthy()
  })

  it('toekomst-zone is een link naar /toekomst', () => {
    const { container } = render(<MiniNetWorthChart {...props} />)
    const futureZone = container.querySelector(
      'a[href="/toekomst"][aria-label*="projectie"]',
    )
    expect(futureZone).toBeTruthy()
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
    const { container } = render(
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
    expect(container.textContent).toContain('187')
    expect(container.textContent).toContain('915')
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
    expect(container.textContent).not.toContain('915')
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
    expect(container.textContent).toContain(formatCurrency(expected))
    expect(container.textContent).not.toContain(formatCurrency(wrongOrder))
  })

  it("toont in 'nominal' het onbewerkte eindbedrag (byte-identiek aan vandaag)", () => {
    const rows = buildFactorRows()
    const last = rows[rows.length - 1]
    const { container } = renderMiniChart(rows, 'nominal')
    expect(container.textContent).toContain(
      formatCurrency(last.netWorth + EV_ANCHOR_OFFSET),
    )
  })

  it('houdt het Vandaag-punt in beide weergaven gelijk aan currentNetWorth (naad zonder knik)', () => {
    for (const view of ['nominal', 'real'] as const) {
      const { container, unmount } = renderMiniChart(buildFactorRows(), view)
      // Het kopgetal is gerealiseerd vermogen → exempt, nooit gedeeld.
      expect(container.textContent).toContain(formatCurrency(EV_CURRENT_NET_WORTH))

      // De projectielijn start exact op de Vandaag-marker: geen knik op de naad.
      const todayCircle = Array.from(container.querySelectorAll('circle')).find(
        c => c.getAttribute('cx') === '109' && c.getAttribute('r') === '4',
      )
      expect(todayCircle).toBeTruthy()
      const projPath = Array.from(container.querySelectorAll('path')).find(p =>
        (p.getAttribute('d') ?? '').startsWith('M109.0,'),
      )
      expect(projPath).toBeTruthy()
      const firstY = (projPath!.getAttribute('d') ?? '').split(' ')[0].split(',')[1]
      expect(Number(todayCircle!.getAttribute('cy')).toFixed(1)).toBe(firstY)
      unmount()
    }
  })

  it('laat de euro-weergave-badge alleen zien in huidige euro’s', () => {
    const rows = buildFactorRows()
    const nominal = renderMiniChart(rows, 'nominal')
    expect(nominal.container.querySelectorAll('button[aria-label*="Weergave"]').length).toBe(0)
    nominal.unmount()

    const real = renderMiniChart(rows, 'real')
    // Precies ÉÉN badge op dit oppervlak (D11: één badge per pagina).
    expect(real.container.querySelectorAll('button[aria-label*="Weergave"]').length).toBe(1)
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

  it('het LOSSTAANDE vrijheidsdoel van de mini-grafiek deflateert met de FIRE-jaarfactor', () => {
    const rows = buildFactorRows()
    // Dezelfde uitdrukking die /toekomst gebruikt voor `fireTarget`:
    // deflate(requiredFirePortfolio, factorAtAge(kernelrijen, FIRE-leeftijd)).
    const expected = deflate(
      EV_REQUIRED_PORTFOLIO,
      factorAtAge(
        rows.map(r => ({ age: r.age, inflationFactor: r.inflationFactor })),
        EV_FIRE_AGE,
      ),
      'real',
    )
    // Bewijs dat de deflatie iets doet — anders zou de test ook groen zijn
    // wanneer het oppervlak niet omrekent.
    expect(Math.round(expected)).not.toBe(EV_REQUIRED_PORTFOLIO)

    const chart = renderMiniChart(rows, 'real')
    expect(chart.container.textContent).toContain(
      `Vrijheidsdoel ${formatCurrency(expected)} liquide`,
    )
    chart.unmount()
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

  it("beide oppervlakken tonen in 'nominal' het onbewerkte doelbedrag", () => {
    const rows = buildFactorRows()
    const chart = renderMiniChart(rows, 'nominal')
    expect(chart.container.textContent).toContain(
      `Vrijheidsdoel ${formatCurrency(EV_REQUIRED_PORTFOLIO)} liquide`,
    )
    chart.unmount()

    const widget = render(
      <VrijheidsvoortgangWidget size="full" data={makeWidgetData(rows)} />,
    )
    expect(widget.container.textContent).toContain(formatCurrency(EV_REQUIRED_PORTFOLIO))
    // In de standaardweergave hoort er géén grondslag-noot te staan.
    expect(widget.container.textContent).not.toContain("in toekomstige euro's")
  })

  it('kiest bij een FIRE-leeftijd exact op .5 dezelfde factor-rij als /toekomst (afronden omhoog)', () => {
    // Het randgeval uit bevinding 4: `factorAtAge` pakt de dichtstbijzijnde rij
    // en laat een .5-leeftijd naar BENEDEN vallen (eerste kleinste afstand wint,
    // rijen oplopend), terwijl de canonieke weergave-seam `fireAgeForDisplay`
    // (= Math.round) naar BOVEN gaat. Zonder normalisatie hing de deflator dus
    // af van of de aanroeper fractioneel of afgerond aanleverde — precies het
    // getal dat UAT-KRUIS-27 belooft gelijk te houden.
    const rows = buildFactorRows()
    const factorRows = rows.map(r => ({ age: r.age, inflationFactor: r.inflationFactor }))
    const halfAge = EV_FIRE_AGE - 0.5 // 59,5 → weergave-leeftijd 60

    const naiefLager = factorAtAge(factorRows, halfAge)          // rij 59
    const genormaliseerdHoger = factorAtAge(factorRows, EV_FIRE_AGE) // rij 60
    // De twee rijen moeten echt verschillen, anders bewijst de test niets.
    expect(naiefLager).not.toBe(genormaliseerdHoger)

    const { container } = render(
      <EuroViewProvider initialView="real">
        <MiniNetWorthChart
          netWorthHistory={buildHistory([230_000, 240_000, EV_CURRENT_NET_WORTH])}
          currentNetWorth={EV_CURRENT_NET_WORTH}
          currentAge={EV_CURRENT_AGE}
          fireAge={halfAge}
          endAge={90}
          simNetWorthRows={rows}
          simRequiredPortfolio={EV_REQUIRED_PORTFOLIO}
        />
      </EuroViewProvider>,
    )
    const verwacht = deflate(EV_REQUIRED_PORTFOLIO, genormaliseerdHoger, 'real')
    const nietVerwacht = deflate(EV_REQUIRED_PORTFOLIO, naiefLager, 'real')
    expect(container.textContent).toContain(`Vrijheidsdoel ${formatCurrency(verwacht)} liquide`)
    expect(container.textContent).not.toContain(formatCurrency(nietVerwacht))
  })
})
