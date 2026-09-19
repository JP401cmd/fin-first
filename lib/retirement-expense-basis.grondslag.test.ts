import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { transactionAnnualIncome } from './budget-realized'

/**
 * ÉÉN INKOMENSGRONDSLAG VOOR ALLE PADEN (WF-TOEK-02-bug2, eigenaarsbesluit 6 sep 2026,
 * ADR 0169).
 *
 * Given een gebruiker met `retirement_expense_method = 'current_income'`, `income_source
 * ≠ 'manual'`, geen bruikbare budgetgrondslag én inkomsten-TRANSFERS in de historie,
 * When de SSR-loader (/toekomst), de client-herlading (`horizon-client#loadData` via de
 * cashflow-settings-bundel uit `loadCoreData`), de pensioenuitgave-sheet-route en de
 * huishoud-sectie het transactie-jaarinkomen afleiden,
 * Then rekenen ze alle vier op DEZELFDE, transfer-EXCLUSIEVE som — de app-brede
 * grondslag van de inkomenskaart, spaarquote en gezondheidsscore. De per-module
 * splitsing ("horizon telt transfers bewust mee") is opgeheven: een gedocumenteerde
 * tweede waarheid blijft een tweede waarheid en heropende exact het repro-pad van
 * deze kaart (KPI ≠ sheet na sluiten van de sheet).
 *
 * Twee vangrails: (1) de helper kent geen transfer-inclusieve variant meer; (2) een
 * bron-scan van de vier call-sites — een nieuwe `includeTransfers`-vlag valt hier om.
 */

const ROOT = process.cwd()
const CALL_SITES = [
  'lib/horizon/raw-data-loader.ts',
  'app/api/uitgaven-na-pensioen/context/route.ts',
  'lib/household-projection.ts',
  'lib/core-data-loader.ts',
  'components/app/horizon/horizon-client.tsx',
] as const

describe('transactionAnnualIncome — één grondslag, transfer-exclusief', () => {
  const window = {
    historyMonths: 12,
    windowIncome: { real: 60_000, all: 72_000 },
  }

  it('rekent op de transfer-gefilterde som (real), nooit op de inclusieve som (all)', () => {
    expect(transactionAnnualIncome(window)).toBe(60_000)
  })

  it('kent géén transfer-inclusieve variant meer (geen opties-parameter)', () => {
    // Een tweede parameter zou de splitsing per loader heropenen; de signatuur is
    // bewust één-argument. `length` telt de verplichte parameters.
    expect(transactionAnnualIncome.length).toBe(1)
  })
})

describe('bron-scan: geen call-site vraagt nog om de transfer-inclusieve som', () => {
  for (const rel of CALL_SITES) {
    it(`${rel} draagt geen includeTransfers-vlag`, () => {
      const src = readFileSync(path.join(ROOT, rel), 'utf8')
      expect(src).not.toMatch(/includeTransfers\s*:\s*true/)
    })
  }

  it('lib/budget-realized.ts kent geen includeTransfers-optie meer (alleen nog als historische verwijzing in proza)', () => {
    const src = readFileSync(path.join(ROOT, 'lib/budget-realized.ts'), 'utf8')
    // Een optie-declaratie of -gebruik heeft de vorm `includeTransfers?:` / `includeTransfers:`;
    // het woord in een docstring zonder dubbele punt is de historische verwijzing en mag.
    expect(src).not.toMatch(/includeTransfers\s*\??\s*:/)
  })
})
