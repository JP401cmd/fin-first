import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton, PageOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { krantBronVoor, leestTijdlijn } from '@/lib/krant/tijdlijn-bron'
import { leesEigenProfiel, rijNaarV1Profiel } from '@/lib/krant/v1-profiel'
import { NieuwsprofielScherm } from '@/components/krant/nieuwsprofiel-scherm'

/**
 * /mijn/nieuwsprofiel — je nieuwsprofiel voor de Krant (Krant 2C, ADR 0192).
 *
 * Achter de gesloten vlag: alleen voor wie de tijdlijn leest (`krantBronVoor` →
 * leestTijdlijn, met of zonder AI-laag). Voor ieder ander bestaat de pagina
 * niet (404) — zolang TIJDLIJN_BETA_OPEN false is dus alleen voor een
 * superadmin. De route staat al binnen de Krant-grens (KRANT_ROUTES).
 *
 * Lezen via de server (ADR 0058): de eigen rij met expliciete kolommen, als
 * prop naar het client-scherm. Muteren via PUT /api/krant/profiel.
 */

export const dynamic = 'force-dynamic'

export default async function NieuwsprofielPage() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  if (!user) redirect('/login')

  const { bron } = await krantBronVoor(supabase, user.id)
  if (!leestTijdlijn(bron)) notFound()

  const { profiel, herkomst } = rijNaarV1Profiel(await leesEigenProfiel(supabase, user.id))

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Nieuwsprofiel" />

      <PageOpening
        className="mb-2"
        gutterClassName="pr-12 sm:pr-14"
        kicker="Mijn · nieuwsprofiel"
        titleBefore="Wat de Krant over je "
        emphasis="weet"
        titleAfter=""
        deck="Met deze banden kiest de Krant welk nieuws jou raakt, en rekent hij in euro’s uit wat het voor jou betekent. Alles is optioneel. Wat je zelf invult, overschrijft de Krant niet."
      >
        <PageInfoButton content={getPageInfo('/mijn/nieuwsprofiel')} className="absolute right-0 top-0" />
      </PageOpening>

      <NieuwsprofielScherm start={profiel} herkomst={herkomst} />
    </div>
  )
}
