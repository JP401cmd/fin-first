/**
 * Regressietest — geen niet-bestaande kolom `is_income` meer in de
 * `budgets`-select van cash-overview.tsx.
 *
 * `loadBudgets()` (rond regel 404) vroeg kolom `is_income` op van tabel
 * `budgets`. Die kolom bestaat alleen op `transactions` → 42703 → 400 bij
 * elke load van `/overzicht/cashflow`. De select-lijst is nu exact
 * `'id, name, icon, parent_id, budget_type, default_limit'` en het lokale
 * `BudgetRow`-type is meegeknipt.
 *
 * `cash-overview.tsx` is ~1900 regels met veel dependencies (loader,
 * dynamic imports, perspective/toast-providers); volledig renderen zou een
 * halve mock-architectuur vergen voor wat hier een pure select-string-fout
 * is. Deze test scant daarom de bron gericht op de `budgets`-select —
 * zelfde aanpak als `lib/ai/privacy-gate-scan.test.ts` /
 * `scripts/check-client-data-reads.mjs`. `is_income` komt elders in dit
 * bestand legitiem >10x voor (op `transactions`), dus de test isoleert
 * expliciet de `budgets`-query — geen brede bestandsbrede regex.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SOURCE_PATH = path.join(process.cwd(), 'components', 'app', 'cash-overview.tsx')
const source = fs.readFileSync(SOURCE_PATH, 'utf-8')

function extractBudgetsSelect(src: string): string {
  const match = src.match(/\.from\(\s*['"]budgets['"]\s*\)[\s\S]{0,300}?\.select\(\s*['"]([^'"]+)['"]\s*\)/)
  expect(match, 'kon de .from(\'budgets\').select(...) call niet vinden in cash-overview.tsx').not.toBeNull()
  return match![1]
}

describe('cash-overview.tsx — budgets-select bevat geen niet-bestaande kolom (regressie)', () => {
  it('vraagt exact de verwachte kolomlijst op (geen `is_income`)', () => {
    const columns = extractBudgetsSelect(source)
    expect(columns).toBe('id, name, icon, parent_id, budget_type, default_limit')
  })

  it('de opgevraagde kolomlijst bevat geen `is_income` (bestaat alleen op transactions)', () => {
    const columns = extractBudgetsSelect(source)
    const columnList = columns.split(',').map((c) => c.trim())
    expect(columnList).not.toContain('is_income')
  })

  it('het lokale BudgetRow-type bevat geen `is_income`-veld', () => {
    const match = source.match(/type BudgetRow = \{([\s\S]*?)\}/)
    expect(match, 'kon het BudgetRow-type niet vinden — is het hernoemd?').not.toBeNull()
    const body = match![1]
    expect(body).not.toMatch(/is_income/)
  })
})
