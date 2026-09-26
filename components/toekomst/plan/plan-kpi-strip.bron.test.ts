/**
 * Bron-grendels op de KPI-rij van het Plan-katern (fase 1, ADR 0179, kaart §5.1).
 *
 * Deze invarianten stonden op `horizon-client.tsx`; met de verhuizing van de blokken
 * C/D/G naar `plan-kpi-strip.tsx` gaan ze hierheen mee:
 * - kpi-gegevensmelding: elke tegel toetst zijn eigen brondata, één vorm (UR2-05)
 * - haalbare-uitgave (JSX-deel): één regel in beide layouts, semantische kleur
 * - na-pensioen-klik (tegels): beide tegels delen `openRetirementExpensePane`
 * - fire-doel-grondslag (JSX-deel): dubbele doelregels in leesvolgorde, geen accent
 * - prognose-precisie (deel): doelbedrag met approx, leeftijd zonder decimalen
 * - nu-stoppen (KPI-labels) en euro-view FR-B5 (hero-puntbedragen als view*)
 *
 * De afleidingen zelf (guards, `haalbareUitgaveRegel`, `fireDoel`) blijven in de ouder;
 * die helften blijven op de ouder gepind.
 *
 * Fase 2 (ADR 0179 D2/D4, spec §4.9): de drie weergaven (groot mobiel getal, desktop-strip,
 * mobiele 2×2-strip) zijn één `FiguresStrip`. Elke invariant geldt daarom nu voor ÉÉN
 * layout; de tellingen gingen bewust van 2 naar 1. De vorm van de gegevensmelding is de
 * helper `heroKpiNoticeDelen` (kop op de plek van het getal, uitleg als onderschrift).
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const SOURCE_PATH = join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-kpi-strip.tsx')
const source = readSourceLF(SOURCE_PATH)

/** Eén `FiguresStrip` voor alle breedtes (fase 2): elke tegel staat één keer in de bron. */
const LAYOUTS = 1

function codeRegels(): string[] {
  return source.split('\n').filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
}

