'use client'

// crypto-spread-section.tsx — per coin: op welke bronnen staat hij verdeeld?
//
// Aanvulling op `crypto-source-breakdown` (totalen per bron over het hele
// portfolio). Deze sectie groepeert eerst op symbol en toont per coin een
// stacked-bar met de bron-verdeling. Doel: exchange-lock-in zichtbaar maken.
// BTC alleen op Bitvavo? Dan is dat een single-point-of-failure. BTC op
// Bitvavo + eigen wallet + Kraken? Dan is het risico verdeeld.
//
// Krant-esthetiek:
//   - Scherpe hoeken, 1px ink-borders
//   - DM Mono tabular-nums voor units en bedragen
//   - Source-kleuren consistent met `holding-source-badge.tsx`:
//     exchange = kern-700 (donkerste, want "platformrisico")
//     wallet   = kern-500 (zelf-custodie, neutraal)
//     manual   = kern-300 (lichtste, want geen levende koppeling)
//   - Filter-toggle als segmented control (twee scherpe pills)
//   - Klikbare bron-segmenten + bron-rijen → holding-detail-page

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plug, Wallet, Pencil, ChevronDown } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { CryptoSpreadEntry } from '@/lib/crypto-holdings-data'

interface CryptoSpreadSectionProps {
  spread: CryptoSpreadEntry[]
}

type FilterMode = 'spread-only' | 'all'

// Source-kind → tailwind background class voor de stacked-bar segmenten.
// Bewust harde kern-tinten: ze blijven binnen de Kern-module (bezittingen)
// en geven onderling genoeg contrast (700 / 500 / 300) om in een 1D-bar
// drie soorten te onderscheiden zonder een tweede kleur-as in te voeren.
const SEGMENT_BG: Record<'exchange' | 'wallet' | 'manual', string> = {
  exchange: 'bg-kern-700',
  wallet: 'bg-kern-500',
  manual: 'bg-kern-300',
}

// Tekst-kleur op de bron-rij — past bij segment-tint maar leesbaar als label.
const SEGMENT_LABEL_INK: Record<'exchange' | 'wallet' | 'manual', string> = {
  exchange: 'text-kern-700',
  wallet: 'text-kern-600',
  manual: 'text-[var(--ink-3)]',
}

