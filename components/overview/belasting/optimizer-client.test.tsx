import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Box3OptimizerClient } from './optimizer-client'
import { generateBox3Strategies, synthBox3Input } from '@/lib/tax-optimizer/box3-strategies'
import { buildCurrentStanding, pickBest } from '@/lib/tax-optimizer'
import { calculateBox3 } from '@/lib/box3-data'
import { GOAL_BY_ID } from '@/lib/tax-optimizer/goals'
import type {
  GoalSection,
  OptimizerCurrentStanding,
  OptimizerStrategy,
  OptimizerTopChoice,
} from '@/lib/tax-optimizer/types'

/**
 * Currency-rendering gebruikt een non-breaking space tussen € en het bedrag
 * (Intl.NumberFormat('nl-NL')). Testing-library's whitespace-normalizer
 * collapst die naar een gewone spatie bij het lezen van de DOM, dus een exacte
 * string-match met de nbsp zelf faalt stil. Idioom uit jaarruimte-card.test.tsx:
 * match op een `€\s*<bedrag>`-regex i.p.v. de exacte geformatteerde string.
 */
function euroPattern(amount: number): RegExp {
  const digits = Math.round(amount).toLocaleString('nl-NL').replace(/\./g, '\\.')
  return new RegExp(`€\\s*${digits}`)
}

const DAILY_EXPENSES = 100
const YEAR = 2026 as const

/**
 * Fixture uit de ÉCHTE motor (calculateBox3 + generateBox3Strategies +
 * buildCurrentStanding) — geen handgeschreven objecten. Zo pinnen de tests
 * zowel "de weergave klopt" als "de motor levert de velden waar de weergave op
 * rust" (netto effect, rendementskosten, huidige situatie).
 *
 * Groot beleggingen-blok zonder spaargeld: garandeert een "beleggingen →
 * spaargeld"-shift die de heffing verlaagt (lager forfait) maar verwacht
 * rendement kost — dus een NEGATIEF netto effect.
 */
function buildFixture(): {
  baseline: OptimizerStrategy
  shift: OptimizerStrategy
  standing: OptimizerCurrentStanding
} {
  const current = calculateBox3(synthBox3Input(0, 300_000, 0, false, DAILY_EXPENSES, YEAR))
  const { baseline, strategies } = generateBox3Strategies({
    goalId: 'box3-minimaal',
    year: YEAR,
    dailyExpenses: DAILY_EXPENSES,
    hasPartner: false,
    current,
  })
  const shift = strategies.find((s) => s.kind === 'samenstelling-shift')
  if (!shift) {
    throw new Error(
      'fixture-fout: generateBox3Strategies leverde geen samenstelling-shift op — pas de fixture-bedragen aan',
    )
  }
  // Meet vóór je assert: bevestig dat de motor écht een rendement-kostend
  // scenario met positieve besparing én negatief netto effect teruggeeft.
  expect(shift.hasReturnCost).toBe(true)
  expect(shift.savings).toBeGreaterThan(0)
  expect(shift.returnCostEur).toBeGreaterThan(0)
  expect(shift.netEffect).toBeLessThan(0)

  return { baseline, shift, standing: buildCurrentStanding(current, DAILY_EXPENSES) }
}

function box3Section(
  goalId: 'box3-minimaal' | 'box3-geen-rendementsverlies',
  baseline: OptimizerStrategy,
  ranked: OptimizerStrategy[],
  best: OptimizerStrategy | null,
): GoalSection {
  return { kind: 'box3', goalId, goal: GOAL_BY_ID[goalId], baseline, ranked, best }
}

function jaarruimteSection(besparing: number, freedomDays: number): GoalSection {
  return {
    kind: 'jaarruimte',
    goalId: 'jaarruimte-maximaal',
    goal: GOAL_BY_ID['jaarruimte-maximaal'],
    grossYearlyIncome: 60_000,
    pensionFactorA: 0,
    dailyExpenses: DAILY_EXPENSES,
    hasData: true,
    besparing,
    freedomDays,
  }
}

describe('Box3OptimizerClient — katern I: waar je nu staat', () => {
  it('pint de getoonde referentie-cijfers op de canonieke buildCurrentStanding-uitvoer', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('Heffing nu')).toBeTruthy()
    // Het getoonde bedrag is exact de heffing uit de motor.
    expect(screen.getAllByText(euroPattern(standing.tax)).length).toBeGreaterThan(0)
    // Vrijheidstijd-framing: de heffing in dagen, uit hetzelfde standing-veld.
    expect(screen.getByText(`${standing.taxFreedomDays} dagen`)).toBeTruthy()
    // Vermogensmix uit standing (beleggingen-only fixture).
    expect(screen.getAllByText(euroPattern(standing.totaalBeleggingen)).length).toBeGreaterThan(0)
  })

  it('toont de aannames waarop de vergelijking rust als read-only chips', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
        year={YEAR}
      />,
    )

    expect(screen.getByText('verwacht rendement beleggen')).toBeTruthy()
    expect(screen.getByText('spaarrente-aanname')).toBeTruthy()
    expect(screen.getByText('belastingjaar')).toBeTruthy()
  })
})

