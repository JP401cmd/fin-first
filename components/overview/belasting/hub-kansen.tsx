import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { TaxOpportunity } from '@/lib/tax-overview'
import { Kicker, ScenarioCallout } from '@/components/editorial'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * HubKansen (C4) — "next best action": de grootste belasting-besparingskansen,
 * geordend op €-besparing (de hub levert ze al gesorteerd via
 * `buildTaxOverview.opportunities`).
 *
 * Elke regel: box-streep (functionele kleur) + box-label + titel + €-besparing
 * (Playfair) + vrijheidsdagen + (optionele) deadline + doorklik-link naar de
 * bijbehorende box-subpagina. De bredere balk = meer besparing (relatief t.o.v.
 * de grootste kans), zodat het oog meteen naar de zwaarste hefboom wordt
 * getrokken.
 *
 * DGA-leengrens komt als kans met savings=0 binnen (waarschuwing, geen
 * besparing) — die toont geen balk en geen vrijheidsdagen, alleen de regel.
 *
 * Bewust presentationeel/server-compatible (geen hooks, geen fetching).
 */

const BOX_BADGE: Record<1 | 2 | 3, { label: string; color: string }> = {
  1: { label: 'Box 1', color: '#b45309' }, // amber
  2: { label: 'Box 2', color: '#7c3aed' }, // violet
  3: { label: 'Box 3', color: '#0d9488' }, // teal
}

export function HubKansen({ opportunities }: { opportunities: TaxOpportunity[] }) {
  if (opportunities.length === 0) return null

  // Schaal op de grootste besparing zodat de balklengtes onderling
  // vergelijkbaar zijn (>=1 voorkomt deling door nul bij enkel savings=0).
  const maxSavings = Math.max(...opportunities.map((o) => o.savings), 1)

  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Grootste besparingskansen</Kicker>

      <ul className="mt-4 border-t border-[var(--rule-soft)]">
        {opportunities.map((opp) => {
          const badge = BOX_BADGE[opp.box]
          const pct = Math.min(Math.max((opp.savings / maxSavings) * 100, 0), 100)
          const hasSavings = opp.savings > 0

          return (
            <li key={opp.id} className="border-b border-[var(--rule-soft)] last:border-b-0">
              <Link
                href={opp.href}
                className="group block relative py-4 pl-4 transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                {/* Box-kleur-streep links — functionele onderscheiding. */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-4 bottom-4 w-[3px]"
                  style={{ backgroundColor: badge.color }}
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm font-semibold text-[var(--ink)] leading-snug">
                        {opp.title}
                      </span>
                    </div>

                    {/* Besparing (Playfair) + vrijheidstijd */}
                    {hasSavings ? (
                      <div className="mt-2 flex items-baseline gap-3 flex-wrap text-xs text-[var(--ink-2)]">
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="text-[var(--ink-3)]">tot</span>
                          <span
                            className="font-black tabular-nums text-lg leading-none text-[var(--positive)]"
                            style={{ fontFamily: PLAYFAIR }}
                          >
                            {formatCurrency(opp.savings)}
                          </span>
                          <span className="text-[var(--ink-3)]">besparing</span>
                        </span>
                        {opp.freedomDays > 0 && (
                          <span className="inline-flex items-center gap-1 text-[var(--ink-3)]">
                            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {opp.freedomDays} vrijheidsdagen
                          </span>
                        )}
                      </div>
                    ) : (
                      <p
                        className="mt-2 italic text-xs text-[var(--ink-3)]"
                        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                      >
                        Aandachtspunt — beoordeel voor jaareinde.
                      </p>
                    )}

                    {opp.deadline && (
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                        Deadline · {opp.deadline}
                      </p>
                    )}

                    {/* Besparings-balk (relatief op de grootste kans) — scherp. */}
                    {hasSavings && (
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden bg-[var(--subtle)]">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, backgroundColor: badge.color }}
                        />
                      </div>
                    )}
                  </div>

                  <ArrowRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
                    aria-hidden="true"
                  />
                </div>
              </Link>

              {/* "Voeg toe als actie" — deterministisch via het acties-systeem.
                  Buiten de Link gehouden (geen genest interactief element) en
                  uitgelijnd onder de regel-content (pl-4 matcht de Link-padding). */}
              <div className="pb-4 pl-4 -mt-1">
                <AandachtspuntActieButton
                  id={`tax:${opp.id}`}
                  domain="tax"
                  title={opp.title}
                  savings={opp.savings}
                  freedomDays={opp.freedomDays}
                  deadline={opp.deadline}
                  href={opp.href}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-5">
        <ScenarioCallout title="Indicatie, geen advies.">
          {' '}Geschatte besparing per hefboom — geen aangifte of fiscaal advies.
        </ScenarioCallout>
      </div>
    </article>
  )
}
