/**
 * Render-tests op de KPI-strip en de voortgangsbalk van katern Plan (fase 2, ADR 0179).
 *
 * Pint de getoonde waarden tegen de canonieke bronnen voor dezelfde invoer:
 *  1. KPI 1 onder `solved` = `formatHeroFireAge` (hele jaren), onderschrift "jaar" —
 *     nooit de fractie (die staat in de kassabon).
 *  2. Eenvoudig = twee cellen: Vrijheidsleeftijd en Na pensioen; Volledig = vier.
 *  3. Onder een vast anker heet KPI 1 `ANKER_KPI_LABEL` en valt de Opnamerate weg.
 *  4. De voortgangsbalk: onder solved de vulling plus `planSamenvatting` ("N% van je
 *     doelbedrag"); onder een vast anker alleen de vulling.
 *  5. De duidingszin ("werken wordt een keuze rond je …") is weg.
 *  6. Het vrijheidsleeftijd-getal staat één keer in de strip (geen tweede weergave).
 */
import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { formatHeroFireAge, resolveHeroFireAge } from '@/lib/horizon/hero-fire-age'
import { ANKER_KPI_LABEL } from '@/lib/horizon/anker-copy'
import { planSamenvatting } from '@/lib/horizon/katern-copy'
import type { HorizonOutcomeGuard } from '@/lib/horizon/outcome-guard'
import { PlanKpiStrip } from './plan-kpi-strip'
import { PlanAnkerEnVoortgang } from './plan-hero-duiding'

const OK: HorizonOutcomeGuard = { ok: true, issue: null, label: null, hint: null }

const SOLVED = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: 52.3 })

function stripProps(over: Partial<ComponentProps<typeof PlanKpiStrip>> = {}): ComponentProps<typeof PlanKpiStrip> {
  return {
    isFixedAnchorMode: false,
    hasPerspectiveHero: false,
    setShowFireAgeReceipt: vi.fn(),
    heroFireAge: SOLVED,
    heroFireAgePending: false,
    isPartnerView: false,
    perspectiveHero: null,
    showFireAgeNotice: false,
    showFreeHero: false,
    freeHeroLabel: 'Vrijheid',
    heroAgeLabel: 'Vrijheidsleeftijd',
    fireAgeNoticeGuard: OK,
    freeHeroPhrase: 'Je bent vrij',
    heroFireAgeText: formatHeroFireAge(SOLVED, { dash: '–', pendingText: '···' }),
    heroAgeCaptionBase: 'jaar',
    setShowFireTargetReceipt: vi.fn(),
    showFireTargetNotice: false,
    fireTargetGuard: OK,
    isNuStoppenMode: false,
    dualDoelRegels: null,
    viewPerspectiveHeroFireTarget: null,
    viewVermogenOpAnker: null,
    viewBalkVrijheidDoel: 812_000,
    fireTargetCaption: 'benodigd',
    setShowSwrReceipt: vi.fn(),
    isPensioenMode: false,
    isKernelDepleteRate: false,
    viewMonthlyWithdrawalAtAow: null,
    simResult: null,
    fireSwr: 0.034,
    openRetirementExpensePane: vi.fn(),
    retirementMethod: 'essential_budgets' as ComponentProps<typeof PlanKpiStrip>['retirementMethod'],
    showRetirementExpenseNotice: false,
    retirementExpenseGuard: OK,
    input: { yearlyMustExpenses: 37_800 } as ComponentProps<typeof PlanKpiStrip>['input'],
    haalbareUitgaveRegel: null,
    haalbareUitgaveToon: 'text-positive',
    ...over,
  }
}

function renderStrip(mode: DisplayMode, over: Partial<ComponentProps<typeof PlanKpiStrip>> = {}) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <PlanKpiStrip {...stripProps(over)} />
    </DisplayModeProvider>,
  )
}

describe('PlanKpiStrip — KPI 1 in hele jaren', () => {
  it('toont formatHeroFireAge ("52") met onderschrift "jaar", niet 52,3', () => {
    const { container } = renderStrip('full')
    const cel = container.querySelector('[data-testid="hero-stat-fire-age"]') as HTMLElement
    expect(cel).toBeTruthy()
    expect(formatHeroFireAge(SOLVED)).toBe('52')
    expect(within(cel).getByText('52')).toBeTruthy()
    expect(within(cel).getByText('jaar')).toBeTruthy()
    expect(cel.textContent).not.toMatch(/52[,.]3/)
    expect(cel.getAttribute('data-fire-age-status')).toBe(SOLVED.status)
  })

  it('de cel is één knop die de kassabon opent', () => {
    const setShowFireAgeReceipt = vi.fn()
    const { container } = renderStrip('full', { setShowFireAgeReceipt })
    const cel = container.querySelector('[data-testid="hero-stat-fire-age"]') as HTMLButtonElement
    expect(cel.tagName).toBe('BUTTON')
    cel.click()
    expect(setShowFireAgeReceipt).toHaveBeenCalledWith(true)
  })

  it('het getal staat één keer in de strip (geen tweede weergavestijl)', () => {
    const { container } = renderStrip('full')
    expect(container.querySelectorAll('[data-testid="hero-stat-fire-age"]')).toHaveLength(1)
    expect(screen.getAllByText('52')).toHaveLength(1)
  })
})

