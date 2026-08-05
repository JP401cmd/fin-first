/**
 * Component-test voor `PhaseDetailTable` — kolom "Lening" in het uitklap-paneel.
 *
 * Review-bevinding H2: `debtBalances` bevat naast echte `Debt`-ids ook
 * SYNTHETISCHE modelpotten ('opeethypotheek', 'tekort-lening'). Die staan niet in
 * de `debts`-prop, dus viel het label terug op `debtId.slice(0, 8)` en las de
 * gebruiker letterlijk "opeethyp" / "tekort-l" in de tabel.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhaseDetailTable } from './phase-detail-table'
import type { UnifiedProjectionRow, DebtBalanceDetail } from '@/lib/unified-projection'
import type { Debt } from '@/lib/debt-data'

// ── Fixtures ────────────────────────────────────────────────────────────────

function balance(start: number, end: number, interest = 0, principal = 0): DebtBalanceDetail {
  return { startBalance: start, interestPaid: interest, principalPaid: principal, endBalance: end }
}

function makeRow(debtBalances: Record<string, DebtBalanceDetail>): UnifiedProjectionRow {
  return {
    year: 27,
    age: 67,
    phase: 'withdrawal',
    assetBuckets: {
      investment: { startValue: 400_000, growth: 20_000, contributions: 0, box3Drag: 2_000, endValue: 418_000 },
    },
    debtBalances,
    totalAssets: 418_000,
    totalDebts: Object.values(debtBalances).reduce((s, d) => s + d.endBalance, 0),
    netWorth: 395_000,
    startNetWorth: 380_000,
    nettoLiquide: 395_000,
    grossIncome: 24_000,
    savings: 0,
    withdrawal: 30_000,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 20_000,
    totalBox3: 2_000,
    cumulativeBox3: 30_000,
    inflationFactor: 1.6,
  }
}

const ECHTE_HYPOTHEEK: Debt = {
  id: 'hyp-1',
  name: 'Hypotheek Dorpsstraat',
  debt_type: 'mortgage',
} as Debt

/** Rendert de tabel en klapt zowel de fase-tabel als het jaar-detail open. */
function renderExpanded(row: UnifiedProjectionRow, debts?: Debt[]) {
  const view = render(
    <PhaseDetailTable rows={[row]} phase="withdrawal" inflationRate={0.02} debts={debts} />,
  )
  fireEvent.click(screen.getByText(/per jaar/))
  // De jaar-rij zelf is de toggle voor het detail-paneel.
  fireEvent.click(screen.getByText(String(row.age)))
  return view
}

// ── H2: synthetische potten krijgen een leesbaar label ──────────────────────

describe('PhaseDetailTable — kolom Lening bij synthetische modelpotten', () => {
  it('toont "Opeethypotheek", nooit de afkapping "opeethyp"', () => {
    renderExpanded(makeRow({ opeethypotheek: balance(1_050_000, 1_120_000, 58_000) }))
    expect(screen.getByText('Opeethypotheek')).toBeTruthy()
    expect(screen.queryByText('opeethyp')).toBeNull()
  })

  it('toont "Tekort-lening", nooit de afkapping "tekort-l"', () => {
    renderExpanded(makeRow({ 'tekort-lening': balance(10_000, 23_000, 900) }))
    expect(screen.getByText('Tekort-lening')).toBeTruthy()
    expect(screen.queryByText('tekort-l')).toBeNull()
  })

  it('laat de naam van een echte schuld ongemoeid naast een modelpot', () => {
    renderExpanded(
      makeRow({
        'hyp-1': balance(200_000, 190_000, 6_000, 10_000),
        opeethypotheek: balance(0, 23_000, 500),
      }),
      [ECHTE_HYPOTHEEK],
    )
    expect(screen.getByText('Hypotheek Dorpsstraat')).toBeTruthy()
    expect(screen.getByText('Opeethypotheek')).toBeTruthy()
  })
})
