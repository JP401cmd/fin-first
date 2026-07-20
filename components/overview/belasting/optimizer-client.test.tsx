import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Box3OptimizerClient } from './optimizer-client'
import { generateBox3Strategies, synthBox3Input } from '@/lib/tax-optimizer/box3-strategies'
import { calculateBox3 } from '@/lib/box3-data'
import { GOAL_BY_ID } from '@/lib/tax-optimizer/goals'
import type {
  GoalSection,
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
  // formatCurrency (Intl, 0 decimalen) rondt af — spiegel dat hier, anders
  // wijkt een niet-geheel bedrag (bv. cent-resten uit de belastingmotor) af.
  const digits = Math.round(amount).toLocaleString('nl-NL').replace(/\./g, '\\.')
  return new RegExp(`€\\s*${digits}`)
}

/**
 * Regressietest voor de "geen rendementsverlies"-presentatie (Doel II,
 * box3-geen-rendementsverlies): een rendement-kostende samenstelling-shift mag
 * NOOIT als groene winst getoond worden — hij hoort gedempt met de
 * "kost rendement"-marker, terwijl de stand "grootste besparing" (box3-minimaal)
 * dezelfde shift wél als "grootste kans" toont.
 *
 * De fixture-strategie komt uit de échte motor (generateBox3Strategies +
 * calculateBox3), niet uit een handgeschreven mkStrategy-object — zo pint deze
 * test zowel "de presentatielogica klopt" als "de motor levert daadwerkelijk
 * een hasReturnCost:true-scenario" vast.
 */
