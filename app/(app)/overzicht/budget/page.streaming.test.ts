import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { componentBody, stripComments } from '@/test/helpers/page-source'

/**
 * /overzicht/budget — broncontrole op de streamingvorm.
 *
 * Zelfde soort test als op de zusterpagina's (forecast, vaste-lasten), en om
 * dezelfde reden: het defect is niet "een verkeerd getal" maar "de eerste byte
 * komt pas na de traagste loader". De HTML is identiek, alleen seconden later —
 * een render-test kan dat per definitie niet zien. Wat het verschil maakt is de
 * vorm van de module, en die valt stilletjes terug.
 *
 * DEZE TEST BESTAAT OMDAT HET ÉÉN KEER IS MISGEGAAN. De cashflow-hub had zo'n
 * test; bij het opheffen van die hub (ADR 0135) verhuisde de budgetpagina naar
 * deze plek en werd hij de derde hefboom — maar de test verhuisde niet mee, en
 * de pagina kreeg `createClient()`, `loadBudgetsData()`, `auth.getUser()` en
 * drie count-queries bóven zijn return. De `<Suspense>` om de kaarten was
 * daarmee decoratief: de titel wachtte alsnog op de volledige budgets-load.
 * Juist op deze pagina telt dat — je opent 'm dagelijks, en hij is een van de
 * twee mogelijke startschermen.
 *
 * `componentBody` is brace-matchend (test/helpers/page-source.ts): een `await`
 * áchter de component telt niet mee, anders zou de "precies één await"-assertie
 * stil verwateren.
 */

const PAGE_SRC = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')
const LOADER_SRC = readFileSync(path.resolve(__dirname, 'budgets-loader.tsx'), 'utf-8')

const PAGE_SIGNATURE = 'export default async function OverzichtBudgetPage'

describe('/overzicht/budget — geen zware await boven de return', () => {
  const body = componentBody(PAGE_SRC, PAGE_SIGNATURE)

  it('heeft exact één await in het component-lichaam', () => {
    const awaits = body.match(/\bawait\b/g) ?? []
    expect(awaits).toHaveLength(1)
  })

  it('en dat ene await is de cookie-read getServerPerspective()', () => {
    expect(body).toMatch(/const\s+perspective\s*=\s*await\s+getServerPerspective\(\)/)
  })

  it('raakt de zware loaders niet aan boven de return', () => {
    for (const loader of ['loadBudgetsData', 'createClient', 'auth.getUser']) {
      expect(body).not.toContain(loader)
    }
  })
})

describe('/overzicht/budget — beide blokken stromen achter een eigen Suspense', () => {
  const src = stripComments(PAGE_SRC)

  it('rendert het kaartenblok en het budgetblok elk in een eigen <Suspense>', () => {
    expect(src).toMatch(/<Suspense\s+fallback=\{<CashflowCardsFallback\s*\/>\}>\s*<CashflowCardsLoader/)
    expect(src).toMatch(/<Suspense\s+fallback=\{<BudgetsFallback\s*\/>\}>\s*<BudgetsLoader/)
  })

  it('houdt de pagina dynamisch — geen revalidate/ISR', () => {
    expect(src).not.toMatch(/export\s+const\s+revalidate/)
  })
})

describe('budgets-loader — draagt de zware kant', () => {
  const src = stripComments(LOADER_SRC)

  it('haalt zijn eigen client op in plaats van er een als prop te krijgen', () => {
    expect(src).toMatch(/const\s+supabase\s*=\s*await\s+createClient\(\)/)
  })

  it('draagt de budgets-bundel én de koppel-nudge-telling', () => {
    expect(src).toContain('loadBudgetsData')
    expect(src).toContain('budget_koppel_nudge_shown')
  })

  it('telt de nudge-voorwaarden user-scoped, niet via gedeelde huishoud-RLS', () => {
    // Drie queries, elk met een expliciete eigen-rij-filter: partner-data mag de
    // nudge niet onderdrukken of oproepen.
    const eqUser = src.match(/\.eq\('user_id',\s*user\.id\)/g) ?? []
    expect(eqUser.length).toBeGreaterThanOrEqual(3)
  })

  it('rendert de setup-gate NIET meer — budgetteren is basisfunctionaliteit (ADR 0135)', () => {
    expect(src).not.toContain('AppSetupGate')
    expect(src).not.toContain('getAppSetupStatus')
  })
})
