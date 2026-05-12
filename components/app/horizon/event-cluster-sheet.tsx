'use client'

/**
 * EventClusterSheet — toont de inhoud van een geclusterde groep markers op
 * de EventsTimeline (onder de Horizon-chart). Wordt geopend wanneer de
 * gebruiker op een +N cluster-marker tikt.
 *
 * Driewegregel: dit is een sheet (single-context, lijst-info, terugkeer naar
 * chart) — daarom ShellOverlay kind="sheet". De sheet groepeert events per
 * type (levensgebeurtenissen vs. natuurlijke mijlpalen) zodat de gebruiker
 * direct ziet welke categorieën bijdragen aan de cluster. Type-zichtbaarheid
 * volgt automatisch uit de filter van EventsTimeline — uitgeschakelde types
 * komen nooit in een cluster terecht.
 *
 * Klik op een rij:
 *   - life-event → sluit sheet, opent EventPane (via `onSelectEvent`)
 *   - natuurlijke mijlpaal → sluit sheet, deeplinkt naar bron-asset/debt
 *     (dezelfde routing als EventsTimeline.onViewEvent voor `nat-`-ids)
 */

import type { LifeEvent } from '@/lib/horizon-data'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

// ── Helpers ───────────────────────────────────────────────────────

function isNaturalEvent(ev: LifeEvent): boolean {
  return ev.metadata?.isNatural === true
}

function eventDirection(ev: LifeEvent): 'income' | 'expense' {
  const positive = (ev.monthly_income_change * ev.duration_months) + Math.max(-ev.one_time_cost, 0)
  const negative = (ev.monthly_cost_change * ev.duration_months) + Math.max(ev.one_time_cost, 0)
  return positive > negative ? 'income' : 'expense'
}

function naturalCategory(ev: LifeEvent): 'asset' | 'debt' | 'simulation' {
  const cat = ev.metadata?.category
  if (cat === 'asset' || cat === 'debt' || cat === 'simulation') return cat
  return 'simulation'
}

function naturalImpactLine(ev: LifeEvent, masked: boolean): string {
  const kind = ev.metadata?.kind as string | undefined
  const amount = ev.metadata?.amount as number | undefined
  if (kind === 'sim_out_of_cash') return 'Vermogen op'
  if (kind === 'sim_peak' && amount) return `Piek ${formatMaskedCurrency(amount, masked)}`
  if (kind === 'sim_first_million') return 'Mijlpaal bereikt'
  if (kind === 'sim_box3_threshold' && amount) return `Boven heffingsvrij ${formatMaskedCurrency(amount, masked)}`
  if (kind === 'debt_payoff' && amount) return `Resterend ${formatMaskedCurrency(amount, masked)}`
  if (kind === 'debt_free') return 'Alle schulden afgelost'
  if (kind === 'fixed_rate_reset') return 'Rentevast eindigt'
  if (kind === 'asset_expiry' && amount) return `Uitkering ${formatMaskedCurrency(amount, masked)}`
  if (kind === 'asset_maturity' && amount) return `Vrij beschikbaar ${formatMaskedCurrency(amount, masked)}`
  if (kind === 'vehicle_runoff') return 'Volledig afgeschreven'
  return 'Automatisch afgeleide mijlpaal'
}

