'use client'

import Link from 'next/link'
import {
  TrendingUp,
  Lightbulb,
  Calendar,
  AlertTriangle,
  Sparkles,
  LineChart,
  type LucideIcon,
} from 'lucide-react'

/**
 * BriefingPanel — vervangt AtomicCards op /overzicht hero. Toont een
 * 3-koloms grid (max 6 entries = 3×2) met door AI gegenereerde
 * briefing-kaarten. Elke kaart heeft een categorie-kicker, eigen
 * kleur-codering en optioneel een href voor doorklikken.
 *
 * Achtergrond — plan §6.2 + Tier-3 #16 (Wekelijkse briefing):
 *   Het plan beschrijft "drie atomic cards onder hero" voor de wekelijkse
 *   briefing. User-feedback (mei 19) verzoekt evolutie naar max 6 cards
 *   in 3-koloms-grid met meer categorieën. Cards mogen verschillende
 *   afmetingen hebben (1-col vs 2-col).
 *
 * Categorieën (6 stuks):
 *   - observation  WAT VALT OP        emerald  TrendingUp
 *   - tip          EEN TIP            violet   Lightbulb
 *   - upcoming     KOMENDE MAAND      sky      Calendar
 *   - heads_up     HEADS-UP           amber    AlertTriangle
 *   - milestone    MIJLPAAL           fuchsia  Sparkles
 *   - market       MARKT              slate    LineChart
 *
 * Span (visueel onderscheid voor verschillende prioriteit):
 *   - 'narrow'  → 1 kolom (default)
 *   - 'wide'    → 2 kolommen (breekt visueel uit, voor headline-items)
 *
 * Data-bron: server-side briefing-engine genereert per dag/week deze
 * entries op basis van temporal-context, recommendations, life-events,
 * net-worth-delta. Voor MVP putten we uit recommendations + life-events
 * + financial-health pillars; de briefing-engine als first-class
 * server-component (plan A-4) komt in volgende iteratie.
 */

export type BriefingCategory =
  | 'observation'
  | 'tip'
  | 'upcoming'
  | 'heads_up'
  | 'milestone'
  | 'market'

export type BriefingSpan = 'narrow' | 'wide'

export interface BriefingEntry {
  /** Unieke key voor React-list-key. */
  id: string
  category: BriefingCategory
  /** Eén-zin body — primaire boodschap. */
  text: string
  /** Optionele href voor doorklikken naar context. */
  href?: string
  /** Visuele span — 'wide' = 2-kolom-card, 'narrow' = 1-kolom (default). */
  span?: BriefingSpan
}

const CATEGORY_CONFIG: Record<
  BriefingCategory,
  { label: string; dotColor: string; Icon: LucideIcon }
> = {
  observation: { label: 'Wat valt op', dotColor: 'bg-emerald-500', Icon: TrendingUp },
  tip:         { label: 'Een tip',     dotColor: 'bg-violet-500',  Icon: Lightbulb },
  upcoming:    { label: 'Komende maand', dotColor: 'bg-sky-500',   Icon: Calendar },
  heads_up:    { label: 'Heads-up',    dotColor: 'bg-amber-500',   Icon: AlertTriangle },
  milestone:   { label: 'Mijlpaal',    dotColor: 'bg-fuchsia-500', Icon: Sparkles },
  market:      { label: 'Markt',       dotColor: 'bg-slate-500',   Icon: LineChart },
}

/** Maximum aantal kaartjes — plan §6.2 evolutie: 3-koloms × 2 rijen = 6. */
const MAX_BRIEFING_ENTRIES = 6

export function BriefingPanel({ entries }: { entries: BriefingEntry[] }) {
  // Slice tot max 6 en behoud volgorde — server-side briefing-engine
  // beslist over prioriteit (most-urgent eerst). Hier alleen capping.
  const capped = entries.slice(0, MAX_BRIEFING_ENTRIES)

  if (capped.length === 0) {
    // Volledige lege staat — toon één placeholder zodat user weet dat
    // hier briefing-content komt zodra er data is.
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
        <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-3 sm:p-4 sm:col-span-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--ink-4)]" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Briefing
            </span>
          </div>
          <p className="text-sm text-[var(--ink-3)] italic leading-snug">
            Nog onvoldoende data voor een briefing — vul je hefbomen aan
            en check terug volgende week voor je eerste samenvatting.
          </p>
        </article>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
      {capped.map((entry) => (
        <BriefingCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function BriefingCard({ entry }: { entry: BriefingEntry }) {
  const config = CATEGORY_CONFIG[entry.category]
  const Icon = config.Icon
  // Wide span: 2 kolommen op sm+, full-width op mobile. Narrow: 1 kol.
  const spanClass = entry.span === 'wide' ? 'sm:col-span-2' : ''

  const inner = (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {config.label}
        </span>
        <Icon className="w-3.5 h-3.5 text-[var(--ink-4)] ml-auto" aria-hidden="true" />
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-snug">{entry.text}</p>
    </>
  )

  if (entry.href) {
    return (
      <Link
        href={entry.href}
        className={`rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all block ${spanClass}`}
      >
        {inner}
      </Link>
    )
  }
  return (
    <article
      className={`rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 ${spanClass}`}
    >
      {inner}
    </article>
  )
}

export { MAX_BRIEFING_ENTRIES }
