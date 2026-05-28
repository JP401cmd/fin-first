'use client'

import Link from 'next/link'
import { ArrowRight, Inbox, MessageCircle, Clock } from 'lucide-react'

/**
 * ActiesTeaser — compacte strip op /overzicht die naar de Acties-pool
 * verwijst. Vervangt de inline 2-koloms ActionCenter sinds de
 * acties-pool een eigen pagina kreeg (/overzicht/acties) en voorstellen
 * naar Will-chat verhuisden.
 *
 * Toont drie tegels:
 *   - Open acties      → /overzicht/acties
 *   - Uitgesteld werk  → /overzicht/acties (lane: postponed)
 *   - Voorstellen      → Will-chat met kick-off-prompt
 *
 * Counts komen van de server (loadWillData kpiData). De Voorstellen-tegel
 * heeft geen count omdat voorstellen niet meer persisteren voor de
 * gebruiker — ze komen voorbij in de chat en zijn na beslissing weg.
 */
interface ActiesTeaserProps {
  openActionCount: number
  postponedActionCount: number
}

export function ActiesTeaser({ openActionCount, postponedActionCount }: ActiesTeaserProps) {
  const items = [
    {
      href: '/overzicht/acties',
      Icon: Inbox,
      label: 'Open acties',
      count: openActionCount,
      sublabel: openActionCount === 1 ? 'wacht op jou' : 'wachten op jou',
    },
    {
      href: '/overzicht/acties#postponed',
      Icon: Clock,
      label: 'Uitgesteld',
      count: postponedActionCount,
      sublabel: postponedActionCount === 1 ? 'staat klaar' : 'staan klaar',
    },
    {
      href: '/berichten?prompt=analyseer-mijn-financien',
      Icon: MessageCircle,
      label: 'Will-voorstellen',
      count: null,
      sublabel: 'vraag analyse aan',
    },
  ] as const

  return (
    <section aria-label="Acties" className="mt-4 px-4 sm:px-6">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Wat zou je nu kunnen doen
          </div>
          <h2 className="mt-0.5 font-serif text-lg sm:text-xl text-[var(--ink)]">
            Acties en voorstellen
          </h2>
        </div>
        <Link
          href="/overzicht/acties"
          className="inline-flex items-center gap-1 text-xs font-semibold text-wil-700 hover:text-wil-800"
        >
          Alle acties
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {items.map(({ href, Icon, label, count, sublabel }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-colors hover:border-wil-300 hover:shadow-sm"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wil-50 text-wil-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                {count !== null && (
                  <span className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
                    {count}
                  </span>
                )}
                <span className={`text-sm font-medium text-[var(--ink-2)] ${count !== null ? '' : 'font-semibold'}`}>
                  {label}
                </span>
              </div>
              <p className="text-[11px] text-[var(--ink-3)] leading-snug">{sublabel}</p>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5 group-hover:text-wil-700"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  )
}
