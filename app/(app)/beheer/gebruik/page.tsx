import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { laadGebruikAnalyse, parseIntern, parsePeriode } from '@/lib/beheer/gebruik-analyse/loader'
import { GebruikPagina } from '@/components/app/beheer/gebruik/gebruik-pagina'
import { PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const dynamic = 'force-dynamic'

/**
 * Beheer · Gebruik — geanonimiseerde gebruiksanalyse (ADR 0153).
 *
 * Superadmin-only. De service-role-client roept één RPC aan die uitsluitend
 * k-onderdrukte tellingen teruggeeft; de loader vertaalt die naar een
 * view-model met cellen. Naar de presentatielaag gaat alléén dat view-model —
 * geen ruwe rijen, geen fetch in de browser (ADR 0058).
 */
export default async function BeheerGebruikPage({
  searchParams,
}: {
  searchParams: Promise<{ dagen?: string | string[]; intern?: string | string[] }>
}) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    redirect('/overzicht')
  }

  const params = await searchParams
  const dagen = parsePeriode(params.dagen)
  const intern = parseIntern(params.intern)

  const resultaat = await laadGebruikAnalyse(getServiceClient(), { dagen, intern })

  return (
    <div className="relative">
      <PageInfoButton className="absolute right-0 top-0 z-10" content={getPageInfo('/beheer/gebruik')} />
      <GebruikPagina resultaat={resultaat} />
    </div>
  )
}
