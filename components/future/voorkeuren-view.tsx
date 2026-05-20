'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal, ArrowRight, TrendingUp, Wallet, Pencil } from 'lucide-react'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { useViewMode } from '@/components/app/view-mode-provider'
import { VoorkeurBewerkenSheet } from './voorkeur-bewerken-sheet'
import { OnttrekkingsBewerkenSheet } from './onttrekkings-bewerken-sheet'
import { EindstrategieBewerkenSheet } from './eindstrategie-bewerken-sheet'
import type { WithdrawalStrategyType } from '@/lib/withdrawal-strategy'
import type { FireEndStrategy } from '@/lib/fire-strategy'

/**
 * VoorkeurenView — content voor Voorkeuren-tab op /toekomst.
 *
 * Plan §6.3 Tab 4: regels die op de hele tijdas + alle events werken.
 * Twee secties:
 *  1. Toekomst-regels — eindstrategie · onttrekkingsstrategie · volgorde ·
 *     verdeling-bij-toename · onttrekking-bij-afname
 *  2. Markt-aannames — inflatie + bruto rendement (effectief SWR)
 *
 * Voor MVP-extractie: read-only samenvatting van huidige waarden uit
 * horizonData (fireParams + fireStrategy + withdrawalStrategy), met
 * deeplinks naar /identity/parameters voor het bewerken zelf. Inline-
 * editor komt in volgende iteratie.
 */

const WITHDRAWAL_LABELS: Record<string, { name: string; subtitle: string }> = {
  static: {
    name: 'Vast (4%)',
    subtitle: 'Klassiek SWR — inflatie-geïndexeerd, geen reactie op markt',
  },
  guardrails: {
    name: 'Guardrails',
    subtitle: 'Dynamisch — verlaagt bij slechte returns, verhoogt bij goede',
  },
  vpw: {
    name: 'VPW',
    subtitle: 'Variable Percentage Withdrawal — leeftijd-afhankelijk',
  },
  bucket: {
    name: 'Bucket',
    subtitle: 'Cash-buffer + lange-termijn portfolio gescheiden',
  },
}