describe('Box3OptimizerClient — katern II: de vergelijking', () => {
  it('zet elke kans op één netto-effect-as en toont het geleverde netto effect (niet de bruto besparing)', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    // Het netto effect (besparing − misgelopen rendement) staat er, met teken.
    expect(screen.getAllByText(euroPattern(Math.abs(shift.netEffect))).length).toBeGreaterThan(0)
    // De bruto besparing blijft zichtbaar als attribuut in de tabel.
    expect(screen.getAllByText(euroPattern(shift.savings)).length).toBeGreaterThan(0)
    // De rendementskosten staan als eigen rij (eigen as, geen samengesteld cijfer).
    expect(screen.getByText('Verwacht rendementseffect')).toBeTruthy()
    expect(screen.getAllByText(euroPattern(shift.returnCostEur)).length).toBeGreaterThan(0)
  })

  it('zet "Niets doen" als eerste kolom en de netto-effect-rij als sluitrij', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const headers = screen.getAllByRole('columnheader')
    // [0] = lege hoek-cel voor de attribuut-kolom, [1] = de referentie.
    expect(headers[1].textContent).toContain('Niets doen')
    expect(headers[2].textContent).toContain(shift.title)

    const nettoRow = screen.getByText('Netto effect per jaar').closest('tr')
    expect(nettoRow).toBeTruthy()
    expect(nettoRow?.querySelector('.border-double')).toBeTruthy()
  })

  it('markeert de topkans in de rij zelf met een badge én een motiveringsregel', () => {
    const { baseline, shift, standing } = buildFixture()
    const jaarruimte = jaarruimteSection(1_800, 18)
    const topChoice: OptimizerTopChoice = {
      goalId: 'jaarruimte-maximaal',
      title: 'Benut je jaarruimte (lijfrente)',
      savings: 1_800,
      netEffect: 1_800,
      freedomDays: 18,
      caveat: 'Je zet dit bedrag vast tot je pensioen.',
      kind: 'jaarruimte',
      opportunityId: 'jaarruimte-maximaal',
    }

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), jaarruimte]}
        topChoice={topChoice}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('grootste kans')).toBeTruthy()
    expect(screen.getByText(/hoogste netto voordeel/i)).toBeTruthy()
    // Geen losse "Je grootste kans nu"-hero meer boven de vergelijking.
    expect(screen.queryByText(/Je grootste kans nu/i)).toBeNull()
  })

  it('filtert met de stand "Zonder rendementsverlies" de rendement-kostende kans weg', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getAllByText(shift.title).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Zonder rendementsverlies' }))

    expect(screen.queryAllByText(shift.title).length).toBe(0)
    expect(screen.getByText(/geen kans over/i)).toBeTruthy()
  })

  it('toont de Wft-callout één keer, onder de vergelijking', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getAllByText('Indicatie, geen advies.').length).toBe(1)
  })
})

/**
 * Household-fixture met TWEE kansen die onder 'netto' en 'besparing' echt
 * verschillend geordend zijn: de shift bespaart bruto meer maar kost per saldo
 * rendement (netEffect < 0), de partnerverdeling bespaart bruto minder maar
 * kost niets (netEffect = savings > 0). Zo bewijst de test dat de sorteer-
 * toggle de kolomvolgorde in de vergelijkingstabel echt omdraait — een pure
 * `sortOpportunities`-unit-test dekt de sorteerlogica, niet de bedrading naar
 * de DOM.
 */
function buildTwoOpportunityFixture(): {
  section: GoalSection
  shift: OptimizerStrategy
  partner: OptimizerStrategy
  standing: OptimizerCurrentStanding
} {
  const current = calculateBox3({
    assets: [
      { id: 'a1', asset_type: 'savings', current_value: 150_000, is_active: true } as never,
      { id: 'a2', asset_type: 'investment', current_value: 150_000, is_active: true } as never,
    ],
    debts: [],
    hasPartner: true,
    dailyExpenses: DAILY_EXPENSES,
    year: YEAR,
  })
  const { baseline, strategies } = generateBox3Strategies({
    goalId: 'box3-minimaal',
    year: YEAR,
    dailyExpenses: DAILY_EXPENSES,
    hasPartner: true,
    current,
    optimalAllocation: { totalTax: 5_000, savingsVsEqual: 800 },
  })
  const shift = strategies.find((s) => s.kind === 'samenstelling-shift')
  const partner = strategies.find((s) => s.kind === 'partnerverdeling')
  if (!shift || !partner) {
    throw new Error('fixture-fout: verwacht zowel een shift- als een partnerverdeling-scenario')
  }
  // Meet vóór je assert: bevestig dat de fixture de twee sorteerstanden echt
  // uit elkaar trekt, anders bewijst de klik-test niets.
  expect(shift.savings).toBeGreaterThan(partner.savings)
  expect(shift.netEffect).toBeLessThan(0)
  expect(partner.netEffect).toBe(partner.savings)
  expect(partner.netEffect).toBeGreaterThan(0)

  return {
    section: box3Section('box3-minimaal', baseline, strategies, pickBest(strategies, 'box3-minimaal')),
    shift,
    partner,
    standing: buildCurrentStanding(current, DAILY_EXPENSES),
  }
}

