import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { componentBody, stripComments } from '@/test/helpers/page-source'

/**
 * /overzicht/cashflow — broncontrole op de streaming-vorm (perf Task 2.2).
 *
 * ## Waarom een BRON-test en geen gedragstest
 *
 * Het defect dat deze taak wegnam was niet "een verkeerd getal" maar "de
 * eerste byte komt pas na de traagste loader": vijf loaders in één
 * `Promise.all` bóven de return. De uitkomst van de pagina is daar niet
 * anders van — dezelfde HTML, alleen ~5s later. Een render-test kan dat per
 * definitie niet zien; wat het verschil máákt is de vorm van de module.
 *
 * En die vorm is precies wat stilletjes terugvalt. Eén `await createClient()`
 * of `await loadX()` erbij boven de return en de hele pagina wacht weer,
 * terwijl de `<Suspense>`-grenzen er nog volkomen correct uitzien. Vandaar
 * drie structurele asserties:
 *
 *  1. In het component-lichaam staat exact ÉÉN `await`, en dat is de
 *     cookie-read `getServerPerspective()`.
 *  2. De pagina importeert geen enkele zware loader meer — die wonen achter
 *     de Suspense-grenzen.
 *  3. De kaarten draaien op `loadCashflowKpis` (ADR 0077), niet op de volle
 *     `loadDashboardData`-bundel.
 *
 * Plus de bindende regel uit de opdracht: geen ISR/revalidate op deze pagina
 * (gepersonaliseerde financiële data; de winst is minder werk per request,
 * niet stale HTML).
 *
 * `componentBody`/`stripComments` wonen in test/helpers/page-source.ts — gedeeld
 * met de vaste-lasten-variant van deze test, en daar ook zelf vastgepind
 * (accolade-matching, zodat een `await` áchter de component niet meetelt).
 */

const PAGE_SRC = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')
const CARDS_LOADER_SRC = readFileSync(
  path.resolve(__dirname, '../../../../components/overview/cashflow-cards-loader.tsx'),
  'utf-8',
)

const PAGE_SIGNATURE = 'export default async function OverzichtCashflowPage'

describe('/overzicht/cashflow — geen zware await boven de return', () => {
  const body = componentBody(PAGE_SRC, PAGE_SIGNATURE)

  it('heeft exact één await in het component-lichaam', () => {
    const awaits = body.match(/\bawait\b/g) ?? []
    expect(awaits).toHaveLength(1)
  })

  it('en dat ene await is de cookie-read getServerPerspective()', () => {
    expect(body).toMatch(/const\s+perspective\s*=\s*await\s+getServerPerspective\(\)/)
  })

  it('opent geen supabase-client op de pagina zelf', () => {
    // `createClient()` is goedkoop maar wél een await; de loaders halen 'm zelf
    // op (React-cache() → dezelfde instantie), zodat er geen tweede await
    // "gratis" mee naar boven kan kruipen.
    expect(body).not.toContain('createClient(')
  })
})

describe('/overzicht/cashflow — de zware loaders staan achter Suspense', () => {
  const src = stripComments(PAGE_SRC)

  for (const loader of [
    'loadDashboardData',
    'loadCashflowData',
    'loadVasteLastenSummary',
    'loadCashflowSettingsData',
    'loadCashBankLinks',
  ]) {
    it(`importeert ${loader} niet meer`, () => {
      expect(src).not.toContain(loader)
    })
  }

  it('rendert het kaartenblok en het rekeningenblok elk in een eigen <Suspense>', () => {
    expect(src).toMatch(/<Suspense\s+fallback=\{<CashflowCardsFallback\s*\/>\}>\s*<CashflowCardsLoader/)
    expect(src).toMatch(/<Suspense\s+fallback=\{<CashOverviewSkeleton\s*\/>\}>\s*<CashOverviewLoader/)
  })

  it('houdt de pagina dynamisch — geen revalidate/ISR', () => {
    expect(src).not.toMatch(/export\s+const\s+revalidate/)
  })
})

describe('cashflow-cards-loader — draait op de slanke KPI-laag (ADR 0077)', () => {
  const src = stripComments(CARDS_LOADER_SRC)

  it('consumeert loadCashflowKpis', () => {
    expect(src).toMatch(/import\s*\{\s*loadCashflowKpis\s*\}\s*from\s*'@\/lib\/cashflow-kpis'/)
  })

  it('raakt de volle dashboard-bundel niet aan', () => {
    expect(src).not.toContain('loadDashboardData')
  })

  it('rendert de inflatiekaart in hetzelfde gestreamde blok', () => {
    // Stap 3: de kaart hangt aan `cashflow.baselineExpenses` uit dezelfde
    // `loadCashflowData` — een eigen Suspense zou een tweede wachtpunt op
    // dezelfde load zijn.
    expect(src).toContain('<InflationImpactCard')
    expect(src).toContain('cashflow.baselineExpenses >= 500')
  })
})
