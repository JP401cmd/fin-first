'use client'

/**
 * BulkResultaten — de selectie-teller, de resultatentabel en de paginatie van de
 * bulkbewerk-overlay (F3, F6–F11).
 *
 * Presentatie + interactie, géén state: de selectie-statemachine woont in
 * `selection-model.ts` en de overlay houdt 'm vast. Dit component vertaalt
 * alleen naar DOM — en dat is precies de laag waar de bekende fout ontstaat, dus
 * drie dingen liggen hier vast:
 *
 * 1. De **kopcheckbox** krijgt zijn stand uit `headerState(sel, pageIds)`, en
 *    `pageIds` bevat per definitie alleen de zichtbare rijen. Er is geen pad
 *    waarlangs de kop iets buiten de pagina kan aanraken.
 * 2. De **"alle N"-affordance** is een aparte `<button>` met het getal in de
 *    tekst — nooit een stand van de kopcheckbox.
 * 3. **Rij-eigen acties** zijn uitgeschakeld zodra er iets geselecteerd is
 *    (F11): twee concurrerende klikdoelen op dezelfde rij is precies hoe je per
 *    ongeluk één transactie opent terwijl je er veertig wilde verwijderen.
 * 4. **Selecteren kan niet tijdens het laden.** Zolang een nieuwe zoekopdracht
 *    loopt staan de vorige rijen nog op het scherm terwijl de filtercontext al
 *    het nieuwe criterium toont. Wie in dat venster aanvinkt, selecteert oude
 *    rijen die de bevestiging straks toeschrijft aan een filter waarbinnen ze
 *    nooit gekozen zijn. Kop, rij én "alle N" zijn daarom `disabled` tijdens
 *    `loading` — dezelfde regel die de paginatieknoppen al volgden.
 */

import { useRef } from 'react'
import { GitFork, Landmark, Pencil } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatDateShort } from '@/lib/format'
import { SELECTION_MAX, type TransactionSearchRow } from '@/lib/transactions/bulk-contract'
import {
  headerState,
  isRowSelected,
  shouldOfferSelectAll,
  type BulkSelection,
} from './selection-model'

const nlNumber = new Intl.NumberFormat('nl-NL')

export interface BulkResultatenProps {
  rows: readonly TransactionSearchRow[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  error: string | null
  selection: BulkSelection
  selectedCount: number
  /** Melding waarom de selectie verviel (F10). Leeg = niets te melden. */
  selectionNotice: string | null
  budgetName: (id: string) => string | undefined
  accountName: (id: string) => string | undefined
  onToggleRow: (id: string, withShift: boolean) => void
  onTogglePage: () => void
  onSelectAllMatching: () => void
  onClearSelection: () => void
  onPageChange: (page: number) => void
  /** Rij openen om te bewerken; uitgeschakeld zolang er een selectie is (F11). */
  onOpenRow?: (id: string) => void
  /** Loopt het materialiseren van "alle N"? */
  manifestBusy: boolean
}

/** Checkbox met drie standen. `indeterminate` bestaat alleen als DOM-property. */
function TriStateCheckbox({
  state,
  onChange,
  label,
  disabled,
}: {
  state: 'empty' | 'indeterminate' | 'full'
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state === 'full'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'indeterminate'
      }}
      onChange={onChange}
      disabled={disabled}
      className="h-4 w-4 cursor-pointer accent-kern-600 disabled:cursor-not-allowed disabled:opacity-50"
    />
  )
}

