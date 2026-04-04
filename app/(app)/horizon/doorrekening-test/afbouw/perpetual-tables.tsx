"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { NL_SWR } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────

interface PerpetualRow {
  year: number;
  age: number;
  startBalance: number;
  withdrawal: number;
  remainder: number;
  growth: number;
  endBalance: number;
  withdrawalRate?: number;
  remainingYears?: number;
  guardrail?: "upper" | "lower" | "normal";
}

interface BucketRow {
  month: number;
  age: number;
  cashBalance: number;
  bondBalance: number;
  stockBalance: number;
  totalBalance: number;
  withdrawal: number;
  refillCash: number;
  refillBonds: number;
}

// ── Helpers ──────────────────────────────────────────────────

function samplePerpetualRows(rows: PerpetualRow[]): PerpetualRow[] {
  if (rows.length <= 20) return rows;
  const result: PerpetualRow[] = rows.slice(0, 5);
  for (let i = 5; i < rows.length - 3; i++) {
    if (i % 5 === 0) result.push(rows[i]);
  }
  result.push(...rows.slice(-3));
  return result;
}

function sampleBucketRows(rows: BucketRow[]): BucketRow[] {
  if (rows.length <= 24) return rows;
  const result: BucketRow[] = rows.slice(0, 6);
  for (let i = 6; i < rows.length - 3; i++) {
    if (i % 6 === 0) result.push(rows[i]);
  }
  result.push(...rows.slice(-3));
  return result;
}

/** Remaining years until age 100 (VPW planning horizon). */
function remainingLifeYears(currentAge: number): number {
  return Math.max(1, 100 - currentAge);
}

/** Variable Percentage Withdrawal rate based on annuity formula. */
function vpwRate(remYears: number, realReturn: number): number {
  if (remYears <= 1) return 1;
  if (realReturn === 0) return 1 / remYears;
  return realReturn / (1 - Math.pow(1 + realReturn, -remYears));
}

/** Bond return: ~2% nominal (fixed, conservative). */
const BOND_ANNUAL_RETURN = 0.02;

// ── Main Component ───────────────────────────────────────────

