'use client'

import BudgetsClient from '@/components/app/budgets-client'
import type { BudgetsPageData } from '@/lib/budgets-data-loader'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'

// ── Component ────────────────────────────────────────────────

/**
 * Verdiepingstab "Budgetteren" voor de cash-categorie.
 *
 * Bewuste keuze: in plaats van een eigen samenvatting-implementatie te bouwen
 * embedden we hier de volledige `<BudgetsClient />` — dezelfde component die
 * `/core/budgets` rendert. De gebruiker krijgt zo binnen de cash-tab
 * exact dezelfde mogelijkheden (analyse, donut/list/heatmap, CRUD) zonder
 * dat we logica hoeven te dupliceren.
 *
 * Module-uit pad:
 * - Wanneer `moduleActive === false` rendert het outer component direct de
 *   teaser-subcomponent met tip-strip. De `<BudgetsClient />` wordt dan
 *   nooit gemount, dus we voorkomen onnodige Supabase-queries en
 *   localStorage-state setup.
 *
 * Layout-discipline:
 * - `BudgetsClient` heeft een eigen `mx-auto max-w-6xl px-4 sm:px-6 …`
 *   wrapper. De `AssetCategoryPage` draait deze tab al binnen een
 *   `max-w-5xl` container met `px-4 sm:px-6`. Een naïeve embed zou dus
 *   dubbele horizontale padding én een te smalle inhoudsruimte krijgen.
 *   Met `-mx-4 sm:-mx-6` heffen we de buitenste padding op zodat
 *   `BudgetsClient` zijn eigen ademing terug krijgt. De max-width blijft
 *   gecapped op `max-w-5xl` (de outer page-container) — bewust, de
 *   tab-context is per definitie smaller dan de standalone /core/budgets.
 */
export function CashBudgetterenTab({ moduleActive, initialData }: DeepeningTabProps) {
  // Splits op de outer-prop: bij module-uit zien we de actieve tak nooit, dus
  // hoeft de data-state niet te bestaan. Voorkomt setState-in-effect cascades.
  if (!moduleActive) {
    return <CashBudgetterenTeaser />
  }
  // Cast op het eindpunt: de registry-laag gebruikt `unknown` zodat hij
  // generiek blijft, hier weten we precies welke shape we verwachten.
  return <CashBudgetterenActive initialData={initialData as BudgetsPageData | undefined} />
}

// ── Teaser-tak (module uit) ──────────────────────────────────

function CashBudgetterenTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Budgetteren is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met Budgetteren zie je per rekening waar je geld heen gaat en
          berekenen we je spaarquote automatisch. Schakel het in via Instellingen om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer Budgetteren om uitgaven per rekening te volgen en je spaarquote automatisch te berekenen."
        className="border-t-0"
      />
    </div>
  )
}

// ── Actieve tak (module aan) ─────────────────────────────────

interface CashBudgetterenActiveProps {
  initialData?: BudgetsPageData
}

/**
 * Embed de volledige `<BudgetsClient />` in de tab. We negeren bewust de
 * outer-padding van de tab-container (zie layout-noot bovenin) zodat
 * BudgetsClient zijn eigen breakpoints kan gebruiken. Wanneer `initialData`
 * ontbreekt valt BudgetsClient terug op zijn eigen client-side fetch — geen
 * losse skeleton hier nodig, dat regelt BudgetsClient zelf.
 */
function CashBudgetterenActive({ initialData }: CashBudgetterenActiveProps) {
  return (
    <div className="-mx-4 sm:-mx-6">
      <BudgetsClient initialData={initialData} />
    </div>
  )
}
