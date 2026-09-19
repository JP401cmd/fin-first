/**
 * BEWAKER (Notion 3d8f9e8d…: "Vrijheidsduren op /overzicht/bezittingen impliceren
 * een ander dagtarief dan de rest van de app") — gefixt 19 sep 2026; deze suite
 * begon als falende repro en houdt de eigenschap nu vast.
 *
 * Wat er misging: `<AssetPane>` — het detailvenster dat /overzicht/bezittingen én
 * de categoriepagina's per bezit openen — rekent zijn eigen dagtarief uit op de
 * ESSENTIËLE-budgetten-grondslag (`computeYearlyMustExpenses(...) / 365`, met de
 * profielschatting als terugval) en geeft dát als `dailyExpenses` door aan
 * `<AssetDetailModal>` ("Deze waarde staat voor X vrijheid", Δ t.o.v. aankoop).
 * De rest van de pagina (loader → `initialData.dailyExpenses`, AssetForm,
 * AssetReturnModal) en de rest van de app (/overzicht, totaalplan, instellingen,
 * Fin) lezen het canonieke 12-mnd-consumptietarief uit `getRecentDailyExpenseRate`
 * (ADR 0126 D1/D2). Twee tarieven op één pagina, voor hetzelfde bezit.
 *
 * ADR 0126 D1 kent precies twee vrijheidstijd-grootheden (dagtarief = marginaal
 * op consumptie, runway = totaal uit de kernel) en verbiedt een derde. De
 * must-basis is die derde — en staat als gedocumenteerde uitzondering op de
 * allowlist van `scripts/check-freedom-time-basis.mjs`, waardoor de pre-push-
 * gate 'm groen laat. Zusteroppervlak met dezelfde constructie:
 * `components/core/holdings/portfolio-value-chart.tsx` (yearlyEssentialExpenses).
 *
 * Bron-test (precedent: assets-client.bruto-vrijheidstijd.test.ts): de
 * eigenschap zit in de bron — welke grondslag er als noemer in de conversie
 * gaat — niet in een gerenderde waarde.
 *
 * DE FIX (19 sep 2026): beide oppervlakken consumeren het canonieke tarief als
 * prop uit hun loader (`AssetsPageData.dailyExpenses`, `HoldingsPageData.dailyExpenses`,
 * en voor de categoriepagina uit `app/(app)/core/assets/[type]/page.tsx`), en beide
 * allowlist-entries in `scripts/check-freedom-time-basis.mjs` zijn verwijderd — die
 * gate is daarmee weer hard op dit pad.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function codeLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n')
}

const paneCode = codeLines(
  readFileSync(join(process.cwd(), 'components', 'app', 'core', 'assets', 'asset-pane.tsx'), 'utf8'),
)
const chartCode = codeLines(
  readFileSync(
    join(process.cwd(), 'components', 'core', 'holdings', 'portfolio-value-chart.tsx'),
    'utf8',
  ),
)

describe('dagtarief-grondslag van het bezit-detailvenster (ADR 0126 D1)', () => {
  it('AssetPane rekent geen eigen dagtarief op de essentiële-budgetten-grondslag', () => {
    // Vandaag: `yearlyMustExpenses / 365` → `setDailyExpenses(...)`.
    expect(paneCode).not.toMatch(/yearlyMustExpenses\s*\/\s*365/)
    expect(paneCode).not.toMatch(/computeYearlyMustExpenses/)
  })

  it('AssetPane valt niet zelf terug op de profielschatting als dagtarief', () => {
    // Vandaag: `dailyExpenseRate(Number(profile?.estimated_monthly_expenses ?? 0))`.
    // De terugval hoort in `recentDailyExpenseRateFromRows` (één plek, mét
    // `source`-label voor de voetnoot), niet in een component.
    expect(paneCode).not.toMatch(/dailyExpenseRate\(\s*Number\(profile\?\.estimated_monthly_expenses/)
  })

  it('AssetPane consumeert het canonieke tarief (prop van de loader of /api/daily-expense-rate)', () => {
    expect(paneCode).toMatch(/dailyExpenses\??:\s*number|api\/daily-expense-rate/)
  })

  it('zuster: portfolio-value-chart rekent geen dagtarief op yearlyEssentialExpenses', () => {
    expect(chartCode).not.toMatch(/dailyExpenseRate\(\s*yearlyEssentialExpenses\s*\/\s*12\s*\)/)
  })

  it('zuster: portfolio-value-chart consumeert het tarief als prop', () => {
    expect(chartCode).toMatch(/dailyExpenses\??:\s*number/)
  })

  it('geeft het tarief door aan het detailvenster én draagt de wisselkoers-voetnoot', () => {
    // De keten die het getal op het scherm brengt: prop → modal, en één koers
    // per oppervlak (UR3-08, eigenaarsbesluit A bij B-039).
    expect(paneCode).toContain('dailyExpenses={dailyExpenses}')
    expect(paneCode.split('<VrijheidstijdVoetnoot').length - 1).toBe(1)
    expect(paneCode).toContain('source={dailyExpensesSource}')
  })

  it('doet zelf geen budget-queries meer voor het dagtarief', () => {
    // De twee `budgets`-queries die de essentiële oprol voedden zijn weg; wat
    // resteert is de ééne profielkolom die de pane nog echt nodig heeft.
    expect(paneCode).not.toMatch(/is_essential/)
    expect(paneCode).not.toMatch(/estimated_monthly_expenses/)
  })

  it('de allowlist grandfathert deze twee oppervlakken niet meer', () => {
    // De uitzondering landde één dag NÁ ADR 0126 en maakte de gate vals-groen.
    const gate = readFileSync(join(process.cwd(), 'scripts', 'check-freedom-time-basis.mjs'), 'utf8')
    const code = codeLines(gate)
    expect(code).not.toContain("'components/app/core/assets/asset-pane.tsx'")
    expect(code).not.toContain("'components/core/holdings/portfolio-value-chart.tsx'")
  })
})