describe('Box3OptimizerClient — sorteer-toggle wijzigt de kolomvolgorde', () => {
  it('"Netto effect" (default) zet de partnerverdeling vóór de shift; "Grootste besparing" draait dat om', () => {
    const { section, shift, partner, standing } = buildTwoOpportunityFixture()

    render(<Box3OptimizerClient sections={[section]} standing={standing} hasPartner={true} />)

    const opportunityHeaderTitles = () =>
      screen.getAllByRole('columnheader').slice(2).map((h) => h.textContent ?? '')

    // Default sortMode = 'netto': partnerverdeling (netto positief) eerst.
    const before = opportunityHeaderTitles()
    expect(before[0]).toContain(partner.title)
    expect(before[1]).toContain(shift.title)

    fireEvent.click(screen.getByRole('button', { name: 'Grootste besparing' }))

    // Na de toggle: de shift (grotere bruto besparing) staat nu vooraan.
    const after = opportunityHeaderTitles()
    expect(after[0]).toContain(shift.title)
    expect(after[1]).toContain(partner.title)
  })
})

describe('Box3OptimizerClient — katern III: inzoomen per kans', () => {
  it('begint ingeklapt en toont na openen de kassabon met het netto effect', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const toggle = screen.getByRole('button', { name: /Toon uitwerking/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Verwacht misgelopen rendement')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Verwacht misgelopen rendement')).toBeTruthy()
    expect(screen.getByText('Belastingbesparing in dit scenario')).toBeTruthy()
    // Negatief netto effect → feitelijke verdict-regel, geen imperatief.
    expect(screen.getByText(/kost dit scenario je geld/i)).toBeTruthy()
  })

  it('houdt maximaal één kans tegelijk open', () => {
    const { baseline, shift, standing } = buildFixture()
    const jaarruimte = jaarruimteSection(1_800, 18)

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), jaarruimte]}
        standing={standing}
        hasPartner={false}
      />,
    )

    const toggles = screen.getAllByRole('button', { name: /Toon uitwerking/i })
    expect(toggles.length).toBe(2)

    fireEvent.click(toggles[0])
    expect(screen.getAllByRole('button', { name: /Verberg/i }).length).toBe(1)

    fireEvent.click(screen.getAllByRole('button', { name: /Toon uitwerking/i })[0])
    expect(screen.getAllByRole('button', { name: /Verberg/i }).length).toBe(1)
  })

  it('opent de uitwerking vanuit de vergelijkingstabel', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        standing={standing}
        hasPartner={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Bekijk uitwerking/i }))
    expect(screen.getByText('Verwacht misgelopen rendement')).toBeTruthy()
  })
})

describe('Box3OptimizerClient — lege staten', () => {
  it('toont zonder doorgerekende kansen een neutrale variant met de Fin-knop', () => {
    const { standing } = buildFixture()

    render(<Box3OptimizerClient sections={[]} standing={standing} hasPartner={false} />)

    expect(screen.getByText(/geen scenario dat je Box 3-heffing verlaagt/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Bespreek .* met Fin/i })).toBeTruthy()
    // Geen groene bedragen: de netto-effect-as ontbreekt volledig.
    expect(screen.queryByText('Netto effect per jaar')).toBeNull()
  })

  it('toont zonder topkans geen badge, wél de Fin-fallback', () => {
    const { baseline, shift, standing } = buildFixture()

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift)]}
        topChoice={null}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.queryByText('grootste kans')).toBeNull()
    expect(screen.getByRole('button', { name: /Bespreek .* met Fin/i })).toBeTruthy()
  })
})

describe('Box3OptimizerClient — katern IV: voetnoten', () => {
  it('sluit af met aannames, methode, binnenkort en geen-advies', () => {
    const { baseline, shift, standing } = buildFixture()
    const preview: GoalSection = {
      kind: 'preview',
      goalId: 'levenslang-minimaal',
      goal: GOAL_BY_ID['levenslang-minimaal'],
      previewNote: 'Straks vergelijkt TriFinity de onttrekkingsvolgordes.',
    }

    render(
      <Box3OptimizerClient
        sections={[box3Section('box3-minimaal', baseline, [shift], shift), preview]}
        standing={standing}
        hasPartner={false}
      />,
    )

    expect(screen.getByText('Aannames')).toBeTruthy()
    expect(screen.getByText('Methode')).toBeTruthy()
    expect(screen.getByText('Binnenkort')).toBeTruthy()
    expect(screen.getByText('Geen advies')).toBeTruthy()
    expect(screen.getByText(/onttrekkingsvolgordes/i)).toBeTruthy()
  })
})
