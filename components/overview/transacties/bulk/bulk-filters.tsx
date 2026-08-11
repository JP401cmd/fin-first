'use client'

/**
 * BulkFilters — de zoekbalk, de filtervelden en de actieve-filter-chips van de
 * bulkbewerk-overlay (F2, F4).
 *
 * Presentatie-component: geen fetch, geen debounce, geen selectie-kennis. De
 * overlay houdt het criterium vast en beslist wanneer een wijziging "gecommit"
 * wordt — dat moment is óók het moment waarop de selectie vervalt (F10), en die
 * koppeling hoort bij de state-houder, niet bij een invoerveld.
 *
 * De zoekterm is bewust een APART veld van de rest: hij wordt in de overlay
 * gedebounced (300ms) terwijl een filterwissel direct commit. Vandaar
 * `qDraft`/`onQDraftChange` naast `criteria`/`onCriteriaChange`.
 *
 * ── Uitzondering: de twee bedragvelden zijn óók getypte tekst ───────────────
 * Een keuzelijst of datumprikker levert per interactie één afgeronde waarde;
 * een bedrag typ je teken voor teken. Waren die velden controlled op het
 * *getal* uit het criterium, dan herschrijft elke render de invoer: "12,50"
 * wordt bij de komma `Number("12.")` → `12`, en de volgende twee aanslagen
 * maken daar `1250` van. Een bedoelde ondergrens van € 12,50 selecteert dan
 * € 1.250 en hoger. Vandaar een lokale tekst-draft per veld, met dezelfde
 * 300ms-debounce als de zoekterm: één query per bedoeling, en dus ook maar één
 * keer selectie-verlies (F10) in plaats van vier.
 */

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { budgetOptionLabel, type BudgetSelectEntry } from '@/lib/budget-data'
import {
  SEARCH_TERM_MAX_LENGTH,
  type TransactionDirection,
  type TransactionSearchCriteria,
} from '@/lib/transactions/bulk-contract'
import { describeCriteria, hasAnyCriteria, type CriteriaLabelSources } from './criteria'

const FIELD_CLASS =
  'w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500'
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-[var(--ink-2)]'

export interface BulkFiltersProps {
  criteria: TransactionSearchCriteria
  onCriteriaChange: (next: TransactionSearchCriteria) => void
  /** Ongedebouncede zoektekst; de overlay commit 'm zelf naar `criteria.q`. */
  qDraft: string
  onQDraftChange: (value: string) => void
  accounts: readonly { id: string; name: string }[]
  budgetEntries: readonly BudgetSelectEntry[]
  labels: CriteriaLabelSources
  /** Aantal treffers, of `null` zolang de eerste zoekopdracht loopt. */
  total: number | null
  busy: boolean
}

/** `1.250` / `12.500` — een punt tussen groepjes van drie is een duizendtal. */
const GROUPED_THOUSANDS = /^\d{1,3}(\.\d{3})+$/

/**
 * Getypt bedrag → getal. Leeg (of onleesbaar) veld → `undefined`, zodat het
 * veld helemaal wegvalt uit het criterium i.p.v. als lege waarde mee te reizen.
 *
 * Nederlandse notatie: de komma is het decimaalteken. Een punt is alleen een
 * duizendtalscheiding wanneer hij dat aantoonbaar is — naast een komma
 * ("1.250,50") of in groepjes van drie ("1.250"). Een losse "12.50" blijft dus
 * gewoon 12,5 en wordt niet stilletjes 1250; dat stille verspringen is precies
 * de fout die dit veld eerder maakte.
 */
function num(value: string): number | undefined {
  const raw = value.trim()
  if (raw === '') return undefined
  const normalized =
    raw.includes(',') || GROUPED_THOUSANDS.test(raw)
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.abs(n) : undefined
}

/**
 * Ondergrens: 0 is géén grens.
 *
 * `buildSearchQuery` slaat een `amountMin <= 0` bewust over (er is geen bedrag
 * kleiner dan nul in absolute zin), maar `hasAnyCriteria`/`describeCriteria`
 * zouden er wél "Bedrag vanaf € 0" van maken. De filtercontext op de
 * bevestiging noemt dan een beperking die de zoekopdracht nooit heeft
 * toegepast — en dat is precies het soort regel waarop iemand een
 * onomkeerbare actie afvinkt.
 */
