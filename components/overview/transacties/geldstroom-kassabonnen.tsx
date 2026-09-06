'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { summarizeFlow, type AnalysisTransaction, type FlowSummary } from '@/lib/transaction-insights'
import type { Budget } from '@/lib/budget-data'

/**
 * GeldstroomKassabonnen — de drie kassabon-sheets achter de Inkomen- en
 * Uitgaven-cel van de geldstroom-kaart. Verhuisd van de cashflow-hub
 * (`components/app/cash-overview.tsx`) naar de transactiepagina (UR3-28,
 * fase 2b).
 *
 * ── ÉÉN GRONDSLAG, GEEN TWEEDE SOM ───────────────────────────────────────────
 * Elke regel is een `summarizeFlow` over een deelverzameling van dezelfde
 * `transactions` die de periode-samenvatting voedt. Rijen worden eerst
 * gegroepeerd (per rekening, per budget, per kindbudget) en dán opgeteld met
 * dezelfde canonieke functie — dus met identieke classificatie (teken van
 * `amount`) en hetzelfde transfer-filter. Het TOTAAL onderaan elke bon komt
 * niet uit de opsomming maar uit `summary`: als die twee ooit uiteen zouden
 * lopen, is dat zichtbaar en niet weggemiddeld.
 *
 * Omdat élke uitgave-rij in precies één emmer valt (eigen budget → parent →
 * "Ongecategoriseerd" bij een onbekend of ontbrekend budget), telt de
 * opsomming per constructie op tot dat totaal.
 *
 * ── PERIODE, GEEN MAAND ──────────────────────────────────────────────────────
 * De bonnen beschrijven de periode van de `PeriodeSelector`, niet de
 * kalendermaand-tot-nu-toe van de oude hub. Het venster staat daarom in de
 * titel van elke sheet.
 *
 * ── WAT NIET MEEVERHUISDE ────────────────────────────────────────────────────
 * De hub kende een vangrail voor split-OUDERS (`is_split`): hun bedrag leeft op
 * `transaction_splits`, dus ze werden naar "Ongecategoriseerd" geroute in plaats
 * van op hun eigen budget geboekt. `AnalysisTransaction` draagt dat veld niet,
 * en het toevoegen zou een gedeeld contract raken voor een geval dat vandaag
 * niet voorkomt (het bewerkformulier schrijft `budget_id = null` bij een split,
 * waarmee zulke rijen hier alsnog onder "Ongecategoriseerd" landen). Het TOTAAL
 * klopt in beide gevallen; alleen de toewijzing van een legacy-/import-rij met
 * zowel een split als een budget zou afwijken.
 */

/** Bucket-sleutel voor inkomsten zonder `account_id` of op een onbekende rekening. */
const OVERIGE_REKENINGEN = '__overig'
/** Bucket-sleutel voor uitgaven zonder (bekend) budget. */
const ONGECATEGORISEERD = '__uncat'

export type KassabonKind = 'income' | 'expense'

type ReceiptLine = {
  id: string
  name: string
  amount: number
  limit: number
  /** Heeft dit budget kindbudgetten met besteding? Dan is de regel doorklikbaar. */
  hasChildren: boolean
}

/**
 * Groepeer rijen op een sleutel en vat elke groep samen met `summarizeFlow`.
 * Rijen waarvoor `keyOf` `null` geeft vallen buiten elke groep.
 */
