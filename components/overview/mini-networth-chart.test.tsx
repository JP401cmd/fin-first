import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MiniNetWorthChart } from './mini-networth-chart'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

// MiniNetWorthChart rendert NetWorthHistorySheet onvoorwaardelijk (de `open`-prop
// gate't alleen zichtbaarheid); die child roept sinds de handmatige-historie-editor
// `useRouter()` aan. Zonder app-router-context crasht elke render hier — mock
// next/navigation zodat de chart-tests de sheet kunnen mounten.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

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
