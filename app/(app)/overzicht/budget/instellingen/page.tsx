import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageVerdictOpening } from '@/components/editorial'
import { resolveRouteTitle } from '@/lib/nav-config'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { getPageInfo } from '@/lib/page-info-content'
import { loadBudgetCashSources } from '@/lib/budget-cash-sources'
import { BudgetCashSources } from '@/components/overview/budget-cash-sources'
import { CashflowInstellingenBlokLazy } from '@/components/overview/cashflow-instellingen-lazy'

export const metadata: Metadata = {
  title: 'Budget-instellingen — TriFinity',
  description:
    'Waar je cijfers op rusten: je schatting van inkomen, uitgaven en spaarquote, plus de rekeningen die meelopen in budgetteren.',
}

/**
 * /overzicht/budget/instellingen — de vierde tegel op de budgetpagina (W-002).
 *
 * ── Wat hier staat, en waarom hier ──────────────────────────────────────────
 * Twee dingen die allebei bepalen wat je op /overzicht/budget ziet, en die
 * allebei ergens anders stonden:
 *
 *  1. **De grondslag** — je schatting van inkomen, uitgaven en spaarquote
 *     (`CashflowInstellingenBlokLazy`). Die stond onderaan
 *     /overzicht/budget/transacties, onder de vouw, achter een disclosure. Daar
 *     was hij een voetnoot bij een lijst; hier is hij waar je 'm zoekt. Hij is
 *     VERHUISD, niet gekopieerd — op de transactiepagina staat hij niet meer.
 *
 *  2. **De rekeningkeuze** — welke cash- en spaarrekeningen meelopen in
 *     budgetteren (`BudgetCashSources`). Die keuze was tot nu toe alleen te
 *     maken in de inrichtwizard of per rekening bij Bezittingen. Het is
 *     dezelfde keuze en hetzelfde schrijfpad (`POST /api/assets/toggle-budget`),
 *     dus de twee schermen kunnen niet uit elkaar lopen.
 *
 * ── Wél een info-knop, geen statuspunt ──────────────────────────────────────
 * Dit scherm begon als pure instelling — de permanente uitzondering op besluit 9
 * (`SETTINGS_OR_FLOW_ROUTES`), net als /mijn/uiterlijk. Dat is herzien: het
 * draagt inhoud die nergens anders staat, met name dat onderlinge overboekingen
 * tussen twee meelopende eigen rekeningen op de post "Eigen rekening" horen —
 * anders tellen ze dubbel en drukken ze de spaarquote. Dat is een
 * "wat zie ik hier?"-vraag, dus de `i` staat er.
 *
 * Géén statuspunt: de route staat niet in `ROUTE_FAMILY`
 * (`lib/page-status/compute.ts`), want een instellingenpagina heeft geen
 * stoplicht — er is dus niets te minimaliseren of te heropenen.
 *
 * ── Streaming ───────────────────────────────────────────────────────────────
 * Er staat GEEN await boven de return: de titel en de aanhef zitten in de eerste
 * byte, de rekeningenlijst stroomt er in zijn eigen `<Suspense>` achteraan en de
 * grondslag laadt pas wanneer hij in beeld komt (eigen lazy-eiland).
 */
export default async function BudgetInstellingenPage() {
  return (
    <>
      <NavStackMeta title="Instellingen" bottomBar={{ kind: 'tabs' }} />

      {/* Eigen `relative` rij voor de header-control, zoals /forecast en
          /transacties het doen — zo hoeft de aanhef eronder geen gutter te
          reserveren. Geen statuspunt ernaast (deze route heeft geen stoplicht),
          dus de `i` staat alleen op de vaste offset. */}
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          content={getPageInfo('/overzicht/budget/instellingen')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Geen oordeel op deze route: een instelling is een keuze, geen score
            (er staat hierboven dan ook bewust geen statuspunt). `verdict={null}`
            maakt de titel de kale paginanaam, op beide breakpoints zichtbaar. */}
        <PageVerdictOpening
          pageName={resolveRouteTitle('/overzicht/budget/instellingen') ?? 'Instellingen'}
          verdict={null}
          deck="Welke rekeningen meetellen en waarop je cijfers rusten. Wat je hier wijzigt, rekent je budget meteen mee."
        />

        <section className="space-y-3">
          <h2 className="font-display text-[17px] font-semibold leading-snug text-[var(--ink)] sm:text-[19px]">
            Rekeningen die meelopen
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-[var(--ink-2)]">
            Alleen transacties van deze rekeningen tellen mee in je budgetten en je geldstroom.
            Dezelfde vinkjes staan bij je bezittingen, per rekening — het is één keuze.
          </p>
          <Suspense fallback={<CashSourcesFallback />}>
            <CashSourcesLoader />
          </Suspense>
        </section>
      </div>

      {/* BUITEN de container hierboven, met opzet: dit blok draagt zijn eigen
          `mx-auto max-w-6xl px-4 sm:px-6`-wrapper (die moet blijven staan omdat
          het bij een mislukte fetch helemaal verdwijnt, padding incluis).
          Erbinnen zetten zou de horizontale padding verdubbelen. */}
      <CashflowInstellingenBlokLazy />
    </>
  )
}

/**
 * De rekeningenlijst, server-geladen (ADR 0058) en expliciet gescopet op de
 * eigen gebruiker — de SELECT-policy op `assets` is huishoud-gedeeld, dus
 * zonder die filter zou de partner hier meekomen. Zie `lib/budget-cash-sources.ts`.
 */
async function CashSourcesLoader() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const sources = await loadBudgetCashSources(supabase, user.id)
  return <BudgetCashSources sources={sources} />
}

/** Reserveert de hoogte van twee rekeningregels — de veelvoorkomende kant. */
function CashSourcesFallback() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-11 border border-[var(--border-ed)] bg-[var(--subtle)]/40" />
      ))}
    </div>
  )
}