export function PerpetualStrategyTables({
  startPortfolio,
  retirementAge,
  endAge,
  yearlyExpenses,
  grossReturn,
  inflationRate,
}: {
  startPortfolio: number;
  retirementAge: number;
  endAge: number;
  yearlyExpenses: number;
  grossReturn: number;
  inflationRate: number;
  hasPartner: boolean;
}) {
  const totalYears = Math.max(0, endAge - retirementAge);
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1;

  // ── SWR Strategy ──
  const swrRows = useMemo(() => {
    const rows: PerpetualRow[] = [];
    let balance = startPortfolio;
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const currentAge = retirementAge + y;
      const withdrawal = Math.min(balance * NL_SWR, balance);
      const remainder = balance - withdrawal;
      const growth = remainder * realReturn;
      rows.push({
        year: y + 1,
        age: currentAge,
        startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal),
        remainder: Math.round(remainder),
        growth: Math.round(growth),
        endBalance: Math.round(remainder + growth),
      });
      balance = remainder + growth;
    }
    return rows;
  }, [startPortfolio, totalYears, retirementAge, realReturn]);

  // ── Guardrails Strategy ──
  const guardrailsRows = useMemo(() => {
    const rows: PerpetualRow[] = [];
    let balance = startPortfolio;
    let currentWithdrawal = startPortfolio * NL_SWR;
    const upperThreshold = startPortfolio * 1.2;
    const lowerThreshold = startPortfolio * 0.8;

    for (let y = 0; y < totalYears && balance > 0; y++) {
      const currentAge = retirementAge + y;
      let guardrail: "upper" | "lower" | "normal" = "normal";

      if (balance > upperThreshold) {
        currentWithdrawal = currentWithdrawal * 1.1;
        guardrail = "upper";
      } else if (balance < lowerThreshold) {
        currentWithdrawal = currentWithdrawal * 0.9;
        guardrail = "lower";
      }

      const withdrawal = Math.min(currentWithdrawal, balance);
      const remainder = balance - withdrawal;
      const growth = remainder * realReturn;
      rows.push({
        year: y + 1,
        age: currentAge,
        startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal),
        remainder: Math.round(remainder),
        growth: Math.round(growth),
        endBalance: Math.round(remainder + growth),
        guardrail,
      });
      balance = remainder + growth;
    }
    return rows;
  }, [startPortfolio, totalYears, retirementAge, realReturn]);

  // ── VPW Strategy ──
  const vpwRows = useMemo(() => {
    const rows: PerpetualRow[] = [];
    let balance = startPortfolio;
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const currentAge = retirementAge + y;
      const remYears = remainingLifeYears(currentAge);
      const rate = vpwRate(remYears, realReturn);
      const withdrawal = Math.min(balance * rate, balance);
      const remainder = balance - withdrawal;
      const growth = remainder * realReturn;
      rows.push({
        year: y + 1,
        age: currentAge,
        startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal),
        remainder: Math.round(remainder),
        growth: Math.round(growth),
        endBalance: Math.round(remainder + growth),
        withdrawalRate: rate,
        remainingYears: remYears,
      });
      balance = remainder + growth;
    }
    return rows;
  }, [startPortfolio, totalYears, retirementAge, realReturn]);

  // ── Bucket Strategy (monthly) ──
  const bucketMonthlyRows = useMemo(() => {
    const totalMonths = totalYears * 12;
    const rows: BucketRow[] = [];
    const monthlyExpense = yearlyExpenses / 12;
    const monthlyStockReturn = Math.pow(1 + realReturn, 1 / 12) - 1;
    const monthlyBondReturn = Math.pow(1 + BOND_ANNUAL_RETURN, 1 / 12) - 1;

    let cashBal = Math.min(yearlyExpenses * 2, startPortfolio);
    let bondBal = Math.min(yearlyExpenses * 5, Math.max(0, startPortfolio - cashBal));
    let stockBal = Math.max(0, startPortfolio - cashBal - bondBal);

    for (let m = 1; m <= totalMonths; m++) {
      const totalBal = cashBal + bondBal + stockBal;
      if (totalBal <= 0) break;

      const currentAge = retirementAge + Math.floor((m - 1) / 12);

      // Step 4: Monthly withdrawal from cash bucket
      const withdrawal = Math.min(monthlyExpense, totalBal);
      const fromCash = Math.min(withdrawal, cashBal);
      cashBal -= fromCash;
      const fromBonds = Math.min(withdrawal - fromCash, bondBal);
      bondBal -= fromBonds;
      const fromStocks = withdrawal - fromCash - fromBonds;
      stockBal = Math.max(0, stockBal - fromStocks);

      // Monthly returns: cash 0%, bonds ~2%/yr, stocks profile return
      bondBal += bondBal * monthlyBondReturn;
      stockBal += stockBal * monthlyStockReturn;

      // Step 5: Yearly refill at end of each year (every 12th month)
      let refillCash = 0;
      let refillBonds = 0;
      if (m % 12 === 0) {
        // Refill cash from bonds, then stocks
        const cashTarget = Math.min(yearlyExpenses * 2, cashBal + bondBal + stockBal);
        if (cashBal < cashTarget) {
          const cashNeed = cashTarget - cashBal;
          const fromBondsRefill = Math.min(cashNeed, bondBal);
          bondBal -= fromBondsRefill;
          cashBal += fromBondsRefill;
          refillCash += fromBondsRefill;
          const remainingNeed = cashNeed - fromBondsRefill;
          if (remainingNeed > 0 && stockBal > 0) {
            const fromStocksRefill = Math.min(remainingNeed, stockBal);
            stockBal -= fromStocksRefill;
            cashBal += fromStocksRefill;
            refillCash += fromStocksRefill;
          }
        }
        // Refill bonds from stocks
        const bondTarget = Math.min(yearlyExpenses * 5, bondBal + stockBal);
        if (bondBal < bondTarget && stockBal > 0) {
          const bondNeed = bondTarget - bondBal;
          const fromStocksRefill = Math.min(bondNeed, stockBal);
          stockBal -= fromStocksRefill;
          bondBal += fromStocksRefill;
          refillBonds += fromStocksRefill;
        }
      }

      rows.push({
        month: m,
        age: currentAge,
        cashBalance: Math.round(cashBal),
        bondBalance: Math.round(bondBal),
        stockBalance: Math.round(stockBal),
        totalBalance: Math.round(cashBal + bondBal + stockBal),
        withdrawal: Math.round(withdrawal),
        refillCash: Math.round(refillCash),
        refillBonds: Math.round(refillBonds),
      });
    }
    return rows;
  }, [startPortfolio, totalYears, retirementAge, yearlyExpenses, realReturn]);

  // Yearly bucket rows for per-jaar view
  const bucketYearlyRows = useMemo(() => {
    const rows: PerpetualRow[] = [];
    const monthlyStockReturn = Math.pow(1 + realReturn, 1 / 12) - 1;
    const monthlyBondReturn = Math.pow(1 + BOND_ANNUAL_RETURN, 1 / 12) - 1;
    const monthlyExpense = yearlyExpenses / 12;

    let cashBal = Math.min(yearlyExpenses * 2, startPortfolio);
    let bondBal = Math.min(yearlyExpenses * 5, Math.max(0, startPortfolio - cashBal));
    let stockBal = Math.max(0, startPortfolio - cashBal - bondBal);

    for (let y = 0; y < totalYears; y++) {
      const currentAge = retirementAge + y;
      const startBal = cashBal + bondBal + stockBal;
      if (startBal <= 0) break;

      let yearWithdrawal = 0;
      let yearGrowth = 0;

      for (let m = 0; m < 12; m++) {
        const totalBal = cashBal + bondBal + stockBal;
        if (totalBal <= 0) break;
        const withdrawal = Math.min(monthlyExpense, totalBal);
        yearWithdrawal += withdrawal;
        const fromCash = Math.min(withdrawal, cashBal);
        cashBal -= fromCash;
        const fromBondsW = Math.min(withdrawal - fromCash, bondBal);
        bondBal -= fromBondsW;
        const fromStocksW = withdrawal - fromCash - fromBondsW;
        stockBal = Math.max(0, stockBal - fromStocksW);
        const bondGrowth = bondBal * monthlyBondReturn;
        const stockGrowth = stockBal * monthlyStockReturn;
        bondBal += bondGrowth;
        stockBal += stockGrowth;
        yearGrowth += bondGrowth + stockGrowth;
      }

      // Annual refill
      const cashTarget = Math.min(yearlyExpenses * 2, cashBal + bondBal + stockBal);
      if (cashBal < cashTarget) {
        const cashNeed = cashTarget - cashBal;
        const fromBondsR = Math.min(cashNeed, bondBal);
        bondBal -= fromBondsR;
        cashBal += fromBondsR;
        const remaining = cashNeed - fromBondsR;
        if (remaining > 0 && stockBal > 0) {
          const fromStocksR = Math.min(remaining, stockBal);
          stockBal -= fromStocksR;
          cashBal += fromStocksR;
        }
      }
      const bondTarget = Math.min(yearlyExpenses * 5, bondBal + stockBal);
      if (bondBal < bondTarget && stockBal > 0) {
        const fromStocksR = Math.min(bondTarget - bondBal, stockBal);
        stockBal -= fromStocksR;
        bondBal += fromStocksR;
      }

      const endBal = cashBal + bondBal + stockBal;
      rows.push({
        year: y + 1,
        age: currentAge,
        startBalance: Math.round(startBal),
        withdrawal: Math.round(yearWithdrawal),
        remainder: Math.round(endBal - yearGrowth),
        growth: Math.round(yearGrowth),
        endBalance: Math.round(endBal),
      });
    }
    return rows;
  }, [startPortfolio, totalYears, retirementAge, yearlyExpenses, realReturn]);

  const strategies = [
    {
      key: "swr",
      label: "SWR (Safe Withdrawal Rate)",
      subtitle: `Onttrekking = ${(NL_SWR * 100).toFixed(3)}% van portfolio per jaar`,
      rows: swrRows,
    },
    {
      key: "guardrails",
      label: "Guardrails",
      subtitle: `Basisonttrekking NL SWR (${(NL_SWR * 100).toFixed(2)}%). Portfolio > 120% start \u2192 +10%, < 80% \u2192 \u221210%`,
      rows: guardrailsRows,
      showGuardrailColumn: true,
    },
    {
      key: "vpw",
      label: "VPW (Variable Percentage Withdrawal)",
      subtitle:
        "Jaarlijks herberekend op basis van resterende jaren tot 100 en verwacht rendement",
      rows: vpwRows,
      showVpwColumns: true,
    },
  ];

  return (
    <>
      {strategies.map((strat) => (
        <PerpetualSubTable
          key={strat.key}
          label={strat.label}
          subtitle={strat.subtitle}
          rows={strat.rows}
          showVpwColumns={strat.showVpwColumns}
          showGuardrailColumn={strat.showGuardrailColumn}
        />
      ))}
      <BucketStrategyTable
        rows={bucketMonthlyRows}
        yearlyRows={bucketYearlyRows}
        yearlyExpenses={yearlyExpenses}
      />
    </>
  );
}

