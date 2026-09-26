/**
 * Render-bewijs voor de verhuisde euro-render-grens (ADR 0179 fase 1 stap 12).
 *
 * Given de grens (bakens `EURO-WEERGAVE: DE RENDER-GRENS` … `EINDE EURO-WEERGAVE`) is
 *       ongewijzigd uit horizon-client geknipt naar `useEuroViewFeeds`,
 * When  de hook rendert onder een `EuroViewProvider` op 'nominal' en op 'real',
 * Then  geeft hij in 'nominal' exact de nominale feeds terug (dezelfde referentie,
 *       zodat de memo-keten van de consumenten niet in een re-render-cascade valt)
 *       en deelt hij in 'real' elk bedrag precies één keer door de factor van de
 *       leeftijd waar het bij hoort.
 *
 * De bron-kant (precies één grens, niets erbuiten) staat in
 * `use-euro-view-feeds.euro-view.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import type { EuroView } from '@/lib/euro-display'
import type { SimResult, SimRow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { LabUitkomst } from '@/lib/horizon/lab-uitkomst'
import { useEuroViewFeeds, type EuroViewFeedsInput } from './use-euro-view-feeds'

const PI = 0.02
/** Kernelrijen 40..44 met factor (1+π)^(age − 40); jaar 0 draagt exact 1,0. */
const UNIFIED = [40, 41, 42, 43, 44].map(
  (age) => ({ age, inflationFactor: (1 + PI) ** (age - 40) }) as unknown as UnifiedProjectionRow,
)
const SIM_ROWS = [40, 41, 42, 43, 44].map(
  (age) =>
    ({
      age,
      phase: 'accumulation',
      startPortfolio: 100_000,
      growth: 0,
      savings: 0,
      withdrawal: 0,
      cashflowNet: 0,
      oneTimeNet: 0,
      endPortfolio: 110_000,
      grossIncome: 0,
      grossExpenses: 0,
      flowIn: 0,
      flowOut: 0,
    }) as SimRow,
)
const SIM_RESULT = {
  requiredFirePortfolio: 500_000,
  targetEndPortfolio: 50_000,
  fireAge: 43,
  fireAgeFractional: 43.2,
  vastStopLeeftijd: null,
} as unknown as SimResult
const LAB_UITKOMST = {
  kind: 'vrijheidsleeftijd',
  basisFireAge: null,
  scenarioFireAge: null,
  deltaMaanden: null,
  promotie: { kind: 'geen', reden: 'geen-verkenning' },
} as unknown as LabUitkomst

function input(): EuroViewFeedsInput {
  return {
    displayUnifiedRows: UNIFIED,
    displaySimRows: SIM_ROWS,
    wealthCompositionRows: [],
    partnerLine: null,
    householdMainLine: null,
    liquidWealthPoints: undefined,
    combinedScenarioOverlays: [],
    householdOverlays: null,
    monteCarloOverlay: undefined,
    simResult: SIM_RESULT,
    fireTargetInclHome: 600_000,
    chartEndAge: 44,
    targetInflationFactors: UNIFIED.map((r) => ({ age: r.age, factor: r.inflationFactor })),
    userAowAge: { years: 42, months: 0, fractional: 42 } as EuroViewFeedsInput['userAowAge'],
    fireTargetExclHome: 400_000,
    balkVrijheidDoel: 500_000,
    effectiveFireTarget: 500_000,
    vermogenOpAnker: null,
    monthlyWithdrawalAtAow: 2_000,
    labDekking: null,
    labUitkomst: LAB_UITKOMST,
    masked: false,
    labPromotie: LAB_UITKOMST.promotie,
    doelPreviews: [],
    readoutData: null,
    canonicalDailyRate: 100,
    ieBreakdownResult: null,
    scenarioPresets: null,
    householdHero: null,
    partnerHero: null,
  }
}

function render(view: EuroView, feeds: EuroViewFeedsInput) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EuroViewProvider initialView={view}>{children}</EuroViewProvider>
  )
  return renderHook(() => useEuroViewFeeds(feeds), { wrapper }).result.current
}

