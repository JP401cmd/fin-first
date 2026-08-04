import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { componentBody, stripComments } from '@/test/helpers/page-source'

/**
 * /overzicht/cashflow/forecast — broncontrole (perf Task 2.5).
 *
 * Zelfde soort test als op de hub en de vaste-lasten-pagina, en om dezelfde
 * reden: het defect is niet "een verkeerd getal" maar "de eerste byte komt pas
 * na de traagste loader". De HTML is identiek, alleen seconden later (RUM p75
 * desktop op deze pagina: TTFB 8.770 ms) — een render-test kan dat per definitie
 * niet zien. Wat het verschil maakt is de vorm van de module, en die valt
 * stilletjes terug: één `await createClient()`/`loadX()` erbij boven de return en
 * de hele pagina wacht weer, terwijl de `<Suspense>`-grens er nog "correct"
 * uitziet.
 *
 * Stap 1: de pagina las uit de volle `loadDashboardData`-bundel vijf velden —
 * `monthlyIncome`, `monthlyExpenses`, `savingsRate6m`, `savingsHistory` en
 * `expenseHistory`. Die komen nu uit de slanke laag (`loadForecastSectionData`,
 * ADR 0083). De GETALSMATIGE gelijkheid van die vijf is een andere test:
 * `lib/cashflow-kpis.forecast-parity.test.ts` draait beide paden end-to-end.
 *
 * Stap 2: die twee loaders staan achter een `<Suspense>`, zodat titel en
 * header-controls in de eerste byte zitten. `componentBody` is brace-matchend
 * (test/helpers/page-source.ts): een `await` áchter de component telt niet mee,
 * anders zou de "precies één await"-assertie stil verwateren.
 */

const PAGE_SRC = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')
const LOADER_SRC = readFileSync(path.resolve(__dirname, 'forecast-loader.tsx'), 'utf-8')
const SECTION_SRC = readFileSync(
  path.resolve(__dirname, '../../../../../components/fin/cashflow-section.tsx'),
  'utf-8',
)

const PAGE_SIGNATURE = 'export default async function OverzichtCashflowForecastPage'

describe('/overzicht/cashflow/forecast — geen zware await boven de return', () => {
  const body = componentBody(PAGE_SRC, PAGE_SIGNATURE)

  it('heeft exact één await in het component-lichaam', () => {
    const awaits = body.match(/\bawait\b/g) ?? []
    expect(awaits).toHaveLength(1)
  })

  it('en dat ene await is de cookie-read getServerPerspective()', () => {
    expect(body).toMatch(/const\s+perspective\s*=\s*await\s+getServerPerspective\(\)/)
  })

  it('opent geen supabase-client op de pagina zelf', () => {
    // `createClient()` is goedkoop maar wél een await; de loader haalt 'm zelf
    // op (React-`cache()` → dezelfde instantie), zodat er geen tweede await
    // "gratis" mee naar boven kan kruipen.
    expect(body).not.toContain('createClient(')
  })
})

describe('/overzicht/cashflow/forecast — de zware loaders staan achter Suspense', () => {
  const src = stripComments(PAGE_SRC)

  for (const loader of ['loadDashboardData', 'loadForecastSectionData', 'loadCashflowData']) {
    it(`importeert ${loader} niet op de pagina`, () => {
      expect(src).not.toContain(loader)
    })
  }

  it('rendert het inhoudsblok in een <Suspense> met een eigen fallback', () => {
    expect(src).toMatch(/<Suspense\s+fallback=\{<ForecastFallback\s*\/>\}>\s*<ForecastLoader/)
  })

  it('rendert de aanhef (LCP-kandidaat) direct, buiten de Suspense-grens', () => {
    const beforeSuspense = src.slice(0, src.indexOf('<Suspense'))
    expect(beforeSuspense).toContain('<PageOpening')
    expect(beforeSuspense).toContain('<PageStatusDot')
    expect(beforeSuspense).toContain('<PageInfoButton')
  })

  it('houdt de header-controls op de vaste offsets', () => {
    expect(src).toContain('right-[52px] top-4 sm:right-[60px]')
    expect(src).toContain('right-4 top-4 sm:right-6')
  })

  it('houdt de pagina dynamisch — geen revalidate/ISR', () => {
    expect(src).not.toMatch(/export\s+const\s+revalidate/)
  })
})

describe('forecast-loader — draait op de slanke forecast-laag (ADR 0083)', () => {
  const src = stripComments(LOADER_SRC)

  it('consumeert loadForecastSectionData', () => {
    expect(src).toMatch(/import\s*\{\s*loadForecastSectionData\s*\}\s*from\s*'@\/lib\/cashflow-kpis'/)
  })

  it('raakt de volle dashboard-bundel niet meer aan', () => {
    expect(src).not.toContain('loadDashboardData')
    expect(src).not.toContain('dashboardData')
  })

  it('houdt samenvatting en projectietabel in dezelfde grens — één wachtpunt', () => {
    expect(src).toContain('<CashflowSection')
    expect(src).toContain('<CashflowForecast')
    // En géén tweede grens erómheen: beide blokken hangen aan hetzelfde paar
    // loads, dus een eigen <Suspense> zou een tweede wachtpunt zijn. Zonder deze
    // regel houdt precies die wijziging de test groen.
    expect(src).not.toContain('<Suspense')
  })

  it('geeft de slanke laag ONGEFILTERD door — geen tussenliggende hersom', () => {
    // `CashflowSection` leest de vijf velden zelf uit het meegegeven object. Zou
    // iemand hier een veld gaan uitrekenen of overschrijven (bv. savingsRate6m
    // uit monthlyIncome/monthlyExpenses), dan ontstaat precies de tweede
    // rekenweg die ADR 0083 uitsluit.
    expect(src).toMatch(/<CashflowSection\s+data=\{forecastData\}\s*\/>/)
    expect(src).not.toContain('savingsRate6m')
  })
})

describe('/overzicht/cashflow/forecast — CashflowSection hangt niet meer aan de bundel', () => {
  const src = stripComments(SECTION_SRC)

  it('typeert zijn prop op CashflowSectionScalars, niet op DashboardData', () => {
    // Met `data: DashboardData` blijft de pagina compileren zodra iemand de volle
    // bundel terugzet — en dan is de winst stil weer weg. De smalle prop maakt
    // die stap zichtbaar.
    expect(src).toMatch(/import\s+type\s*\{\s*CashflowSectionScalars\s*\}\s*from\s*'@\/lib\/cashflow-kpis'/)
    expect(src).not.toContain('DashboardData')
  })

  it('leest precies de vijf velden en niets meer', () => {
    expect(src).toContain(
      'const { monthlyIncome, monthlyExpenses, savingsRate6m, savingsHistory, expenseHistory } = data',
    )
  })
})
