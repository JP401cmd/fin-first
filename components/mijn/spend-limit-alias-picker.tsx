'use client'

import { Check } from 'lucide-react'
import { useSpendLimitAlias } from '@/lib/hooks/use-spend-limit-alias'
import { SPEND_LIMIT_ALIASES, spendLimitCopy } from '@/lib/spend-limits/copy'

/**
 * SpendLimitAliasPicker — kiest de weergavenaam voor grenzenpotten.
 *
 * De ENIGE plek in de app waar deze keuze staat (FR-B5-03): geen tweede control
 * in de sectie zelf, geen command-palette-actie. Hij hoort in de weergave-familie
 * op /mijn/uiterlijk omdat het puur een naam is — de keuze raakt geen data, geen
 * regel, geen berekening en geen historische periode (ADR 0089 besluit 1).
 *
 * Labels en beschrijvingen komen uit `lib/spend-limits/copy.ts`; dit component
 * bevat bewust geen eigen naam-literals. Persistence loopt via de hook
 * (optimistisch + PUT /api/spend-limit-alias + rollback bij falen).
 *
 * Vorm gespiegeld op FontPicker: kaart-knoppen met `aria-pressed`, Check-badge
 * op de actieve keuze, editorial-tokens (geen module-accent — dit is een
 * app-brede weergavevoorkeur, geen module-identiteit).
 */
export function SpendLimitAliasPicker() {
  const { alias, setAlias } = useSpendLimitAlias()

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Naamgeving
      </div>
      <p className="text-[11px] leading-snug text-[var(--ink-3)]">
        Hoe noemen we de grens die je jezelf stelt op een categorie of winkel? Je keuze geldt overal
        in de app — en verandert verder helemaal niets aan je cijfers.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SPEND_LIMIT_ALIASES.map((option) => {
          const copy = spendLimitCopy(option)
          const active = alias === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setAlias(option)}
              aria-pressed={active}
              className={`group rounded-2xl border p-3 sm:p-4 text-left transition-all ${
                active
                  ? 'border-[var(--ink-2)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--ink-3)]'
              }`}
            >
              <header className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-[var(--ink)]">{copy.plural}</span>
                {active && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--paper)]">
                    <Check className="w-3 h-3" aria-hidden="true" />
                  </span>
                )}
              </header>
              <p className="text-[11px] text-[var(--ink-3)] leading-snug">{copy.aliasDescription}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
