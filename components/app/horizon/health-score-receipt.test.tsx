/**
 * Tests voor HealthScoreReceipt — v2 (ADR 0010).
 *
 * Dekt:
 * - AC-4: getoond totaal + label + kleurband volgen het live health-object
 * - Vier pillarGroup-koppen zichtbaar bij v2-data (Rondkomen/Buffer/Schuld/Vrijheid)
 * - Totaalscore prominent bovenaan
 * - Belasting-"kans"-sectie aanwezig en Wft-veilig geformuleerd
 * - Geen override-pad meer
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HealthScore, HealthPillar, PillarGroup } from '@/lib/financial-health'
import { HealthScoreReceipt } from './health-score-receipt'

// useChatContext heeft een provider nodig — stub 'm; chat-gedrag is hier niet relevant.
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ openWithMessage: vi.fn() }),
}))

// Realistische Nederlandse indicatornamen — de engine garandeert altijd
// gelokaliseerde namen (lib/financial-health.ts), dus de fixtures spiegelen dat.
const PILLAR_DISPLAY_NAMES: Record<string, string> = {
  savings_rate: 'Spaarquote',
  budget_discipline: 'Budgetdiscipline',
  emergency_fund: 'Noodfonds',
  debt_service_ratio: 'Schuldenlast',
  debt_ratio: 'Schuldratio',
  fire_progress: 'FIRE-voortgang',
  asset_concentration: 'Vermogensspreiding',
}

function makePillar(
  id: string,
  score: number,
  weight: number,
  pillarGroup?: PillarGroup,
): HealthPillar {
  return {
    id,
    name: PILLAR_DISPLAY_NAMES[id] ?? id,
    score,
    weight,
    rawValue: `${score}`,
    explanation: 'x',
    improvementTip: 'y',
    actionLabel: 'doe iets',
    actionHref: '/overzicht',
    pillarGroup,
    groupLabel: pillarGroup
      ? { rondkomen: 'Rondkomen', buffer: 'Buffer', schuld: 'Schuld', vrijheid: 'Vrijheid' }[pillarGroup]
      : undefined,
  } as HealthPillar
}

/** v2-conforme health: 7 indicatoren met pillarGroup, gewichten ~1.0 */
function makeHealthV2(total = 72, label = 'Sterk'): HealthScore {
  return {
    total,
    label,
    pillars: [
      makePillar('savings_rate', 75, 0.2105, 'rondkomen'),
      makePillar('budget_discipline', 80, 0.1053, 'rondkomen'),
      makePillar('emergency_fund', 60, 0.2105, 'buffer'),
      makePillar('debt_service_ratio', 100, 0.1263, 'schuld'),
      makePillar('debt_ratio', 90, 0.0842, 'schuld'),
      makePillar('fire_progress', 50, 0.1895, 'vrijheid'),
      makePillar('asset_concentration', 80, 0.0737, 'vrijheid'),
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 7,
    budgetingActive: true,
  } as HealthScore
}

/** Minimale health voor kleurbandtests (3 pillars voor radar n≥3). */
function makeHealth(total: number, label: string): HealthScore {
  return {
    total,
    label,
    pillars: [
      makePillar('savings_rate', total, 0.34, 'rondkomen'),
      makePillar('debt_ratio', total, 0.33, 'schuld'),
      makePillar('emergency_fund', total, 0.33, 'buffer'),
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 3,
    budgetingActive: true,
  } as HealthScore
}

// ── AC-4: live totaal + label ─────────────────────────────────────────────

describe('HealthScoreReceipt — AC-4 (label/kleurband volgt het getoonde getal)', () => {
  it('toont het live totaal én label uit health (geen override-pad)', () => {
    render(<HealthScoreReceipt health={makeHealth(92, 'Uitstekend')} />)
    expect(screen.getAllByText('92/100').length).toBeGreaterThan(0)
    // 'Uitstekend' verschijnt nu zowel als beoordelingsregel als op de pijler-
    // badges (score 92 → 'Uitstekend' in de 5-traps scoreLabelNl) — minstens één.
    expect(screen.getAllByText('Uitstekend').length).toBeGreaterThan(0)
  })

  it('kleurband volgt het getal: >=80 → score-good', () => {
    const { container } = render(<HealthScoreReceipt health={makeHealth(85, 'Uitstekend')} />)
    const total = screen.getByLabelText('Totaalscore 85 van 100')
    expect(total.className).toContain('text-score-good')
    expect(total.className).not.toContain('text-score-warn')
    expect(total.className).not.toContain('text-score-bad')
    expect(container).toBeTruthy()
  })

  it('kleurband volgt het getal: 60–79 → score-ok', () => {
    const total = render(<HealthScoreReceipt health={makeHealth(68, 'Sterk')} />)
      .container.querySelector('[aria-label="Totaalscore 68 van 100"]')!
    expect(total.className).toContain('text-score-ok')
  })

  it('kleurband volgt het getal: 40–59 → score-warn', () => {
    const total = render(<HealthScoreReceipt health={makeHealth(55, 'Redelijk')} />)
      .container.querySelector('[aria-label="Totaalscore 55 van 100"]')!
    expect(total.className).toContain('text-score-warn')
  })

  it('kleurband volgt het getal: <40 → score-bad', () => {
    const total = render(<HealthScoreReceipt health={makeHealth(22, 'Kwetsbaar')} />)
      .container.querySelector('[aria-label="Totaalscore 22 van 100"]')!
    expect(total.className).toContain('text-score-bad')
  })

  it('de receipt accepteert geen override-prop meer (alleen health + footer)', () => {
    render(<HealthScoreReceipt health={makeHealth(34, 'Kwetsbaar')} />)
    expect(screen.getByLabelText('Totaalscore 34 van 100')).toBeTruthy()
  })
})

// ── Vier pillarGroup-koppen ────────────────────────────────────────────────

describe('HealthScoreReceipt — vier pillarGroup-secties (v2, ADR 0010)', () => {
  it('toont Rondkomen-sectie-header bij v2-data', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    // PillarGroupSection rendert een <section aria-label="Pijler Rondkomen: ...">
    const section = screen.getByRole('region', { name: /Rondkomen/i })
    expect(section).toBeTruthy()
  })

  it('toont Buffer-sectie-header bij v2-data', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    const section = screen.getByRole('region', { name: /Buffer/i })
    expect(section).toBeTruthy()
  })

  it('toont Schuld-sectie-header bij v2-data', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    const section = screen.getByRole('region', { name: /Schuld/i })
    expect(section).toBeTruthy()
  })

  it('toont Vrijheid-sectie-header bij v2-data', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    const section = screen.getByRole('region', { name: /Vrijheid/i })
    expect(section).toBeTruthy()
  })

  it('pillars zonder pillarGroup vallen in Overig-bucket (backward-compat)', () => {
    const healthWithUngrouped: HealthScore = {
      ...makeHealthV2(),
      pillars: [
        makePillar('savings_rate', 75, 0.5, 'rondkomen'),
        makePillar('emergency_fund', 60, 0.25), // geen pillarGroup
        makePillar('fire_progress', 50, 0.25, 'vrijheid'),
      ],
      activePillarCount: 3,
    }
    render(<HealthScoreReceipt health={healthWithUngrouped} />)
    // Overig-bucket verschijnt bij ungrouped pillars
    expect(screen.getByRole('region', { name: /Overige indicatoren/i })).toBeTruthy()
  })
})

