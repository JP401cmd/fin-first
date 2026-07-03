import Link from 'next/link'
import { Images, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { WIDGET_CATALOG } from '@/lib/widget-catalog'
import { WidgetGalerijClient } from './widget-galerij-client'

// Admin-gating regelt app/(app)/beheer/layout.tsx (redirect voor non-admins).

export default async function WidgetGalerijPage({
  searchParams,
}: {
  // Next.js 16: searchParams is een Promise.
  searchParams: Promise<{ load?: string }>
}) {
  const params = await searchParams
  const shouldLoad = params.load === '1'

  // ── Click-to-load (egress) ─────────────────────────────────────
  // De zware loadDashboardData-loader draait NIET bij een gewoon paginabezoek.
  // Pas met ?load=1 halen we de bundel op en renderen we de galerij.
  if (!shouldLoad) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ink)]">Widget-galerij</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Referentiepagina die alle {WIDGET_CATALOG.length} widgets uit de catalogus in elke
            toegestane grootte rendert, op de echte data van jouw account. Module- en
            abonnement-gating wordt bewust omzeild zodat elke widget getoond wordt.
          </p>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-5">
          <p className="text-sm text-[var(--ink-2)]">
            Om egress te sparen wordt de dashboard-data pas geladen na een klik. Dit draait
            dezelfde queryset als het echte dashboard voor dit account.
          </p>
          <Link
            href="/beheer/widget-galerij?load=1"
            className="mt-4 inline-flex items-center gap-2 rounded-[var(--r-sm)] bg-[var(--ink)] px-4 py-2.5 text-xs font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
          >
            <Images className="h-4 w-4" />
            Widgets laden en weergeven
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const { dashboardData } = await loadDashboardData(supabase)

  return <WidgetGalerijClient data={dashboardData} />
}
