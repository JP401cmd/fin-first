import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { componentBody, stripComments } from '@/test/helpers/page-source'

/**
 * /overzicht/cashflow/vaste-lasten — broncontrole (perf Task 2.4).
 *
 * Zelfde soort test als op de hub (page.streaming.test.ts daar), en om dezelfde
 * reden: het defect is niet "een verkeerd getal" maar "de eerste byte komt pas
 * na de traagste loader". De HTML is identiek, alleen seconden later — een
 * render-test kan dat per definitie niet zien. Wat het verschil maakt is de vorm
 * van de module, en die valt stilletjes terug.
 *
 * Stap 1: de pagina las uit de volle `loadDashboardData`-bundel precies twee
 * scalars, `monthlyIncome` en `monthlyExpenses`. Die komen nu uit de slanke
 * KPI-laag (`loadCashflowKpis`, ADR 0077).
 *
 * Stap 2: die drie loaders staan achter een `<Suspense>`, zodat titel en
 * header-controls in de eerste byte zitten. `componentBody` is brace-matchend
 * (test/helpers/page-source.ts): een `await` áchter de component telt niet mee,
 * anders zou de "precies één await"-assertie stil verwateren.
 */

const PAGE_SRC = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')
const LOADER_SRC = readFileSync(path.resolve(__dirname, 'vaste-lasten-loader.tsx'), 'utf-8')

const PAGE_SIGNATURE = 'export default async function OverzichtCashflowVasteLastenPage'

describe('/overzicht/cashflow/vaste-lasten — geen zware await boven de return', () => {
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

describe('/overzicht/cashflow/vaste-lasten — de zware loaders staan achter Suspense', () => {
  const src = stripComments(PAGE_SRC)

  for (const loader of ['loadDashboardData', 'loadCashflowKpis', 'loadCashflowData', 'loadVasteLastenSummary']) {
    it(`importeert ${loader} niet op de pagina`, () => {
      expect(src).not.toContain(loader)
    })
  }

  it('rendert het inhoudsblok in een <Suspense> met een eigen fallback', () => {
    expect(src).toMatch(/<Suspense\s+fallback=\{<VasteLastenFallback\s*\/>\}>\s*<VasteLastenLoader/)
  })

  it('rendert de aanhef (LCP-kandidaat) direct, buiten de Suspense-grens', () => {
    const beforeSuspense = src.slice(0, src.indexOf('<Suspense'))
    expect(beforeSuspense).toContain('<PageOpening')
    expect(beforeSuspense).toContain('<PageStatusDot')
    expect(beforeSuspense).toContain('<PageInfoButton')
  })

  it('houdt de pagina dynamisch — geen revalidate/ISR', () => {
    expect(src).not.toMatch(/export\s+const\s+revalidate/)
  })
})

describe('vaste-lasten-loader — draait op de slanke KPI-laag (ADR 0077)', () => {
  const src = stripComments(LOADER_SRC)

  it('consumeert loadCashflowKpis', () => {
    expect(src).toMatch(/import\s*\{\s*loadCashflowKpis\s*\}\s*from\s*'@\/lib\/cashflow-kpis'/)
  })

  it('raakt de volle dashboard-bundel niet meer aan', () => {
    expect(src).not.toContain('loadDashboardData')
    expect(src).not.toContain('dashboardData')
  })

  it('houdt de EFFECTIVE grondslag aan, niet de gerealiseerde maand (ADR 0073)', () => {
    // `CashflowCardScalars` draagt beide paren. `currentMonth*` grijpen zou hier
    // stil een andere grootheid opleveren — een half-afgelopen maand als noemer
    // onder "aandeel van je inkomen" — en dat is precies de bug van ADR 0073.
    expect(src).toMatch(/monthlyIncome:\s*kpis\.monthlyIncome/)
    expect(src).toMatch(/monthlyExpenses:\s*kpis\.monthlyExpenses/)
    expect(src).not.toContain('currentMonth')
  })

  it('houdt de kalender in dezelfde grens — één wachtpunt op één load', () => {
    expect(src).toContain('<CashflowKalender')
    expect(src).toContain('<VasteLastenClient')
  })
})
