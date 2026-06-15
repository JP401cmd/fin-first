'use client'

import { useState } from 'react'
import {
  ChevronLeft, Trash2, ChevronDown, SlidersHorizontal, ExternalLink, Info,
} from 'lucide-react'
import { BudgetIcon } from '@/components/app/budget-shared'
import { BudgetIconGrid } from '@/components/app/budget-icon-picker'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { isTempId, type DraftBudget } from '@/lib/budget-plan-diff'

const GOAL_TYPES = [
  { value: '', label: 'Geen' },
  { value: 'vaste_maandlast', label: 'Vaste maandlast' },
  { value: 'bestedingslimiet', label: 'Bestedingslimiet' },
  { value: 'spaardoel', label: 'Spaardoel' },
  { value: 'maandelijkse_reservering', label: 'Reservering' },
  { value: 'periodieke_last', label: 'Periodieke last' },
] as const

const GOAL_HELP: Record<string, string> = {
  vaste_maandlast: 'Een vaste terugkerende uitgave. Je ziet direct of je inkomsten dit dekken.',
  bestedingslimiet: 'Maximaal te besteden bedrag. Je krijgt een melding bij de drempel.',
  spaardoel: 'Spaart toe naar een doel. Vul doelbedrag en einddatum in om voortgang te volgen.',
  maandelijkse_reservering: 'Bouwt maandelijks saldo op. Overschot schuift automatisch door.',
  periodieke_last: 'Voor grote periodieke uitgaven (verzekering, vakantie). Je reserveert maandelijks een deel.',
}

const labelCls = 'mb-1.5 block text-sm font-medium text-[var(--ink-2)]'
const inputCls =
  'w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500'
const legendCls =
  'mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--ink-3)]'

/**
 * Detail-subscherm voor één budget binnen de planeditor-sheet. Bewerkt de
 * in-memory **draft** (geen directe DB-write) — alle wijzigingen landen via de
 * gedeelde diff + atomische save_budget_plan-RPC bij "Opslaan" in de sheet.
 *
 * Eigendom (delen) en koppelen aan een bestaand `goals`-spaardoel zitten
 * bewust NIET hier — die blijven op het uitgebreide BudgetForm-pad, bereikbaar
 * via de "Eigendom & koppeling…"-link (alleen voor reeds opgeslagen budgetten).
 */
