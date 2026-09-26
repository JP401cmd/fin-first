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
import type { HealthVerloopPunt } from '@/lib/health-verloop'

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

// ── Radar-labels leesbaar (geen harde 9-tekens-truncatie) ────────────────

describe('HealthScoreReceipt — radar-labels volledig leesbaar', () => {
  it('toont volledige pijlernamen als SVG-tekst (niet afgekapt op 9 tekens)', () => {
    const { container } = render(<HealthScoreReceipt health={makeHealthV2()} />)
    // Verzamel alle <text>-labels in de radar (SVG).
    const svgTextContent = Array.from(container.querySelectorAll('svg text'))
      .map(t => t.textContent ?? '')
      .join('|')

    // Lange namen die vroeger op 9 tekens werden afgekapt, staan nu volledig.
    expect(svgTextContent).toContain('Vermogensspreiding')
    expect(svgTextContent).toContain('Budgetdiscipline')
    expect(svgTextContent).toContain('Schuldenlast')
    // Geen ellipsis-afkapping meer in de radar-labels.
    expect(svgTextContent).not.toContain('…')
  })

  it('aria-label van de radar bevat de volledige pijlernamen (screenreader)', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    const radar = screen.getByRole('img', { name: /Radar chart/i })
    const label = radar.getAttribute('aria-label') ?? ''
    expect(label).toContain('Vermogensspreiding')
    expect(label).toContain('Budgetdiscipline')
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

// ── Sectie "Verloop" (fase 5 — verloop naar /overzicht) ─────────────────────

function verloopPunt(
  snapshot_date: string,
  resilience_score: number | null,
  opts: { score_version?: number | null; fire_age?: number | null; engine_bron?: string | null } = {},
): HealthVerloopPunt {
  return {
    snapshot_date,
    resilience_score,
    score_version: opts.score_version === undefined ? 2 : opts.score_version,
    fire_age: opts.fire_age ?? null,
    engine_bron: opts.engine_bron ?? null,
  }
}

/** Het lijnpad (geen vlak) van een verloopgrafiek. */
function lijnPad(chart: HTMLElement): string {
  const path = chart.querySelector('path[fill="none"]')
  return path?.getAttribute('d') ?? ''
}

describe('HealthScoreReceipt — sectie Verloop', () => {
  it('Given geen verloop-prop (bv. /toekomst), When de kassabon rendert, Then geen sectie Verloop', () => {
    render(<HealthScoreReceipt health={makeHealthV2()} />)
    expect(screen.queryByTestId('health-verloop')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Verloop' })).toBeNull()
  })

  it('Given een lege reeks, When de kassabon opent, Then de lege staat zonder grafiek', async () => {
    render(<HealthScoreReceipt health={makeHealthV2()} verloop={[]} />)
    expect(await screen.findByRole('heading', { name: 'Verloop' })).toBeTruthy()
    expect(screen.getByTestId('health-verloop-leeg')).toBeTruthy()
    expect(screen.queryByTestId('resilience-trend-chart')).toBeNull()
    expect(screen.queryByTestId('fire-age-trend-chart')).toBeNull()
  })

  it('Given één maandstand, When de kassabon opent, Then die stand als tekst en geen grafiek', async () => {
    render(
      <HealthScoreReceipt
        health={makeHealthV2()}
        verloop={[verloopPunt('2026-09-26', 64, { fire_age: 51.9 })]}
      />,
    )
    const gezondheid = await screen.findByTestId('health-verloop-gezondheid-een-punt')
    expect(gezondheid.textContent).toMatch(/64 van 100 in sep 2026/)
    expect(screen.getByTestId('health-verloop-vrijheidsleeftijd-een-punt').textContent).toMatch(/51,9 jaar in sep 2026/)
    expect(screen.queryByTestId('resilience-trend-chart')).toBeNull()
    expect(screen.queryByTestId('fire-age-trend-chart')).toBeNull()
  })

  it('Given twee reeksen per maand, When de kassabon opent, Then gezondheidsgetal én vrijheidsleeftijd met de constaterende uitlegregel', async () => {
    render(
      <HealthScoreReceipt
        health={makeHealthV2()}
        verloop={[
          verloopPunt('2026-07-31', 58, { fire_age: 53 }),
          verloopPunt('2026-08-29', 61, { fire_age: 52.4 }),
          verloopPunt('2026-09-26', 64, { fire_age: 51.9 }),
        ]}
      />,
    )
    expect(await screen.findByTestId('resilience-trend-chart')).toBeTruthy()
    expect(screen.getByTestId('fire-age-trend-chart')).toBeTruthy()
    const uitleg = screen.getByTestId('health-verloop-fire-uitleg').textContent ?? ''
    expect(uitleg).toMatch(/zoals hij toen berekend werd/)
    // Merkstem (ADR 0165): geen koop-/verkoopmetafoor.
    expect(uitleg).not.toMatch(/koop|kocht|verkoop/i)
    expect(screen.queryByTestId('health-verloop-versiewissel')).toBeNull()
    expect(screen.queryByTestId('method-change-marker')).toBeNull()
  })

  it('Given een score_version-overgang, When de kassabon opent, Then gemarkeerd in de grafiek en de lijn breekt daar', async () => {
    render(
      <HealthScoreReceipt
        health={makeHealthV2()}
        verloop={[
          verloopPunt('2026-05-31', 70, { score_version: 1 }),
          verloopPunt('2026-06-30', 72, { score_version: 1 }),
          verloopPunt('2026-07-31', 58, { score_version: 2 }),
          verloopPunt('2026-08-29', 61, { score_version: 2 }),
        ]}
      />,
    )
    const chart = await screen.findByTestId('resilience-trend-chart')
    expect(screen.getByTestId('method-change-marker')).toBeTruthy()
    expect(screen.getByTestId('health-verloop-versiewissel').textContent).toMatch(/veranderde in jul 2026/)
    // Twee lijnstukken: v1 en v2 worden niet met elkaar verbonden.
    expect(lijnPad(chart).match(/M/g)).toHaveLength(2)
  })

  it('Given een ontbrekende maand, When de kassabon opent, Then plot op datum: het gat blijft zichtbaar en de lijn breekt', async () => {
    render(
      <HealthScoreReceipt
        health={makeHealthV2()}
        verloop={[
          verloopPunt('2026-01-31', 50),
          verloopPunt('2026-02-28', 52),
          // maart ontbreekt
          verloopPunt('2026-04-30', 55),
          verloopPunt('2026-05-31', 57),
        ]}
      />,
    )
    const chart = await screen.findByTestId('resilience-trend-chart')
    const xs = Array.from(chart.querySelectorAll('circle')).map((c) => Number(c.getAttribute('cx')))
    const stapFebApr = xs[2] - xs[1]
    const stapJanFeb = xs[1] - xs[0]
    expect(stapFebApr).toBeGreaterThan(stapJanFeb * 1.8)
    expect(lijnPad(chart).match(/M/g)).toHaveLength(2)
  })

  it('Given een engine_bron-wisseling in de FIRE-reeks, When de kassabon opent, Then de "rekenwijze gewijzigd"-regel', async () => {
    render(
      <HealthScoreReceipt
        health={makeHealthV2()}
        verloop={[
          verloopPunt('2026-07-31', 58, { fire_age: 53, engine_bron: 'v2' }),
          verloopPunt('2026-08-29', 61, { fire_age: 51, engine_bron: 'kernel' }),
        ]}
      />,
    )
    const note = await screen.findByTestId('engine-bron-transition-note')
    expect(note.textContent).toMatch(/Rekenwijze gewijzigd in aug 2026/)
  })
})

describe('HealthScoreReceipt — lopende maand = live stand', () => {
  it('Given een verloop waarvan de lopende maand live is, When de kassabon opent, Then zegt de ondertitel dat en staat het live getal als laatste punt', async () => {
    render(
      <HealthScoreReceipt
        health={makeHealthV2(56, 'Redelijk')}
        verloop={[verloopPunt('2026-08-29', 56), { ...verloopPunt('2026-09-26', 56), live: true }]}
      />,
    )
    const ondertitel = await screen.findByTestId('health-verloop-ondertitel')
    expect(ondertitel.textContent).toBe(
      'De laatste stand van elke maand over de laatste twaalf maanden; voor deze maand je huidige stand.',
    )
    const labels = Array.from(screen.getByTestId('resilience-trend-chart').querySelectorAll('text'))
      .map((t) => t.textContent)
    expect(labels.filter((t) => t === '56')).toHaveLength(2)
  })

  it('Given een verloop zonder live punt, When de kassabon opent, Then de gewone ondertitel', async () => {
    render(<HealthScoreReceipt health={makeHealthV2()} verloop={[verloopPunt('2026-08-29', 56)]} />)
    expect((await screen.findByTestId('health-verloop-ondertitel')).textContent).toBe(
      'De laatste stand van elke maand, over de laatste twaalf maanden.',
    )
  })
})