function lowerBound(value: string): number | undefined {
  const n = num(value)
  return n != null && n > 0 ? n : undefined
}

/** Getal → invoertekst. Nederlandse komma, geen duizendtalpunten (die zouden bij het teruglezen weer moeten worden weggehaald). */
function toDraft(value: number | undefined): string {
  return value == null ? '' : String(value).replace('.', ',')
}

export function BulkFilters({
  criteria,
  onCriteriaChange,
  qDraft,
  onQDraftChange,
  accounts,
  budgetEntries,
  labels,
  total,
  busy,
}: BulkFiltersProps) {
  const patch = (next: Partial<TransactionSearchCriteria>) => {
    onCriteriaChange({ ...criteria, ...next })
  }

  // ── De twee bedragvelden: tekst-draft + gedeelde debounce ─────────────────
  // Beide grenzen delen één timer. Twee losse timers zouden in dezelfde tick
  // kunnen aflopen en dan bouwt de tweede zijn criterium op een `criteria` van
  // vóór de eerste — waarmee de net gezette ondergrens weer verdwijnt.
  const [amountDraft, setAmountDraft] = useState(() => ({
    min: toDraft(criteria.amountMin),
    max: toDraft(criteria.amountMax),
  }))
  // Wat wíj het laatst gecommit hebben. Daarmee is een wijziging van búiten te
  // onderscheiden van ons eigen echo: alleen de eerste (bv. "Alles wissen")
  // mag de invoer overschrijven terwijl je typt.
  const [committed, setCommitted] = useState<{ min?: number; max?: number }>({
    min: criteria.amountMin,
    max: criteria.amountMax,
  })
  // Laatste props voor de debounce-callback, zonder ze tot dependency te maken
  // (dat zou de timer bij elke andere filterwissel opnieuw starten).
  const criteriaRef = useRef(criteria)
  const onCriteriaChangeRef = useRef(onCriteriaChange)
  useEffect(() => {
    criteriaRef.current = criteria
    onCriteriaChangeRef.current = onCriteriaChange
  })

  // Criterium van buiten gewijzigd → invoer meebewegen. Bewust tijdens render
  // (React's "adjusting state when a prop changes") in plaats van in een
  // effect: zo is er geen tussenrender waarin het veld nog de oude grens toont.
  if (criteria.amountMin !== committed.min || criteria.amountMax !== committed.max) {
    setCommitted({ min: criteria.amountMin, max: criteria.amountMax })
    setAmountDraft({ min: toDraft(criteria.amountMin), max: toDraft(criteria.amountMax) })
  }

  useEffect(() => {
    const min = lowerBound(amountDraft.min)
    const max = num(amountDraft.max)
    if (min === committed.min && max === committed.max) return
    const timer = setTimeout(() => {
      setCommitted({ min, max })
      onCriteriaChangeRef.current({ ...criteriaRef.current, amountMin: min, amountMax: max })
    }, 300)
    return () => clearTimeout(timer)
  }, [amountDraft, committed])

  const activeLines = describeCriteria(criteria, labels)
  const anyActive = hasAnyCriteria(criteria)

  const selectedAccount = criteria.accountIds?.[0] ?? ''
  const selectedBudget =
    criteria.budgetIds == null || criteria.budgetIds.length === 0
      ? ''
      : criteria.budgetIds[0] === null
        ? '__none__'
        : criteria.budgetIds[0]

  return (
    <div className="space-y-4">
      {/* ── Vrije tekst over de VOLLEDIGE historie ─────────────────────────── */}
      <div>
        <label htmlFor="bulk-q" className={LABEL_CLASS}>
          Zoek in je hele historie
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]"
            aria-hidden
          />
          <input
            id="bulk-q"
            type="search"
            value={qDraft}
            maxLength={SEARCH_TERM_MAX_LENGTH}
            onChange={(e) => onQDraftChange(e.target.value)}
            placeholder="bijv. Notaris, Albert Heijn, huur"
            className={`${FIELD_CLASS} pl-9`}
          />
        </div>
        <p className="mt-1.5 text-[11px] italic text-[var(--ink-3)]">
          Zoekt op omschrijving en tegenpartij — zonder datumvenster, dus ook jaren terug.
        </p>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bulk-from" className={LABEL_CLASS}>
            Vanaf
          </label>
          <input
            id="bulk-from"
            type="date"
            value={criteria.dateFrom ?? ''}
            onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor="bulk-to" className={LABEL_CLASS}>
            Tot en met
          </label>
          <input
            id="bulk-to"
            type="date"
            value={criteria.dateTo ?? ''}
            onChange={(e) => patch({ dateTo: e.target.value || undefined })}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="bulk-account" className={LABEL_CLASS}>
            Rekening
          </label>
          <select
            id="bulk-account"
            value={selectedAccount}
            onChange={(e) => patch({ accountIds: e.target.value ? [e.target.value] : undefined })}
            className={FIELD_CLASS}
          >
            <option value="">Alle rekeningen</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bulk-budget" className={LABEL_CLASS}>
            Budget
          </label>
          <select
            id="bulk-budget"
            value={selectedBudget}
            onChange={(e) => {
              const v = e.target.value
              patch({
                budgetIds: v === '' ? undefined : v === '__none__' ? [null] : [v],
              })
            }}
            className={FIELD_CLASS}
          >
            <option value="">Alle budgetten</option>
            <option value="__none__">Zonder budget</option>
            {budgetEntries.map((entry) =>
              entry.kind === 'group' ? (
                <optgroup key={entry.id} label={entry.label}>
                  {entry.options.map((child) => (
                    <option key={child.id} value={child.id}>
                      {budgetOptionLabel(child)}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={entry.id} value={entry.id}>
                  {budgetOptionLabel(entry)}
                </option>
              ),
            )}
          </select>
        </div>

        <div>
          <label htmlFor="bulk-direction" className={LABEL_CLASS}>
            Richting
          </label>
          <select
            id="bulk-direction"
            value={criteria.direction ?? ''}
            onChange={(e) =>
              patch({ direction: (e.target.value || undefined) as TransactionDirection | undefined })
            }
            className={FIELD_CLASS}
          >
            <option value="">In en uit</option>
            <option value="expense">Alleen uitgaven</option>
            <option value="income">Alleen inkomsten</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="bulk-min" className={LABEL_CLASS}>
              Bedrag vanaf
            </label>
            <input
              id="bulk-min"
              type="text"
              inputMode="decimal"
              value={amountDraft.min}
              onChange={(e) => setAmountDraft((d) => ({ ...d, min: e.target.value }))}
              placeholder="€ 0"
              className={`${FIELD_CLASS} font-mono tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="bulk-max" className={LABEL_CLASS}>
              tot
            </label>
            <input
              id="bulk-max"
              type="text"
              inputMode="decimal"
              value={amountDraft.max}
              onChange={(e) => setAmountDraft((d) => ({ ...d, max: e.target.value }))}
              placeholder="€ ∞"
              className={`${FIELD_CLASS} font-mono tabular-nums`}
            />
          </div>
        </div>
      </div>

      {/* ── Actieve filters + treffer-totaal ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-kern-700"
          data-testid="bulk-total"
        >
          {busy && total === null
            ? 'Zoeken…'
            : total === null
              ? '—'
              : `${new Intl.NumberFormat('nl-NL').format(total)} ${total === 1 ? 'resultaat' : 'resultaten'}`}
        </span>
        {activeLines.map((line) => (
          <span
            key={line}
            className="inline-flex items-center gap-1 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]"
          >
            {line}
          </span>
        ))}
        {anyActive && (
          <button
            type="button"
            onClick={() => {
              onQDraftChange('')
              onCriteriaChange({})
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            <X className="h-3 w-3" aria-hidden />
            Alles wissen
          </button>
        )}
      </div>
    </div>
  )
}
