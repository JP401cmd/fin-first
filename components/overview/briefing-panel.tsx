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
import { HEFBOOM_CONFIG, type Hefboom } from '@/lib/hefboom-config'

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

/**
 * Hefboom-tag — plan T-3 (Tier-2 #15): "Tips zijn altijd gekoppeld aan
 * één van de 4 hefbomen". Wordt visueel als mini-icoon naast de
 * categorie-kicker getoond zodat de gebruiker leert welke hefboom een
 * tip/observatie raakt.
 */
/** Backwards-compatible alias — gedeelde definitie staat in
 *  `lib/hefboom-config.ts`. */
export type HefboomTag = Hefboom

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
  /** Optionele hefboom-tag. Wanneer aanwezig: mini-icoon naast kicker.
   *  Bij cross-hefboom inzichten (bv. FIRE-progress, fysiek vermogen
   *  totaal) blijft het veld undefined. */
  hefboom?: HefboomTag
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

export function BriefingPanel({
  entries,
  narrative,
}: {
  entries: BriefingEntry[]
  /** Optionele natuurlijke-taal samenvatting (plan T-1 / Tier-3 #16).
   *  Gerendered als "Will:"-headline boven de card-grid. Wanneer null
   *  of leeg blijft de headline weg. */
  narrative?: string | null
}) {
  // Slice tot max 6 en behoud volgorde — server-side briefing-engine
  // beslist over prioriteit (most-urgent eerst). Hier alleen capping.
  const capped = entries.slice(0, MAX_BRIEFING_ENTRIES)

  if (capped.length === 0) {
    // Volledige lege staat — toon één placeholder zodat user weet dat
    // hier briefing-content komt zodra er data is.
    return (
      <div className="mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-3 sm:space-y-4">
      {narrative && <BriefingNarrative text={narrative} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {capped.map((entry) => (
          <BriefingCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}

/**
 * Headline-card met natuurlijke-taal briefing. Will-persona is de stem
 * (plan §6.5). Subtiele violet-tint zodat de samenvatting visueel
 * onderscheidt van de feiten-cards eronder.
 */
function BriefingNarrative({ text }: { text: string }) {
  return (
    <article className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/60 to-stone-50 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
          W
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
          Will — jouw briefing
        </span>
      </div>
      <p className="text-sm sm:text-base text-[var(--ink-2)] leading-relaxed">
        {text}
      </p>
      {/* Plan §6.2: "Toon alle briefings →" — slide-in via /will waar de
          volledige briefing-historie staat. Kort en niet-opdringerig. */}
      <div className="mt-3 pt-3 border-t border-violet-100/70">
        <Link
          href="/will#briefing"
          className="text-[11px] font-semibold text-violet-700 hover:underline inline-flex items-center gap-1"
        >
          Eerdere briefings
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

function BriefingCard({ entry }: { entry: BriefingEntry }) {
  const config = CATEGORY_CONFIG[entry.category]
  const Icon = config.Icon
  const hefboomCfg = entry.hefboom ? HEFBOOM_CONFIG[entry.hefboom] : null
  const HefboomIcon = hefboomCfg?.Icon
  // Wide span: 2 kolommen op sm+, full-width op mobile. Narrow: 1 kol.
  const spanClass = entry.span === 'wide' ? 'sm:col-span-2' : ''

  const inner = (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {config.label}
        </span>
        {hefboomCfg && HefboomIcon && (
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${hefboomCfg.tint}`}
            aria-label={`Hefboom: ${hefboomCfg.label}`}
            title={`Hefboom: ${hefboomCfg.label}`}
          >
            <HefboomIcon className="w-3 h-3" aria-hidden="true" />
          </span>
        )}
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
