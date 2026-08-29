/**
 * Component-tests voor HorizonYearDetailsSheet — de kassabon-uitsplitsingen in
 * het jaar-detail-scherm van /toekomst (extend-feature fase 2).
 *
 * Dekt:
 *  - `buildWithdrawalReceiptLines`: de onttrekkings-kassabon reconcilieert exact
 *    (Σ component === totaalNeed; totaalNeed − nietGedekt === withdrawal) voor een
 *    normaal jaar én een tekortjaar met "Niet gedekt".
 *  - Render: de onttrekkings-regels, rendement-/Box 3-sub-regels per type en de
 *    netto-vermogen-kop-strip-sub-regel verschijnen.
 *
 * De ingebedde Sankey wordt gestub't — die draait op `buildBreakdown` en heeft
 * eigen dekking; hier isoleren we het sheet-eigen kassabon-idioom.
 * DisplayModeProvider-val: buiten provider = "full" (geen HideInSimple-hard-hide).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { HorizonYearDetailsSheet, buildWithdrawalReceiptLines } from './horizon-year-details-sheet'
import type { UnifiedProjectionRow, WithdrawalNeedBreakdown } from '@/lib/unified-projection'
import type { SimRow } from '@/lib/fire-simulation'

// Stub de ingebedde Sankey — buildBreakdown wordt elders getest.
vi.mock('@/components/app/horizon/horizon-cashflow-sankey', () => ({
  HorizonCashflowSankey: () => <div data-testid="sankey-stub" />,
}))

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
beforeEach(() => {
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
})

// ── Fixtures ─────────────────────────────────────────────────────────

function needOf(partial: Partial<WithdrawalNeedBreakdown>): WithdrawalNeedBreakdown {
  return {
    uitgaveTerm: 0,
    huurNaVerkoop: 0,
    vervallenHypotheeklast: 0,
    box3: 0,
    partnerBijdrage: 0,
    totaalNeed: 0,
    restMaandClamp: 0,
    nietGedekt: 0,
    ...partial,
  }
}

// Normaal onttrekkingsjaar (leeftijd-90-case uit de opdracht):
// basisuitgaven 101k + huur 75k − hyplast 5k + box3 3k = 174k behoefte, volledig gedekt.
const NORMAL_NEED = needOf({
  uitgaveTerm: 101000,
  huurNaVerkoop: 75000,
  vervallenHypotheeklast: 5000,
  box3: 3000,
  totaalNeed: 174000,
  nietGedekt: 0,
})

// Tekortjaar: behoefte 174k, maar pot dekt maar 150k → 24k niet gedekt.
const DEFICIT_NEED = needOf({
  uitgaveTerm: 101000,
  huurNaVerkoop: 75000,
  vervallenHypotheeklast: 5000,
  box3: 3000,
  totaalNeed: 174000,
  nietGedekt: 24000,
})

function makeYearRow(overrides: Partial<UnifiedProjectionRow> = {}): UnifiedProjectionRow {
  return {
    year: 50,
    age: 90,
    phase: 'withdrawal',
    assetBuckets: {
      investment: { startValue: 480000, growth: 30000, contributions: 0, box3Drag: 3000, endValue: 500000 },
      cash: { startValue: 49500, growth: 500, contributions: 0, box3Drag: 200, endValue: 50000 },
    },
    debtBalances: {},
    totalAssets: 550000,
    totalDebts: 20000,
    netWorth: 530000,
    startNetWorth: 529000,
    // Mock-rij: volledig liquide (Prognose!J == I) tenzij een test `nettoLiquide` zet.
    nettoLiquide: 530000,
    grossIncome: 0,
    savings: 0,
    withdrawal: 174000,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 30500,
    totalBox3: 3200,
    cumulativeBox3: 60000,
    inflationFactor: Math.pow(1.02, 50),
    withdrawalNeed: NORMAL_NEED,
    ...overrides,
  }
}

const SIM_ROWS: SimRow[] = [
  { age: 89, phase: 'retirement', startPortfolio: 0, growth: 0, savings: 0, withdrawal: 0, cashflowNet: 0, oneTimeNet: 0, endPortfolio: 0, grossIncome: 0, grossExpenses: 0, flowIn: 0, flowOut: 0 },
  { age: 90, phase: 'retirement', startPortfolio: 0, growth: 0, savings: 0, withdrawal: 0, cashflowNet: 0, oneTimeNet: 0, endPortfolio: 0, grossIncome: 0, grossExpenses: 0, flowIn: 0, flowOut: 0 },
  { age: 91, phase: 'retirement', startPortfolio: 0, growth: 0, savings: 0, withdrawal: 0, cashflowNet: 0, oneTimeNet: 0, endPortfolio: 0, grossIncome: 0, grossExpenses: 0, flowIn: 0, flowOut: 0 },
]

function renderSheet(row: UnifiedProjectionRow, primaryBasis?: 'total' | 'liquid') {
  return render(
    <HorizonYearDetailsSheet
      open
      onClose={() => {}}
      age={90}
      unifiedRows={[row]}
      simRows={SIM_ROWS}
      currentAge={40}
      inflationRate={0.02}
      debts={[]}
      lifeEvents={[]}
      cashflows={[]}
      primaryBasis={primaryBasis}
    />,
  )
}

// ── buildWithdrawalReceiptLines: exacte reconciliatie ────────────────

describe('buildWithdrawalReceiptLines', () => {
  it('component-regels sommeren naar totaalNeed en reconciliëren op de onttrekking (normaal jaar)', () => {
    const lines = buildWithdrawalReceiptLines(NORMAL_NEED, 174000)
    const componentSum = lines
      .filter(l => l.kind === 'component')
      .reduce((s, l) => s + l.signed, 0)
    expect(componentSum).toBeCloseTo(NORMAL_NEED.totaalNeed, 6)
    // Geen tekort-sluitregel in een gedekt jaar
    expect(lines.some(l => l.kind === 'deficit')).toBe(false)
    // De bon reconcilieert met het getoonde bedrag (= withdrawal)
    expect(NORMAL_NEED.totaalNeed - NORMAL_NEED.nietGedekt).toBe(174000)
  })

  it('sluit met "Niet gedekt (tekort)" zodat de bon exact het getoonde bedrag geeft (tekortjaar)', () => {
    const withdrawal = 150000
    const lines = buildWithdrawalReceiptLines(DEFICIT_NEED, withdrawal)
    const deficit = lines.find(l => l.kind === 'deficit')
    expect(deficit).toBeTruthy()
    expect(deficit!.signed).toBe(-24000)
    // totaalNeed − nietGedekt === withdrawal (getoonde bedrag)
    expect(DEFICIT_NEED.totaalNeed - DEFICIT_NEED.nietGedekt).toBe(withdrawal)
  })
})

// ── Render: kassabon-regels zichtbaar ────────────────────────────────

describe('HorizonYearDetailsSheet — onttrekkings-kassabon', () => {
  it('rendert de behoefte-uitsplitsing onder de onttrekking (normaal jaar)', () => {
    renderSheet(makeYearRow())
    expect(screen.getByText('Basisuitgaven (geïndexeerd)')).toBeTruthy()
    expect(screen.getByText('Huur na verkoop woning')).toBeTruthy()
    expect(screen.getByText('Vrijgevallen hypotheeklast')).toBeTruthy()
    expect(screen.getByText('Behoefte-totaal')).toBeTruthy()
    // Geen tekort-regel in een gedekt jaar
    expect(screen.queryByText('Niet gedekt (tekort)')).toBeNull()
  })

  it('toont "Niet gedekt (tekort)" als sluitregel in een tekortjaar', () => {
    renderSheet(makeYearRow({ withdrawal: 150000, withdrawalNeed: DEFICIT_NEED }))
    expect(screen.getByText('Niet gedekt (tekort)')).toBeTruthy()
  })
})

describe('HorizonYearDetailsSheet — rendement & Box 3 per type', () => {
  it('splitst rendement en Box 3 uit per vermogenstype', () => {
    renderSheet(makeYearRow())
    // Beide sub-lijsten dragen de asset-type-labels (Beleggingen verschijnt in
    // zowel de rendement- als de box3-uitsplitsing → minstens 2×).
    const beleggingen = screen.getAllByText('Beleggingen')
    expect(beleggingen.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Rendement-kassabon: liquide vs. niet-besteedbaar (defect A) ──────

/**
 * Review-bevinding M1/M2. `totalGrowth` telt óók de waardestijging van een
 * niet-liquide eigen woning; die is geen besteedbaar inkomen. De hoofdregel toont
 * daarom `totalGrowthLiquide` en het verschil krijgt een eigen NEUTRALE regel, zodat
 * de kassabon nog steeds op `totalGrowth` sluit én de eigen-woningsubrij niet twee
 * keer verschijnt.
 */