export function CryptoSpreadSection({ spread }: CryptoSpreadSectionProps) {
  const router = useRouter()
  // Default: alleen gespreide coins. Voor de typische portefeuille (alles op
  // één exchange) is dit een lege state — die nudge zet de gebruiker aan tot
  // het toevoegen van een tweede bron, wat het hele punt van de sectie is.
  const [filter, setFilter] = useState<FilterMode>('spread-only')
  // Sectie standaard ingeklapt: spreiding is een verdiepingsslag, niet de
  // primaire scan-info op de Holdings-pagina.
  const [expanded, setExpanded] = useState(false)

  // Geen crypto-posities? Helemaal geen sectie tonen — de items-tab heeft
  // dan al een eigen empty-state, en dit zou alleen ruis toevoegen.
  if (spread.length === 0) return null

  const spreadCount = spread.filter((e) => e.sourceCount > 1).length
  const filtered = filter === 'spread-only'
    ? spread.filter((e) => e.sourceCount > 1)
    : spread

  const bodyId = 'crypto-spread-section-body'

  return (
    <section className="space-y-4">
      <SpreadHeader
        spreadCount={spreadCount}
        totalCount={spread.length}
        filter={filter}
        onFilterChange={setFilter}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        bodyId={bodyId}
      />

      {expanded && (
        <div id={bodyId}>
          {filtered.length === 0 ? (
            <SpreadEmptyState />
          ) : (
            <ul className="space-y-4">
              {filtered.map((entry) => (
                <li key={entry.symbol}>
                  <SpreadEntryCard
                    entry={entry}
                    onSourceClick={(holdingId) =>
                      router.push(`/core/assets/crypto/${holdingId}`)
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// ── Header met kicker + serif uitleg + filter-toggle ────────────────────

interface SpreadHeaderProps {
  spreadCount: number
  totalCount: number
  filter: FilterMode
  onFilterChange: (next: FilterMode) => void
  expanded: boolean
  onToggleExpanded: () => void
  bodyId: string
}

function SpreadHeader({
  spreadCount,
  totalCount,
  filter,
  onFilterChange,
  expanded,
  onToggleExpanded,
  bodyId,
}: SpreadHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="group flex items-baseline gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <ChevronDown
            className={`h-4 w-4 self-center text-[var(--ink-3)] transition-transform group-hover:text-[var(--ink)] ${expanded ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Spreiding
            </p>
            <h3 className="font-serif text-lg font-semibold text-[var(--ink)] group-hover:underline group-hover:underline-offset-4">
              Per coin op bronnen verdeeld
            </h3>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
            <span className="text-[var(--ink)]">{spreadCount}</span>
            <span className="text-[var(--ink-4)]"> / {totalCount}</span>
          </p>
          {expanded && (
            <SpreadFilterToggle
              value={filter}
              onChange={onFilterChange}
              spreadCount={spreadCount}
            />
          )}
        </div>
      </div>
      {expanded && (
        <p className="max-w-prose font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Helpt bij identificeren van exchange-lock-in: dezelfde coin op meerdere
          bronnen vermindert single-point-of-failure risico.
        </p>
      )}
    </div>
  )
}

// ── Filter-toggle (twee-knops segmented control) ────────────────────────

interface SpreadFilterToggleProps {
  value: FilterMode
  onChange: (next: FilterMode) => void
  spreadCount: number
}

function SpreadFilterToggle({
  value,
  onChange,
  spreadCount,
}: SpreadFilterToggleProps) {
  // Disable de "spread-only"-knop als er geen gespreide coins zijn — anders
  // klikt de gebruiker zich naar een lege state zonder dat duidelijk is dat
  // de filter de oorzaak is.
  const spreadOnlyDisabled = spreadCount === 0

  return (
    <div
      role="group"
      aria-label="Filter spreiding"
      className="inline-flex border border-[var(--border-ed)] bg-[var(--paper)]"
    >
      <button
        type="button"
        onClick={() => onChange('spread-only')}
        disabled={spreadOnlyDisabled}
        aria-pressed={value === 'spread-only'}
        className={`h-8 px-3 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
          value === 'spread-only'
            ? 'bg-[var(--ink)] text-[var(--paper)]'
            : spreadOnlyDisabled
              ? 'cursor-not-allowed text-[var(--ink-4)]'
              : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
        }`}
      >
        Alleen gespreid
      </button>
      <button
        type="button"
        onClick={() => onChange('all')}
        aria-pressed={value === 'all'}
        className={`h-8 border-l border-[var(--border-ed)] px-3 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
          value === 'all'
            ? 'bg-[var(--ink)] text-[var(--paper)]'
            : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
        }`}
      >
        Alle coins
      </button>
    </div>
  )
}

// ── Empty state per filter-mode ─────────────────────────────────────────

function SpreadEmptyState() {
  // Deze empty-state geldt alleen voor het 'spread-only'-filter (in 'all'
  // is `filtered` per definitie ≥ 1 als de outer-guard al passed). De copy
  // is daarom een nudge naar bron-spreiding, niet een neutraal "geen data".
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-5 py-6 text-center">
      <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        Geen coins op meerdere bronnen — voeg een wallet of tweede exchange
        toe voor risico-spreiding.
      </p>
    </div>
  )
}

// ── Eén entry-kaart: header + stacked-bar + bron-lijst ──────────────────

interface SpreadEntryCardProps {
  entry: CryptoSpreadEntry
  onSourceClick: (holdingId: string) => void
}

function SpreadEntryCard({ entry, onSourceClick }: SpreadEntryCardProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
      {/* Header: symbol + naam links, totale units + waarde rechts */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold uppercase tracking-[0.04em] text-[var(--ink)]">
            {entry.symbol}
          </p>
          {entry.name && entry.name.toUpperCase() !== entry.symbol && (
            <p className="truncate text-[11px] text-[var(--ink-3)]">
              {entry.name}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatUnits(entry.totalUnits)}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
            {fc(entry.totalValueEur)}
          </p>
        </div>
      </header>

      {/* Stacked-bar: één segment per bron, klikbaar per segment */}
      <StackedBar entry={entry} onSegmentClick={onSourceClick} />

      {/* Bron-lijst onder de bar — één rij per bron met % + waarde */}
      <ul className="mt-2.5 space-y-1.5">
        {entry.sources.map((s) => (
          <li key={`${s.kind}-${s.holdingId}`}>
            <button
              type="button"
              onClick={() => onSourceClick(s.holdingId)}
              className="group flex w-full items-baseline gap-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <SourceKindIcon kind={s.kind} />
              <span
                className={`flex-1 truncate text-[11px] font-medium uppercase tracking-[0.06em] ${SEGMENT_LABEL_INK[s.kind]} group-hover:text-[var(--ink)]`}
              >
                {s.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                {formatUnits(s.units)}
              </span>
              <span className="w-10 text-right font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
                {s.sharePct.toFixed(0)}%
              </span>
              <span className="w-16 text-right font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                {fc(s.valueEur)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  )
}

// ── Stacked-bar (horizontaal, bron-segmenten) ───────────────────────────

interface StackedBarProps {
  entry: CryptoSpreadEntry
  onSegmentClick: (holdingId: string) => void
}

function StackedBar({ entry, onSegmentClick }: StackedBarProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Render alleen segmenten met sharePct > 0 (defensief tegen edge-cases).
  // Voor één-bron-coins krijgt de bar één vlak, gevuld kleur — visueel
  // duidelijk dat er geen spreiding is, en de hover/click linkt nog steeds.
  const segments = entry.sources.filter((s) => s.sharePct > 0)
  if (segments.length === 0) return null

  return (
    <div
      className="mt-2.5 flex h-2 w-full overflow-hidden border border-[var(--border-ed)]"
      role="img"
      aria-label={`Verdeling ${entry.symbol} over ${entry.sourceCount} bronnen`}
    >
      {segments.map((s, idx) => {
        const isLast = idx === segments.length - 1
        return (
          <button
            key={`${s.kind}-${s.holdingId}-seg`}
            type="button"
            onClick={() => onSegmentClick(s.holdingId)}
            title={`${s.label} — ${s.sharePct.toFixed(1)}% (${fc(s.valueEur)})`}
            aria-label={`${s.label}: ${s.sharePct.toFixed(0)} procent`}
            className={`h-full ${SEGMENT_BG[s.kind]} ${
              isLast ? '' : 'border-r border-[var(--paper)]'
            } transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
            style={{ width: `${s.sharePct}%` }}
          />
        )
      })}
    </div>
  )
}

// ── Source-kind icon (klein, voor de bron-rij) ──────────────────────────

function SourceKindIcon({ kind }: { kind: 'exchange' | 'wallet' | 'manual' }) {
  // 12px icon, kleur volgt de label-tint via SEGMENT_LABEL_INK op de parent.
  // Bewust drie verschillende glyphs zodat je in één scan ziet welk soort
  // bron het is, zonder eerst het label te lezen.
  if (kind === 'exchange') {
    return (
      <Plug
        className={`h-3 w-3 shrink-0 ${SEGMENT_LABEL_INK.exchange}`}
        aria-hidden="true"
      />
    )
  }
  if (kind === 'wallet') {
    return (
      <Wallet
        className={`h-3 w-3 shrink-0 ${SEGMENT_LABEL_INK.wallet}`}
        aria-hidden="true"
      />
    )
  }
  return (
    <Pencil
      className={`h-3 w-3 shrink-0 ${SEGMENT_LABEL_INK.manual}`}
      aria-hidden="true"
    />
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Format crypto-units met dynamische precisie. Spiegel van de heatmap-helper:
 * grote balansen krijgen weinig decimalen, dust-balansen krijgen meer
 * significante cijfers, ultra-klein valt terug op exponentiële notatie zodat
 * we geen "0,0000" tonen voor een echte (zij het kleine) balans.
 */
function formatUnits(units: number): string {
  if (units === 0) return '0'
  if (units >= 1000)
    return units.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
  if (units >= 1)
    return units.toLocaleString('nl-NL', { maximumFractionDigits: 4 })
  if (units >= 0.0001)
    return units.toLocaleString('nl-NL', { maximumFractionDigits: 6 })
  return units.toExponential(2)
}
