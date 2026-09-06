import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  TransactiesVersheidBanner,
  TransactiesKoopkrachtKaart,
} from '@/components/overview/transacties/transacties-notices-loader'
import { InsightToggleButton } from '@/components/editorial/insight-toggle-button'
import { INFLATION_IMPACT_ID } from '@/components/overview/inflation-impact-card'
import { CashflowInstellingenBlokLazy } from '@/components/overview/cashflow-instellingen-lazy'
import { loadAccountCount } from '@/lib/account-count'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { KoppelRekeningBanner } from '@/components/overview/koppel-rekening-banner'
import { TransactiesAnalyse } from '@/components/overview/transacties/transacties-analyse'
import { SpendLimitsSection } from '@/components/overview/transacties/spend-limits-section'
import { loadSpendLimitsSection } from '@/lib/spend-limits/loader'
import { getCachedPerspectiveContext } from '@/lib/household/perspective-loader-server'
import { loadTransactionFlags } from '@/lib/household/transaction-flags'
import type { WidgetPrefs } from '@/lib/widget-catalog'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Transacties — TriFinity',
  description: 'Analyseer je transacties per periode: geldstroom, top-tegenpartijen en patronen.',
}

/**
 * /overzicht/budget/transacties — periode-gestuurde transactie-analyse.
 * De analyse is een client-component (TransactiesAnalyse) die zélf data ophaalt
 * per gekozen periode; de server levert enkel het accountCount voor de
 * koppel-banner.
 *
 * Dat aantal komt uit `loadAccountCount` — één perspectief-gescopede count-query
 * op bank_accounts. Voorheen draaide deze pagina daarvoor de volledige
 * `loadCashflowData` (perspectief-keten, 6 maanden transacties, recurrings, een
 * naam-decoratie per getoonde feed-rij) om er precies één integer uit te lezen;
 * de rest van die bundel wordt op deze route nergens gebruikt.
 *
 * NUANCE sinds ADR 0135: `TransactiesNoticesLoader` roept `loadCashflowData`
 * wél weer aan, voor één scalar — de €500-drempel van de inflatiekaart. Dat is
 * een bewuste keuze van de eigenaar: het blok staat achter een eigen
 * `<Suspense>` en houdt de analyse dus niet op, het is serverwerk per verzoek
 * en geen wachttijd voor de gebruiker. De besparing hierboven geldt nog steeds
 * voor het KRITIEKE pad; hij is niet stil teruggedraaid.
 *
 * DEEPLINK NAAR ÉÉN GRENZENPOT (D7 / FR-B1-09): `?limit=<uuid>` opent de
 * prestatieweergave van die pot, `&periode=<periodKey>` selecteert er meteen een
 * periode in. De server leest de parameters alleen — valideren gebeurt in de
 * sectie tegen de potten die de loader daadwerkelijk teruggaf, zodat een onbekend
 * of gearchiveerd id stilzwijgend niets doet in plaats van een foutpagina op te
 * leveren. In Next 16 zijn `searchParams` een Promise; vandaar de `await`.
 */
export default async function OverzichtCashflowTransactiesPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string | string[]; periode?: string | string[] }>
}) {
  const { limit, periode } = await searchParams
  // Een herhaalde query-parameter (`?limit=a&limit=b`) komt als array binnen —
  // dan is er geen eenduidige bedoeling en openen we niets.
  const openLimitId = typeof limit === 'string' && limit.length > 0 ? limit : null
  const openPeriodKey = typeof periode === 'string' && periode.length > 0 ? periode : null

  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const accountCount = await loadAccountCount(supabase, perspective)
  // Grenzenpotten worden SERVER-SIDE geladen (ADR 0058) en als props doorgegeven;
  // de sectie herrekent zelf niets. De loader is goedkoop voor wie geen pot heeft:
  // één geïndexeerde query op spend_limits, en pas daarna de aggregaat-RPC's.
  const spendLimits = await loadSpendLimitsSection(supabase)
  // "Te bespreken" (ADR 0128): server-geladen op de request-gecachte
  // huishoud-context; `null` voor solo-gebruikers → de sectie rendert niet.
  const teBespreken = await loadTransactionFlags(
    supabase,
    await getCachedPerspectiveContext(supabase),
  )

  // Widget-prefs voor de schakelaar "Widget op dashboard" in het bewerkformulier.
  // Server-side gelezen en als prop doorgegeven (ADR 0058) — de sectie leidt de
  // effectieve staat af met `isSpendLimitWidgetEnabled`, dezelfde helper die de
  // loader-injectie en PATCH /api/spend-limits/[id]/widget gebruiken. Eigen rij,
  // anon-RLS-client; `null` betekent "nog nooit iets aangepast" en de helper valt
  // dan terug op de injectie-regel (actief = zichtbaar).
  //
  // Alleen de potten-schakelaar heeft dit nodig, dus het blijft één smalle
  // kolomselectie op één rij — geen tweede dashboardbundel op deze pagina.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('widget_prefs').eq('id', user.id).maybeSingle()
    : { data: null }
  const savedWidgets = (profile?.widget_prefs as WidgetPrefs | null)?.widgets
  const widgetPrefs = Array.isArray(savedWidgets) ? savedWidgets : null

  return (
    <>
      <NavStackMeta title="Transacties" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        {/* Verhuisd van de opgeheven cashflow-hub, samen met de inflatiekaart
            waar hij bij hoort: haalt het weggeklikte inzicht terug. Vaste
            offsets links van het statuspunt (meldingen-conventie). */}
        <InsightToggleButton
          ids={[INFLATION_IMPACT_ID]}
          className="absolute right-[84px] top-4 sm:right-[92px]"
        />
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/budget/transacties')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Editorial header — gedeeld kop-patroon met de cashflow-familie. */}
        <PageOpening
          kicker="Je geldstroom"
          titleBefore="Waar gaat je "
          emphasis="tijd"
          titleAfter=" naartoe?"
          deck="Elke transactie is gekochte of verkochte tijd — bekijk waar je uren heen gaan."
        />
        <KoppelRekeningBanner accountCount={accountCount} />
        {/* Versheidsmelding, verhuisd van de cashflow-hub: alles hieronder rust
            op transacties, dus als die stilstaan hoort dat er vóór te staan.
            Eigen <Suspense> zodat zijn loader de analyse niet ophoudt; bij verse
            data rendert hij niets. De fallback reserveert de bannerhoogte zodat
            de analyse niet omlaag springt zodra hij binnenkomt. */}
        <Suspense fallback={<div aria-hidden="true" className="h-16 animate-pulse bg-[var(--subtle)]" />}>
          <TransactiesVersheidBanner />
        </Suspense>
        {/* De grenzenpotten staan direct onder de geldstroom-/spaarquote-kaart:
            eerst wat er binnenkomt en overblijft, dan de grenzen die je daarop
            zet. Server-geladen (ADR 0058) en als slot doorgegeven, omdat de
            analyse zelf een client-component is. */}
        <TransactiesAnalyse
          teBespreken={teBespreken}
          /* Bij nul rekeningen staat de KoppelRekeningBanner hierboven, en die
             biedt koppelen én importeren al — dan hoeven ze niet nog eens in de
             actie-rij. Zelfde conditie als de banner zelf gebruikt. */
          vulIngangenInBanner={accountCount === 0}
          naGeldstroom={
            <SpendLimitsSection
              data={spendLimits}
              openLimitId={openLimitId}
              openPeriodKey={openPeriodKey}
              widgetPrefs={widgetPrefs}
            />
          }
        />
        {/* Koopkracht ONDER de analyse — de pagina vraagt waar je tijd naartoe
            gaat, dus eerst het antwoord, dan de zijstap over dertig jaar. Geen
            gereserveerde hoogte: hij verschijnt alleen boven €500
            baseline-uitgaven én kan weggeklikt zijn, dus een vaste reservering
            zou voor een deel van de gebruikers een permanent gat zijn. */}
        <Suspense fallback={null}>
          <TransactiesKoopkrachtKaart perspective={perspective} />
        </Suspense>
      </div>

      {/* Waar je cijfers op rusten — de grondslagkeuze voor inkomen, uitgaven en
          spaarquote (ADR 0103). Verhuisd van de cashflow-hub: die keuze wordt
          gevoed door transacties en budgetten, dus hij hoort naast zijn bron.
          Draagt zijn eigen <section>-wrapper en laadt pas in beeld; bij een
          mislukte fetch rendert hij niets, inclusief de padding. */}
      <CashflowInstellingenBlokLazy />
    </>
  )
}
