import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PalettePicker } from '@/components/mijn/palette-picker'
import { FontPicker } from '@/components/mijn/font-picker'
import { ModuleAccentPicker } from '@/components/mijn/module-accent-picker'
import { BudgetTintPicker } from '@/components/mijn/budget-tint-picker'
import { PhaseColorPicker } from '@/components/mijn/phase-color-picker'
import { CategoryTintPicker } from '@/components/mijn/category-tint-picker'

export const metadata: Metadata = {
  title: 'Uiterlijk — TriFinity',
  description: 'Kies kleurpalet, accentkleur en typografie voor TriFinity.',
}

/**
 * /mijn/uiterlijk — uiterlijk-instellingen (plan A-2 ontmantelen van
 * legacy settings-monster).
 *
 * Voor MVP: alleen het cream-palet picker (3 voorkeuzes). Per-module
 * accent-kleuren + font-theme + budget-categorie-tints blijven nog
 * op /identity/instellingen?tab=weergave totdat ze stuk-voor-stuk
 * worden uitgekamerd.
 */
export default function MijnUiterlijkPage() {
  return (
    <>
      <NavStackMeta title="Uiterlijk" bottomBar={{ kind: 'tabs' }} />
      <section className="mx-auto max-w-2xl px-4 sm:px-6 py-6">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Mijn — uiterlijk
          </div>
          <h1 className="mt-1 font-serif text-2xl text-[var(--ink)]">
            Hoe ziet TriFinity eruit?
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-2)] leading-relaxed">
            Wissel tussen de drie cream-paletten. Je keuze wordt lokaal
            opgeslagen en geldt voor alle pagina&apos;s.
          </p>
        </header>

        <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <PalettePicker />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <FontPicker />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <ModuleAccentPicker />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <BudgetTintPicker />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <PhaseColorPicker />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <CategoryTintPicker />
        </div>

        <p className="mt-6 text-[11px] italic text-[var(--ink-3)]">
          Wijzigingen worden direct toegepast en gesynct met je account. Elke sectie heeft een eigen
          standaard-knop om naar de fabrieksinstelling terug te zetten.
        </p>
      </section>
    </>
  )
}
