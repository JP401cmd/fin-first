import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import { ProjectieBlock, SlagingskansBlock, InzichtenBlock } from './totaalplan-blocks'
import type { ProjectieData, SlagingskansData, InzichtItem } from '@/lib/totaalplan-data'

/**
 * Runtime-assertie op de weergave-mapping. De load-bearing correctheidszorg hier
 * is de grondslag-scheiding (CLAUDE.md): het doel-marker en vermogenspad staan op
 * `nettoVermogen` (incl. eigen woning); de liquide FIRE-pot (`fireLiquidePot`, excl.
 * woning) is een AFZONDERLIJKE grootheid en mag NOOIT op de doel-as belanden.
 * Bewust ver uit elkaar liggende bedragen zodat verkeerde-veld-drift zichtbaar wordt.
 *
 * Het pad is (zoals de assemblage 'm levert, B-043) al geclipt t/m `displayEndAge − 1`;
 * `inflationFactor` is de kernel-deflator per rij (jaar 0 = 1.0) — de laatste rij
 * krijgt bewust factor 2 zodat een vergeten óf dubbele deflatie in 'real' zichtbaar bijt.
 */
const projectieOk: ProjectieData = {
  ok: true,
  reason: null,
  fireReachable: true,
  fireAge: 52,
  fireAgeFractional: 52.5,
  currentAge: 40,
  fireCalendarYear: 2038,
  doelbedragNettoVermogen: 850_000, // incl. eigen woning — hoort op doel-row + as
  fireLiquidePot: 600_000, // excl. woning — hoort ALLEEN in losse duiding
  displayEndAge: 90,
  strategy: 'deplete',
  vermogenspad: [
    { year: 0, age: 40, startNettoVermogen: 280_000, nettoVermogen: 300_000, inflationFactor: 1 },
    { year: 6, age: 46, startNettoVermogen: 500_000, nettoVermogen: 520_000, inflationFactor: 1.126 },
    { year: 12, age: 52, startNettoVermogen: 820_000, nettoVermogen: 850_000, inflationFactor: 1.268 },
    { year: 49, age: 89, startNettoVermogen: 1_080_000, nettoVermogen: 1_100_000, inflationFactor: 2 },
  ],
  eindwaardeNettoVermogen: 1_100_000,
  eindwaardeNettoLiquide: 900_000,
  ankerTekortZin: null,
  tekortLening: null,
}