// ── Bucket Strategy Table ───────────────────────────────────

function BucketStrategyTable({
  rows,
  yearlyRows,
  yearlyExpenses,
}: {
  rows: BucketRow[];
  yearlyRows: PerpetualRow[];
  yearlyExpenses: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const displayRows = useMemo(
    () => (expanded ? rows : sampleBucketRows(rows)),
    [rows, expanded]
  );
  const hasTooMany = rows.length > 24;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-[var(--ink)]">
              Bucket (Emmer-strategie)
            </h4>
            <p className="text-[11px] text-[var(--ink-3)]">
              3 emmers: cash ({formatCurrency(Math.round(yearlyExpenses * 2))},
              2j, 0%), obligaties (
              {formatCurrency(Math.round(yearlyExpenses * 5))}, 5j, ~2%),
              aandelen (rest, profiel-rendement)
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode("monthly")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${viewMode === "monthly" ? "bg-horizon-100 text-horizon-700" : "text-[var(--ink-3)] hover:bg-[var(--subtle)]"}`}
            >
              Per maand
            </button>
            <button
              onClick={() => setViewMode("yearly")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${viewMode === "yearly" ? "bg-horizon-100 text-horizon-700" : "text-[var(--ink-3)] hover:bg-[var(--subtle)]"}`}
            >
              Per jaar
            </button>
          </div>
        </div>
      </div>

      {viewMode === "yearly" ? (
        <YearlyBucketView rows={yearlyRows} />
      ) : (
        <>
          {rows.length > 0 ? (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                    <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      Mnd
                    </th>
                    <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      Leeftijd
                    </th>
                    <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      Onttrekking
                    </th>
                    <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                      Cash
                    </th>
                    <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                      Obligaties
                    </th>
                    <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                      Aandelen
                    </th>
                    <th className="px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      Totaal
                    </th>
                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      Hervulling
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const isRefillMonth = row.refillCash > 0 || row.refillBonds > 0;
                    return (
                      <tr
                        key={row.month}
                        className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${
                          isRefillMonth
                            ? "bg-horizon-50/40"
                            : row.totalBalance <= 0
                              ? "bg-amber-50/50"
                              : idx % 2 === 1
                                ? "bg-[var(--subtle)]/30"
                                : ""
                        }`}
                      >
                        <td className="px-2 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">
                          {row.month}
                        </td>
                        <td className="px-2 py-1 font-mono tabular-nums text-[var(--ink)]">{row.age}j</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-red-600">
                          -{formatCurrency(row.withdrawal)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-amber-700">
                          {formatCurrency(row.cashBalance)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-blue-700">
                          {formatCurrency(row.bondBalance)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-emerald-700">
                          {formatCurrency(row.stockBalance)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums font-medium text-[var(--ink)]">
                          {formatCurrency(row.totalBalance)}
                        </td>
                        <td className="px-2 py-1 text-center text-[11px]">
                          {isRefillMonth ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-horizon-100 px-2 py-0.5 font-medium text-horizon-700">
                              {row.refillCash > 0 && (
                                <span>C+{formatCurrency(row.refillCash)}</span>
                              )}
                              {row.refillBonds > 0 && (
                                <span>O+{formatCurrency(row.refillBonds)}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[var(--ink-4)]">{"\u2014"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                    <td colSpan={2} className="px-2 py-1.5 font-bold text-[var(--ink)]">
                      Totaal ({rows.length} mnd)
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                      -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-amber-700">
                      {formatCurrency(rows[rows.length - 1]?.cashBalance ?? 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-blue-700">
                      {formatCurrency(rows[rows.length - 1]?.bondBalance ?? 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                      {formatCurrency(rows[rows.length - 1]?.stockBalance ?? 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                      {formatCurrency(rows[rows.length - 1]?.totalBalance ?? 0)}
                    </td>
                    <td className="px-2 py-1.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">
              Geen data beschikbaar.
            </div>
          )}

          {hasTooMany && (
            <div className="border-t border-[var(--border-ed)] px-3 py-1.5 text-center">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] font-medium text-horizon-600 hover:text-horizon-700"
              >
                {expanded ? "Minder rijen tonen" : `Alle ${rows.length} rijen tonen`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Yearly Bucket View ──────────────────────────────────────

function YearlyBucketView({ rows }: { rows: PerpetualRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayRows = useMemo(
    () => (expanded ? rows : samplePerpetualRows(rows)),
    [rows, expanded]
  );
  const hasTooMany = rows.length > 20;

  return (
    <>
      {rows.length > 0 ? (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Jaar
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Leeftijd
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Portfoliowaarde
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Onttrekking
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Restant
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Rendement
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${
                    row.endBalance <= 0
                      ? "bg-amber-50/50"
                      : idx % 2 === 1
                        ? "bg-[var(--subtle)]/30"
                        : ""
                  }`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">{row.year}</td>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink)]">{row.age}j</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.remainder)}
                  </td>
                  <td
                    className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {row.growth >= 0 ? "+" : ""}
                    {formatCurrency(row.growth)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td colSpan={2} className="px-3 py-1.5 font-bold text-[var(--ink)]">
                  Totaal ({rows.length}j)
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[0]?.startBalance ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.growth, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">
          Geen data beschikbaar.
        </div>
      )}

      {hasTooMany && (
        <div className="border-t border-[var(--border-ed)] px-3 py-1.5 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-medium text-horizon-600 hover:text-horizon-700"
          >
            {expanded ? "Minder rijen tonen" : `Alle ${rows.length} rijen tonen`}
          </button>
        </div>
      )}
    </>
  );
}

// ── Sub-table Component ──────────────────────────────────────

function PerpetualSubTable({
  label,
  subtitle,
  rows,
  showVpwColumns,
  showGuardrailColumn,
}: {
  label: string;
  subtitle: string;
  rows: PerpetualRow[];
  showVpwColumns?: boolean;
  showGuardrailColumn?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayRows = useMemo(
    () => (expanded ? rows : samplePerpetualRows(rows)),
    [rows, expanded]
  );
  const hasTooMany = rows.length > 20;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
        <h4 className="text-sm font-bold text-[var(--ink)]">{label}</h4>
        <p className="text-[11px] text-[var(--ink-3)]">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Jaar
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Leeftijd
                </th>
                {showVpwColumns && (
                  <>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      Rest. jaren
                    </th>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      VPW %
                    </th>
                  </>
                )}
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Portfoliowaarde
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Onttrekking
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Restant
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Rendement
                </th>
                {showGuardrailColumn && (
                  <th className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Guardrail
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${
                    row.endBalance <= 0
                      ? "bg-amber-50/50"
                      : idx % 2 === 1
                        ? "bg-[var(--subtle)]/30"
                        : ""
                  }`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">{row.year}</td>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink)]">{row.age}j</td>
                  {showVpwColumns && (
                    <>
                      <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {row.remainingYears ?? "\u2014"}
                      </td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums font-medium text-horizon-600">
                        {row.withdrawalRate != null
                          ? `${(row.withdrawalRate * 100).toFixed(2)}%`
                          : "\u2014"}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.remainder)}
                  </td>
                  <td
                    className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {row.growth >= 0 ? "+" : ""}
                    {formatCurrency(row.growth)}
                  </td>
                  {showGuardrailColumn && (
                    <td className="px-3 py-1 text-center text-[11px] font-medium">
                      {row.guardrail === "upper" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                          ▲ +10%
                        </span>
                      ) : row.guardrail === "lower" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                          ▼ −10%
                        </span>
                      ) : (
                        <span className="text-[var(--ink-4)]">{"\u2014"}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td
                  colSpan={showVpwColumns ? 4 : 2}
                  className="px-3 py-1.5 font-bold text-[var(--ink)]"
                >
                  Totaal ({rows.length}j)
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[0]?.startBalance ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.growth, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">
          Geen data beschikbaar.
        </div>
      )}

      {hasTooMany && (
        <div className="border-t border-[var(--border-ed)] px-3 py-1.5 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-medium text-horizon-600 hover:text-horizon-700"
          >
            {expanded ? "Minder rijen tonen" : `Alle ${rows.length} rijen tonen`}
          </button>
        </div>
      )}
    </div>
  );
}