const HUIS_GROWTH_ROW = makeYearRow({
  assetBuckets: {
    investment: { startValue: 494000, growth: 6000, contributions: 0, box3Drag: 3000, endValue: 500000 },
    eigen_huis: { startValue: 396000, growth: 4000, contributions: 0, box3Drag: 0, endValue: 400000 },
  },
  totalGrowth: 10000,
  totalGrowthLiquide: 6000,
})

/** Het `<li>` van een CostsRow, opgezocht via zijn label. */
function costsRowFor(label: string | RegExp): HTMLElement {
  const el = screen.getByText(label).closest('li')
  expect(el).toBeTruthy()
  return el as HTMLElement
}

describe('HorizonYearDetailsSheet — rendement liquide vs. niet-besteedbaar', () => {
  it('toont het besteedbare deel als hoofdregel en de woningwaardestijging als aparte neutrale regel', () => {
    renderSheet(HUIS_GROWTH_ROW)

    const hoofd = costsRowFor('Rendement portfolio')
    expect(hoofd.textContent).toContain('6.000')

    const neutraal = costsRowFor('Waardestijging eigen woning (niet besteedbaar)')
    expect(neutraal.textContent).toContain('4.000')

    // Geen dubbeltelling: de eigen-woningsubrij hangt ONDER de neutrale regel,
    // niet onder het besteedbare rendement.
    expect(within(hoofd).queryByText('Eigen woning')).toBeNull()
    expect(within(neutraal).getByText('Eigen woning')).toBeTruthy()
    // …en de beleggingssubrij hangt wél onder de hoofdregel.
    expect(within(hoofd).getByText('Beleggingen')).toBeTruthy()

    // Kassabon sluit: 6.000 (liquide) + 4.000 (niet besteedbaar) = totalGrowth 10.000.
    expect(HUIS_GROWTH_ROW.totalGrowthLiquide! + 4000).toBe(HUIS_GROWTH_ROW.totalGrowth)
    // Geen restregel nodig zolang eigen_huis het hele verschil dekt.
    expect(screen.queryByText('Overig niet-besteedbaar')).toBeNull()
  })

  it('valt terug op de oude weergave zonder totalGrowthLiquide — geen neutrale regel', () => {
    const { totalGrowthLiquide: _weg, ...zonderVeld } = HUIS_GROWTH_ROW
    renderSheet(zonderVeld as UnifiedProjectionRow)

    const hoofd = costsRowFor('Rendement portfolio')
    // Volledige totalGrowth op de hoofdregel…
    expect(hoofd.textContent).toContain('10.000')
    // …met de eigen-woningsubrij er gewoon onder (pre-fix-gedrag).
    expect(within(hoofd).getByText('Eigen woning')).toBeTruthy()
    expect(screen.queryByText('Waardestijging eigen woning (niet besteedbaar)')).toBeNull()
    expect(screen.queryByText('Waardedaling eigen woning (niet besteedbaar)')).toBeNull()
  })

  it('sluit met "Overig niet-besteedbaar" als de subrijen het verschil niet dekken', () => {
    // Niet-liquide verschil = 10.000 − 6.000 = 4.000, maar de eigen-woningbucket
    // draagt er maar 3.000 van → 1.000 restant mag niet stil verdwijnen.
    renderSheet(
      makeYearRow({
        assetBuckets: {
          investment: { startValue: 494000, growth: 6000, contributions: 0, box3Drag: 3000, endValue: 500000 },
          eigen_huis: { startValue: 397000, growth: 3000, contributions: 0, box3Drag: 0, endValue: 400000 },
        },
        totalGrowth: 10000,
        totalGrowthLiquide: 6000,
      }),
    )
    const neutraal = costsRowFor('Waardestijging eigen woning (niet besteedbaar)')
    expect(neutraal.textContent).toContain('4.000')
    const rest = within(neutraal).getByText('Overig niet-besteedbaar')
    expect(rest).toBeTruthy()
    expect(rest.closest('li')!.textContent).toContain('1.000')
  })

  it('noemt een negatief niet-liquide verschil een waardeDALING', () => {
    renderSheet(
      makeYearRow({
        assetBuckets: {
          investment: { startValue: 490000, growth: 10000, contributions: 0, box3Drag: 3000, endValue: 500000 },
          eigen_huis: { startValue: 404000, growth: -4000, contributions: 0, box3Drag: 0, endValue: 400000 },
        },
        totalGrowth: 6000,
        totalGrowthLiquide: 10000,
      }),
    )
    expect(screen.getByText('Waardedaling eigen woning (niet besteedbaar)')).toBeTruthy()
    expect(screen.queryByText('Waardestijging eigen woning (niet besteedbaar)')).toBeNull()
  })
})

