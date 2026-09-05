import Link from 'next/link'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'
import { createClient } from '@/lib/supabase/server'
import { loadBeheerInboxCounts } from '@/lib/beheer-inbox-counts'
import { loadAiHealth } from '@/lib/ai/ai-health-loader'
import { AiHealthStrip } from '@/components/app/beheer/ai-status-card'

/**
 * De /beheer-hub. De tellers per inbak komen uit een server-loader (ADR 0058:
 * lezen via loader, geen client-fetch). Een teller verschijnt alleen als hij
 * echt geteld is (`number`) — bij `null` (bron onbereikbaar) ontbreekt hij
 * eerlijk in plaats van een nep-0 te tonen.
 *
 * De AI-storingsstrip (UR3-09 / ADR 0132) toont zichzelf alleen bij een
 * patroon (`storing`/`hapering`) — zie `AiHealthStrip`.
 */
export default async function BeheerPage() {
  const supabase = await createClient()
  const [counts, aiHealth] = await Promise.all([
    loadBeheerInboxCounts(supabase),
    loadAiHealth(supabase),
  ])

  return (
    <div className="space-y-10">
      <AiHealthStrip health={aiHealth} />
      {BEHEER_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`beheer-groep-${group.id}`}>
          <div className="border-b border-[var(--border-ed)] pb-2">
            <h2
              id={`beheer-groep-${group.id}`}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)]"
            >
              <span aria-hidden className={`mr-2.5 inline-block h-px w-7 align-middle ${group.stripeClass}`} />
              {group.label}
            </h2>
            <p className="mt-1.5 font-serif text-sm italic text-[var(--ink-3)]">{group.description}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => {
              const Icon = tool.icon
              const count = tool.inboxKey ? counts[tool.inboxKey] : null
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-all duration-150 hover:-translate-y-px hover:border-[var(--border-md)] hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-[var(--ink-2)]"
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
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">{tool.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