describe('PlanKpiStrip — KPI 1 bij onbereikbaar en bij rekenen (C3 punt 2)', () => {
  const ONBEREIKBAAR = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: null })
  const BEREKENEN = resolveHeroFireAge({ hasKernelResult: false, isRefining: true })

  function kpi1(heroFireAge: typeof SOLVED, pending: boolean) {
    const { container } = renderStrip('full', {
      heroFireAge,
      heroFireAgePending: pending,
      heroFireAgeText: formatHeroFireAge(heroFireAge, { dash: '–', pendingText: '···' }),
    })
    return container.querySelector('[data-testid="hero-stat-fire-age"]') as HTMLElement
  }

  it('onbereikbaar: de canonieke woorden, geen streepje, geen "jaar", geen markeerblok', () => {
    expect(ONBEREIKBAAR.status).toBe('onbekend')
    const cel = kpi1(ONBEREIKBAAR, false)
    expect(cel.textContent).toContain('Niet binnen je plan')
    expect(cel.textContent).not.toContain('–')
    expect(cel.textContent).not.toMatch(/\bjaar\b/)
    // Het beige markeerblok (HighlightMark) onder een leeg getal oogde als een skeleton.
    expect(cel.querySelector('[style*="linear-gradient"]')).toBeNull()
    expect(cel.getAttribute('aria-busy')).toBeNull()
  })

  it('rekenen: "···" met "wordt berekend…" en aria-busy — oogt anders dan onbereikbaar', () => {
    const cel = kpi1(BEREKENEN, true)
    expect(cel.textContent).toContain('···')
    expect(cel.textContent).toContain('wordt berekend…')
    expect(cel.getAttribute('aria-busy')).toBe('true')
    expect(cel.textContent).not.toContain('Niet binnen je plan')
  })
})

describe('PlanKpiStrip — KPI 3 in nl-NL (C3 punt 5)', () => {
  it('ingesteld: "3,40%" met komma, niet "3.40%"', () => {
    const { container } = renderStrip('full', { fireSwr: 0.034, simResult: null })
    const cel = container.querySelector('[data-testid="hero-stat-swr"]') as HTMLElement
    expect(cel.textContent).toContain('3,40%')
    expect(cel.textContent).not.toContain('3.40%')
    expect(cel.textContent).toContain('ingesteld')
  })

  it('impliciet: het simulatiepercentage, met onderschrift "impliciet"', () => {
    const simResult = { implicitWithdrawalRate: 0.0456 } as ComponentProps<typeof PlanKpiStrip>['simResult']
    const { container } = renderStrip('full', { fireSwr: 0.0284, simResult })
    const cel = container.querySelector('[data-testid="hero-stat-swr"]') as HTMLElement
    expect(cel.textContent).toContain('4,56%')
    expect(cel.textContent).toContain('impliciet')
  })
})

describe('PlanKpiStrip — Eenvoudig en Volledig', () => {
  it('Volledig: vier cellen', () => {
    const { container } = renderStrip('full')
    expect(container.querySelectorAll('[data-figure-amount]')).toHaveLength(4)
    expect(container.querySelector('[data-testid="hero-stat-swr"]')).toBeTruthy()
  })

  it('Eenvoudig: twee cellen, Vrijheidsleeftijd en Na pensioen', () => {
    const { container } = renderStrip('simple')
    expect(container.querySelectorAll('[data-figure-amount]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="hero-stat-fire-age"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="hero-stat-retirement-expense"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="hero-stat-fire-target"]')).toBeNull()
    expect(container.querySelector('[data-testid="hero-stat-swr"]')).toBeNull()
  })

  it('onder een vast anker: "Reikt tot" als KPI 1 en geen Opnamerate', () => {
    const { container } = renderStrip('full', { isFixedAnchorMode: true, heroAgeLabel: ANKER_KPI_LABEL })
    expect(container.querySelectorAll('[data-figure-amount]')).toHaveLength(3)
    expect(container.querySelector('[data-testid="hero-stat-swr"]')).toBeNull()
    const cel = container.querySelector('[data-testid="hero-stat-fire-age"]') as HTMLElement
    expect(cel.textContent).toContain(ANKER_KPI_LABEL)
  })
})

