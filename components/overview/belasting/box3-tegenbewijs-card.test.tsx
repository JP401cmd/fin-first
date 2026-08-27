import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { Box3TegenbewijsCard } from './box3-tegenbewijs-card'
import { BOX3_PARAMS } from '@/lib/box3-data'
import { compareForfaitairVsWerkelijk } from '@/lib/box3-tegenbewijs'
import type { Box3Result } from '@/lib/box3-data'

/**
 * Bevinding M24 — "Tegenbewijs-simulator start op 2,0% terwijl de app rendement
 * kent".
 *
 * De oude beginstand was `useState(2)`: een magic number dat nergens uit de app
 * kwam. Omdat het omslagpunt tussen "tegenbewijs loont" en "forfaitair is
 * gunstiger" per spaar/beleg-mix ergens anders ligt, gaf diezelfde 2,0% op de
 * ene portefeuille "bespaart €X" (mét geld-CTA) en op de andere "levert niets
 * op" — zonder dat het verdict vermeldde bij welk percentage dat oordeel hoorde.
 *
 * Besluit eigenaar 26-08-2026 (optie A): de schuif start op het omslagpunt uit
 * het bestaande `Box3Result` — geen nieuwe databron — en het verdict draagt
 * ALTIJD het gekozen percentage.
 *
 * Drie dingen worden hier vastgelegd:
 *  1. AFGELEIDE DEFAULT — de beginstand komt uit `omslagRendementPct` van de
 *     canonieke engine, gesnapt op de sliderstap; hij verschilt dus per
 *     portefeuille en is nooit een vaste 2.
 *  2. GELABELD VERDICT — beide verdict-takken noemen het gekozen percentage.
 *  3. NEUTRALE BEGINSTAND — op de default staat er geen besparing en dus geen
 *     "Voeg toe als actie"-knop klaar op een aanname die de gebruiker nooit koos.
 */

const YEAR = 2026 as const
const TARIEF = BOX3_PARAMS[YEAR].tarief
const SLIDER_STEP = 0.5

function mockResult(overrides: Partial<Box3Result> = {}): Box3Result {
  return {
    year: YEAR,
    hasPartner: false,
    params: BOX3_PARAMS[YEAR],
    assetClassifications: [],
    debtClassifications: [],
    totaalSpaargeld: 0,
    totaalBeleggingen: 0,
    totaalUitgesloten: 0,
    totaalBox3Schulden: 0,
    totaalUitgeslotenSchulden: 0,
    schuldendrempel: 3_800,
    aftrekbareSchulden: 0,
    forfaitairSpaargeld: 0,
    forfaitairBeleggingen: 0,
    forfaitairSchulden: 0,
    voordeelUitSparen: 0,
    rendementsgrondslag: 0,
    heffingsvrijVermogen: 59_357,
    grondslagSparen: 0,
    effectiefRendement: 0,
    box3Income: 0,
    tax: 0,
    freedomDays: 0,
    dailyExpenses: 100,
    ...overrides,
  }
}

/** Spaargeld-zware portefeuille: laag forfait → laag omslagpunt (≈0,97% → 1,0%). */
const SPAARDER = mockResult({
  totaalSpaargeld: 200_000,
  totaalBeleggingen: 0,
  tax: 700,
})

/** Beleggings-zware portefeuille: hoog forfait → hoog omslagpunt (≈4,72% → 5,0%). */
const BELEGGER = mockResult({
  totaalSpaargeld: 0,
  totaalBeleggingen: 200_000,
  tax: 3_400,
})

function slider(): HTMLInputElement {
  return screen.getByLabelText('Werkelijk rendement') as HTMLInputElement
}

/**
 * De besparings-CTA. Op de knop-tekst matchen ("Toevoegen als actie", de
 * default-`label` van AandachtspuntActieButton) en niet op een zelfbedachte
 * formulering — een regex die nergens op slaat maakt een `toBeNull()`-assertie
 * stilzwijgend waar.
 */
function actieKnop(): HTMLElement | null {
  return screen.queryByRole('button', { name: /Toevoegen als actie/ })
}

/** Het omslagpunt uit de canonieke engine, gesnapt op de sliderstap (naar boven). */
function verwachteDefault(result: Box3Result): number {
  const { omslagRendementPct } = compareForfaitairVsWerkelijk({
    box3Result: result,
    werkelijkRendementPct: 0,
  })
  return Math.ceil(omslagRendementPct / SLIDER_STEP) * SLIDER_STEP
}

/** De broncode van het component — invoer voor de magic-number-grendel. */
function cardCode(): string {
  return readFileSync(
    join(process.cwd(), 'components/overview/belasting/box3-tegenbewijs-card.tsx'),
    'utf8',
  )
}

