'use client'

import { useMemo } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import {
  LIFE_EVENT_CATALOG,
  LIFE_EVENT_GROUPS,
  type LifeEventGroup,
} from '@/lib/horizon-data'
import { Kicker, EditorialHeadline, EditorialDeck, RomanSection } from '@/components/editorial'
import { EVENT_ICONS } from './log-timeline'

interface Props {
  onSelect: (type: string) => void
  /** Klik op de "Praat met Will"-tegel — schakelt pane naar chat-mode. */
  onOpenChat: () => void
  /** Filter `householdOnly` types weg als gebruiker solo is. */
  householdMode: boolean
}

const GROUPS_ORDER: LifeEventGroup[] = ['leven', 'wonen', 'werk', 'pensioen', 'vermogen', 'vrije_tijd', 'anders']

export function EventPaneCatalog({ onSelect, onOpenChat, householdMode }: Props) {
  const grouped = useMemo(() => {
    const out: Record<LifeEventGroup, { type: string; entry: typeof LIFE_EVENT_CATALOG[string] }[]> = {
      leven: [], wonen: [], werk: [], pensioen: [], vermogen: [], vrije_tijd: [], anders: [],
    }
    for (const [type, entry] of Object.entries(LIFE_EVENT_CATALOG)) {
      if (entry.householdOnly && !householdMode) continue
      const group = entry.group
      out[group].push({ type, entry })
    }
    return out
  }, [householdMode])

  return (
    // Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
    // Extra `pb-6` voor lucht onder de grid; horizontale padding komt van de pane.
    <div className="pb-6">
      <header className="mb-6">
        <Kicker size="large">Nieuw moment</Kicker>
        <EditorialHeadline emphasis="komt eraan" className="mt-3">
          Welke gebeurtenis komt eraan?
        </EditorialHeadline>
        <EditorialDeck className="mt-5">
          Kies een type om met een ingevuld voorstel te beginnen. Of brainstorm eerst met Will —
          hij helpt je het concreet te maken en zet een voorstel klaar dat je kunt openen in de
          editor.
        </EditorialDeck>
      </header>

      {/* Will-tegel — prominent boven de catalog-grid */}
      <button
        type="button"
        onClick={onOpenChat}
        className="group w-full mb-8 p-4 sm:p-5 rounded-xl border-2 border-[var(--module-active-700)] bg-[var(--module-active-50)] hover:bg-[var(--module-active-100)] hover:-translate-y-px transition-all text-left flex items-center gap-4"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--module-active-700)] text-[var(--paper)]">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
            samen brainstormen
          </div>
          <div
            className="mt-0.5 text-base sm:text-lg font-bold tracking-[-0.01em]"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            Praat met <em className="not-italic font-normal italic">Will</em>
          </div>
          <div className="text-xs text-[var(--ink-3)] mt-0.5 truncate">
            Vertel je droom of plan — Will zet er een voorstel voor klaar.
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-[var(--module-active-700)] shrink-0 group-hover:translate-x-0.5 transition-transform" aria-hidden />
      </button>

      <div className="mb-3 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)]">
        Of kies een type
      </div>

      <div className="space-y-8">
        {GROUPS_ORDER.map(groupKey => {
          const items = grouped[groupKey]
          if (!items || items.length === 0) return null
          const meta = LIFE_EVENT_GROUPS[groupKey]
          return (
            <RomanSection key={groupKey} label={meta.label}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {items.map(({ type, entry }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onSelect(type)}
                    className="text-left p-3 border border-[var(--border-ed)] rounded-lg bg-[var(--paper)] hover:border-[var(--module-active-700)] hover:shadow-sm hover:-translate-y-px transition-all min-h-[88px]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--module-active-50)] text-[var(--module-active-700)]">
                        {EVENT_ICONS[entry.icon] ?? EVENT_ICONS['Calendar']}
                      </span>
                      <span className="font-semibold text-sm leading-tight">{entry.label}</span>
                    </div>
                    {entry.impactRange && (
                      <div className="text-[10px] text-[var(--ink-3)] font-mono tabular-nums">
                        {entry.impactRange}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </RomanSection>
          )
        })}
      </div>
    </div>
  )
}
