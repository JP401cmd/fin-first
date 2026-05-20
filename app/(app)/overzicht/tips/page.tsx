import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadWillData } from '@/lib/will-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { TipsLijst } from '@/components/overview/tips-lijst'
import { OffTrackDoelenLijst } from '@/components/overview/off-track-doelen-lijst'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Tips & acties — TriFinity',
  description:
    'Prioriteerbare lijst van Will-aanbevelingen plus doelen die aandacht vragen.',
}

/**
 * /overzicht/tips — acties-pool MVP. Plan T-5 + §6.6 MVP:
 * recommendations (TipsLijst) + off-track goals (OffTrackDoelenLijst)
 * in één view. Voorkomt dat de gebruiker tussen /overzicht/tips en
 * /toekomst moet schakelen om alles te zien wat aandacht vraagt.
 *
 * Volledige acties-pool met DB-tabel + Will-chat-bron volgt later
 * (§6.6 - DB schema werk).
 */
export default async function OverzichtTipsPage() {
  const supabase = await createClient()
  const willData = await loadWillData(supabase)
  const description = PAGE_INFO['/overzicht/tips'] ?? ''

  return (
    <>
      <NavStackMeta title="Tips & acties" bottomBar={{ kind: 'tabs' }} />
      <section className="relative mx-auto max-w-3xl px-4 sm:px-6 py-6">
        {description && (
          <PageInfoButton
            description={description}
            className="absolute right-4 top-6 sm:right-6"
          />
        )}
        <header className="mb-6 pr-12 sm:pr-16">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Will — acties
          </div>
          <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
            Wat zou je nu kunnen doen?
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
            Tips van Will plus doelen die aandacht vragen — op één plek
            zodat je niet hoeft te schakelen.
          </p>
        </header>

        <TipsLijst recommendations={willData.recommendations} />

        <OffTrackDoelenLijst
          goals={willData.goals}
          goalProgresses={willData.goalProgresses}
        />
      </section>
    </>
  )
}