// ── Schulden-kassabon: kop-totaal reconcilieert met de regels ────────

/**
 * Review-bevinding H3: de rekenmotor boekt de opeethypotheek als synthetische
 * pot `debtBalances['opeethypotheek']` (géén `Debt`-rij). Die zit wél in
 * `row.totalDebts` maar werd uit de regellijst gefilterd → kop van €1,12 mln
 * boven een lijst waarin dat bedrag nergens voorkwam.
 */
describe('HorizonYearDetailsSheet — Schulden-kassabon reconcilieert', () => {
  const OPEET_ROW = makeYearRow({
    debtBalances: {
      opeethypotheek: {
        startBalance: 1_050_000,
        interestPaid: 58_000,
        principalPaid: 0,
        endBalance: 1_120_000,
      },
    },
    totalDebts: 1_120_000,
  })

  it('rendert de synthetische opeethypotheek-pot met een leesbaar label', () => {
    renderSheet(OPEET_ROW)
    expect(screen.getByText('Opeethypotheek')).toBeTruthy()
    // Nooit meer de UUID-afkapping van de sleutel.
    expect(screen.queryByText('opeethyp')).toBeNull()
  })

  it('kop-totaal is gelijk aan de som van de getoonde regels (geen gat)', () => {
    renderSheet(OPEET_ROW)
    // De kop toont het totaal; de enige regel toont exact hetzelfde bedrag.
    // Beide via dezelfde formatter → minstens twee voorkomens van het bedrag.
    const bedragen = screen.getAllByText((_, el) => {
      const t = el?.textContent?.replace(/ /g, ' ') ?? ''
      return el?.children.length === 0 && /1\.120\.000/.test(t)
    })
    expect(bedragen.length).toBeGreaterThanOrEqual(2)
    // Geen restregel nodig: de bon klopt zonder sluitpost.
    expect(screen.queryByText('Overige schulden')).toBeNull()
  })

  it('een onbekende pot verdwijnt niet stil maar sluit de bon als restregel', () => {
    renderSheet(
      makeYearRow({
        debtBalances: {
          'onbekende-modelpot-xyz': {
            startBalance: 0,
            interestPaid: 0,
            principalPaid: 0,
            endBalance: 40_000,
          },
        },
        totalDebts: 40_000,
      }),
    )
    expect(screen.getByText('Overige schulden')).toBeTruthy()
  })
})

