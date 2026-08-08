import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageOpening } from '@/components/editorial'
import { PalettePicker } from '@/components/mijn/palette-picker'
import { FontPicker } from '@/components/mijn/font-picker'
import { ModuleAccentPicker } from '@/components/mijn/module-accent-picker'
import { BudgetTintPicker } from '@/components/mijn/budget-tint-picker'
import { CategoryTintPicker } from '@/components/mijn/category-tint-picker'
import { SpendLimitAliasPicker } from '@/components/mijn/spend-limit-alias-picker'

export const metadata: Metadata = {
  title: 'Uiterlijk — TriFinity',
  description: 'Kies kleurpalet, accentkleur en typografie voor TriFinity.',
}

/**
 * /mijn/uiterlijk — uiterlijk-instellingen (plan A-2 ontmantelen van
 * legacy settings-monster, voltooid; daarna C5 "scope-discipline"-reorg).
 *
 * Alle weergave-blokken van de oude monolith leven hier. De PAGINA leidt
 * met de twee essentiële keuzes — Palet (wisselt het hele token-systeem)
 * en Typografie (leesbaarheid) — en stopt de diepe maatwerk-pickers
 * (module-accenten, budget-tints, fase-kleuren, categoriekaart-tinten)
 * weg in een standaard-dichte "Geavanceerd"-disclosure. Niets is
 * verwijderd: alle providers, persistence en standaard-knoppen blijven;
 * de diepe instellingen zijn één klik onder "Geavanceerd" bereikbaar.
 */
export default function MijnUiterlijkPage() {
  return (
    <>
      <NavStackMeta title="Uiterlijk" bottomBar={{ kind: 'tabs' }} />
      <section className="mx-auto max-w-2xl px-4 sm:px-6 py-6">
        <PageOpening
          className="mb-6"
          kicker="Mijn · uiterlijk"
          titleBefore="Hoe ziet TriFinity "
          emphasis="eruit"
          titleAfter="?"
          deck="Wissel tussen de paletten — van warm cream tot knapperig krant-wit — en de typografie. Je keuze wordt opgeslagen en geldt voor alle pagina's. Fijnregelen kan onder “Geavanceerd”."
        />

        {/* Essentieel — Palet wisselt het complete token-systeem in één klik. */}
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <PalettePicker />
        </div>

        {/* Essentieel — Typografie stuurt leesbaarheid van de hele app. */}
        <div className="mt-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <FontPicker />
        </div>

        {/*
          Geavanceerd — diepe maatwerk-kleurpickers, standaard ingeklapt.
          <details> = nul JS, server-renderbaar; opent op klik. Editorial:
          scherpe hoeken, --ink/--paper tokens, Kicker-label als summary.
          Elke onderliggende picker behoudt zijn eigen standaard-knop.
        */}
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:px-6">
            <span>
              <span className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Geavanceerd
              </span>
              <span className="mt-0.5 block text-sm text-[var(--ink-2)]">
                Accentkleuren, budget-tints, categoriekaart-tinten en naamgeving
                fijnregelen
              </span>
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              <span className="group-open:hidden">Openen +</span>
              <span className="hidden group-open:inline">Sluiten −</span>
            </span>
          </summary>

          <div className="mt-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <ModuleAccentPicker />
          </div>

          <div className="mt-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <BudgetTintPicker />
          </div>

          <div className="mt-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <CategoryTintPicker />
          </div>

          {/* Naamgeving — de weergavenaam voor grenzenpotten. Puur cosmetisch
              (ADR 0089 besluit 1) en bewust de ENIGE plek waar deze keuze staat. */}
          <div className="mt-4 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <SpendLimitAliasPicker />
          </div>
        </details>

        <p className="mt-6 text-xs leading-relaxed text-[var(--ink-2)]">
          Wijzigingen worden direct toegepast en gesynct met je account. Elke sectie heeft een eigen
          standaard-knop om naar de fabrieksinstelling terug te zetten.
        </p>
      </section>
    </>
  )
}
