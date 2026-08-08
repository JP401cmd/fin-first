'use client'

import { Bug, ChevronRight, HelpCircle, Lightbulb } from 'lucide-react'

/**
 * Stap 1 van de meldflow: welk soort melding wil je maken?
 *
 * Drie routes, drie afhandelingen — daarom kiest de gebruiker het type vóór het
 * formulier: een bug vraagt om reproductie-informatie, een vraag om een
 * antwoord, een wens om een weging. Eén generiek "feedback"-veld zou die drie
 * op één hoop gooien en de triage terugleggen bij ons.
 */

export type MeldingType = 'bug' | 'vraag' | 'aanbeveling'

const KEUZES: {
  type: MeldingType
  label: string
  uitleg: string
  Icon: typeof Bug
}[] = [
  {
    type: 'bug',
    label: 'Bug melden',
    uitleg: 'Er ging iets mis of het klopt niet.',
    Icon: Bug,
  },
  {
    type: 'vraag',
    label: 'Vraag stellen',
    uitleg: 'Je snapt iets niet of je wilt weten hoe iets werkt.',
    Icon: HelpCircle,
  },
  {
    type: 'aanbeveling',
    label: 'Aanbeveling doen',
    uitleg: 'Je hebt een idee of wens voor de app.',
    Icon: Lightbulb,
  },
]

export function MeldingTypeKiezer({ onKies }: { onKies: (type: MeldingType) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      {KEUZES.map(({ type, label, uitleg, Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onKies(type)}
          className="group flex w-full items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-3.5 py-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-wil-300 hover:bg-wil-50/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wil-500"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-wil-200 bg-wil-50 text-wil-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] leading-tight text-[var(--ink)]">
              {label}
            </span>
            <span className="mt-1 block font-serif text-[12px] italic leading-snug text-[var(--ink-3)]">
              {uitleg}
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-wil-600"
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}