describe('plan-kpi-strip — elke tegel toetst zijn eigen brondata (kpi-gegevensmelding)', () => {
  it('haalt de ene meldingsvorm uit plan-helpers', () => {
    expect(source).toContain("import { heroKpiNoticeDelen, ReceiptCue } from './plan-helpers'")
  })

  it('rendert de melding op de leeftijd-, doel- en na-pensioen-tegel', () => {
    expect(source.match(/\bheroKpiNoticeDelen\(/g) ?? []).toHaveLength(3 * LAYOUTS)
    for (const g of ['fireAgeNoticeGuard', 'fireTargetGuard', 'retirementExpenseGuard']) {
      expect(source, g).toMatch(new RegExp(`heroKpiNoticeDelen\\(${g}\\b`))
    }
  })

  it('schrijft de kop nergens zelf uit', () => {
    for (const g of ['fireTargetGuard', 'retirementExpenseGuard', 'fireAgeNoticeGuard']) {
      expect(source.match(new RegExp(`\\b${g}\\.label\\b`, 'g')) ?? [], g).toHaveLength(0)
      // De uitleg (hint) staat in de tegel alleen via HeroKpiNotice, nooit los.
      expect(source.match(new RegExp(`\\b${g}\\.hint\\b`, 'g')) ?? [], g).toHaveLength(0)
    }
    expect(source).not.toMatch(/['"`]We missen gegevens/)
  })
})

describe('plan-kpi-strip — haalbare uitgave (JSX-deel)', () => {
  it('rendert de regel in beide layouts en rekent hem niet zelf uit', () => {
    expect(source.match(/data-testid="haalbaar-bij-uitgave"/g) ?? []).toHaveLength(LAYOUTS)
    expect(source).not.toContain('haalbaarBijUitgaveRegel(')
  })

  it('kleurt met de semantische toon uit de ouder en niets anders', () => {
    const blokken = source.match(/data-testid="haalbaar-bij-uitgave"[\s\S]{0,400}/g) ?? []
    expect(blokken).toHaveLength(LAYOUTS)
    for (const b of blokken) {
      expect(b).toMatch(/haalbareUitgaveToon/)
      expect(b).not.toMatch(/text-(red|emerald|green|rose)-\d/)
      expect(b).not.toMatch(/#[0-9a-fA-F]{6}/)
    }
  })

  it('toont niets in huishoud-/partnerweergave', () => {
    expect(source.match(/!hasPerspectiveHero && haalbareUitgaveRegel/g) ?? []).toHaveLength(LAYOUTS)
  })
})

describe('plan-kpi-strip — "Na pensioen"-tegels (na-pensioen-klik)', () => {
  it('beide tegels bestaan en gebruiken dezelfde handler', () => {
    expect(source.match(/'data-testid': 'hero-stat-retirement-expense'/g) ?? []).toHaveLength(LAYOUTS)
    // ADR 0179 fase 3: persoonlijk een link naar de rij, in de huishoudweergave de handler.
    expect(source.match(/\{ onClick: openRetirementExpensePane \} : \{ href: UITGAVE_RIJ_HREF \}/g) ?? []).toHaveLength(LAYOUTS)
    expect(source).toContain("instellingenRijHref('uitgave-na-pensioen')")
  })
})

describe('plan-kpi-strip — doelbedrag-grondslag (fire-doel-grondslag, JSX-deel)', () => {
  it('schrijft het onderschrift niet zelf uit maar toont fireTargetCaption', () => {
    for (const literal of ['benodigd — met je huis', 'benodigd — zonder je huis']) {
      expect(codeRegels().filter((l) => l.includes(literal))).toEqual([])
    }
    expect(source.match(/: fireTargetCaption,/g) ?? []).toHaveLength(LAYOUTS)
  })

  it('leest de dubbele doeltegel via de leesvolgorde, niet rechtstreeks', () => {
    for (const regel of codeRegels()) {
      expect(/MaskedAmount value=\{viewFireTarget(Incl|Excl)Home/.test(regel), regel.trim()).toBe(false)
    }
  })

  it('kleurt geen van beide doelregels met een module-accent', () => {
    const regels = codeRegels()
    const treffers = regels.map((l, i) => [l, i] as const).filter(([l]) => l.includes('dualDoelRegels['))
    expect(treffers.length).toBeGreaterThan(0)
    for (const [, i] of treffers) {
      const venster = regels.slice(Math.max(0, i - 4), i + 2).join('\n')
      expect(/module-active-/.test(venster), venster).toBe(false)
    }
  })
})

describe('plan-kpi-strip — prognose-precisie (deel)', () => {
  const DOELBEDRAG =
    /value=\{[^}]*(fireTarget|FireTarget|VrijheidDoel|PortfolioAtAow|RequiredPortfolio|dualDoelRegels)/

  it('rendert elk doelbedrag met approx', () => {
    const sites = source.split('\n').filter((l) => l.includes('<MaskedAmount') && DOELBEDRAG.test(l))
    // één layout × (dubbel 2 + perspectief 1 + enkel 1) = 4; de grendel mag niet leeg draaien
    expect(sites.length).toBeGreaterThanOrEqual(4)
    expect(sites.filter((l) => !l.includes('approx'))).toEqual([])
  })

  it('toont de leeftijd nooit met decimalen en consumeert de afgeronde seam', () => {
    const LEEFTIJD_MET_DECIMALEN = /\b\w*[fF]ire[aA]ge\w*[?!]?\.toFixed\(|\bheroFireAge\.age[?!]?\.toFixed\(/
    expect(source.split('\n').filter((l) => LEEFTIJD_MET_DECIMALEN.test(l))).toEqual([])
    expect(source).toContain('heroFireAgeText')
    // Het grote mobiele kerngetal is in fase 2 vervallen: geen tweede weergave van KPI 1.
    expect(source).not.toContain('heroFireAgeTextMobile')
    expect(source).toContain('heroFireAgeCaption(')
  })
})

describe('plan-kpi-strip — vast anker (nu-stoppen, KPI-labels) en euro-weergave', () => {
  it('KPI 2 heet onder een vast anker "Vermogen op je stopmoment"; KPI 3 valt weg', () => {
    expect(source).toContain("isFixedAnchorMode ? 'Vermogen op je stopmoment' : 'Doelbedrag'")
    expect(source).toContain('const zonderOpname = isFixedAnchorMode && !hasPerspectiveHero')
    expect(source).toMatch(/zonderOpname\s*\?\s*\[kpiLeeftijd, kpiDoel, kpiNaPensioen\]/)
  })

  it('toont de hero-puntbedragen als view*-waarden (FR-B5)', () => {
    expect(source).not.toMatch(/MaskedAmount value=\{fireTargetInclHome!\}/)
    expect(source).not.toMatch(/MaskedAmount value=\{fireTargetExclHome!\}/)
    expect(source).toMatch(/isFixedAnchorMode \? \(viewVermogenOpAnker \?\? 0\) : viewBalkVrijheidDoel/)
    expect(source).toContain('viewMonthlyWithdrawalAtAow')
  })
})

describe('plan-kpi-strip — één strip, Eenvoudig twee cellen (fase 2, spec §4.7/§4.9)', () => {
  it('is één FiguresStrip, geen eigen grid en geen tweede (mobiele) weergave', () => {
    expect(source.match(/<FiguresStrip\b/g) ?? []).toHaveLength(1)
    expect(source).not.toMatch(/md:hidden|hidden md:grid/)
    expect(source).not.toContain('PlanKerngetalMobiel')
  })

  it('kiest in Eenvoudig Vrijheidsleeftijd en Na pensioen via simpleFigures (geen modus-ternary)', () => {
    expect(source).toContain('simpleFigures={[kpiLeeftijd, kpiNaPensioen]}')
    expect(source).not.toMatch(/useDisplayMode|displayMode\s*===/)
  })
})
