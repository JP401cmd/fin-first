import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { stripComments } from '@/test/helpers/page-source'

/**
 * /overzicht/cashflow/vaste-lasten — broncontrole (perf Task 2.4).
 *
 * Zelfde soort test als op de hub (page.streaming.test.ts daar), en om dezelfde
 * reden: het defect is niet "een verkeerd getal" maar "de eerste byte komt pas
 * na de traagste loader". De HTML is identiek, alleen seconden later — een
 * render-test kan dat per definitie niet zien. Wat het verschil maakt is de vorm
 * van de module, en die valt stilletjes terug.
 *
 * Stap 1 (dit blok): de pagina las uit de volle `loadDashboardData`-bundel
 * precies twee scalars, `monthlyIncome` en `monthlyExpenses`. Die komen nu uit
 * de slanke KPI-laag (`loadCashflowKpis`, ADR 0077).
 */

const PAGE_SRC = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')

describe('/overzicht/cashflow/vaste-lasten — draait op de slanke KPI-laag (ADR 0077)', () => {
  const src = stripComments(PAGE_SRC)

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

  it('houdt de pagina dynamisch — geen revalidate/ISR', () => {
    expect(src).not.toMatch(/export\s+const\s+revalidate/)
  })
})