function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function VoorkeurenView({
  fireParams,
  fireStrategy,
  withdrawalStrategy,
}: {
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
}) {
  const { isPlannen } = useViewMode()
  // Inline-editor state — welke voorkeur wordt momenteel bewerkt.
  const [editing, setEditing] = useState<
    | null
    | {
        title: string
        column: 'inflation_rate' | 'expected_return'
        currentValuePct: number
        helperText: string
      }
  >(null)
  // Aparte state voor onttrekkings-sheet (geen overlap met getal-editor).
  const [editingOnttrekking, setEditingOnttrekking] = useState(false)
  const [editingEindstrategie, setEditingEindstrategie] = useState(false)
  const endStrategy = STRATEGY_LABELS[fireStrategy.strategy]
  const wsLabel = WITHDRAWAL_LABELS[withdrawalStrategy.strategy] ?? {
    name: withdrawalStrategy.strategy,
    subtitle: 'Onbekende strategie',
  }

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8 space-y-8">
      {/* Toekomst-regels */}
      <div>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — regels
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Regels op de hele tijdas
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Bepalen hoe je projectie zich gedraagt bij events en in de
            afbouw-fase.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <VoorkeurCard
            label="Eindstrategie"
            value={endStrategy?.name ?? fireStrategy.strategy}
            subtitle={
              endStrategy?.subtitle ??
              `Eindleeftijd ${fireStrategy.endAge}, doel ${
                fireStrategy.legacyAmount > 0 ? `€${fireStrategy.legacyAmount}` : '€0'
              }`
            }
            href="/identity/parameters?focus=eindstrategie"
            Icon={SlidersHorizontal}
            badge={`Tot ${fireStrategy.endAge} jaar`}
            onEdit={isPlannen ? () => setEditingEindstrategie(true) : undefined}
          />
          <VoorkeurCard
            label="Onttrekkingsstrategie"
            value={wsLabel.name}
            subtitle={wsLabel.subtitle}
            href="/identity/parameters?focus=onttrekking"
            Icon={SlidersHorizontal}
            badge={
              withdrawalStrategy.strategy === 'guardrails'
                ? `Floor ${formatPct(withdrawalStrategy.guardrailFloor)} · Ceiling ${formatPct(withdrawalStrategy.guardrailCeiling)}`
                : undefined
            }
            onEdit={isPlannen ? () => setEditingOnttrekking(true) : undefined}
          />
          <VoorkeurCard
            label="Onttrekkingsvolgorde"
            value="Cash → Beleggen → Pensioen"
            subtitle="Welke pot eerst leegtrekken bij afbouw"
            href="/identity/parameters?focus=volgorde"
            Icon={SlidersHorizontal}
            badge="Standaard"
          />
          <VoorkeurCard
            label="Verdeling bij toename"
            value="Naar lange-termijn portfolio"
            subtitle="Waar gaat extra geld heen bij een positief event"
            href="/identity/parameters?focus=verdeling"
            Icon={SlidersHorizontal}
            badge="Standaard"
          />
        </div>
      </div>

      {/* Markt-aannames */}
      <div>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — markt-aannames
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Algemene parameters
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Inflatie geldt op alle bedragen. Rendement per bezittingen-groep
            stel je in op{' '}
            <Link
              href="/overzicht/bezittingen"
              className="underline hover:text-[var(--ink-2)]"
            >
              /overzicht/bezittingen
            </Link>{' '}
            (cash, beleggen, huis, pensioen).
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <VoorkeurCard
            label="Inflatie"
            value={formatPct(fireParams.inflationRate)}
            subtitle="Jaarlijkse prijsstijging — index alle bedragen"
            href="/identity/parameters?focus=inflatie"
            Icon={TrendingUp}
            badge="Per jaar"
            onEdit={
              isPlannen
                ? () =>
                    setEditing({
                      title: 'Inflatie',
                      column: 'inflation_rate',
                      currentValuePct: fireParams.inflationRate * 100,
                      helperText: 'NL-default 2.5% per jaar. Past op alle euro-bedragen in de projectie.',
                    })
                : undefined
            }
          />
          <VoorkeurCard
            label="Bruto rendement"
            value={formatPct(fireParams.grossReturn)}
            subtitle="Verwacht jaarrendement op het belegbaar vermogen"
            href="/identity/parameters?focus=rendement"
            Icon={TrendingUp}
            badge="Per jaar"
            onEdit={
              isPlannen
                ? () =>
                    setEditing({
                      title: 'Bruto rendement',
                      column: 'expected_return',
                      currentValuePct: fireParams.grossReturn * 100,
                      helperText: 'Wereldwijde aandelen-historie: ~6-8%. Conservatief: 4-5%. Voorkeur per asset-groep op /overzicht/bezittingen.',
                    })
                : undefined
            }
          />
          <VoorkeurCard
            label="Effectief SWR"
            value={formatPct(fireParams.effectiveSwr)}
            subtitle="Box 3-gecorrigeerd reëel rendement (NL-specifiek)"
            href="/identity/parameters?focus=swr"
            Icon={Wallet}
            badge="Afgeleid"
          />
        </div>
      </div>

      <p className="text-[11px] italic text-[var(--ink-3)]">
        {isPlannen
          ? 'Klik op Eindstrategie, Onttrekking, Inflatie of Rendement om snel bij te werken. Andere voorkeuren via /identity/parameters.'
          : 'Activeer Plannen-modus voor inline-editor. Of bewerk via /identity/parameters.'}
      </p>

      {editing && (
        <VoorkeurBewerkenSheet
          title={editing.title}
          column={editing.column}
          currentValuePct={editing.currentValuePct}
          helperText={editing.helperText}
          onClose={() => setEditing(null)}
        />
      )}

      {editingOnttrekking && (
        <OnttrekkingsBewerkenSheet
          currentStrategy={withdrawalStrategy.strategy as WithdrawalStrategyType}
          onClose={() => setEditingOnttrekking(false)}
        />
      )}

      {editingEindstrategie && (
        <EindstrategieBewerkenSheet
          currentStrategy={fireStrategy.strategy as FireEndStrategy}
          onClose={() => setEditingEindstrategie(false)}
        />
      )}
    </section>
  )
}

function VoorkeurCard({
  label,
  value,
  subtitle,
  href,
  Icon,
  badge,
  onEdit,
}: {
  label: string
  value: string
  subtitle: string
  href: string
  Icon: typeof SlidersHorizontal
  badge?: string
  /** Wanneer aanwezig: card wordt button met inline-edit i.p.v. Link. */
  onEdit?: () => void
}) {
  const cardClass =
    'rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all flex flex-col text-left w-full'
  const cardInner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {label}
        </div>
        {onEdit ? (
          <Pencil className="w-3.5 h-3.5 text-[var(--ink-4)]" aria-hidden="true" />
        ) : (
          <Icon className="w-3.5 h-3.5 text-[var(--ink-4)]" aria-hidden="true" />
        )}
      </div>
      <div className="font-serif text-base sm:text-lg font-semibold text-[var(--ink)] tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug flex-1">
        {subtitle}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {badge ? (
          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] bg-[var(--subtle)] rounded-full px-2 py-0.5">
            {badge}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[11px] font-semibold text-violet-700 inline-flex items-center gap-1">
          {onEdit ? 'Bijwerken' : 'Bewerken'}
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </span>
      </div>
    </>
  )
  if (onEdit) {
    return (
      <button type="button" onClick={onEdit} className={cardClass}>
        {cardInner}
      </button>
    )
  }
  return (
    <Link href={href} className={cardClass}>
      {cardInner}
    </Link>
  )
}
