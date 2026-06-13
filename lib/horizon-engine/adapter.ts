/**
 * Horizon grootboek-engine — adapter naar de bestaande front-end rij-typen.
 *
 * Zet `HorizonLedgerResult` (per asset, REËEL) om naar `UnifiedProjectionResult`
 * (per asset-type) zodat de huidige grafiekcomponenten de nieuwe engine kunnen
 * consumeren zonder UI-wijziging. Twee transformaties:
 *  1. **Rollup** van per-asset naar per-asset-type (assetBuckets is type-gekeyd).
 *  2. **Route 2 — reëel → nominaal**: alle bedragen × (1+inflatie)^jaar, zodat de
 *     /toekomst-getallen op dezelfde schaal blijven als de oude (nominale) engine.
 *     `inflationFactor` blijft (1+inflatie)^jaar voor optionele reële weergave.
 */

import type { AssetType } from '@/lib/asset-data'
import type {
  UnifiedProjectionRow,
  UnifiedProjectionResult,
  AssetBucketDetail,
  DebtBalanceDetail,
} from '@/lib/unified-projection'
import type { HorizonLedgerResult, LedgerRow } from './types'

type Phase = UnifiedProjectionRow['phase']

function faseToPhase(fase: LedgerRow['fase']): Phase {
  if (fase === 'opbouw') return 'accumulation'
  if (fase === 'overbrugging') return 'transition'
  return 'withdrawal'
}

function rowToUnified(row: LedgerRow, inflation: number): UnifiedProjectionRow {
  const f = Math.pow(1 + inflation, row.jaar) // reëel → nominaal

  const assetBuckets: Partial<Record<AssetType, AssetBucketDetail>> = {}
  const withdrawalByType: Partial<Record<AssetType, number>> = {}
  let savings = 0
  let withdrawal = 0
  let totalGrowth = 0
  let totalBox3 = 0
  let startAssets = 0
  for (const a of row.assets) {
    const b: AssetBucketDetail =
      assetBuckets[a.type] ?? { startValue: 0, growth: 0, contributions: 0, box3Drag: 0, endValue: 0 }
    b.startValue += a.begin * f
    b.growth += a.rendement * f
    b.contributions += a.instroom * f
    b.box3Drag += a.box3 * f
    b.endValue += a.eind * f
    assetBuckets[a.type] = b
    savings += a.instroom * f
    withdrawal += a.uitstroom * f
    totalGrowth += a.rendement * f
    totalBox3 += a.box3 * f
    startAssets += a.begin * f
    if (a.uitstroom > 0) withdrawalByType[a.type] = (withdrawalByType[a.type] ?? 0) + a.uitstroom * f
  }

  const debtBalances: Record<string, DebtBalanceDetail> = {}
  let startDebt = 0
  for (const d of row.schulden) {
    debtBalances[d.id] = {
      startBalance: d.begin * f,
      interestPaid: d.rente * f,
      principalPaid: (d.aflossing + d.extraAflossing) * f,
      endBalance: d.eind * f,
    }
    startDebt += d.begin * f
  }

  return {
    year: row.jaar,
    age: row.leeftijd,
    phase: faseToPhase(row.fase),
    assetBuckets,
    debtBalances,
    totalAssets: row.totaalAssets * f,
    totalDebts: row.totaalSchuld * f,
    netWorth: row.nettoVermogen * f,
    startNetWorth: startAssets - startDebt,
    grossIncome: (row.salaris + row.aowEnPensioen + row.overigInkomen) * f,
    savings,
    withdrawal,
    withdrawalByType,
    cashflowNet: row.cashflowNetto * f,
    oneTimeNet: (row.overigInkomen - row.eventsUitgave) * f,
    totalGrowth,
    totalBox3,
    cumulativeBox3: 0,
    inflationFactor: f,
  }
}

export function ledgerToUnifiedResult(
  result: HorizonLedgerResult,
  opts?: { yearlyExpenses?: number },
): UnifiedProjectionResult {
  const inflation = result.inflationRate
  let cumBox3 = 0
  const rows = result.rows.map((r) => {
    const u = rowToUnified(r, inflation)
    cumBox3 += u.totalBox3
    u.cumulativeBox3 = cumBox3
    return u
  })

  const fireRow = result.fireAge != null ? result.rows.find((r) => r.leeftijd === result.fireAge) : undefined
  const fireFactor = fireRow ? Math.pow(1 + inflation, fireRow.jaar) : 1
  const lastRow = result.rows[result.rows.length - 1]
  const lastFactor = lastRow ? Math.pow(1 + inflation, lastRow.jaar) : 1

  const req = result.requiredFirePortfolioAtFire * fireFactor
  const implicitWithdrawalRate =
    req > 0 && opts?.yearlyExpenses ? (opts.yearlyExpenses * fireFactor) / req : 0
  const targetEndPortfolio = (result.vNodig[result.vNodig.length - 1] ?? 0) * lastFactor

  return {
    rows,
    fireAge: result.fireAge,
    fireAgeFractional: result.fireAgeFractional,
    fireReachable: result.fireReachable,
    firePortfolioAtFire: result.liquideAtFire * fireFactor,
    requiredFirePortfolio: req,
    implicitWithdrawalRate,
    strategy: result.strategy,
    targetEndPortfolio,
    displayEndAge: result.displayEndAge,
  }
}