describe('ProjectieBlock — grondslag-scheiding (nettoVermogen vs liquide pot)', () => {
  it('rendert het doelbedrag uit doelbedragNettoVermogen (incl. woning), niet de liquide pot', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    const doelLabel = screen.getByText(/Doelbedrag — netto vermogen/i)
    const doelRow = doelLabel.parentElement
    // De doel-row toont 850.000 (nettoVermogen-grondslag) …
    expect(doelRow?.textContent).toMatch(/850\.000/)
    // … en NOOIT de liquide FIRE-pot (600.000) op diezelfde row.
    expect(doelRow?.textContent).not.toMatch(/600\.000/)
  })

  it('benoemt de grondslag expliciet en toont de liquide pot enkel als losse duiding', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    expect(screen.getByText(/netto vermogen \(inclusief eigen woning\)/i)).toBeTruthy()
    // Liquide pot verschijnt in de aparte duidingszin, met eigen bedrag.
    const duiding = screen.getByText(/liquide FIRE-pot/i).closest('p')
    expect(duiding?.textContent).toMatch(/600\.000/)
  })

  it('rendert een inline SVG vermogenspad (geen canvas)', () => {
    const { container } = render(
      <ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />,
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('toont een nette lege staat bij ok=false zonder grafiek', () => {
    const empty: ProjectieData = {
      ...projectieOk,
      ok: false,
      reason: 'geen geboortedatum',
      vermogenspad: [],
    }
    const { container } = render(
      <ProjectieBlock projectie={empty} dailyExpenseRate={100} num="x." />,
    )
    expect(screen.getByText(/Nog geen projectie mogelijk/i)).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })
})

/**
 * B-043 — "eindwaarde van −1 mln zonder leeftijd in het totaalplan".
 * Eigenaarsbesluit: zoals /toekomst — planeinde in het label, euro_view volgen,
 * 0-vloer op de grafiek, en een eerlijke melding bij een echt tekort.
 */
describe('ProjectieBlock — planeinde, euro-weergave en tekort-meldingen (B-043)', () => {
  it('draagt de leeftijd van het planeinde in het Eindvermogen-label zelf', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    const label = screen.getByText('Eindvermogen (90 j)')
    // Nominaal: het bedrag van de laatste geclipte rij, ongedeflateerd.
    expect(label.parentElement?.textContent).toMatch(/1\.100\.000/)
    // De oude, leeftijdloze kop bestaat niet meer.
    expect(screen.queryByText('Eindwaarde netto vermogen')).toBeNull()
  })

  it("volgt euro_view = 'real': elk bedrag exact één keer door de kernelfactor van zijn rij", () => {
    render(
      <EuroViewProvider initialView="real">
        <ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />
      </EuroViewProvider>,
    )
    // Eindvermogen: 1.100.000 / factor 2 (laatste rij) = 550.000 — niet 1.100.000 (vergeten) en niet 275.000 (dubbel).
    const eind = screen.getByText('Eindvermogen (90 j)').parentElement?.textContent ?? ''
    expect(eind).toMatch(/550\.000/)
    expect(eind).not.toMatch(/1\.100\.000/)
    expect(eind).not.toMatch(/275\.000/)
    // Doelbedrag: factor op de FIRE-leeftijd (52,5 → dichtstbijzijnde rij 52, factor 1.268) → ≈ 670.347.
    const doel = screen.getByText(/Doelbedrag — netto vermogen/i).parentElement?.textContent ?? ''
    expect(doel).toMatch(/670\.3\d\d/)
    // De weergave staat expliciet benoemd.
    expect(screen.getAllByText(/huidige euro's/i).length).toBeGreaterThan(0)
  })

  it('vrijheidstijd is real-verankerd: identiek in nominal en real, en op het LIQUIDE deel', () => {
    // 900.000 liquide / factor 2 / €100 per dag = 4.500 dagen ≈ 12 jaar en 4 maanden — niet 11.000 dagen (ongedeflateerd, 1.100.000 incl. woning).
    // De subregel is het laatste <p> van de DefinitionRow (label · waarde · sub).
    const subRegel = (r: ReturnType<typeof render>) =>
      r.getByText('Eindvermogen (90 j)').parentElement?.lastElementChild?.textContent ?? ''
    const nominal = render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    const subNominal = subRegel(nominal)
    nominal.unmount()
    const real = render(
      <EuroViewProvider initialView="real">
        <ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />
      </EuroViewProvider>,
    )
    const subReal = subRegel(real)
    const vrijheid = (s: string) => s.match(/^(\d+ jaar(?: en \d+ maanden)?) vrijheid in het liquide deel/)?.[1]
    expect(vrijheid(subNominal)).toBe('12 jaar en 4 maanden')
    expect(vrijheid(subReal)).toBe(vrijheid(subNominal))
  })

  it('laat de vrijheidstijd-regel weg zonder eerlijke dagbasis (dagtarief 0)', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={0} num="x." />)
    expect(screen.getByText('Eindvermogen (90 j)').parentElement?.textContent).not.toMatch(/vrijheid/)
  })

  it('vloert de grafieklijn op 0: een negatieve stand zakt niet onder de basislijn', () => {
    const negatief: ProjectieData = {
      ...projectieOk,
      vermogenspad: [
        ...projectieOk.vermogenspad.slice(0, 3),
        { year: 49, age: 89, startNettoVermogen: 10_000, nettoVermogen: -400_000, inflationFactor: 2 },
      ],
      eindwaardeNettoVermogen: -400_000,
      eindwaardeNettoLiquide: -400_000,
    }
    const { container } = render(<ProjectieBlock projectie={negatief} dailyExpenseRate={100} num="x." />)
    const polyline = container.querySelector('polyline')
    const baseline = container.querySelector('line')
    expect(polyline && baseline).toBeTruthy()
    const baselineY = Number(baseline!.getAttribute('y1'))
    const ys = (polyline!.getAttribute('points') ?? '')
      .split(' ')
      .map((p) => Number(p.split(',')[1]))
    // SVG-y groeit naar beneden: geen enkel punt lager dan de basislijn (= 0).
    expect(Math.max(...ys)).toBeLessThanOrEqual(baselineY + 0.05)
    // De negatieve eindstand staat wél eerlijk in het cijfer.
    expect(screen.getByText('Eindvermogen (90 j)').parentElement?.textContent).toMatch(/-.*400\.000/)
  })

  it('toont het anker-tekort als aparte melding met de /toekomst-zin', () => {
    const zin = 'Als je op 58 stopt, reikt je liquide vermogen tot je 71e. Je plan loopt tot je 90e.'
    render(<ProjectieBlock projectie={{ ...projectieOk, ankerTekortZin: zin }} dailyExpenseRate={100} num="x." />)
    expect(screen.getByTestId('anchor-shortfall-blok').textContent).toContain(zin)
  })

  it('toont een aangesproken tekort-lening met de gedeelde copy (wat de 0-vloer anders verbergt)', () => {
    const copy = buildDeficitLoanCopy({
      firstAge: 72,
      clearedAge: null,
      housing: null,
      aowAge: 67,
      displayEndAge: 90,
      isPensioenMode: false,
      homeExcludedFromFire: false,
      geenTekortLeningAan: false,
      peakText: '€ 42.000',
      freedomText: null,
    })
    render(
      <ProjectieBlock
        projectie={{ ...projectieOk, tekortLening: { firstAge: 72, peak: 42_000, copy } }}
        dailyExpenseRate={100}
        num="x."
      />,
    )
    const blok = screen.getByTestId('tekort-lening-blok').textContent ?? ''
    expect(blok).toContain(copy.periode)
    expect(blok).toContain('€ 42.000')
    expect(blok).toContain(copy.lijn)
  })

  it('zonder tekort: geen meldingen', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    expect(screen.queryByTestId('anchor-shortfall-blok')).toBeNull()
    expect(screen.queryByTestId('tekort-lening-blok')).toBeNull()
  })
})

