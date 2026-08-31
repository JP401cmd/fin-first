'use client'
import { memo, useEffect, useMemo, useState } from 'react'
import { Repeat, CreditCard, RefreshCw, Smartphone, ArrowLeftRight, ArrowDownLeft, Landmark, Search, SlidersHorizontal, X } from 'lucide-react'
import { AccountSourceIcon, accountSourceSuffix } from '@/components/core/account-source-icon'
import type { BankLinkState } from '@/lib/bank-connection-status'
import {
  cleanMerchantName, deriveType, parseLocationTime,
  dayFreedomLabel, detectRecurring, groupByDay, monogram, parseSmartQuery, type TxKind,
} from '@/lib/transaction-display'
import { useDailyExpenseRate } from '@/components/app/freedom-time-label'
import { formatCurrencyDecimals, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

// Editorial iconen (Lucide, scherp, gedempt) — GEEN emoji. Type uit deriveType().kind.
const TYPE_ICON: Record<TxKind, typeof CreditCard | null> = {
  pin: CreditCard, incasso: RefreshCw, ideal: Smartphone, overboeking: ArrowLeftRight,
  bijschrijving: ArrowDownLeft, betaalverzoek: ArrowLeftRight, bankkosten: Landmark, onbekend: null,
}

export type AccountOption = {
  id: string
  name: string
  bankName: string | null
  ibanTail: string | null
  connected: boolean
  /**
   * De archief-rekening: de verzamelplek voor boekingen van verwijderde
   * rekeningen (ADR 0082). Mag hier WÉL als filter verschijnen — anders is er
   * geen enkele plek waar je je bewaarde boekingen terugziet — maar NOOIT als
   * doel om een nieuwe transactie op te boeken. Die scheiding maakt
   * `transacties-analyse.tsx` met `bookableAccounts`.
   */
  isArchive?: boolean
}
type Direction = 'all' | 'expense' | 'income'
type SortKey = 'date' | 'amount' | 'merchant'

interface Props {
  transactions: AnalysisTransaction[]
  accounts: AccountOption[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  onSelect?: (tx: AnalysisTransaction) => void
}

const WD = ['ma','di','wo','do','vr','za','zo']
const MO = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
function dayHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return `${WD[dow]} ${d} ${MO[m - 1]}`
}

// nl-NL bedrag-formatter voor de FX-subregel (vreemde valuta, geen euro-glyph).
const FX_FMT = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Begrens het aantal gerenderde rijen. Jaarweergave kan honderden transacties
// bevatten; een grote feed-DOM maakt de bottom-sheet open/close-reflow (scroll-lock
// + focus-trap) onevenredig duur. Pagineren houdt de DOM klein. "Toon meer" verhoogt.
const ROW_PAGE = 50

export function TransactieTijdlijn({ transactions, accounts, selectedAccountId, onSelectAccount, onSelect }: Props) {
  const { masked } = useMaskedAmounts()

  // ── Filter-state ───────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState<Direction>('all')
  const [onlyRecurring, setOnlyRecurring] = useState(false)
  const [onlyTransfers, setOnlyTransfers] = useState(false)
  const [amountMin, setAmountMin] = useState<number | null>(null)
  const [amountMax, setAmountMax] = useState<number | null>(null)
  const [sort, setSort] = useState<SortKey>('date')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(ROW_PAGE)

  // Slimme zoekopdracht — alléén tekst/bedrag/richting, GEEN datum-facetten
  // (de PeriodeSelector bovenaan de pagina is de enige tijdsbron).
  const smart = useMemo(() => parseSmartQuery(query, new Date()), [query])

  // Dagtarief voor de vrijheidsdagen in de dagkop = het CANONIEKE 12-mnd rolling
  // €/dag uit de gedeelde client-bron (`DailyExpenseProvider` →
  // /api/daily-expense-rate → lib/expense-rate.ts), exact het tarief dat de
  // check-in, de badges en de bulk-actiebalk lezen.
  //
  // Hier stond tot M22 een eigen `avgDailyExpense(transactions, windowDays)`: de
  // uitgaven van het ZICHTBARE venster gedeeld door de vensterlengte. Dat maakte
  // de wisselkoers "€ → tijd" afhankelijk van de periodekeuze en de filters —
  // € 2.500 las hier als 6000,0 vrijheidsdagen en op de check-in als 6083. Een
  // dagtarief is geen eigenschap van de lijst die je toevallig open hebt staan.
  //
  // Zolang het tarief niet bekend is (fetch loopt nog, of geen transactiebasis)
  // is er 0 en laat `dayFreedomLabel` de tijdregel weg — liever geen tijdclaim
  // dan een verzonnen tijdclaim; zelfde degradatie als `bulk/bulk-impact.tsx`.
  const { dailyExpenseRate, loading: tariefLoading, source: tariefSource } = useDailyExpenseRate()
  const daily = tariefLoading || tariefSource === 'none' ? 0 : dailyExpenseRate

  // Terugkerend-detectie blijft op de VOLLEDIGE window (niet op de filterselectie).
  const recurring = useMemo(
    () => detectRecurring(transactions.map((t) => ({ id: t.id, counterparty_name: t.counterparty_name, counterparty_iban: t.counterparty_iban, creditor_id: t.creditor_id, amount: t.amount, date: t.date }))),
    [transactions],
  )

  // Effectieve filters: expliciete chip/slider wint van de slimme-zoek-afgeleide.
  const effDirection: Exclude<Direction, 'all'> | null =
    direction !== 'all' ? direction : smart.direction
  const effMin = amountMin ?? smart.amountMin
  const effMax = amountMax ?? smart.amountMax
  const text = smart.text.toLowerCase()

  const filtered = useMemo(() => {
    const out = transactions.filter((t) => {
      if (effDirection === 'expense' && t.amount >= 0) return false
      if (effDirection === 'income' && t.amount <= 0) return false
      if (onlyRecurring && !recurring.has(t.id)) return false
      if (onlyTransfers) {
        const isTransfer = t.transaction_type === 'transfer' || deriveType(t.bank_code, t.counterparty_name, t.amount).kind === 'betaalverzoek'
        if (!isTransfer) return false
      }
      const abs = Math.abs(t.amount)
      if (effMin != null && abs < effMin) return false
      if (effMax != null && abs > effMax) return false
      if (text) {
        const clean = cleanMerchantName(t.counterparty_name).toLowerCase()
        const desc = (t.description ?? '').toLowerCase()
        const raw = (t.counterparty_name ?? '').toLowerCase()
        if (!clean.includes(text) && !desc.includes(text) && !raw.includes(text)) return false
      }
      return true
    })
    return out
  }, [transactions, effDirection, onlyRecurring, onlyTransfers, effMin, effMax, text, recurring])

  // Groepeer de gefilterde set per dag; sorteer dan per dag-groep op de keuze.
  const groups = useMemo(() => {
    const g = groupByDay(filtered)
    if (sort === 'amount') {
      for (const day of g) day.rows = [...day.rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    } else if (sort === 'merchant') {
      for (const day of g) day.rows = [...day.rows].sort((a, b) =>
        cleanMerchantName(a.counterparty_name).localeCompare(cleanMerchantName(b.counterparty_name), 'nl'))
    }
    return g
  }, [filtered, sort])

  // Reset de paginatie wanneer de gefilterde set wijzigt (periode/filter/zoek).
  useEffect(() => { setVisibleCount(ROW_PAGE) }, [filtered])

  // Begrens tot `visibleCount` rijen over de dag-groepen heen — houdt de DOM klein
  // (en daarmee de open/close-reflow van de bottom-sheet goedkoop).
  const cappedGroups = useMemo(() => {
    let budget = visibleCount
    const out: typeof groups = []
    for (const g of groups) {
      if (budget <= 0) break
      if (g.rows.length <= budget) {
        out.push(g)
        budget -= g.rows.length
      } else {
        out.push({ ...g, rows: g.rows.slice(0, budget) })
        budget = 0
      }
    }
    return out
  }, [groups, visibleCount])

  const filterActive =
    direction !== 'all' || onlyRecurring || onlyTransfers || amountMin != null || amountMax != null ||
    sort !== 'date' || query.trim() !== ''

  function clearAll() {
    setQuery('')
    setDirection('all')
    setOnlyRecurring(false)
    setOnlyTransfers(false)
    setAmountMin(null)
    setAmountMax(null)
    setSort('date')
  }

  return (
    <section className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      {accounts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1 text-xs" role="group" aria-label="Kies rekening">
          <AccountButton active={selectedAccountId === null} label="Alle rekeningen" onClick={() => onSelectAccount(null)} />
          {accounts.map((a) => (
            /* De chips kennen maar twee toestanden: `AccountOption.connected`
               komt uit de bestaande leesronde van transacties-analyse.tsx en zegt
               niets over de gezondheid van de koppeling. Hier bewust GEEN derde
               toestand bijverzinnen en geen extra fetch openen — de
               verbroken-toestand leeft op de rekeningkaart (cashflow), die de
               server-loader wél meekrijgt. */
            <AccountButton key={a.id} active={selectedAccountId === a.id}
              state={a.connected ? 'linked' : 'manual'}
              label={a.name} onClick={() => onSelectAccount(a.id)} />
          ))}
        </div>
      )}

      {/* Slimme zoekbalk */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Zoek transacties"
          placeholder='Zoek of typ "hornbach boven 50"…'
          className="min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] pl-9 pr-3 py-2 font-mono text-[13px] italic text-[var(--ink)] placeholder:italic placeholder:text-[var(--ink-3)] focus:outline-2 focus:outline-[var(--ink)]"
        />
      </div>

      {/* Quick-chips */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <Chip label="Alles" active={direction === 'all'} onClick={() => setDirection('all')} />
        <Chip label="Uitgaven" active={direction === 'expense'} onClick={() => setDirection('expense')} />
        <Chip label="Inkomsten" active={direction === 'income'} onClick={() => setDirection('income')} />
        <Chip label="Terugkerend" active={onlyRecurring} onClick={() => setOnlyRecurring((v) => !v)} toggle />
        <Chip label="Overboekingen" active={onlyTransfers} onClick={() => setOnlyTransfers((v) => !v)} toggle />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)] border border-[var(--border-ed)] hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
        >
          <SlidersHorizontal className="h-3 w-3" aria-hidden />
          Filters
        </button>
      </div>

      {/* Actieve-filter-chips + wissen */}
      {filterActive && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {query.trim() !== '' && <ActiveChip label={`"${query.trim()}"`} onRemove={() => setQuery('')} />}
          {direction === 'expense' && <ActiveChip label="Uitgaven" onRemove={() => setDirection('all')} />}
          {direction === 'income' && <ActiveChip label="Inkomsten" onRemove={() => setDirection('all')} />}
          {onlyRecurring && <ActiveChip label="Terugkerend" onRemove={() => setOnlyRecurring(false)} />}
          {onlyTransfers && <ActiveChip label="Overboekingen" onRemove={() => setOnlyTransfers(false)} />}
          {amountMin != null && <ActiveChip label={`≥ ${FX_FMT.format(amountMin)}`} onRemove={() => setAmountMin(null)} />}
          {amountMax != null && <ActiveChip label={`≤ ${FX_FMT.format(amountMax)}`} onRemove={() => setAmountMax(null)} />}
          {sort !== 'date' && <ActiveChip label={sort === 'amount' ? 'Sortering: bedrag' : 'Sortering: winkel'} onRemove={() => setSort('date')} />}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 min-h-[44px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] underline hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
          >
            Alles wissen
          </button>
        </div>
      )}

      {transactions.length === 0 ? (
        <FirstUseEmpty />
      ) : filtered.length === 0 ? (
        <NoResultsEmpty onClear={clearAll} />
      ) : (
        <div role="list" className="space-y-4">
          {cappedGroups.map((g) => {
            // Eén grondslag voor béide cijfers in de kop (M20): het euro-bedrag en de
            // vrijheidsdagen lezen allebei dit netto dagbedrag. Vroeger stond hier het
            // netto bedrag naast dagen uit `expenseTotal` — twee definities in één regel.
            const net = g.incomeTotal - g.expenseTotal
            const freedom = dayFreedomLabel(net, daily, masked)
            return (
              <div key={g.date}>
                <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]" aria-label={dayHeader(g.date)}>{dayHeader(g.date)}</span>
                  <span className="font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
                    {net >= 0 ? '+' : '−'} {masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrencyDecimals(Math.abs(net))}
                    {freedom && <span className="text-[var(--color-kern-700)]"> · {freedom}</span>}
                  </span>
                </div>
                <ul className="divide-y divide-dotted divide-[var(--border-ed)]">
                  {g.rows.map((t) => <Row key={t.id} t={t} recurring={recurring.has(t.id)} onSelect={onSelect} masked={masked} />)}
                </ul>
              </div>
            )
          })}
          {filtered.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + ROW_PAGE)}
              className="mt-1 min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)] hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
            >
              Toon meer · {filtered.length - visibleCount} resterend
            </button>
          )}
        </div>
      )}

      {/* Filters bottom-sheet */}
      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" size="sm">
        <div className="space-y-5 px-5 py-4">
          <fieldset>
            <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Bedrag</legend>
            <div className="flex items-center gap-2">
              <input
                type="number" inputMode="decimal" min={0} value={amountMin ?? ''}
                onChange={(e) => setAmountMin(e.target.value === '' ? null : Number(e.target.value))}
                aria-label="Minimumbedrag" placeholder="min"
                className="min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-[13px] text-[var(--ink)] tabular-nums focus:outline-2 focus:outline-[var(--ink)]"
              />
              <span className="font-mono text-[11px] text-[var(--ink-3)]">tot</span>
              <input
                type="number" inputMode="decimal" min={0} value={amountMax ?? ''}
                onChange={(e) => setAmountMax(e.target.value === '' ? null : Number(e.target.value))}
                aria-label="Maximumbedrag" placeholder="max"
                className="min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-[13px] text-[var(--ink)] tabular-nums focus:outline-2 focus:outline-[var(--ink)]"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Sorteren</legend>
            <div className="flex flex-wrap gap-1">
              <Chip label="Datum" active={sort === 'date'} onClick={() => setSort('date')} />
              <Chip label="Bedrag" active={sort === 'amount'} onClick={() => setSort('amount')} />
              <Chip label="Winkel" active={sort === 'merchant'} onClick={() => setSort('merchant')} />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Alleen</legend>
            <Chip label="Terugkerend" active={onlyRecurring} onClick={() => setOnlyRecurring((v) => !v)} toggle />
          </fieldset>

          <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-4">
            <span className="font-mono text-[11px] text-[var(--ink-3)] tabular-nums">{filtered.length} resultaten</span>
            <button
              type="button"
              onClick={clearAll}
              className="min-h-[44px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)] border border-[var(--border-ed)] hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
            >
              Alles wissen
            </button>
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}

