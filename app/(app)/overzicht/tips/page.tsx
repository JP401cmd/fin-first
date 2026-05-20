import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadWillData } from '@/lib/will-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { TipsLijst } from '@/components/overview/tips-lijst'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Tips — TriFinity',
  description:
    'Prioriteerbare lijst van Will-aanbevelingen — doe nu, later of negeren.',
}

/**
 * /overzicht/tips — prioriteerbare lijst van Will-recommendations.
 *
 * Plan T-5 (Tier-2 #11): "Tips-overzicht als prioriteerbare lijst,
 * niet als losse cards. Eén top-tip per week met 'doe dit nu / negeer
 * / later' als actie."
 *
 * Eerste item krijgt visueel accent ("Top tip deze week"). Acties
 * persistent via supabase.from('recommendations').update({ status }).
 */
export default async function OverzichtTipsPage() {
  const supabase = await createClient()
  const willData = await loadWillData(supabase)
  const description = PAGE_INFO['/overzicht/tips'] ?? ''

  return (
    <>
      <NavStackMeta title="Tips" bottomBar={{ kind: 'tabs' }} />
      <section className="relative mx-auto max-w-3xl px-4 sm:px-6 py-6">
        {description && (
          <PageInfoButton
            description={description}
            className="absolute right-4 top-6 sm:right-6"
          />
        )}
        <header className="mb-6 pr-12 sm:pr-16">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Will — tips
          </div>
          <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
            Wat zou je nu kunnen doen?
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
            Een prioriteerbare lijst van Will&apos;s aanbevelingen. Markeer
            wat je vandaag oppakt, wat je voor later parkeert, en wat je
            wegfiltert.
          </p>
        </header>

        <TipsLijst recommendations={willData.recommendations} />
      </section>
    </>
  )
}