describe('Box3TegenbewijsCard — beginstand van de schuif (M24)', () => {
  it('start op het omslagpunt van deze portefeuille, niet op een vaste 2,0%', () => {
    render(<Box3TegenbewijsCard result={SPAARDER} />)

    // (700 / 0,36) / 200.000 × 100 = 0,972% → gesnapt op de stap = 1,0%.
    expect(verwachteDefault(SPAARDER)).toBe(1)
    expect(Number(slider().value)).toBe(1)
  })

  it('geeft een ándere beginstand bij een andere spaar/beleg-mix', () => {
    render(<Box3TegenbewijsCard result={BELEGGER} />)

    // (3.400 / 0,36) / 200.000 × 100 = 4,722% → gesnapt op de stap = 5,0%.
    expect(verwachteDefault(BELEGGER)).toBe(5)
    expect(Number(slider().value)).toBe(5)
  })

  it('blijft binnen het sliderbereik als het omslagpunt daarbuiten valt', () => {
    // Extreem hoge forfaitaire heffing t.o.v. de bezittingen → omslagpunt > 12%.
    const extreem = mockResult({ totaalBeleggingen: 10_000, tax: 10_000 * 0.2 * TARIEF })
    render(<Box3TegenbewijsCard result={extreem} />)

    expect(Number(slider().value)).toBeLessThanOrEqual(12)
    expect(Number(slider().value)).toBeGreaterThanOrEqual(-5)
  })

  it('houdt geen losse 2 meer als beginwaarde in de broncode', () => {
    expect(cardCode()).not.toMatch(/useState\(\s*2\s*\)/)
  })
})

describe('Box3TegenbewijsCard — gelabeld verdict (M24)', () => {
  it('noemt het gekozen percentage in de "forfaitair gunstiger"-tak', () => {
    render(<Box3TegenbewijsCard result={SPAARDER} />)

    // Op de beginstand (op/boven het omslagpunt) wint de forfaitaire heffing.
    expect(screen.getByText(/forfaitaire/)).toBeTruthy()
    expect(screen.getByTestId('tegenbewijs-verdict').textContent).toContain('1,0%')
  })

  it('noemt het gekozen percentage ook in de besparings-tak', () => {
    // Ruim onder het omslagpunt van de belegger → tegenbewijs loont.
    render(<Box3TegenbewijsCard result={BELEGGER} />)
    // Simuleer een gebruiker die naar 1,0% schuift.
    fireEvent.change(slider(), { target: { value: '1' } })

    const verdict = screen.getByTestId('tegenbewijs-verdict')
    expect(verdict.textContent).toContain('1,0%')
    expect(verdict.textContent).toContain('bespaart')
  })
})

describe('Box3TegenbewijsCard — herankeren bij perspectiefwissel (M24, review 4b)', () => {
  it('herinitialiseert op het nieuwe omslagpunt wanneer de kaart een nieuwe key krijgt', () => {
    const { rerender } = render(<Box3TegenbewijsCard key="persoonlijk" result={SPAARDER} />)
    expect(Number(slider().value)).toBe(1)

    // Perspectiefwissel: ander `result` én een andere key → verse beginstand.
    rerender(<Box3TegenbewijsCard key="huishouden" result={BELEGGER} />)
    expect(Number(slider().value)).toBe(5)
  })

  it('houdt zónder key-wissel de OUDE beginstand vast — precies waarom de key nodig is', () => {
    const { rerender } = render(<Box3TegenbewijsCard key="vast" result={SPAARDER} />)
    expect(Number(slider().value)).toBe(1)

    // Zelfde key: React behoudt de state. De kaart toont dan het NIEUWE
    // omslagpunt (4,7%) terwijl de schuif op de OUDE 1,0% blijft staan — en
    // 1,0% ligt onder dat nieuwe omslagpunt, dus er verschijnt een besparing
    // mét CTA op een stand die de gebruiker nooit koos.
    rerender(<Box3TegenbewijsCard key="vast" result={BELEGGER} />)
    expect(Number(slider().value)).toBe(1)
    expect(actieKnop()).not.toBeNull()
  })

  it('bindt de call-site in box3-detail aan het perspectief', () => {
    const detail = readFileSync(join(process.cwd(), 'components/overview/box3-detail.tsx'), 'utf8')
    const callSite = detail.slice(detail.indexOf('<Box3TegenbewijsCard'))
    expect(callSite.slice(0, 200)).toMatch(/key=\{`\$\{perspective\}/)
  })
})

describe('Box3TegenbewijsCard — grondslag-voetnoot (M24, review 4c)', () => {
  const FOOTNOOT = 'Tegen je dagtarief van € 100 per dag — je uitgaven over de afgelopen 12 maanden.'

  it('toont de doorgegeven voetnoot zodra er een vrijheidstijd-regel staat', () => {
    render(<Box3TegenbewijsCard result={BELEGGER} rateFootnote={FOOTNOOT} />)
    // Beginstand = forfaitair gunstiger → geen tijdregel → ook geen voetnoot.
    expect(screen.queryByText(FOOTNOOT)).toBeNull()

    fireEvent.change(slider(), { target: { value: '1' } })
    expect(screen.getByText(FOOTNOOT)).toBeTruthy()
  })

  it('voetnoot blijft weg als de ouder er geen levert (gemaskeerd of geen dagbasis)', () => {
    render(<Box3TegenbewijsCard result={BELEGGER} rateFootnote={null} />)
    fireEvent.change(slider(), { target: { value: '1' } })

    expect(screen.getByTestId('tegenbewijs-verdict').textContent).toContain('bespaart')
    expect(screen.queryByText(/dagtarief/)).toBeNull()
  })
})

describe('Box3TegenbewijsCard — neutrale beginstand (M24)', () => {
  it('zet op de beginstand géén besparings-CTA klaar', () => {
    render(<Box3TegenbewijsCard result={BELEGGER} />)

    // De oude 2,0%-default toonde hier "tegenbewijs bespaart €1.960" mét knop.
    expect(actieKnop()).toBeNull()
    expect(screen.getByTestId('tegenbewijs-verdict').textContent).toContain('levert niets op')
  })
})