export function BudgetDetailPane({
  row,
  amountValue,
  amountReadOnly,
  average,
  takenOver,
  onUpdate,
  onAmountInput,
  onTakeOver,
  onDelete,
  onBack,
  onEditAdvanced,
}: {
  row: DraftBudget
  amountValue: number
  amountReadOnly: boolean
  average?: { avg: number; months: number }
  takenOver: boolean
  onUpdate: (id: string, patch: Partial<DraftBudget>) => void
  onAmountInput: (id: string, n: number) => void
  onTakeOver: (id: string, amount: number) => void
  onDelete: (id: string) => void
  onBack: () => void
  onEditAdvanced?: (id: string) => void
}) {
  const { masked } = useMaskedAmounts()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const isChild = !!row.parentId
  const persisted = !isTempId(row.id)
  const roundedAvg = average ? Math.round(average.avg) : 0
  const months = average?.months ?? 0
  const showAverage = !!average && months > 0 && !amountReadOnly && row.budgetType !== 'archive'

  function setGoalType(value: string) {
    const patch: Partial<DraftBudget> = { goalType: value || null }
    if (value !== 'spaardoel') patch.goalDate = null
    if (value !== 'spaardoel' && value !== 'periodieke_last') patch.goalAmount = null
    if (value !== 'periodieke_last') patch.goalFrequency = null
    // Reservering schuift overschot per definitie door (zie BudgetForm).
    if (value === 'maandelijkse_reservering') patch.rolloverType = 'carry-over'
    onUpdate(row.id, patch)
  }

  return (
    <div>
      {/* Header met terug-knop — sticky binnen de BottomSheet-scrollcontainer
          zodat "Terug" altijd bereikbaar blijft. */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-[var(--r)] py-1.5 pr-2 text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Terug
        </button>
        <span className="text-[var(--border-md)]" aria-hidden>·</span>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--ink-2)]" aria-hidden>
          <BudgetIcon name={row.icon} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">
          {row.name || 'Naamloos budget'}
        </span>
      </div>

      <div className="px-4 py-5 pb-40 sm:px-6">
        <div className="space-y-8">
          {/* ── Identiteit ── */}
          <section>
            <h3 className={legendCls}>Identiteit</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor={`d-name-${row.id}`} className={labelCls}>Naam</label>
                <input
                  id={`d-name-${row.id}`}
                  type="text"
                  value={row.name}
                  onChange={(e) => onUpdate(row.id, { name: e.target.value })}
                  placeholder={isChild ? 'Naam deelbudget' : 'Naam hoofdbudget'}
                  className={inputCls}
                />
              </div>
              <div>
                <span className={labelCls}>Icoon</span>
                <BudgetIconGrid value={row.icon} onChange={(icon) => onUpdate(row.id, { icon })} />
              </div>
              <div>
                <label htmlFor={`d-desc-${row.id}`} className={labelCls}>
                  Beschrijving <span className="font-normal text-[var(--ink-4)]">(optioneel)</span>
                </label>
                <textarea
                  id={`d-desc-${row.id}`}
                  value={row.description ?? ''}
                  onChange={(e) => onUpdate(row.id, { description: e.target.value || null })}
                  rows={2}
                  placeholder="Korte toelichting…"
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          {/* ── Bedrag ── */}
          <section>
            <h3 className={legendCls}>Bedrag deze maand</h3>
            {amountReadOnly ? (
              <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-3 py-3">
                <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink-2)]">
                  <MaskedAmount value={amountValue} tone="wil" />
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
                  <Info className="h-3 w-3" />
                  Som van de deelbudgetten — bewerk de bedragen bij de deelbudgetten.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-40">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-3)]">€</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={amountValue}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      onAmountInput(row.id, isNaN(n) ? 0 : n)
                    }}
                    aria-label={`Bedrag voor ${row.name || 'budget'}`}
                    className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-2 pl-7 pr-3 text-right font-mono text-sm tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  />
                </div>
                {showAverage && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono tabular-nums text-[var(--ink-3)]" title={`Gemiddelde per maand, afgelopen ${months} maand${months === 1 ? '' : 'en'}`}>
                      ⌀ <MaskedAmount value={roundedAvg} tone="wil" />
                    </span>
                    {takenOver ? (
                      <span className="text-[var(--ink-4)]">Overgenomen</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTakeOver(row.id, roundedAvg)}
                        aria-label={`Neem gemiddelde van ${formatMaskedCurrency(roundedAvg, masked)} over`}
                        className="text-[var(--ink-2)] underline underline-offset-2 decoration-[var(--border-ed)] hover:text-[var(--ink)] hover:decoration-[var(--ink-2)]"
                      >
                        Overnemen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Ritme & overschot ── */}
          <section>
            <h3 className={legendCls}>Ritme &amp; overschot</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`d-interval-${row.id}`} className={labelCls}>Interval</label>
                <select
                  id={`d-interval-${row.id}`}
                  value={row.interval}
                  onChange={(e) => onUpdate(row.id, { interval: e.target.value as DraftBudget['interval'] })}
                  className={inputCls}
                >
                  <option value="monthly">Maandelijks</option>
                  <option value="quarterly">Per kwartaal</option>
                  <option value="yearly">Jaarlijks</option>
                </select>
              </div>
              <div>
                <label htmlFor={`d-rollover-${row.id}`} className={labelCls}>Overschot-beheer</label>
                <select
                  id={`d-rollover-${row.id}`}
                  value={row.rolloverType}
                  onChange={(e) => onUpdate(row.id, { rolloverType: e.target.value as DraftBudget['rolloverType'] })}
                  className={inputCls}
                >
                  <option value="reset">Reset</option>
                  <option value="carry-over">Doorschuiven</option>
                  <option value="invest-sweep">Beleggen-sweep</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Doeltype (alleen deelbudgetten, net als BudgetForm) ── */}
          {isChild && (
            <section>
              <h3 className={legendCls}>Doeltype <span className="font-normal lowercase tracking-normal text-[var(--ink-4)]">(optioneel)</span></h3>
              <div className="flex flex-wrap gap-2">
                {GOAL_TYPES.map(({ value, label }) => {
                  const active = (row.goalType ?? '') === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGoalType(value)}
                      className={`rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-kern-200 bg-kern-50 text-kern-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {row.goalType && GOAL_HELP[row.goalType] && (
                <p className="mt-2 rounded-[var(--r)] border border-kern-200 bg-kern-50 px-3 py-2 text-[11px] leading-relaxed text-kern-700">
                  {GOAL_HELP[row.goalType]}
                </p>
              )}

              {/* Spaardoel → doelbedrag + einddatum (los van een goals-record;
                  koppelen aan een bestaand doel doe je via de escape-hatch). */}
              {row.goalType === 'spaardoel' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Doelbedrag (€)</label>
                    <input
                      type="number" min="0" step="1"
                      value={row.goalAmount ?? ''}
                      onChange={(e) => onUpdate(row.id, { goalAmount: e.target.value === '' ? null : Number(e.target.value) })}
                      className={inputCls}
                      placeholder="bijv. 5000"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Einddatum</label>
                    <input
                      type="date"
                      value={row.goalDate ?? ''}
                      onChange={(e) => onUpdate(row.id, { goalDate: e.target.value || null })}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              {/* Periodieke last → totaalbedrag + frequentie */}
              {row.goalType === 'periodieke_last' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Totaalbedrag (€)</label>
                    <input
                      type="number" min="0" step="1"
                      value={row.goalAmount ?? ''}
                      onChange={(e) => onUpdate(row.id, { goalAmount: e.target.value === '' ? null : Number(e.target.value) })}
                      className={inputCls}
                      placeholder="bijv. 600"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Frequentie</label>
                    <select
                      value={row.goalFrequency ?? ''}
                      onChange={(e) => onUpdate(row.id, { goalFrequency: e.target.value || null })}
                      className={inputCls}
                    >
                      <option value="">Kies frequentie</option>
                      <option value="jaarlijks">Jaarlijks</option>
                      <option value="halfjaarlijks">Halfjaarlijks</option>
                      <option value="kwartaal">Kwartaal</option>
                    </select>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Behandeling ── */}
          <section>
            <h3 className={legendCls}>Behandeling</h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-[var(--ink-2)]">Essentieel</span>
                  <span className="block text-xs text-[var(--ink-3)]">Noodzakelijk voor het dagelijks leven</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.isEssential}
                  aria-label="Essentieel"
                  onClick={() => onUpdate(row.id, { isEssential: !row.isEssential })}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    row.isEssential ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${row.isEssential ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </label>

              <div>
                <label htmlFor={`d-prio-${row.id}`} className={labelCls}>Prioriteit</label>
                <select
                  id={`d-prio-${row.id}`}
                  value={String(row.priorityScore)}
                  onChange={(e) => onUpdate(row.id, { priorityScore: Number(e.target.value) })}
                  className={inputCls}
                >
                  <option value="1">Laag</option>
                  <option value="2">Onder gemiddeld</option>
                  <option value="3">Gemiddeld</option>
                  <option value="4">Boven gemiddeld</option>
                  <option value="5">Hoog</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Geavanceerd (inklapbaar) ── */}
          <section>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="flex w-full items-center gap-2 border-t border-[var(--border-ed)] pt-4 text-left"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <span className="flex-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Geavanceerd</span>
              <ChevronDown className={`h-4 w-4 text-[var(--ink-4)] transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`d-limit-${row.id}`} className={labelCls}>Limiet-type</label>
                    <select
                      id={`d-limit-${row.id}`}
                      value={row.limitType}
                      onChange={(e) => onUpdate(row.id, { limitType: e.target.value as DraftBudget['limitType'] })}
                      className={inputCls}
                    >
                      <option value="soft">Zacht (waarschuwing)</option>
                      <option value="hard">Hard (blokkering)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`d-alert-${row.id}`} className={labelCls}>
                      Notificatiedrempel: {row.alertThreshold}%
                    </label>
                    <input
                      id={`d-alert-${row.id}`}
                      type="range" min="0" max="100"
                      value={row.alertThreshold}
                      onChange={(e) => onUpdate(row.id, { alertThreshold: parseInt(e.target.value) })}
                      className="mt-2 w-full accent-kern-500"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium text-[var(--ink-2)]">Inflatie-geïndexeerd</span>
                    <span className="block text-xs text-[var(--ink-3)]">Bedrag groeit mee met inflatie in prognoses</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.isInflationIndexed}
                    aria-label="Inflatie-geïndexeerd"
                    onClick={() => onUpdate(row.id, { isInflationIndexed: !row.isInflationIndexed })}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      row.isInflationIndexed ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${row.isInflationIndexed ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </label>

                {/* Escape-hatch: eigendom/delen + koppelen aan een bestaand
                    spaardoel — uitgebreid formulier, alleen voor opgeslagen
                    budgetten. */}
                {persisted && onEditAdvanced && (
                  <button
                    type="button"
                    onClick={() => onEditAdvanced(row.id)}
                    className="inline-flex items-center gap-1.5 text-xs text-wil-600 hover:text-wil-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Eigendom &amp; koppeling beheren (uitgebreid)
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Verwijderen */}
          <section className="border-t border-[var(--border-ed)] pt-4">
            <button
              type="button"
              onClick={() => onDelete(row.id)}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-xs font-medium text-[var(--ink-3)] hover:border-negative/40 hover:bg-negative/5 hover:text-negative"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Budget verwijderen
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