describe('useEuroViewFeeds — de verhuisde render-grens', () => {
  it("'nominal' geeft de nominale feeds ongewijzigd door, met dezelfde referentie", () => {
    const feeds = input()
    const out = render('nominal', feeds)
    expect(out.viewDisplaySimRows).toBe(feeds.displaySimRows)
    expect(out.viewCombinedScenarioOverlays).toBe(feeds.combinedScenarioOverlays)
    expect(out.viewTargetInflationFactors).toBe(feeds.targetInflationFactors)
    expect(out.viewFireTarget).toBe(500_000)
    expect(out.viewFireTargetInclHome).toBe(600_000)
    expect(out.viewFireTargetExclHome).toBe(400_000)
    expect(out.viewBalkVrijheidDoel).toBe(500_000)
    expect(out.viewEffectiveFireTarget).toBe(500_000)
    expect(out.viewMonthlyWithdrawalAtAow).toBe(2_000)
    expect(out.viewTargetEndPortfolio).toBe(50_000)
    expect(out.viewDoelPreviews).toBe(feeds.doelPreviews)
  })

  it("'real' deelt elk bedrag één keer door de factor van zijn eigen leeftijd", () => {
    const feeds = input()
    const out = render('real', feeds)
    // FIRE-bedragen: de factor van de afgeronde FIRE-leeftijd (43,2 → 43), KRUIS-27.
    const fireFactor = (1 + PI) ** 3
    expect(out.viewFireTarget).toBeCloseTo(500_000 / fireFactor, 6)
    expect(out.viewFireTargetInclHome).toBeCloseTo(600_000 / fireFactor, 6)
    expect(out.viewFireTargetExclHome).toBeCloseTo(400_000 / fireFactor, 6)
    expect(out.viewBalkVrijheidDoel).toBeCloseTo(500_000 / fireFactor, 6)
    expect(out.viewEffectiveFireTarget).toBeCloseTo(500_000 / fireFactor, 6)
    // De maandonttrekking hoort bij de AOW-leeftijd (42), niet bij de FIRE-leeftijd.
    expect(out.viewMonthlyWithdrawalAtAow).toBeCloseTo(2_000 / (1 + PI) ** 2, 6)
    // Het einddoel hoort bij de laatste getekende leeftijd (44).
    expect(out.viewTargetEndPortfolio).toBeCloseTo(50_000 / (1 + PI) ** 4, 6)
    // Rijen: elke rij met de factor van haar eigen leeftijd; jaar 0 blijft staan.
    out.viewDisplaySimRows.forEach((row, i) => {
      expect(row.endPortfolio).toBeCloseTo(110_000 / (1 + PI) ** i, 6)
      expect(row.age).toBe(40 + i)
    })
    // De meegroeiende doellijn wordt in 'real' een vlakke unit-factorlijst (N2b).
    expect(out.viewTargetInflationFactors.every((f) => f.factor === 1)).toBe(true)
  })

  it("'real': de vrijheidstijd in de cijferbar volgt een ververst dagtarief, ook als de rest gelijk blijft", () => {
    // Na router.refresh() kan alleen het 12-mnd dagtarief veranderen (nieuwe transacties),
    // terwijl de projectie-invoer structureel gelijk blijft (useStructurallyStable) en
    // de readout dus dezelfde referentie houdt. Dan mag de tijdregel niet blijven hangen.
    const readoutData = {
      age: 42,
      year: 2028,
      phaseLabel: 'Opbouw',
      phaseColor: 'x',
      netWorth: 365_000,
      netWorthMoment: 'begin 2028',
      freedomTime: 'nominaal',
      monthlyLabel: 'Inleg / maand',
      monthlyAmount: 1_000,
    } as EuroViewFeedsInput['readoutData']
    const basis = { ...input(), readoutData }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EuroViewProvider initialView="real">{children}</EuroViewProvider>
    )
    const hook = renderHook((feeds: EuroViewFeedsInput) => useEuroViewFeeds(feeds), {
      wrapper,
      initialProps: basis,
    })
    const bij100 = hook.result.current.viewReadoutData?.freedomTime
    hook.rerender({ ...basis, canonicalDailyRate: 200 })
    const bij200 = hook.result.current.viewReadoutData?.freedomTime
    expect(bij100).toBeTruthy()
    expect(bij200).toBeTruthy()
    expect(bij200).not.toBe(bij100)
  })
})
