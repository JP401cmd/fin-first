'use client'

import Link from 'next/link'
import {
  Baby,
  Briefcase,
  Home,
  HeartHandshake,
  Wallet,
  Compass,
  ArrowRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { LifeEvent } from '@/lib/horizon-data'
import { ScenarioBibliotheek } from './scenario-bibliotheek'
import { useViewMode } from '@/components/app/view-mode-provider'

/**
 * GebeurtenissenView — content voor Gebeurtenissen-tab op /toekomst.
 *
 * Plan §6.3 splitst dit in twee secties:
 *  1. Levensgebeurtenissen — punt-in-tijd events (kind, erfenis, ZZP-start,
 *     deeltijd, verhuizing, schenking). Bewerken via sheet (kort formulier).
 *  2. Levensstrategieën — 3 multi-step strategieën met eigen pane:
 *     - AOW-strategie (ingangsleeftijd, partneraftrek, AOW-gat-overbrugging)
 *     - Pensioen-strategie (werknemerspensioen + lijfrente + jaarruimte)
 *     - Huis-strategie (kopen / verkopen / herfinancieren / aflossingsplan)
 *
 * Voor MVP-extractie: lijst van life_events uit horizonData + 3 strategie-
 * cards die deeplinken naar /toekomst/strategie. Native sheet/pane voor
 * bewerken komt in volgende iteratie.
 */

const EVENT_ICONS: Record<string, typeof Compass> = {
  child: Baby,
  kind: Baby,
  career: Briefcase,
  zzp: Briefcase,
  retirement: Compass,
  housing: Home,
  inheritance: HeartHandshake,
  default: Wallet,
}

function iconForEvent(eventType: string, icon?: string): typeof Compass {
  const key = (icon ?? eventType ?? '').toLowerCase()
  return EVENT_ICONS[key] ?? EVENT_ICONS.default ?? Compass
}

function formatEventDate(event: LifeEvent): string {
  if (event.target_date) {
    return new Date(event.target_date).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }
  if (event.target_age != null) {
    return `Leeftijd ${event.target_age}`
  }
  return 'Datum onbekend'
}

function eventImpact(event: LifeEvent): string {
  const parts: string[] = []
  if (event.one_time_cost > 0) {
    parts.push(`Eenmalig ${formatCurrency(event.one_time_cost)}`)
  } else if (event.one_time_cost < 0) {
    parts.push(`Eenmalig opbrengst ${formatCurrency(Math.abs(event.one_time_cost))}`)
  }
  if (event.monthly_cost_change !== 0) {
    const sign = event.monthly_cost_change > 0 ? '+' : '−'
    parts.push(`${sign}${formatCurrency(Math.abs(event.monthly_cost_change))}/mnd kosten`)
  }
  if (event.monthly_income_change !== 0) {
    const sign = event.monthly_income_change > 0 ? '+' : '−'
    parts.push(`${sign}${formatCurrency(Math.abs(event.monthly_income_change))}/mnd inkomen`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Geen geldelijke impact'
}

const LEVENSSTRATEGIEEN: {
  key: string
  label: string
  description: string
  href: string
  Icon: typeof Compass
  bg: string
  text: string
}[] = [
  {
    key: 'aow',
    label: 'AOW-strategie',
    description:
      'Ingangsleeftijd, partneraftrek en AOW-gat-overbrugging. Default = wettelijk; pas aan voor eerder of later opnemen.',
    href: '/toekomst/strategie?focus=aow',
    Icon: Compass,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
  {
    key: 'pensioen',
    label: 'Pensioen-strategie',
    description:
      'Werknemerspensioen, lijfrente en jaarruimte/reserveringsruimte. UPO-data invoer komt in volgende iteratie.',
    href: '/toekomst/strategie?focus=pensioen',
    Icon: Wallet,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  {
    key: 'huis',
    label: 'Huis-strategie',
    description:
      'Kopen / verkopen / herfinancieren / verbouwen + aflossingsplan (annuïteit, lineair of extra aflossen).',
    href: '/toekomst/strategie?focus=huis',
    Icon: Home,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
]

export function GebeurtenissenView({
  events,
  currentAge,
}: {
  events: LifeEvent[]
  /** Huidige leeftijd uit DOB — nodig om scenario-defaults op te baseren
   *  (target_age = currentAge + N). Wanneer null: ScenarioBibliotheek
   *  toont een vriendelijke fout-melding. */
  currentAge?: number | null
}) {
  // ScenarioBibliotheek = scenario-tool → alleen in 'plannen'-modus
  // zichtbaar (plan A-5). Niveau-A "Kijken"-gebruikers zien dan een
  // rustige lijst van bestaande events zonder edit-knoppen.
  const { isPlannen } = useViewMode()
  // Sort events op target_date (alfabet als fallback). Events met datum
  // tonen we eerst chronologisch, daarna events met alleen target_age,
  // tenslotte events zonder timing.
  const sorted = [...events].sort((a, b) => {
    if (a.target_date && b.target_date) {
      return a.target_date.localeCompare(b.target_date)
    }
    if (a.target_date) return -1
    if (b.target_date) return 1
    if (a.target_age != null && b.target_age != null) {
      return a.target_age - b.target_age
    }
    return a.name.localeCompare(b.name)
  })

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8 space-y-8">
      {/* Levensgebeurtenissen */}
      <div>
        <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Toekomst — levensgebeurtenissen
            </div>
            <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
              {sorted.length === 0
                ? 'Geen gebeurtenissen'
                : `${sorted.length} gebeurtenis${sorted.length === 1 ? '' : 'sen'}`}
            </h2>
          </div>
          {isPlannen && <ScenarioBibliotheek currentAge={currentAge ?? null} />}
        </header>

        {sorted.length === 0 ? (
          <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
            <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-3">
              Voeg een gebeurtenis toe om de impact op je tijdas te zien —
              kind, erfenis, verhuizing, ZZP-start, deeltijd of een andere
              levenskeuze.
            </p>
            <Link
              href="/toekomst/whatif"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
            >
              Eerste gebeurtenis toevoegen
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </article>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {sorted.map((event) => {
              const Icon = iconForEvent(event.event_type, event.icon)
              return (
                <article
                  key={event.id}
                  className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
                >
                  <header className="flex items-start gap-3 mb-2">
                    <span className="w-9 h-9 rounded-lg bg-[var(--subtle)] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-[var(--ink-2)]" aria-hidden="true" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--ink)] truncate">
                        {event.name}
                      </h3>
                      <div className="text-[11px] text-[var(--ink-3)] mt-0.5">
                        {formatEventDate(event)}
                      </div>
                    </div>
                  </header>
                  <p className="text-xs text-[var(--ink-2)] leading-snug">
                    {eventImpact(event)}
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* Levensstrategieën */}
      <div>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — levensstrategieën
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Drie multi-step strategieën
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Anders dan losse gebeurtenissen: strategieën hebben eigen
            parameters en zijn als bandjes zichtbaar op de tijdas.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {LEVENSSTRATEGIEEN.map((strat) => {
            const Icon = strat.Icon
            return (
              <Link
                key={strat.key}
                href={strat.href}
                className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all flex flex-col"
              >
                <div
                  className={`w-9 h-9 rounded-lg ${strat.bg} ${strat.text} flex items-center justify-center mb-3`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)] mb-1.5">
                  {strat.label}
                </h3>
                <p className="text-xs text-[var(--ink-2)] leading-snug flex-1">
                  {strat.description}
                </p>
                <span className="mt-3 text-[11px] font-semibold text-violet-700 inline-flex items-center gap-1">
                  Configureren
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      <p className="text-[11px] italic text-[var(--ink-3)]">
        Native sheet/pane voor bewerken van gebeurtenissen en strategieën
        komt in volgende iteratie. Voor nu: gebruik de tijdas (
        <Link href="/toekomst" className="underline">
          tab Tijdas
        </Link>
        ) of Wat-Als (
        <Link href="/toekomst/whatif" className="underline">
          /toekomst/whatif
        </Link>
        ).
      </p>
    </section>
  )
}
