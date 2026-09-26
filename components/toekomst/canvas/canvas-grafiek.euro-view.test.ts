/**
 * Euro-weergave-grendel voor de canvas-bladeren (ADR 0090/0093, kaart §4/§5.1 #4).
 *
 * Nieuwe pin op het verplaatste bestand; de oude assertions in
 * `components/app/horizon/horizon-client.euro-view.test.ts` (tests 4 en 11–12 voor
 * de SimChart-/WealthComposition-callsites) blijven staan tot de integrator het
 * blok inplugt en ze daar schrapt.
 *
 * Wat hier gepind wordt:
 *  1. de canvas-bladeren deflateren NOOIT zelf — geen `deflate*`-aanroep, geen
 *     `inflationFactor`, geen `useEuroView`/`factorAtAge` (de grens blijft in de host);
 *  2. de chart-feeds gaan als `view*`-waarden naar SimChart/WealthCompositionChart/
 *     IncomeExpenseChart/LifelineReadout (een terugval op nominaal oogt plausibel);
 *  3. het dagtarief gaat ongedeflateerd door (D15);
 *  4. `cashflows` blijft nominaal, mét exempt-markering (zelfde reden als de bron);
 *  5. elk bestand met bedragen draagt de euro-view-kopregel.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const DIR = join(process.cwd(), 'components', 'toekomst', 'canvas')
const lees = (naam: string) => readSourceLF(join(DIR, naam))

const CANVAS_BLADEREN = [
  'canvas-tips-toggle.tsx',
  'canvas-pills.tsx',
  'canvas-uitleg.tsx',
  'canvas-grafiek.tsx',
  'canvas-legenda.tsx',
  'marker-kleuren.ts',
]

const EURO_KOPREGEL = '// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf'
const EXEMPT_MARK = '// euro-view: exempt'

describe('canvas-bladeren — geen eigen euro-grens', () => {
  it.each(CANVAS_BLADEREN)('%s roept geen deflatie aan en leest geen inflationFactor', (naam) => {
    const src = lees(naam)
    expect(src).not.toMatch(/\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset|factorAtAge|buildFactorByAge|buildFactorByOffset)\s*\(/)
    expect(src).not.toContain('inflationFactor')
    expect(src).not.toContain('useEuroView')
    expect(src).not.toMatch(/Math\.pow\(/)
  })

  it.each(['canvas-grafiek.tsx', 'canvas-uitleg.tsx'])('%s draagt de euro-view-kopregel', (naam) => {
    expect(lees(naam)).toContain(EURO_KOPREGEL)
  })
})

describe('canvas-grafiek — view*-feeds naar de grafieken', () => {
  const src = lees('canvas-grafiek.tsx')

  it('SimChart krijgt de vier kern-feeds als view*-waarden (naamconventie, euro-view test 4)', () => {
    expect(src).toMatch(/rows=\{useHouseholdMainLine \? viewHouseholdMainLineRows! : usePartnerMainLine \? viewPartnerLineRows! : \(viewDisplaySimRows\)\}/)
    expect(src).toMatch(/fireTarget=\{viewFireTarget\}/)
    expect(src).toMatch(/targetEndPortfolio=\{viewTargetEndPortfolio\}/)
    expect(src).toMatch(/targetInflationFactors=\{[^}]*viewTargetInflationFactors\}/)
  })

  it('SimChart krijgt ook de overlay-feeds als view*-waarden', () => {
    expect(src).toContain('fireTargetInclHome={(usePartnerMainLine || useHouseholdMainLine) ? undefined : (showDualFireTarget ? viewFireTargetInclHome! : undefined)}')
    expect(src).toContain('liquidPoints={dualBasisAvailable ? viewLiquidWealthPoints : undefined}')
    expect(src).toContain('scenarioOverlays={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewCombinedScenarioOverlays}')
    expect(src).toContain('monteCarloOverlay={(usePartnerMainLine || useHouseholdMainLine) ? undefined : viewMonteCarloOverlay}')
    expect(src).toContain('householdOverlays={viewHouseholdOverlays ?? undefined}')
  })

  it('de vermogensopbouw-staven zijn een view*-feed (euro-view test 12)', () => {
    expect(src).toMatch(/stackedRows=\{viewWealthCompositionRows\}/)
  })

  it('de Inkomen & Uitgaven-grafiek krijgt view*-rijen en -bronnen', () => {
    const ie = src.slice(src.indexOf('<IncomeExpenseChart'))
    expect(ie).toMatch(/rows=\{viewDisplaySimRows\}/)
    expect(ie).toMatch(/breakdownResult=\{viewIeBreakdownResult\}/)
  })

  it('laat het dagtarief ongemoeid (D15, euro-view test 11)', () => {
    expect(src).toMatch(/dailyExpenseRate=\{canonicalDailyRate\}/)
    expect(src).not.toMatch(/dailyExpenseRate=\{deflate\(/)
    expect(src).not.toMatch(/dailyExpenseRate=\{view[A-Za-z]*DailyRate/)
  })

  it('geeft cashflows nominaal door, met exempt-markering vlak erboven', () => {
    const regels = src.split('\n')
    const i = regels.findIndex((r) => r.includes('cashflows={simCashflows}'))
    expect(i, 'cashflows={simCashflows} niet gevonden').toBeGreaterThan(-1)
    const venster = regels.slice(Math.max(0, i - 4), i).join('\n')
    expect(venster).toContain(EXEMPT_MARK)
  })

  it('krijgt geen nominale rijen-feed binnen (geen displaySimRows/wealthCompositionRows zonder view)', () => {
    expect(src).not.toMatch(/[^A-Za-z]displaySimRows\b/)
    expect(src).not.toMatch(/[^A-Za-z]wealthCompositionRows\b/)
    expect(src).not.toMatch(/[^A-Za-z]ieBreakdownResult\b/)
    expect(src).not.toMatch(/[^A-Za-z]combinedScenarioOverlays\b/)
  })

  it('de grafiek krijgt het anker expliciet mee voor de STOP-marker (nu-stoppen)', () => {
    expect(src).toContain('stopAnchorFixed={isFixedAnchorMode}')
  })
})

describe('canvas-uitleg — de readout toont de view*-cijfers', () => {
  const src = lees('canvas-uitleg.tsx')
  it('LifelineReadout leest uitsluitend viewReadoutData', () => {
    expect(src).toContain('netWorth={viewReadoutData.netWorth}')
    expect(src).toContain('monthlyAmount={viewReadoutData.monthlyAmount}')
    expect(src).not.toMatch(/[^A-Za-z]readoutData\b/)
  })
})
