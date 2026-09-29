import Link from 'next/link'
import type { BeheerInboxCounts } from '@/lib/beheer-inbox-counts'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'

/**
 * Alle beheerschermen, in de vier vaste groepen uit `lib/beheer-sections.ts`.
 *
 * Het dashboard kiest wat aandacht vraagt; dit blok houdt al het andere
 * bereikbaar. Niet elk scherm krijgt een indicator, wel elk scherm een ingang.
 * De tellers per inbak komen uit dezelfde loader als voorheen en ontbreken
 * eerlijk als de bron niet te lezen was.
 */
export function AlleSchermen({ counts }: { counts: BeheerInboxCounts }) {
  return (
    <div className="space-y-8">
      {BEHEER_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`beheer-groep-${group.id}`}>
          <div className="border-b border-[var(--border-ed)] pb-2">
            <h4
              id={`beheer-groep-${group.id}`}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)]"
            >
              <span aria-hidden className={`mr-2.5 inline-block h-px w-7 align-middle ${group.stripeClass}`} />
              {group.label}
            </h4>
            <p className="mt-1.5 font-serif text-sm italic text-[var(--ink-3)]">{group.description}</p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => {
              const Icon = tool.icon
              const count = tool.inboxKey ? counts[tool.inboxKey] : null
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-all duration-150 hover:-translate-y-px hover:border-[var(--border-md)] hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-colors group-hover:text-[var(--ink-2)]"
                    />
                    <span className="text-sm font-medium text-[var(--ink)]">{tool.label}</span>
                    {count != null && count > 0 && (
                      <span
                        data-testid="beheer-inbox-count"
                        className="ml-auto shrink-0 border border-[var(--border-md)] px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums text-[var(--ink-2)]"
                      >
                        {count}
                        <span className="sr-only"> open</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">{tool.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