function summarizeByKey(
  transactions: AnalysisTransaction[],
  keyOf: (t: AnalysisTransaction) => string | null,
): Map<string, FlowSummary> {
  const groups = new Map<string, AnalysisTransaction[]>()
  for (const t of transactions) {
    const key = keyOf(t)
    if (key === null) continue
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  const out = new Map<string, FlowSummary>()
  for (const [key, rows] of groups) out.set(key, summarizeFlow(rows))
  return out
}

export function GeldstroomKassabonnen({
  open,
  onClose,
  transactions,
  budgets,
  accountMap,
  summary,
  windowLabel,
}: {
  /** Welke bon staat open — `null` = geen. */
  open: KassabonKind | null
  onClose: () => void
  /** Transacties van de gekozen periode (`currentTxns`). */
  transactions: AnalysisTransaction[]
  /** Volledige budgetrijen, incl. `parent_id` en `default_limit`. */
  budgets: Budget[]
  /** Rekening-id → weergavenaam, zoals de pagina 'm al heeft. */
  accountMap: Map<string, string>
  /** De periode-samenvatting van de call-site. Levert de totaalregels. */
  summary: FlowSummary
  /** Venster in gewone taal — staat in de sheet-titel. */
  windowLabel: string
}) {
  // Welk (parent-)budget staat uitgeklapt in de derde bon? `null` = geen.
  const [drillBudgetId, setDrillBudgetId] = useState<string | null>(null)

  const closeAll = useCallback(() => {
    setDrillBudgetId(null)
    onClose()
  }, [onClose])

  // ── Inkomsten per rekening ────────────────────────────────────────────────
  const incomeLines = useMemo(() => {
    const byAccount = summarizeByKey(transactions, (t) => {
      const id = t.account_id
      if (!id) return OVERIGE_REKENINGEN
      return accountMap.has(id) ? id : OVERIGE_REKENINGEN
    })
    const lines: Array<{ id: string; name: string; amount: number }> = []
    for (const [key, flow] of byAccount) {
      if (flow.income <= 0) continue
      lines.push({
        id: key,
        // Restpost: inkomen zonder rekening of op een rekening die deze pagina
        // niet kent. Zonder deze regel telt de bon niet op tot zijn eigen totaal.
        name: key === OVERIGE_REKENINGEN ? 'Overige rekeningen' : accountMap.get(key) ?? 'Overige rekeningen',
        amount: flow.income,
      })
    }
    lines.sort((a, b) => b.amount - a.amount)
    return lines
  }, [transactions, accountMap])

  // ── Uitgaven per (parent-)budget ──────────────────────────────────────────
  const budgetById = useMemo(() => {
    const m = new Map<string, Budget>()
    for (const b of budgets) m.set(b.id, b)
    return m
  }, [budgets])

  const expenseLines = useMemo<ReceiptLine[]>(() => {
    const byBudget = summarizeByKey(transactions, (t) => {
      const bid = t.budget_id
      if (!bid) return ONGECATEGORISEERD
      const budget = budgetById.get(bid)
      // Budget onbekend (verwijderd, gearchiveerd, andere RLS-scope): niet
      // stilzwijgend laten wegvallen — anders klopt de bon niet met zijn totaal.
      if (!budget) return ONGECATEGORISEERD
      const parentId = budget.parent_id
      if (parentId && budgetById.has(parentId)) return parentId
      return bid
    })

    const lines: ReceiptLine[] = []
    for (const [key, flow] of byBudget) {
      if (flow.expense <= 0) continue
      if (key === ONGECATEGORISEERD) {
        lines.push({ id: key, name: 'Ongecategoriseerd', amount: flow.expense, limit: 0, hasChildren: false })
        continue
      }
      const budget = budgetById.get(key)
      if (!budget) continue
      const children = budgets.filter((b) => b.parent_id === key)
      let limit = Number(budget.default_limit) || 0
      for (const child of children) limit += Number(child.default_limit) || 0
      lines.push({
        id: key,
        name: budget.name,
        amount: flow.expense,
        limit,
        hasChildren: children.length > 0,
      })
    }
    lines.sort((a, b) => b.amount - a.amount)
    return lines
  }, [transactions, budgets, budgetById])

  // ── Kindbudgetten van de uitgeklapte regel ────────────────────────────────
  const drillLine = drillBudgetId ? expenseLines.find((l) => l.id === drillBudgetId) ?? null : null

  const drillChildren = useMemo(() => {
    if (!drillBudgetId) return []
    const children = budgets.filter((b) => b.parent_id === drillBudgetId)
    if (children.length === 0) return []
    const childIds = new Set(children.map((c) => c.id))
    const byChild = summarizeByKey(transactions, (t) =>
      t.budget_id && childIds.has(t.budget_id) ? t.budget_id : null,
    )
    return children
      .map((c) => ({
        id: c.id,
        name: c.name,
        amount: byChild.get(c.id)?.expense ?? 0,
        limit: Number(c.default_limit) || 0,
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [drillBudgetId, budgets, transactions])

  return (
    <>
      {/* === Kassabon: Inkomsten === */}
      <BottomSheet
        open={open === 'income'}
        onClose={closeAll}
        title={`Inkomsten · ${windowLabel}`}
      >
        <KassabonShell>
          <div className="space-y-2">
            {incomeLines.map((line) => (
              <div key={line.id} className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">{line.name}</span>
                <span className="font-bold tabular-nums">
                  <MaskedAmount value={line.amount} tone="kern" decimals />
                </span>
              </div>
            ))}
            {incomeLines.length === 0 && (
              <p className="text-[var(--ink-3)]">Geen inkomsten in deze periode.</p>
            )}
            <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Totaal</span>
                <span className="tabular-nums">
                  <MaskedAmount value={summary.income} tone="kern" decimals />
                </span>
              </div>
              <FreedomTimeBadge amount={summary.income} className="mt-1" />
            </div>
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Kassabon: Uitgaven === */}
      <BottomSheet
        open={open === 'expense' && !drillBudgetId}
        onClose={closeAll}
        title={`Uitgaven · ${windowLabel}`}
      >
        <KassabonShell>
          <div className="space-y-2">
            {expenseLines.map((line) =>
              line.hasChildren ? (
                // Doorklikken naar de kindbudgetten. Op de hub bestond deze
                // derde bon wél, maar had hij geen enkele aanroeper — de
                // uitklap-conditie kon nooit waar worden. Hier is de regel zelf
                // de ingang.
                <button
                  key={line.id}
                  type="button"
                  onClick={() => setDrillBudgetId(line.id)}
                  aria-label={`Toon deelbudgetten van ${line.name}`}
                  className="flex w-full items-center justify-between gap-2 text-left transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                >
                  <span className="flex items-center gap-1 text-[var(--ink-2)]">
                    {line.name}
                    <ChevronRight className="h-3 w-3 shrink-0 text-[var(--ink-4)]" aria-hidden />
                  </span>
                  <span className="text-right">
                    <span className="font-bold tabular-nums">
                      <MaskedAmount value={line.amount} tone="kern" decimals />
                    </span>
                    {line.limit > 0 && (
                      <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                        / <MaskedAmount value={line.limit} tone="kern" monoWhenVisible={false} />
                      </span>
                    )}
                  </span>
                </button>
              ) : (
                <div key={line.id} className="flex items-center justify-between">
                  <span className="text-[var(--ink-2)]">{line.name}</span>
                  <div className="text-right">
                    <span className="font-bold tabular-nums">
                      <MaskedAmount value={line.amount} tone="kern" decimals />
                    </span>
                    {line.limit > 0 && (
                      <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                        / <MaskedAmount value={line.limit} tone="kern" monoWhenVisible={false} />
                      </span>
                    )}
                  </div>
                </div>
              ),
            )}
            {expenseLines.length === 0 && (
              <p className="text-[var(--ink-3)]">Geen uitgaven in deze periode.</p>
            )}
            <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Totaal</span>
                <span className="tabular-nums">
                  <MaskedAmount value={summary.expense} tone="kern" decimals />
                </span>
              </div>
              <FreedomTimeBadge amount={summary.expense} className="mt-1" />
            </div>
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Kassabon: deelbudgetten van één uitgavenpost === */}
      <BottomSheet
        open={open === 'expense' && !!drillBudgetId}
        // Sluiten brengt je terug op de uitgaven-bon, niet uit de hele reeks:
        // je klikte je één niveau dieper, dus één niveau terug is de stap die
        // je verwacht.
        onClose={() => setDrillBudgetId(null)}
        title={drillLine?.name ?? 'Budget detail'}
      >
        <KassabonShell>
          <div className="space-y-2">
            {drillChildren.length > 0 ? (
              <>
                {drillChildren.map((child) => (
                  <div key={child.id} className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">{child.name}</span>
                    <div className="text-right">
                      <span className="font-bold tabular-nums">
                        <MaskedAmount value={child.amount} tone="kern" decimals />
                      </span>
                      {child.limit > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                          / <MaskedAmount value={child.limit} tone="kern" monoWhenVisible={false} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>Totaal</span>
                    <span className="tabular-nums">
                      <MaskedAmount value={drillLine?.amount ?? 0} tone="kern" decimals />
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between font-bold">
                <span>{drillLine?.name ?? ''}</span>
                <span className="tabular-nums">
                  <MaskedAmount value={drillLine?.amount ?? 0} tone="kern" decimals />
                </span>
              </div>
            )}
          </div>
        </KassabonShell>
      </BottomSheet>
    </>
  )
}
