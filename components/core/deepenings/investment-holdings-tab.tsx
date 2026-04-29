'use client'

import HoldingsPage from '@/components/core/holdings-client'
import type { HoldingsPageData } from '@/lib/holdings-data-loader'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'

// ── Component ────────────────────────────────────────────────

/**
 * Verdiepingstab "Holdings" voor de investment-categorie.
 *
 * Bewuste keuze: in plaats van een eigen tabel-implementatie te bouwen
 * embedden we hier de volledige `<HoldingsPage />` — dezelfde component die
 * `/core/assets/holdings` rendert. De gebruiker krijgt zo binnen de
 * investment-tab dezelfde rijke ervaring (allocation chart, benchmark,
 * dividend tracker, heatmap, full CRUD) zonder dat we logica dupliceren.
 *
 * Module-uit pad:
 * - Wanneer Aandelenregistratie uit staat tonen we een teaser + tip-strip
 *   met deeplink naar Instellingen. De `<HoldingsPage />` wordt dan nooit
 *   gemount.
 *
 * Layout-discipline:
 * - `HoldingsPage` heeft een eigen `mx-auto max-w-6xl px-4 sm:px-6 …`
 *   wrapper. De `AssetCategoryPage` rendert deze tab al binnen een
 *   `max-w-5xl` container met `px-4 sm:px-6`. Met `-mx-4 sm:-mx-6` heffen
 *   we de outer-padding op zodat HoldingsPage zijn eigen ademing
 *   terugkrijgt. De max-width blijft gecapped op `max-w-5xl` — dat is
 *   bewust de tab-context.
 */
export function InvestmentHoldingsTab({ moduleActive, initialData }: DeepeningTabProps) {
  // Splits op de outer-prop: bij module-uit zien we de actieve tak nooit.
  if (!moduleActive) {
    return <InvestmentHoldingsTeaser />
  }
  // Cast op het eindpunt: registry-laag is generiek (`unknown`), hier
  // weten we welke shape we verwachten van de server-loader.
  return <InvestmentHoldingsActive initialData={initialData as HoldingsPageData | undefined} />
}

// ── Teaser-tak (module uit) ──────────────────────────────────

function InvestmentHoldingsTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Aandelenregistratie is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met Aandelenregistratie zie je per holding de huidige waarde,
          kostenbasis en je dagrendement. Schakel het in via Instellingen om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer Aandelenregistratie om individuele holdings, koersen en dagrendement bij te houden."
        className="border-t-0"
      />
    </div>
  )
}

// ── Actieve tak (module aan) ─────────────────────────────────

interface InvestmentHoldingsActiveProps {
  initialData?: HoldingsPageData
}

/**
 * Embed de volledige `<HoldingsPage />` in de tab. We negeren bewust de
 * outer-padding van de tab-container (zie layout-noot bovenin) zodat
 * HoldingsPage zijn eigen breakpoints kan gebruiken. Wanneer `initialData`
 * ontbreekt valt HoldingsPage terug op zijn eigen client-side fetch — geen
 * losse skeleton hier nodig, dat regelt HoldingsPage zelf.
 */
function InvestmentHoldingsActive({ initialData }: InvestmentHoldingsActiveProps) {
  return (
    <div className="-mx-4 sm:-mx-6">
      <HoldingsPage initialData={initialData} />
    </div>
  )
}
