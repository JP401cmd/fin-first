import Link from 'next/link'
import { Check, X, ArrowRight } from 'lucide-react'
import type { CalculatorRequirementCheck } from '@/lib/calculator/requirements'

/**
 * RequirementsChecklist — checklist met groen-vinkje of grijs-kruisje
 * per vereiste, plus deeplink naar de plek waar de gebruiker het kan
 * toevoegen. Verschijnt op de detail-preview van een publieke
 * rekenhulp, boven de read-only runner.
 *
 * Bij `met=true` toont een groen vinkje en geen actie-link (alles is
 * compleet). Bij `met=false` een grijs kruisje + een "Voeg toe →"
 * deeplink-pill rechts uitgelijnd.
 */
export function RequirementsChecklist({
  checks,
}: {
  checks: CalculatorRequirementCheck[]
}) {
  if (checks.length === 0) {
    return (
      <p className="text-xs text-[var(--ink-3)] italic">
        Deze rekenhulp heeft geen specifieke gegevens nodig — je kunt 'm
        meteen draaien.
      </p>
    )
  }

  const totalMet = checks.filter((c) => c.met).length
  const allMet = totalMet === checks.length

  return (
    <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
          Vereiste gegevens
        </h3>
        <span
          className={[
            'text-[10px] font-mono tabular-nums',
            allMet ? 'text-emerald-700' : 'text-[var(--ink-3)]',
          ].join(' ')}
        >
          {totalMet} / {checks.length} compleet
        </span>
      </header>
      <ul className="space-y-2">
        {checks.map((check) => (
          <li
            key={check.kind}
            className="flex items-start gap-2.5"
          >
            <span
              className={[
                'inline-flex w-5 h-5 shrink-0 items-center justify-center rounded-full mt-0.5',
                check.met
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-[var(--subtle)] text-[var(--ink-3)]',
              ].join(' ')}
              aria-hidden="true"
            >
              {check.met ? (
                <Check className="w-3 h-3" strokeWidth={3} />
              ) : (
                <X className="w-3 h-3" strokeWidth={3} />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--ink)] leading-tight">
                {check.label}
                <span className="sr-only">
                  {check.met ? ' (compleet)' : ' (ontbreekt)'}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-2)] leading-snug mt-0.5">
                {check.detail}
              </p>
            </div>
            {!check.met && (
              <Link
                href={check.deepLink}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors shrink-0"
              >
                Voeg toe
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