// ── Totaalscore prominent bovenaan ────────────────────────────────────────

describe('HealthScoreReceipt — totaalscore prominent', () => {
  it('totaalscore bovenaan visible met /100-notatie', () => {
    render(<HealthScoreReceipt health={makeHealthV2(68, 'Sterk')} />)
    // De prominente totaalscore staat in de KassabonShell header (68/100)
    expect(screen.getAllByText('68/100').length).toBeGreaterThan(0)
  })

  it('beoordelingsregel (label) aanwezig onder de score', () => {
    render(<HealthScoreReceipt health={makeHealthV2(68, 'Sterk')} />)
    // 'Sterk' verschijnt meerdere keren (label + pillar-badges); minstens één instantie.
    expect(screen.getAllByText('Sterk').length).toBeGreaterThan(0)
  })
})

// ── Belasting-kans-sectie (Wft-veilig) ───────────────────────────────────

describe('HealthScoreReceipt — belasting-kans-sectie (ADR 0010, Wft)', () => {
  it('belasting ter oriëntatie-sectie is aanwezig', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    // TaxOpportunitySection rendert een <section aria-label="Belasting: educatief inzicht">
    const section = screen.getByRole('region', { name: /Belasting.*educatief inzicht/i })
    expect(section).toBeTruthy()
  })

  it('belastingkop is Wft-veilig: "ter oriëntatie" (geen advies-claims)', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    // Heading bevat "ter oriëntatie" ipv "bespaar X euro"
    expect(screen.getByText(/ter oriëntatie/i)).toBeTruthy()
  })

  it('belasting-link verwijst naar belastingpagina (niet naar score)', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    const link = screen.getByRole('link', { name: /belastingpositie/i })
    expect(link.getAttribute('href')).toContain('/overzicht/belasting')
  })

  it('tekst bevat "Verken" (richtingaanwijzer, geen "bespaar X")', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    // Verken = educatief, niet bindend advies
    expect(screen.getByText(/Verken je Box 3-positie/i)).toBeTruthy()
  })

  it('tekst bevat GEEN bedrag-beloftes ("€" in educatieve context is uit)', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    // Wft-eis: geen "bespaar €X" of "je betaalt €Y te veel"
    const section = screen.getByRole('region', { name: /Belasting.*educatief inzicht/i })
    expect(section.textContent).not.toMatch(/bespaar.*€\d/)
    expect(section.textContent).not.toMatch(/te veel.*€\d/)
  })
})