function lifeImpactLine(ev: LifeEvent, masked: boolean): string {
  const parts: string[] = []
  if (ev.one_time_cost > 0) {
    parts.push(`−${formatMaskedCurrency(ev.one_time_cost, masked)} eenmalig`)
  } else if (ev.one_time_cost < 0) {
    parts.push(`+${formatMaskedCurrency(Math.abs(ev.one_time_cost), masked)} eenmalig`)
  }
  if (ev.monthly_cost_change > 0) {
    parts.push(`−${formatMaskedCurrency(ev.monthly_cost_change, masked)}/mnd`)
  }
  if (ev.monthly_income_change > 0) {
    parts.push(`+${formatMaskedCurrency(ev.monthly_income_change, masked)}/mnd`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Geen financiële impact'
}

// Module-kleuren — matched events-timeline.tsx
const COLOR_INCOME = 'var(--color-horizon, #c4a06b)'
const COLOR_EXPENSE = 'var(--color-kern, #6b4339)'
const COLOR_NAT_ASSET = 'var(--color-horizon, #c4a06b)'
const COLOR_NAT_DEBT = '#3b7a57'
const COLOR_NAT_SIM = 'var(--ink-3)'
const COLOR_NAT_DANGER = '#c4584a'

function colorFor(ev: LifeEvent): string {
  if (isNaturalEvent(ev)) {
    const kind = ev.metadata?.kind as string | undefined
    if (kind === 'sim_out_of_cash') return COLOR_NAT_DANGER
    const cat = naturalCategory(ev)
    if (cat === 'debt') return COLOR_NAT_DEBT
    if (cat === 'asset') return COLOR_NAT_ASSET
    return COLOR_NAT_SIM
  }
  return eventDirection(ev) === 'income' ? COLOR_INCOME : COLOR_EXPENSE
}

// ── Component ─────────────────────────────────────────────────────

export function EventClusterSheet({
  open,
  events,
  centerAge,
  onClose,
  onSelectEvent,
}: {
  open: boolean
  events: LifeEvent[]
  centerAge: number
  onClose: () => void
  /** Klik op een rij — krijgt de event.id door en is verantwoordelijk voor
   *  routing (life-event → EventPane open; natural → deeplink). Conform
   *  EventsTimeline.onViewEvent-signatuur. */
  onSelectEvent: (eventId: string) => void
}) {
  const { masked } = useMaskedAmounts()

  // Sorteer op age, dan op natural-flag (life-events eerst), dan op naam
  const sorted = [...events].sort((a, b) => {
    const ageA = a.target_age ?? 0
    const ageB = b.target_age ?? 0
    if (ageA !== ageB) return ageA - ageB
    const natA = isNaturalEvent(a) ? 1 : 0
    const natB = isNaturalEvent(b) ? 1 : 0
    if (natA !== natB) return natA - natB
    return a.name.localeCompare(b.name)
  })

  // Tellingen per type — getoond in deck en als groep-labels
  const lifeCount = sorted.filter(e => !isNaturalEvent(e)).length
  const natCount = sorted.length - lifeCount

  const lifeEvents = sorted.filter(e => !isNaturalEvent(e))
  const naturalEvents = sorted.filter(e => isNaturalEvent(e))

  function handleClick(eventId: string) {
    onClose()
    // Defer naar microtask zodat sheet-close-animatie ruimte krijgt vóór
    // pane-open. Voorkomt visual stutter wanneer beide tegelijk renderen.
    queueMicrotask(() => onSelectEvent(eventId))
  }

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="sheet"
      size="md"
      title={`${events.length} gebeurtenissen rond leeftijd ${Math.round(centerAge)}`}
    >
      <div className="space-y-4 p-1">
        <p className="font-serif text-[13px] italic text-[var(--ink-3)]">
          {lifeCount > 0 && natCount > 0
            ? `${lifeCount} levensgebeurtenis${lifeCount === 1 ? '' : 'sen'} en ${natCount} natuurlijke mijlpaal${natCount === 1 ? '' : 'en'} vallen samen in deze periode.`
            : lifeCount > 0
            ? `${lifeCount} levensgebeurtenis${lifeCount === 1 ? '' : 'sen'} vallen samen in deze periode.`
            : `${natCount} natuurlijke mijlpaal${natCount === 1 ? '' : 'en'} vallen samen in deze periode.`}
        </p>

        {lifeEvents.length > 0 && (
          <Section
            label="Levensgebeurtenissen"
            count={lifeEvents.length}
          >
            {lifeEvents.map(ev => (
              <ClusterRow
                key={ev.id}
                event={ev}
                masked={masked}
                onClick={() => handleClick(ev.id)}
              />
            ))}
          </Section>
        )}

        {naturalEvents.length > 0 && (
          <Section
            label="Natuurlijke mijlpalen"
            count={naturalEvents.length}
          >
            {naturalEvents.map(ev => (
              <ClusterRow
                key={ev.id}
                event={ev}
                masked={masked}
                onClick={() => handleClick(ev.id)}
              />
            ))}
          </Section>
        )}
      </div>
    </ShellOverlay>
  )
}

// ── Internals ─────────────────────────────────────────────────────

function Section({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          {label}
        </p>
        <span className="rounded-full bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--ink-4)]">
          {count}
        </span>
      </div>
      <div className="divide-y divide-[var(--border-ed)] overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)]">
        {children}
      </div>
    </div>
  )
}

function ClusterRow({
  event,
  masked,
  onClick,
}: {
  event: LifeEvent
  masked: boolean
  onClick: () => void
}) {
  const natural = isNaturalEvent(event)
  const color = colorFor(event)
  const impact = natural ? naturalImpactLine(event, masked) : lifeImpactLine(event, masked)
  const Icon = EVENT_ICONS[event.icon] || EVENT_ICONS['Calendar']

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)]/60 focus:bg-[var(--subtle)] focus:outline-none"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: color,
          color: color,
          backgroundColor: natural ? 'var(--paper)' : `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
        aria-hidden
      >
        <span className="flex h-4 w-4 items-center justify-center">{Icon}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-sans text-[13px] font-medium text-[var(--ink)]">
          {event.name}
        </span>
        <span className="truncate font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
          {impact}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
        {event.target_age ?? '?'}j
      </span>
    </button>
  )
}