function buildShiftStrategy(): { baseline: OptimizerStrategy; shift: OptimizerStrategy } {
  const dailyExpenses = 100
  const year = 2026 as const
  // Groot beleggingen-blok, geen spaargeld: garandeert dat de "beleggingen →
  // spaargeld"-shift een positieve besparing oplevert (lager forfait).
  const current = calculateBox3(synthBox3Input(0, 300_000, 0, false, dailyExpenses, year))
  const { baseline, strategies } = generateBox3Strategies({
    goalId: 'box3-geen-rendementsverlies',
    year,
    dailyExpenses,
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
  // scenario met positieve besparing teruggeeft, i.p.v. dat aan te nemen.
  expect(shift.hasReturnCost).toBe(true)
  expect(shift.savings).toBeGreaterThan(0)
  return { baseline, shift }
}

describe('Box3OptimizerClient — "geen rendementsverlies"-presentatie (regressie)', () => {
  it('toont een rendement-kostend scenario gedempt met de "kost rendement"-marker en de kosteloze-besparing-labels, zonder "grootste kans"', () => {
    const { baseline, shift } = buildShiftStrategy()
    const section: GoalSection = {
      kind: 'box3',
      goalId: 'box3-geen-rendementsverlies',
      goal: GOAL_BY_ID['box3-geen-rendementsverlies'],
      baseline,
      ranked: [shift],
      best: null,
    }

    render(<Box3OptimizerClient sections={[section]} hasPartner={false} />)

    // Marker "kost rendement — zie Grootste besparing" (ScenarioBars-annotatie + compacte rij)
    expect(screen.getAllByText(/kost rendement/i).length).toBeGreaterThan(0)

    // FiguresStrip-labels horend bij "geen kosteloze winnaar"
    expect(screen.getByText('Laagst haalbaar (kosteloos)')).toBeTruthy()
    expect(screen.getByText(/geen kosteloze besparing/i)).toBeTruthy()

    // Geen "grootste kans"-badge: er is geen kosteloze winnaar (best === null)
    expect(screen.queryByText('grootste kans')).toBeNull()

    // Het besparingsbedrag zelf draagt niet de positieve/groene styling
    const amountEl = screen.getByText(euroPattern(shift.savings))
    expect(amountEl.style.color).not.toBe('var(--positive)')
    expect(amountEl.style.color).toBe('var(--ink-3)')
  })

  it('toont dezelfde shift-strategie in "box3-minimaal" (stand grootste besparing) wél groen als "grootste kans" — contrast', () => {
    const { baseline, shift } = buildShiftStrategy()
    const section: GoalSection = {
      kind: 'box3',
      goalId: 'box3-minimaal',
      goal: GOAL_BY_ID['box3-minimaal'],
      baseline,
      ranked: [shift],
      best: shift,
    }

    render(<Box3OptimizerClient sections={[section]} hasPartner={false} />)

    expect(screen.getByText('grootste kans')).toBeTruthy()
    // Geen gedempte marker hier — dit is de stand grootste besparing, geen
    // rendementsverlies-framing.
    expect(screen.queryByText(/kost rendement/i)).toBeNull()

    // Het besparingsbedrag komt hier terug in de ScenarioBars-annotatie én in het
    // winnaar-kaart-bedrag (best === shift). De FiguresStrip-winnaarcel draagt de
    // kleur op de wrapper (niet op de tekst-node) en valt buiten deze filter;
    // filter daarom op de elementen die de kleur daadwerkelijk zelf dragen.
    const amountEls = screen.getAllByText(euroPattern(shift.savings))
    const styledEls = amountEls.filter((el) => el.style.color !== '')
    expect(styledEls.length).toBeGreaterThan(0)
    for (const el of styledEls) {
      expect(el.style.color).toBe('var(--positive)')
    }
  })
})

/**
 * De pagina LEIDT met één aanbeveling ("Je grootste kans nu") en voegt de twee
 * Box 3-doelen samen tot één katern met een toggle. Deze tests pinnen de nieuwe
 * structuur: de topChoice-prop rendert de leidende kaart met vrijheidstijd-
 * framing + in-page anchor, en de toggle wisselt tussen de twee al-geleverde
 * box3-standen.
 */
describe('Box3OptimizerClient — leidende aanbeveling + samengevoegde Box 3-katern', () => {
  it('rendert het "Je grootste kans nu"-blok met titel, kanttekening en een in-page Bekijk-anchor', () => {
    const { baseline, shift } = buildShiftStrategy()
    const section: GoalSection = {
      kind: 'box3',
      goalId: 'box3-minimaal',
      goal: GOAL_BY_ID['box3-minimaal'],
      baseline,
      ranked: [shift],
      best: shift,
    }
    const topChoice: OptimizerTopChoice = {
      goalId: 'box3-minimaal',
      // Bewust een titel die niet met de strategie-titel botst, zodat de
      // heading-query het top-blok eenduidig raakt.
      title: 'Verlaag je Box 3-heffing dit jaar',
      savings: shift.savings,
      freedomDays: shift.freedomDays,
      caveat: 'Dit scenario kost verwacht rendement.',
      kind: 'box3',
      anchorId: 'optimizer-box3',
    }

    render(<Box3OptimizerClient sections={[section]} topChoice={topChoice} hasPartner={false} />)

    expect(screen.getByText(/Je grootste kans nu/i)).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Verlaag je Box 3-heffing dit jaar' }),
    ).toBeTruthy()
    expect(screen.getByText(/Dit scenario kost verwacht rendement/i)).toBeTruthy()
    // Vrijheidstijd-framing: de teruggekochte vrijheidsdagen worden benoemd.
    expect(screen.getAllByText(/vrijheidsdagen/i).length).toBeGreaterThan(0)
    // "Bekijk"-anchor scrollt naar de bijbehorende sectie.
    const link = screen.getByRole('link', { name: /Bekijk/i })
    expect(link.getAttribute('href')).toBe('#optimizer-box3')
  })

  it('toont een neutrale variant zonder groen bedrag wanneer er geen topChoice is', () => {
    const { baseline, shift } = buildShiftStrategy()
    const section: GoalSection = {
      kind: 'box3',
      goalId: 'box3-minimaal',
      goal: GOAL_BY_ID['box3-minimaal'],
      baseline,
      ranked: [shift],
      best: shift,
    }

    render(<Box3OptimizerClient sections={[section]} topChoice={null} hasPartner={false} />)

    expect(screen.getByText(/geen directe besparingskans/i)).toBeTruthy()
    // Wél de Fin-knop om de situatie te bespreken.
    expect(screen.getByRole('button', { name: /Bespreek .* met Fin/i })).toBeTruthy()
  })

  it('voegt beide Box 3-standen samen tot één katern met een werkende toggle', () => {
    const { baseline, shift } = buildShiftStrategy()
    const minimaal: GoalSection = {
      kind: 'box3',
      goalId: 'box3-minimaal',
      goal: GOAL_BY_ID['box3-minimaal'],
      baseline,
      ranked: [shift],
      best: shift,
    }
    const geenVerlies: GoalSection = {
      kind: 'box3',
      goalId: 'box3-geen-rendementsverlies',
      goal: GOAL_BY_ID['box3-geen-rendementsverlies'],
      baseline,
      ranked: [shift],
      best: null,
    }

    render(<Box3OptimizerClient sections={[minimaal, geenVerlies]} hasPartner={false} />)

    // Eén gedeelde katern-kop (geen twee losse box3-secties meer).
    expect(screen.getByRole('heading', { name: 'Box 3-vermogen' })).toBeTruthy()

    // Default = "Grootste besparing": winnaar zichtbaar, geen gedempte marker.
    expect(screen.getByText('grootste kans')).toBeTruthy()
    expect(screen.queryByText(/kost rendement/i)).toBeNull()

    // Wissel via de IN-SECTIE-toggle (exacte a11y-naam onderscheidt 'm van de
    // gelijknamige doel-chip, die de langere aria-label draagt): nu de gedempte
    // marker, geen winnaar.
    fireEvent.click(screen.getByRole('button', { name: 'Zonder rendementsverlies' }))
    expect(screen.getAllByText(/kost rendement/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('grootste kans')).toBeNull()
  })

  it('rendert de vier doel-chips als navigatie', () => {
    const { baseline, shift } = buildShiftStrategy()
    const minimaal: GoalSection = {
      kind: 'box3',
      goalId: 'box3-minimaal',
      goal: GOAL_BY_ID['box3-minimaal'],
      baseline,
      ranked: [shift],
      best: shift,
    }
    const geenVerlies: GoalSection = {
      kind: 'box3',
      goalId: 'box3-geen-rendementsverlies',
      goal: GOAL_BY_ID['box3-geen-rendementsverlies'],
      baseline,
      ranked: [shift],
      best: null,
    }
    const jaarruimte: GoalSection = {
      kind: 'jaarruimte',
      goalId: 'jaarruimte-maximaal',
      goal: GOAL_BY_ID['jaarruimte-maximaal'],
      grossYearlyIncome: 50_000,
      pensionFactorA: 0,
      dailyExpenses: 100,
      hasData: true,
      besparing: 0,
      freedomDays: 0,
    }
    const preview: GoalSection = {
      kind: 'preview',
      goalId: 'levenslang-minimaal',
      goal: GOAL_BY_ID['levenslang-minimaal'],
      previewNote: 'Binnenkort.',
    }

    render(
      <Box3OptimizerClient
        sections={[minimaal, geenVerlies, jaarruimte, preview]}
        hasPartner={false}
      />,
    )

    // De vier chips zijn echte buttons met een navigatie-aria-label.
    expect(
      screen.getByRole('button', { name: /Ga naar Box 3, gesorteerd op grootste besparing/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: /Ga naar Box 3, gesorteerd zonder rendementsverlies/i,
      }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ga naar Jaarruimte/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ga naar Levenslange druk/i })).toBeTruthy()
  })

  it('een Box 3-chip zet de gedeelde toggle-stand (chip stuurt de sectie aan)', () => {
    const { baseline, shift } = buildShiftStrategy()
    const minimaal: GoalSection = {
      kind: 'box3',
      goalId: 'box3-minimaal',
      goal: GOAL_BY_ID['box3-minimaal'],
      baseline,
      ranked: [shift],
      best: shift,
    }
    const geenVerlies: GoalSection = {
      kind: 'box3',
      goalId: 'box3-geen-rendementsverlies',
      goal: GOAL_BY_ID['box3-geen-rendementsverlies'],
      baseline,
      ranked: [shift],
      best: null,
    }

    render(<Box3OptimizerClient sections={[minimaal, geenVerlies]} hasPartner={false} />)

    // Default = grootste besparing: winnaar zichtbaar.
    expect(screen.getByText('grootste kans')).toBeTruthy()

    // Klik de "Zonder rendementsverlies"-CHIP (via de navigatie-aria-label): de
    // gedeelde stand schakelt en de sectie toont de gedempte marker.
    fireEvent.click(
      screen.getByRole('button', {
        name: /Ga naar Box 3, gesorteerd zonder rendementsverlies/i,
      }),
    )
    expect(screen.getAllByText(/kost rendement/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('grootste kans')).toBeNull()
  })
})