describe('PlanAnkerEnVoortgang — de voortgangsbalk', () => {
  const basis: ComponentProps<typeof PlanAnkerEnVoortgang> = {
    hasPerspectiveHero: false,
    heroFireAge: SOLVED,
    currentAge: 38,
    solvedRun: null,
    simResult: null,
    isFixedAnchorMode: false,
    perspectiveHero: null,
    effectiveFreedomPct: 61.4,
    showFireTargetNotice: false,
  }

  it('onder solved: vulling plus "N% van je doelbedrag" uit planSamenvatting', () => {
    const { container } = render(<PlanAnkerEnVoortgang {...basis} />)
    const label = container.querySelector('[data-testid="plan-voortgang-label"]')
    expect(label?.textContent).toBe(planSamenvatting({ kind: 'solved', doelbedragPct: 61.4 }))
    expect(label?.textContent).toBe('61% van je doelbedrag')
    const vulling = container.querySelector('[data-testid="plan-voortgang"] [style]') as HTMLElement
    expect(vulling.style.width).toBe('61.4%')
  })

  it('onder een vast anker: alleen de vulling, geen percentage (de kop zegt het)', () => {
    const { container } = render(<PlanAnkerEnVoortgang {...basis} isFixedAnchorMode effectiveFreedomPct={96} />)
    expect(container.querySelector('[data-testid="plan-voortgang-label"]')).toBeNull()
    expect(container.textContent).not.toMatch(/\d+%/)
    const vulling = container.querySelector('[data-testid="plan-voortgang"] [style]') as HTMLElement
    expect(vulling.style.width).toBe('96%')
  })

  it('noemt geen "% van je doelbedrag" als de Doelbedrag-cel een gegevensmelding draagt', () => {
    const { container } = render(<PlanAnkerEnVoortgang {...basis} showFireTargetNotice />)
    expect(container.querySelector('[data-testid="plan-voortgang-label"]')).toBeNull()
  })

  it('solved: geen drieslag', () => {
    const { container } = render(<PlanAnkerEnVoortgang {...basis} />)
    expect(container.querySelector('[data-testid="anker-drieslag"]')).toBeNull()
  })

  it('vast anker: "Reikt tot" staat één keer in Plan — in KPI 1, niet nog eens in de drieslag (eigenaarsbesluit 26 sep)', () => {
    const vast = resolveHeroFireAge({
      hasKernelResult: true,
      stopAnker: { soort: 'leeftijd', leeftijd: 58.5 },
      vastStopLeeftijd: 58.5,
      ankerReach: { kind: 'reikt-tot', age: 83.4, endAge: 90 },
      solvedFireAgeFractional: 55.2,
    } as Parameters<typeof resolveHeroFireAge>[0])
    expect(vast.anker).toBeTruthy()
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <PlanKpiStrip {...stripProps({ isFixedAnchorMode: true, heroAgeLabel: ANKER_KPI_LABEL, heroFireAge: vast })} />
        <PlanAnkerEnVoortgang {...basis} heroFireAge={vast} isFixedAnchorMode />
      </DisplayModeProvider>,
    )
    const drieslag = container.querySelector('[data-testid="anker-drieslag"]') as HTMLElement
    expect(drieslag).toBeTruthy()
    expect(drieslag.querySelector('[data-testid="anker-tegel-vrij"]')).toBeTruthy()
    expect(drieslag.querySelector('[data-testid="anker-tegel-stop"]')).toBeTruthy()
    expect(drieslag.textContent).not.toContain(ANKER_KPI_LABEL)
    expect(container.textContent?.split(ANKER_KPI_LABEL).length).toBe(2)
  })

  it('de duidingszin is vervallen', () => {
    const { container } = render(<PlanAnkerEnVoortgang {...basis} />)
    expect(container.querySelector('[data-testid="hero-duiding"]')).toBeNull()
    expect(container.textContent).not.toMatch(/werken wordt een keuze/i)
  })
})

describe('PlanKpiStrip — KPI 4 linkt naar de rij in Instellingen (ADR 0179 fase 3)', () => {
  it('persoonlijk: de cel is een link naar ?rij=uitgave-na-pensioen, geen pane', () => {
    const openRetirementExpensePane = vi.fn()
    const { container } = renderStrip('full', { openRetirementExpensePane })
    const cel = container.querySelector('[data-testid="hero-stat-retirement-expense"]') as HTMLElement
    expect(cel.tagName).toBe('A')
    expect(cel.getAttribute('href')).toBe('/toekomst/instellingen?rij=uitgave-na-pensioen')
    cel.click()
    expect(openRetirementExpensePane).not.toHaveBeenCalled()
  })

  it('het bedrag op de tegel is dezelfde bron als de rij (effectiveInput.yearlyMustExpenses)', () => {
    const { container } = renderStrip('full')
    const cel = container.querySelector('[data-testid="hero-stat-retirement-expense"]') as HTMLElement
    expect(cel.textContent).toMatch(/37\.800/)
  })
})
