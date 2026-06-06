import { createClient } from '@/lib/supabase/server'
import { loadCoreData } from '@/lib/core-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { CoreLanding } from '@/components/core/core-landing'

/**
 * Kern-landing — pure registratie van bezittingen en schulden.
 * Vervangt het oude god component (`core-client.tsx`) — registratie zonder
 * verdieping is een volwaardige use-case, dus geen module-eis op deze route.
 *
 * Bij data-fout valt de pagina terug op een editorial error-state met
 * retry-instructie i.p.v. een leeg client-side render.
 */
export default async function CoreServerPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  try {
    const coreData = await loadCoreData(supabase, perspective)
    return <CoreLanding initialData={coreData} />
  } catch (err) {
    return <CoreLandingError detail={err instanceof Error ? err.message : null} />
  }
}

function CoreLandingError({ detail }: { detail: string | null }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Kern niet beschikbaar
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
