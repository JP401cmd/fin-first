'use client'

import Link from 'next/link'
import { Activity, Target } from 'lucide-react'

/**
 * Gedeelde lege-staat-card voor de hero. Health- en Doelen-empty-states
 * deelden ~80% markup — dit gegenereerd component houdt copy + styling
 * op één plek.
 */
export function EmptyStateCard({
  icon: Icon,
  iconColor,
  iconBg,
  kicker,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  icon: typeof Activity
  iconColor: string
  iconBg: string
  kicker: string
  title: string
  body: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <article className="flex flex-col border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-9 h-9 ${iconBg} flex items-center justify-center`}
        >
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor}`} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            {kicker}
          </div>
          <div className="text-base font-semibold text-[var(--ink)]">{title}</div>
        </div>
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">{body}</p>
      <Link
        href={ctaHref}
        className="self-start inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold min-h-11 hover:opacity-80 transition-opacity"
      >
        {ctaLabel}
      </Link>
    </article>
  )
}

export function HealthScoreEmptyState() {
  return (
    <EmptyStateCard
      icon={Activity}
      iconColor="text-kern-700"
      iconBg="bg-kern-50"
      kicker="Gezondheid"
      title="Nog geen score"
      body="Voeg bezittingen of een schuld toe en je financiële gezondheid verschijnt — vier pijlers (buffer, schuld, sparen, vrijheid) die samen één cijfer vormen."
      ctaHref="/overzicht/bezittingen"
      ctaLabel="Voeg bezitting toe →"
    />
  )
}

export function DoelenEmptyState() {
  return (
    <EmptyStateCard
      icon={Target}
      iconColor="text-horizon-700"
      iconBg="bg-horizon-50"
      kicker="Doelen"
      title="Stel je eerste doel"
      body="Een doel maakt zichtbaar waar je naar toe werkt — vrijheid op je 62e, kind in 2027, of een ander mijlpaal. Voortgang zie je dan elke keer dat je inlogt."
      ctaHref="/toekomst"
      ctaLabel="Maak een doel →"
    />
  )
}