function Chip({ label, active, onClick, toggle }: { label: string; active: boolean; onClick: () => void; toggle?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={['inline-flex items-center min-h-[44px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] border focus-visible:outline-2 focus-visible:outline-[var(--ink)]',
        active
          ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
          : `bg-[var(--paper)] ${toggle ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'} border-[var(--border-ed)] hover:bg-[var(--subtle)]`].join(' ')}
    >
      {label}
    </button>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 border border-[var(--border-ed)] bg-[var(--subtle)] pl-2 pr-1 py-0.5 font-mono text-[10px] text-[var(--ink-2)]">
      <span className="tabular-nums">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Verwijder filter ${label}`}
        className="inline-flex h-5 w-5 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )
}

function FirstUseEmpty() {
  // Bewust géén eigen CTA-knop: de KoppelRekeningBanner bovenaan de pagina
  // (/overzicht/cashflow/transacties) toont al de canonieke acties
  // "Bank koppelen" (/core/cash/connect) en "Importeer" (/core/cash/import).
  // Een tweede knop hier was redundant én linkte naar een omweg-pagina.
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <h3 className="font-serif text-[18px] font-semibold text-[var(--ink)]">Nog geen transacties.</h3>
      <p className="max-w-xs font-serif text-[13px] italic text-[var(--ink-3)]">
        Koppel je bank of importeer een bestand om je geldstroom als opgeslagen tijd te zien.
      </p>
    </div>
  )
}

function NoResultsEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <h3 className="font-serif text-[18px] font-semibold text-[var(--ink)]">Geen resultaten.</h3>
      <p className="max-w-xs font-serif text-[13px] italic text-[var(--ink-3)]">
        Geen transacties passen bij deze filters in deze periode.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 min-h-[44px] inline-flex items-center px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)] border border-[var(--border-ed)] hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
      >
        Wis filters
      </button>
    </div>
  )
}

function AccountButton({ active, label, onClick, state }: { active: boolean; label: string; onClick: () => void; state?: BankLinkState }) {
  /* TXN-4 — een rekeningnaam als "Betaalrekening gezamenlijk ABN AMRO" duwde de
     chip-rij uit elkaar en maakte er op mobiel één regel per rekening van. De
     naam wordt daarom VISUEEL afgekapt (CSS-ellipsis): de volledige tekst blijft
     in de DOM staan, dus de accessible name en de voorlezer houden 'm compleet,
     en de hover-titel spelt 'm uit voor muisgebruikers.
     "Alle rekeningen" is een vaste, korte tekst — die krijgt geen titel (een
     tooltip die de zichtbare tekst herhaalt is ruis) en geen afkapping. */
  const isAccount = state !== undefined
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      /* Het symbool is `aria-hidden` (het zou als geneste naam nooit voorgelezen
         worden), dus de herkomst hoort IN deze naam — anders is de toestand die
         om een handeling vraagt voor AT-gebruikers volledig afwezig. Zichtbaar
         label vóóraan, zodat de accessible name de zichtbare tekst niet
         tegenspreekt. */
      aria-label={state === undefined ? undefined : `${label} — ${accountSourceSuffix(state)}`}
      className={['inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] border',
        active ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]' : 'bg-[var(--paper)] text-[var(--ink-3)] border-[var(--border-ed)]'].join(' ')}>
      {/* Herkomst-symbool: gedeeld met de rekening-kaarten op /overzicht/cashflow.
          `inheritColor` ALLEEN op de actieve pill: die staat op `--ink` met
          `--paper`-tekst, waar een vaste inkt-toon wegvalt. Onvoorwaardelijk erven
          gooide op élke inactieve pill de tint weg, en dan moet een 12px `Unlink`
          het alleen van een 12px `Link2` winnen.
          Anders dan de kaarten tonen de chips ook "handmatig" — bestaand gedrag,
          bewust behouden (B4 raakt alleen de kaarten). */}
      {state !== undefined && <AccountSourceIcon state={state} inheritColor={active} />}
      {isAccount ? (
        <span title={label} className="max-w-[9rem] truncate sm:max-w-[13rem]">
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  )
}

// React.memo: rijen her-renderen niet bij parent-re-renders (bv. het openen/sluiten
// van het bewerk-paneel via `editTx`-state). Props zijn stabiel (t-ref, boolean,
// stabiele onSelect-callback), dus de shallow-compare slaat de re-render over.
const Row = memo(function Row({ t, recurring, onSelect, masked }: { t: AnalysisTransaction; recurring: boolean; onSelect?: (tx: AnalysisTransaction) => void; masked: boolean }) {
  const name = cleanMerchantName(t.counterparty_name)
  const type = deriveType(t.bank_code, t.counterparty_name, t.amount)
  const TypeIcon = TYPE_ICON[type.kind]
  const loc = parseLocationTime(t.description)
  const sub = loc.place ? `${loc.place}${loc.time ? ` · ${loc.time}` : ''}` : t.description
  const income = t.amount > 0
  const content = (
    <>
      <span className="flex-none w-[33px] h-[33px] bg-[var(--color-kern-50)] border border-[var(--border-ed)] flex items-center justify-center font-mono text-[11px] text-[var(--color-kern-700)]" aria-hidden>
        {monogram(name)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-serif font-semibold text-[14.5px] text-[var(--ink)] truncate">{name}</span>
          {TypeIcon && <TypeIcon className="h-3 w-3 flex-none text-[var(--ink-3)]" aria-label={type.label} />}
          {recurring && <Repeat className="h-3 w-3 flex-none text-[var(--color-kern-700)]" aria-label="terugkerend" />}
        </span>
        <span className="block text-[11px] italic text-[var(--ink-3)] truncate">{sub}</span>
      </span>
      <span className="flex-none text-right">
        <span className={['block font-mono text-[14px] tabular-nums', income ? 'text-[var(--positive)]' : 'text-[var(--ink)]'].join(' ')}>
          {income ? '+' : '−'} {masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrencyDecimals(Math.abs(t.amount))}
        </span>
        {t.running_balance != null && (
          <span className="block font-mono text-[10px] text-[var(--ink-4)] tabular-nums">saldo {masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrencyDecimals(t.running_balance)}</span>
        )}
        {t.fx_amount != null && t.fx_currency && (
          <span className="block font-mono text-[9px] text-[var(--ink-4)] tabular-nums">{t.fx_currency} {FX_FMT.format(t.fx_amount)}{t.fx_rate ? ` @ ${FX_FMT.format(t.fx_rate)}` : ''}</span>
        )}
      </span>
    </>
  )
  if (onSelect) {
    return (
      <li>
        <button type="button" onClick={() => onSelect(t)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-[var(--subtle)] focus:outline-2 focus:outline-[var(--ink)]">
          {content}
        </button>
      </li>
    )
  }
  return <li className="flex items-center gap-3 py-2.5">{content}</li>
})