describe('SlagingskansBlock', () => {
  it('toont het percentage en het aantal runs', () => {
    const ok: SlagingskansData = { ok: true, successProbability: 0.82, runs: 200, strategy: 'deplete' }
    render(<SlagingskansBlock slagingskans={ok} num="xi." />)
    expect(screen.getByText(/82%/)).toBeTruthy()
    expect(screen.getByText(/200/)).toBeTruthy()
  })

  it('toont lege staat bij successProbability=null', () => {
    const empty: SlagingskansData = { ok: false, successProbability: null, runs: 0, strategy: null }
    render(<SlagingskansBlock slagingskans={empty} num="xi." />)
    expect(screen.getByText(/Nog geen slagingskans/i)).toBeTruthy()
  })
})

describe('InzichtenBlock', () => {
  it('rendert titels met vrijheidsdagen-framing', () => {
    const items: InzichtItem[] = [
      { id: 'a:1', title: 'Verlaag je vaste lasten', detail: 'Twee abonnementen overlappen.', freedomDays: 12, savingsPerYear: 480 },
    ]
    render(<InzichtenBlock inzichten={items} num="xii." />)
    expect(screen.getByText(/Verlaag je vaste lasten/i)).toBeTruthy()
    expect(screen.getByText(/12 dagen vrijheid/i)).toBeTruthy()
  })

  it('toont lege staat bij geen inzichten', () => {
    render(<InzichtenBlock inzichten={[]} num="xii." />)
    expect(screen.getByText(/Geen directe verbeterpunten/i)).toBeTruthy()
  })
})
