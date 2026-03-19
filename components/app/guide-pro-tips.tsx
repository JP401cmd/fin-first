'use client'

import { Receipt, Clock, SlidersHorizontal, Unlock, MessageSquare, CalendarCheck, GitBranch, Users, Scale, Lightbulb, type LucideIcon } from 'lucide-react'

/* ── Tip definitions ──────────────────────── */

interface ProTip {
  icon: LucideIcon
  text: string
}

const PRO_TIPS: ProTip[] = [
  {
    icon: Receipt,
    text: 'Tik op elk bedrag om de kassabon te openen \u2014 een stapsgewijze berekening van het getal.',
  },
  {
    icon: Clock,
    text: 'Bedragen boven \u20ac100 tonen ook het vrijheidstijd-equivalent in jaren, maanden of dagen.',
  },
  {
    icon: SlidersHorizontal,
    text: 'Dashboard-widgets zijn aanpasbaar \u2014 schakel ze aan of uit via Identiteit \u2192 Instellingen.',
  },
  {
    icon: Unlock,
    text: 'Nieuwe features ontgrendelen automatisch als je soevereiniteitsniveau stijgt.',
  },
  {
    icon: MessageSquare,
    text: 'Stel Will een vraag via de chatknop rechtsonder \u2014 hij kent de context van je pagina.',
  },
  {
    icon: CalendarCheck,
    text: 'Werk je saldi maandelijks bij via de check-in \u2014 zo blijft je FIRE-berekening accuraat.',
  },
  {
    icon: GitBranch,
    text: 'Vergelijk scenario\u2019s in de What-If droomruimte \u2014 zie hoe keuzes je vrijheid be\u00efnvloeden.',
  },
  {
    icon: Users,
    text: 'Voeg je partner toe voor gezamenlijke vermogensberekeningen en per-partner FIRE-prognoses.',
  },
  {
    icon: Scale,
    text: 'Herbalanceer je portfolio jaarlijks rond de Box 3 peildatum (1 jan) — zo houd je risico in lijn én optimaliseer je belasting.',
  },
]

/* ── Main component ──────────────────────── */

export default function GuideProTips() {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-[var(--ink-3)]" />
        <p className="label-editorial text-[var(--ink-3)]">Tips</p>
      </div>

      {/* Mobile: horizontal scroll with snap | Desktop: grid */}
      <div className="relative">
        <div
          className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {PRO_TIPS.map((tip, i) => {
            const Icon = tip.icon
            return (
              <div
                key={i}
                className="snap-start shrink-0 w-[200px] sm:w-[220px] lg:w-auto lg:shrink rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)] text-[var(--ink-3)]">
                    <span className="text-[10px] font-bold font-mono tabular-nums">{i + 1}</span>
                  </div>
                  <Icon className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--ink-2)] line-clamp-3 lg:line-clamp-none">
                  {tip.text}
                </p>
              </div>
            )
          })}
        </div>

        {/* Fade edge indicators — only on mobile */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--paper)] to-transparent lg:hidden" />
      </div>
    </div>
  )
}