describe('HorizonYearDetailsSheet — netto-vermogen kop-strip', () => {
  it('toont de + bezittingen − schulden sub-regel', () => {
    renderSheet(makeYearRow())
    const strips = screen.getAllByText(/bezittingen/)
    expect(strips.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/schulden/)).toBeTruthy()
  })
})

// ── Grondslag-regel bij een J-hoofdlijn (ADR 0114 D3) ──────────────

describe('HorizonYearDetailsSheet — "waarvan besteedbaar" bij woonstrategie Uitsluiten', () => {
  // De bon BLIJFT de volledige jaarbalans op de I-grondslag — een bon is een
  // balans, geen lens, en er is geen kernel-sluitterm waarmee een J-bon sluitend
  // te maken zou zijn. Wat er wel bij moet: het getal waarop de gebruiker klikte.

  const UITSLUITEN = makeYearRow({ nettoLiquide: 180_000 })

  it('zet de regel onder het hoofdcijfer én onder de sluitregel', () => {
    renderSheet(UITSLUITEN, 'liquid')
    // Twee plekken: de bon opent met een I-getal terwijl er op een J-punt
    // geklikt is, dus opening en sluiting mogen daarover niet verschillen.
    expect(screen.getAllByText(/waarvan besteedbaar/).length).toBe(2)
  })

  it('houdt het hoofdcijfer op de I-grondslag (de balans verandert niet)', () => {
    renderSheet(UITSLUITEN, 'liquid')
    // De secties Bezittingen/Schulden lopen nog steeds over de hele balans.
    expect(screen.getAllByText(/bezittingen/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Eind netto')).toBeTruthy()
  })

  it('toont de regel NIET wanneer de grafiek op de totaal-grondslag staat', () => {
    const { container } = renderSheet(UITSLUITEN)
    expect(container.textContent).not.toContain('waarvan besteedbaar')
  })

  it('toont de regel NIET wanneer J ≡ I (Meerekenen — hij zou het hoofdcijfer herhalen)', () => {
    const { container } = renderSheet(makeYearRow(), 'liquid')
    expect(container.textContent).not.toContain('waarvan besteedbaar')
  })
})
