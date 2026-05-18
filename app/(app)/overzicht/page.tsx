import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadCoreData } from '@/lib/core-data-loader'
import { CoreLanding } from '@/components/core/core-landing'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore en netto-vermogen-tijdslijn.',
}

/**
 * /overzicht — canonieke landingpagina (nieuwe navigatie-architectuur).
 *
 * Vervangt /core. Voor nu rendert dezelfde CoreLanding-component zodat
 * preview-functionaliteit meteen werkt onder de nieuwe URL. In komende
 * fases wordt CoreLanding zelf hervormd naar de nieuwe lay-out:
 *  - hero: financiële gezondheidsscore + vier-hefbomen-kompas
 *  - tijdslijn: netto vermogen tot vrijheidsmoment (Tier-2 #9)
 *  - 3 cards: wat valt op / een tip / komende maand
 *  - verdiepingen: /overzicht/{bezittingen,schulden,cashflow,belasting}
 */
export default async function OverzichtPage() {
  const supabase = await createClient()

  try {
    const coreData = await loadCoreData(supabase)
    return <CoreLanding initialData={coreData} />
  } catch (err) {
    return <OverzichtError detail={err instanceof Error ? err.message : null} />
  }
}

function OverzichtError({ detail }: { detail: string | null }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Overzicht niet beschikbaar
      </p>
      <h1 className="mt-2 font-serif text-2xl font-semibold text-[var(--ink)]">
        We konden je gegevens niet laden.
      </h1>
      <p className="mt-3 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Vernieuw de pagina om het opnieuw te proberen. Blijft het probleem terugkomen, kijk dan naar je internetverbinding of meld het via support.
      </p>
      {detail && (
        <p className="mt-4 font-mono text-[11px] text-[var(--ink-4)]">{detail}</p>
      )}
    </div>
  )
}
