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
 * KPI-laag (`loadCashflowKpis`, ADR 0083).
 *
 * Stap 2: die drie loaders staan achter een `<Suspense>`, zodat titel en
 * header-controls in de eerste byte zitten. `componentBody` is brace-matchend
 * (test/helpers/page-source.ts): een `await` áchter de component telt niet mee,
 * anders zou de "precies één await"-assertie stil verwateren.
 */

const PAGE_SRC = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')
const LOADER_SRC = readFileSync(path.resolve(__dirname, 'vaste-lasten-loader.tsx'), 'utf-8')
const CLIENT_SRC = readFileSync(
  path.resolve(__dirname, '../../../../../components/overview/vaste-lasten-client.tsx'),
  'utf-8',
)

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

describe('vaste-lasten-loader — draait op de slanke KPI-laag (ADR 0083)', () => {
  const src = stripComments(LOADER_SRC)

  it('consumeert loadCashflowKpis', () => {
    expect(src).toMatch(/import\s*\{\s*loadCashflowKpis\s*\}\s*from\s*'@\/lib\/cashflow-kpis'/)
  })

  it('raakt de volle dashboard-bundel niet meer aan', () => {
    expect(src).not.toContain('loadDashboardData')
    expect(src).not.toContain('dashboardData')
  })

  it('houdt de EFFECTIVE grondslag aan voor het AANDEEL, niet de gerealiseerde maand (ADR 0073)', () => {
    // `CashflowCardScalars` draagt beide paren. `currentMonth*` grijpen zou hier
    // stil een andere grootheid opleveren — een half-afgelopen maand als noemer
    // onder "aandeel van je inkomen" — en dat is precies de bug van ADR 0073.
    expect(src).toMatch(/monthlyIncome:\s*kpis\.monthlyIncome/)
    expect(src).not.toContain('currentMonth')
  })

  it('geeft het CANONIEKE dagtarief door, niet de effective maanduitgaven (vervolg KRUIS-20)', () => {
    // Twee grondslagen naast elkaar, allebei bewust: het AANDEEL meet tegen het
    // effective maandinkomen (hierboven), de VRIJHEIDSTIJD tegen het 12-mnd
    // rolling dagtarief. Hier stond `monthlyExpenses: kpis.monthlyExpenses`,
    // waarna `buildVasteLastenInsights` er zélf `dailyExpenseRate(...)` op deed —
    // de losse-kalendermaand-conversie die KRUIS-17/20 heeft afgeschaft.
    expect(src).toMatch(/dailyExpenseRate:\s*kpis\.dailyExpenseRate/)
    expect(src).not.toMatch(/monthlyExpenses:\s*kpis\.monthlyExpenses/)
  })

  it('houdt de kalender in dezelfde grens — één wachtpunt op één load', () => {
    expect(src).toContain('<CashflowKalender')
    expect(src).toContain('<VasteLastenClient')
    // En géén tweede grens erómheen: de kalender hangt aan `cashflow.recurrings`
    // uit dezelfde `loadCashflowData`, dus een eigen <Suspense> zou een tweede
    // wachtpunt op één load zijn. Zonder deze regel houdt precies die wijziging
    // de test groen.
    expect(src).not.toContain('<Suspense')
  })
})

describe('/overzicht/cashflow/vaste-lasten — precies één pagina-aanhef', () => {
  it('de client rendert geen tweede PageOpening', () => {
    // De kicker + pagina-aanhef zijn bij T2.4 uit vaste-lasten-client.tsx naar
    // de server-pagina verhuisd (LCP-kandidaat, hangt van geen data af). Zet
    // iemand de `<PageOpening>` daar terug — bij een merge, of uit een "hij
    // hoort toch bij dit blok"-reflex — dan shipt de pagina twee pagina-
    // aanheffen (twee <h2>'s, ADR 0110) zonder dat een van
    // de asserties hierboven iets merkt: die kijken alleen naar page.tsx en de
    // loader. De client is de enige andere plek waar een kop kan ontstaan
    // (`VasteLastenClient` heeft precies één consument: de loader).
    //
    // Het tag-einde in het patroon is nodig, niet cosmetisch: `<PageOpening` is
    // een prefix van `<PageOpeningFigure`, en dát sub-composiet hoort hier juist
    // wél te staan (het cijferblok). Een kale substring-check zou de test
    // permanent rood houden om de verkeerde reden.
    expect(stripComments(CLIENT_SRC)).not.toMatch(/<PageOpening[\s/>]/)
  })
})