export function BulkResultaten({
  rows,
  total,
  page,
  pageSize,
  loading,
  error,
  selection,
  selectedCount,
  selectionNotice,
  budgetName,
  accountName,
  onToggleRow,
  onTogglePage,
  onSelectAllMatching,
  onClearSelection,
  onPageChange,
  onOpenRow,
  manifestBusy,
}: BulkResultatenProps) {
  // Shift-state van de laatste aanwijzer-/toetsaanslag. `mousedown` en `keydown`
  // gaan betrouwbaar vóór de change van een checkbox; `onChange` zelf draagt
  // geen modifier-informatie.
  //
  // De vlag wordt na élke change weer op `false` gezet. Zonder die reset houdt
  // hij de stand van de laatste aanslag vast, en een `change` die zónder
  // voorafgaand pointer-/toetsevent binnenkomt (assistieve technologie, een
  // programmatische klik) zou dan stilzwijgend een bereik selecteren in plaats
  // van één rij. Geen modifier waargenomen = geen shift.
  const shiftRef = useRef(false)
  const { masked } = useMaskedAmounts()

  const pageIds = rows.map((r) => r.id)
  const head = headerState(selection, pageIds)
  const offerAll = shouldOfferSelectAll(selection, pageIds, total)
  const tooLarge = total > SELECTION_MAX
  const hasSelection = selectedCount > 0
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))

  return (
    <div className="space-y-3">
      {/* ── Selectie-teller ────────────────────────────────────────────────
          Altijd gemount, ook bij een lege selectie: een `role="status"` die
          verschijnt en verdwijnt kondigt zijn eerste inhoud niet betrouwbaar
          aan. Nu leest de screenreader elke wijziging voor — inclusief het
          vervallen van de selectie na een filterwissel. */}
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border-ed)] pb-2"
      >
        <span className="font-mono text-[11px] tabular-nums uppercase tracking-[0.14em] text-[var(--ink-2)]">
          {hasSelection
            ? `${nlNumber.format(selectedCount)} geselecteerd`
            : 'Niets geselecteerd'}
        </span>
        {hasSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-[11px] font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            Selectie wissen
          </button>
        )}
        {selectionNotice && (
          <span className="text-[11px] italic text-[var(--ink-3)]">{selectionNotice}</span>
        )}
      </div>

      {/* ── "Alle N" — apart, met het getal in de tekst, nooit de standaard ── */}
      {offerAll && (
        <div className="border-l-[3px] border-kern-500 bg-kern-50/40 px-3 py-2">
          {tooLarge ? (
            <p className="text-[12px] text-[var(--ink-2)]">
              Alle {nlNumber.format(total)} treffers selecteren kan niet in één keer — de grens ligt
              op {nlNumber.format(SELECTION_MAX)} transacties per actie. Verfijn je filter zodat de
              actie overzichtelijk blijft.
            </p>
          ) : (
            <button
              type="button"
              onClick={onSelectAllMatching}
              disabled={manifestBusy || loading}
              className="text-[12px] font-medium text-kern-700 underline underline-offset-2 hover:text-kern-800 disabled:opacity-50"
            >
              {manifestBusy
                ? 'Selectie wordt vastgezet…'
                : `Selecteer alle ${nlNumber.format(total)} gevonden transacties`}
            </button>
          )}
        </div>
      )}
      {/* Het getal komt uit `selectedCount` — dezelfde bron als de teller
          hierboven en als de bevestigingen (het manifest, zodra dat er is).
          Zou hier het zoek-`total` staan, dan noemt de app twee getallen voor
          één selectie op het moment dat ze uiteenlopen: de zoekopdracht is
          geteld ná de materialisatie, het manifest is bevroren (ADR 0104). */}
      {selection.allMatching && (
        <div className="border-l-[3px] border-kern-500 bg-kern-50/40 px-3 py-2 text-[12px] text-[var(--ink-2)]">
          Alle {nlNumber.format(selectedCount)} gevonden transacties staan geselecteerd — ook die op
          andere pagina&apos;s.
        </div>
      )}

      {/* ── Resultaten ─────────────────────────────────────────────────────── */}
      {error ? (
        <p role="alert" className="py-6 text-sm text-negative">
          {error}
        </p>
      ) : loading && rows.length === 0 ? (
        <div className="space-y-2 py-2" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 animate-pulse bg-[var(--subtle)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="border-y border-[var(--border-ed)] py-8 text-center">
          <p className="font-serif text-sm italic text-[var(--ink-2)]">
            Geen transactie gevonden die hierop past.
          </p>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">
            Probeer een kortere zoekterm of zet een filter uit.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)]">
                <th scope="col" className="w-8 py-2 pr-2 text-left align-middle">
                  <TriStateCheckbox
                    state={head}
                    onChange={onTogglePage}
                    disabled={loading}
                    label={`Selecteer de ${rows.length} transacties op deze pagina`}
                  />
                </th>
                <th
                  scope="col"
                  className="py-2 pr-2 text-left text-[10px] font-normal uppercase tracking-[0.08em] text-[var(--ink-4)]"
                >
                  Transactie
                </th>
                <th
                  scope="col"
                  className="py-2 pl-2 text-right text-[10px] font-normal uppercase tracking-[0.08em] text-[var(--ink-4)]"
                >
                  Bedrag
                </th>
                {onOpenRow && <th scope="col" className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = isRowSelected(selection, row.id)
                const budget = row.budget_id ? budgetName(row.budget_id) : undefined
                const account = accountName(row.account_id)
                const meta = [
                  row.counterparty_name && row.counterparty_name !== row.description
                    ? row.counterparty_name
                    : null,
                  budget ?? 'Zonder budget',
                  account,
                ]
                  .filter(Boolean)
                  .join(' · ')

                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[var(--border-ed)] ${
                      selected ? 'bg-kern-50/50' : 'hover:bg-[var(--subtle)]'
                    }`}
                  >
                    <td className="py-2 pr-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={loading}
                        aria-label={`Selecteer ${row.description || 'transactie'} van ${formatDateShort(row.date)}`}
                        onMouseDown={(e) => {
                          shiftRef.current = e.shiftKey
                        }}
                        onKeyDown={(e) => {
                          shiftRef.current = e.shiftKey
                        }}
                        onChange={() => {
                          const withShift = shiftRef.current
                          shiftRef.current = false
                          onToggleRow(row.id, withShift)
                        }}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-kern-600 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <span className="flex items-baseline gap-2">
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                          {formatDateShort(row.date)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[var(--ink)]">
                              {row.description || 'Zonder omschrijving'}
                            </span>
                            {row.is_split && (
                              <GitFork
                                className="h-3 w-3 shrink-0 text-[var(--ink-4)]"
                                aria-label="Gesplitste transactie"
                              />
                            )}
                            {row.is_bank_linked && (
                              <Landmark
                                className="h-3 w-3 shrink-0 text-[var(--ink-4)]"
                                aria-label="Van een gekoppelde bankrekening"
                              />
                            )}
                          </span>
                          {meta && (
                            <span className="block truncate text-[11px] text-[var(--ink-3)]">
                              {meta}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pl-2 text-right align-top">
                      {/* Onder bedragmaskering (ADR 0091) vervalt óók de
                          tekenkleur: rood/groen naast een bolletjesrij verraadt
                          de richting van de boeking terwijl het bedrag
                          verborgen is. Gemaskeerd valt de rij terug op de
                          module-tint, net als elders in de app. */}
                      <MaskedAmount
                        value={row.amount}
                        tone={masked ? 'module' : 'inherit'}
                        className={
                          masked ? '' : row.amount < 0 ? 'text-negative' : 'text-positive'
                        }
                      />
                    </td>
                    {onOpenRow && (
                      <td className="py-2 pl-1 align-top">
                        <button
                          type="button"
                          onClick={() => onOpenRow(row.id)}
                          disabled={hasSelection}
                          title={
                            hasSelection
                              ? 'Wis eerst je selectie om één transactie te bewerken'
                              : 'Bewerk deze transactie'
                          }
                          aria-label={`Bewerk ${row.description || 'transactie'}`}
                          className="inline-flex h-7 w-7 items-center justify-center border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Paginatie ──────────────────────────────────────────────────────── */}
      {total > pageSize && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || loading}
            className="min-h-9 border border-[var(--border-ed)] px-3 text-[12px] font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-40"
          >
            Vorige
          </button>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
            Pagina {nlNumber.format(page)} van {nlNumber.format(lastPage)}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= lastPage || loading}
            className="min-h-9 border border-[var(--border-ed)] px-3 text-[12px] font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-40"
          >
            Volgende
          </button>
        </div>
      )}
    </div>
  )
}
