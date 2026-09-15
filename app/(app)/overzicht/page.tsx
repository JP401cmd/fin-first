import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { getOwnProfile } from '@/lib/server-data/base'
import { getTxAgg12m, aggLatestMonth, type TxMonthAggregateRow } from '@/lib/server-data/tx-aggregates'
import { StaleDataGuard } from '@/components/app/stale-data-guard'
import { StaleNoticeBanner } from '@/components/app/stale-transactions-notice'
import { readMinimizedMap } from '@/lib/page-status/minimized-prefs'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { OverzichtHeroPrimary } from '@/components/overview/overzicht-hero'
import {
  OverzichtSecondaryLoader,
  OverzichtNetWorthChartLoader,
} from '@/components/overview/overzicht-secondary-loader'
import { OverzichtSecondaryFallback } from '@/components/overview/overzicht-secondary'
import { MiniNetWorthChartAnchor } from '@/components/overview/mini-networth-chart-anchor'
import { resolveOverviewGreeting } from '@/lib/overview/greeting'
import { CheckinBanner } from '@/components/overview/checkin-banner'
import { ageAtDate } from '@/lib/horizon-data'
import { isFixedAnchor, resolveFreedomAgeView } from '@/lib/fire-strategy'
import { lookupAowAge } from '@/lib/aow-leeftijd'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { loadCheckinBannerSeed, isCheckinBannerEligible } from '@/lib/overview/banner-seeds'
import { loadRondleidingSeed } from '@/lib/rondleiding/seed'
import { RondleidingProvider } from '@/components/overview/rondleiding/rondleiding-provider'
import { leverToLeverageStatus } from '@/components/app/shell/lever-scores'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { Hefboom } from '@/lib/hefboom-config'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore en briefing.',
}

/**
 * /overzicht — canonieke landing, gestreamd in blokken (perf Task 2.4 + de kaart
 * "gezondheid & netto vermogen los laden van widgets"):
 *
 *  Blok 1 (direct): de begroeting + het vier-hefbomen-kompas ÉN de
 *  Health-Score-card (`OverzichtHeroPrimary`). Hangt UITSLUITEND van de lichte,
 *  `cache()`-gedeelde blok-1-loaders af — `loadLeverScores` + `loadHorizonData`
 *  (health/vrijheid%/housing/leeftijd) + het profiel (naam) + de check-in-seed.
 *  Paint dus zónder op de zware `loadDashboardData` te wachten;
 *  gezondheid komt daardoor meteen in beeld, los van de widget-databundel.
 *
 *  `heroChart` (gestreamd, eigen `<Suspense>`): de mini-vermogen-grafiek
 *  (`OverzichtNetWorthChartLoader`). De per-jaar-PROJECTIE komt uit de
 *  kernel-zware `loadDashboardData` en kan niet mee naar blok 1; het HUIDIGE
 *  netto vermogen staat al perspectief-correct in het kompas van blok 1.
 *
 *  `secondary` (gestreamd, eigen `<Suspense>`): `OverzichtSecondaryLoader` doet
 *  `loadDashboardData` + will + markt-/check-in-briefing + de wekelijkse
 *  snapshot-write + de page-status-seed, en levert de widget-rail, compound en
 *  briefing. Elke Suspense-fallback reserveert een stabiele hoogte (skeleton)
 *  zodat de instroom geen layout-shift geeft (CLS blijft ~0).
 *
 * DEDUP: `horizonData` gaat als prop mee (geen tweede horizon-load); de drie
 * `loadDashboardData`-consumers (chart-loader, secondary-loader, page-status-
 * seed) delen dezelfde React-`cache()`-wrapper → één query-set per request.
 */
export default async function OverzichtPage() {
  const supabase = await createClient()
  // Actieve weergave (Eigen / Huishouden / Partner) uit de tf_perspective-cookie.
  const perspective = await getServerPerspective()

  // Eén auth-round-trip vooraf (React cache()): de loaders roepen intern
  // getCachedUser(supabase) aan; dit hoist die call. Met de user-id vooraf kan
  // de check-in-seed meteen in dezelfde parallelle blok-1-batch.
  const authUser = await getCachedUser(supabase)
  const userId = authUser?.id ?? null

  // ── BLOK 1: lichte, cache()-gedeelde loaders (geen loadDashboardData) ──
  // `getOwnProfile` is `cache()`-wrapped en wordt óók door de twee loaders
  // aangeroepen → hier "gratis" (voor de gebruikersnaam). De check-in-seed hangt
  // enkel van de user-id af.
  const [
    leverScoresResult,
    horizonData,
    ownProfileRes,
    checkinBannerBase,
    txAgg12Res,
    minimizedMap,
  ] = await Promise.all([
    loadLeverScores(supabase, perspective),
    loadHorizonData(supabase, perspective),
    getOwnProfile(supabase),
    userId ? loadCheckinBannerSeed(supabase, userId) : Promise.resolve(undefined),
    // VERSHEID (UR2-13): de jongste maand mét boekingen, voor de melding
    // "gegevens verouderd" in de banner-slot hieronder. `getTxAgg12m` is
    // React-`cache()`-gewrapt en wordt in blok 2 door `loadDashboardData`
    // opnieuw aangeroepen — deze aanroep verschuift die RPC dus naar voren in
    // plaats van er één toe te voegen, en houdt hem in dezelfde parallelle golf.
    getTxAgg12m(supabase),
    // Server-seed van de "geminimaliseerd"-voorkeur voor diezelfde melding
    // (own-row jsonb-pref, cross-device). Lichte single-row select, parallel aan
    // de rest van de golf — zo flikkert de banner/het statuspunt niet na
    // hydration. Zelfde vorm als /toekomst voor de tekort-lening-melding.
    userId
      ? readMinimizedMap(supabase, userId)
      : Promise.resolve({} as Record<string, unknown>),
  ])

  const userName = (ownProfileRes.data as { full_name?: string | null } | null)?.full_name ?? null
  // UR3-10 — de check-in-banner nodigt uit tot een terugblik; op een account dat
  // deze maand is aangemaakt is er nog niets om op terug te blikken en stond hij
  // op dag één naast de rondleiding, de coachmark en Fins tip. De gate hangt aan
  // de accountleeftijd (`profiles.created_at`, hier al geladen — geen extra
  // query), nooit aan de financiële data (ADR 0001).
  const profileCreatedAt =
    (ownProfileRes.data as { created_at?: string | null } | null)?.created_at ?? null
  const checkinBannerSeed = checkinBannerBase
    ? { ...checkinBannerBase, eligible: isCheckinBannerEligible(profileCreatedAt) }
    : undefined
  // `realOnly: false` — voor "heeft deze gebruiker transacties?" telt een maand
  // met alleen transfers ook mee; het gaat om het bestaan van data, niet om een som.
  const latestTransactionMonth = aggLatestMonth((txAgg12Res.data ?? []) as TxMonthAggregateRow[])

  const health = horizonData?.healthScore ?? null
  const freedomPct = horizonData?.healthScoreInput?.freedomPct ?? null

  // Mini-tijdslijn-strip inputs: huidige leeftijd uit DOB + vrijheidsleeftijd.
  const dob = horizonData?.effectiveInput?.dateOfBirth ?? null
  const currentAge = dob ? Math.round(ageAtDate(dob)) : null
  const endAge = horizonData?.fireStrategy?.endAge ?? null
  // ADR 0129 — het STOP-ANKER van het plan is de sleutel, niet de strategienaam:
  // `aow` → pensioen-weergave (marker op AOW); elk vast anker → de minigrafiek knipt op
  // het stopmoment ("Stoppen op …") en zegt nooit "bereikt" tenzij framing 'free'.
  const planAnchor = horizonData?.firePlan?.anchor ?? null
  const isPensioenMode = planAnchor?.kind === 'aow'
  const stopAnchorFixed = planAnchor != null && isFixedAnchor({ anchor: planAnchor })
  // AOW uit de gebruikerstabel (dezelfde lookup als de kernel-tijdas), niet hardcoded.
  const aowAgeFractional = lookupAowAge(horizonData?.aowRows ?? [], dob).fractional
  const stopAge: number | null =
    planAnchor?.kind === 'age'
      ? planAnchor.age
      : planAnchor?.kind === 'aow'
        ? aowAgeFractional
        : planAnchor?.kind === 'now'
          ? currentAge
          : null
  const freedomFraming = resolveFreedomAgeView({
    fireAgeFractional: horizonData?.fireAgeFractional ?? null,
    freedomPct,
    currentAge,
    anchor: planAnchor,
    aowAge: aowAgeFractional,
  }).framing

  // Totaalbedragen per hefboom-tegel — uit healthScoreInput (horizonData,
  // perspectief-correct). Belasting = Box 3-druk per jaar.
  //
  // Cashflow = de EFFECTIEVE spaarquote (ADR 0121) — de grondslag-geresolveerde
  // `resolveSavingsSource(...).effectiveSavingsRatePct`, waar een handmatige of
  // budget-grondslag wint van de meting. Het veld op `healthScoreInput` heette
  // tot R2 (7 sep 2026) `savingsRate6m` — een legacy-misnomer, want de
  // horizon-loader vult het met `effectiveSavingsRate`
  // (lib/horizon/raw-data-loader.ts). De naam draagt nu zijn grondslag.
  // Consume-don't-recompute; dezelfde grondslag als de gezondheidsscore-pijler Rondkomen én —
  // sinds B-030 — als de cashflow-hefboom-status en het kompas-detail.
  //
  // GELIJKE GRONDSLAG IS NIET OVERAL HETZELFDE GETAL. De hefboom-STATUS komt uit
  // `loadLeverScores`, en die loader draait bewust zonder de profiel-fallback en
  // de netto-vermogen-delta-tak die achter dít getal zitten. Op het zuivere
  // transactiepad zonder 6-maands inkomen staat de tegel daarom grijs terwijl
  // `totals.cashflow` een percentage draagt. Zie de kop van
  // lib/lever-scores-loader.ts voor de grens en de motivatie.
  const totals = horizonData?.healthScoreInput
    ? {
        bezittingen: horizonData.healthScoreInput.totalAssets,
        schulden: horizonData.healthScoreInput.totalDebts,
        cashflow: horizonData.healthScoreInput.effectiveSavingsRatePct,
        belasting: horizonData.box3Tax ?? null,
      }
    : undefined

  // Dubbele grondslag (incl./excl. eigen woning) voor de bezittingen-/schulden-
  // hefboom en de nettovermogen-subregel. Bron = horizonData (perspectief-correct).
  const housingSplit =
    horizonData?.showDualHousingBasis
      ? {
          eigenHuisValue: horizonData.housingContext.eigenHuisValue,
          mortgageBalance: horizonData.housingContext.mortgageBalance,
        }
      : null
  const netWorthExclHome = horizonData?.netWorthExclHome ?? null

  // Woon-grondslag voor de rondleidingkaarten (UR3-04, besluit K4). Alles komt
  // uit `horizonData`: `freedomBasis.homeExcludedFromFire` is de al gemaakte
  // `isHomeExcludedFromFire`-keuze (mét de `hasEigenHuis`-gate erin verwerkt) en
  // `netWorthExclHome` de canonieke `netWorthExcludingHome`-uitkomst. Géén
  // tweede query, géén eigen aftrek van de overwaarde. `null` zonder eigen
  // woning: dan is er niets te markeren.
  const rondleidingWoning =
    horizonData?.housingContext.hasEigenHuis
      ? {
          uitgesloten: horizonData.freedomBasis.homeExcludedFromFire,
          netWorthExclHome: horizonData.netWorthExclHome,
        }
      : null

  // Netto vermogen (live) — basis voor de vrijheidstijd-hero + mini-grafiek in blok 2.
  const currentNetWorth =
    (horizonData?.healthScoreInput?.totalAssets ?? 0) -
    (horizonData?.healthScoreInput?.totalDebts ?? 0)

  // Groet + datumlabel SERVER-SIDE berekenen (Europe/Amsterdam) — één bron van
  // waarheid voor de tijd zodat SSR en de eerste client-render identiek zijn.
  const { greeting, dateLabel } = resolveOverviewGreeting()

  // ── Rondleiding (ADR 0130) ────────────────────────────────────────────────
  //
  // Seed én data komen UITSLUITEND uit wat hierboven al geladen is: het profiel
  // (dat de kolom `module_guide_state` toch al meeneemt) en `horizonData`. Geen
  // extra query, geen tweede berekening — de rondleiding vertelt precies de
  // cijfers die de pagina zelf toont. De vrijheidsleeftijd hoort bij het
  // gestreamde blok 2 en meldt zich daar aan via `<RondleidingDataSeed>`.
  const rondleidingSeed = loadRondleidingSeed(
    (ownProfileRes.data as { module_guide_state?: unknown } | null)?.module_guide_state,
  )
  const leverStatus: Record<Hefboom, LeverageStatus> = {
    bezittingen: leverToLeverageStatus(leverScoresResult.scores.assets.status),
    schulden: leverToLeverageStatus(leverScoresResult.scores.debts.status),
    cashflow: leverToLeverageStatus(leverScoresResult.scores.cashflow.status),
    belasting: leverToLeverageStatus(leverScoresResult.scores.tax.status),
  }

  return (
    <>
      {/* Tab-root → 'rich' TopBar + tab-titel in de mobiele bovenbalk. */}
      <NavStackMeta title="Overzicht" topBar={{ kind: 'rich' }} bottomBar={{ kind: 'tabs' }} />
      {/* De welkomstgids stond hier tot ADR 0130 als banner (plus een
          geminimaliseerd punt in de utility-cluster van blok 2). Hij woont nu
          in Fin — vierde icoon in de chat-kop — en de provider hangt in
          `app/(app)/layout.tsx`. /overzicht opent daarmee weer met de
          begroeting en de cijfers, niet met een takenlijst. */}
      {/* De rondleiding hangt om blok 1 (waar de gids-provider stond): daar
          leven de vier hefboomtegels, de gezondheidskaart en de grafiekcel die
          zij één voor één uitlicht. Hij rendert zelf niets in de stroom — de
          spotlight gaat via een portal naar `document.body`. */}
      {/* De "Gegevens verouderd"-melding leeft in de banner-slot van blok 1,
          maar haar geminimaliseerde vorm is een statuspunt náást de pagina-'i'
          in de utility-cluster van blok 2. Deze guard omspant daarom béíde: hij
          velt het versheidsoordeel, deelt de achterstand met banner én punt en
          onthoudt minimaliseren server-side (jsonb-pref → PUT
          /api/overzicht/page-status). De bronnen liggen hier al in blok 1, dus
          ze gaan als `preloaded` mee — geen tweede leesronde.

          ALLEEN IN HET EIGEN PERSPECTIEF: `getTxAgg12m` is RLS-breed (eigen +
          gedeeld huishouden) en kent geen partner-variant, terwijl de tegels
          hieronder in Huishouden/Partner wél perspectief-correct zijn. Een
          melding over "jouw laatste boeking" naast partnercijfers zou een
          bewering doen die deze bron niet kan onderbouwen. */}
      <StaleDataGuard
        active={perspective === 'personal'}
        preloaded={{ latestTransactionMonth, minimizedMap }}
      >
      <RondleidingProvider
        seed={rondleidingSeed}
        data={{
          userName,
          totals: totals
            ? {
                bezittingen: totals.bezittingen,
                schulden: totals.schulden,
                cashflow: totals.cashflow,
                belasting: totals.belasting,
              }
            : null,
          housingSplit,
          leverStatus,
          // Spreiding alleen in het eigen perspectief: de samenstelling komt uit de
          // RLS-brede assetset (eigen + huishoud-gedeeld), niet uit de
          // perspectief-rijen. In huishoud-/partnerperspectief zwijgt de stap erover.
          assetTypeCount:
            perspective === 'personal' ? (horizonData?.healthScoreInput?.assetTypeCount ?? null) : null,
          largestAssetTypeShare:
            perspective === 'personal'
              ? (horizonData?.healthScoreInput?.largestAssetTypeShare ?? null)
              : null,
          health: health
            ? { total: health.total, label: health.label, onbekendHint: health.onbekend?.hint ?? null }
            : null,
          currentNetWorth,
          woning: rondleidingWoning,
          dailyExpenseRate: horizonData?.dailyExpenseRate ?? 0,
          isPensioen: isPensioenMode,
        }}
      >
        <OverzichtHeroPrimary
          userName={userName ?? undefined}
          greeting={greeting}
          dateLabel={dateLabel}
          banners={
            // H20 — de check-in stond hiervóór bóven de begroeting: op een vers
            // account was het eerste scherm een lijstje,
            // vóór je naam en vóór elk bedrag. Hij staat sindsdien ná de
            // begroeting (besluit eigenaar 26-08-2026, optie B). Het blokkenaantal
            // in de Volledige weergave blijft bewust ongewijzigd (besluit 9 aug
            // 2026). De welkomstgids stond hier ook — die woont sinds ADR 0130
            // in Fin.
            <>
              <CheckinBanner seed={checkinBannerSeed} />
              {/* UR2-13 — staat de administratie stil, dan rusten de hefboom-tegels
                  hieronder (o.a. "Cashflow 38 %") op maandenoude transacties zonder
                  dat iets dat verraadt. Rendert zichzelf weg bij verse data en
                  buiten het eigen perspectief; de gating zit in de guard hierboven. */}
              <StaleNoticeBanner />
            </>
          }
          health={health}
          leverScores={leverScoresResult.scores}
          totals={totals}
          housingSplit={housingSplit}
          heroChart={
            // Twee-traps-render (kaart "Weergave grafiek op het overzicht", optie B):
            // trap 1 = het Vandaag-anker met het ECHTE netto vermogen uit blok 1
            // (geen kale skeleton); trap 2 = de volle projectie/historie stroomt in
            // zodra `OverzichtNetWorthChartLoader` klaar is.
            <Suspense
              fallback={
                <MiniNetWorthChartAnchor
                  currentNetWorth={currentNetWorth}
                  netWorthExclHome={netWorthExclHome}
                  showExclHome={housingSplit != null}
                />
              }
            >
              <OverzichtNetWorthChartLoader
                supabase={supabase}
                currentNetWorth={currentNetWorth}
                currentAge={currentAge}
                endAge={endAge}
                isPensioenMode={isPensioenMode}
                stopAnchorFixed={stopAnchorFixed}
                stopAge={stopAge}
                framing={freedomFraming}
                netWorthExclHome={netWorthExclHome}
                housingSplit={housingSplit}
                /* UR3-14 deel D — de twee termen achter het kopgetal, zodat de
                   kassabon achter het netto vermogen dezelfde perspectief-
                   correcte grondslag toont als het getal zelf. Geen extra
                   query: `totals` staat hier al. */
                vermogenOpbouw={
                  totals
                    ? { bezittingen: totals.bezittingen, schulden: totals.schulden }
                    : null
                }
                /* Dekking van het plan onder een vast stopanker — hetzelfde
                   canonieke getal als de Vrijheid-strip; de loader laat het
                   alleen door bij `stopAnchorFixed`. */
                freedomPct={freedomPct}
              />
            </Suspense>
          }
          secondary={
            <Suspense fallback={<OverzichtSecondaryFallback />}>
              <OverzichtSecondaryLoader
                supabase={supabase}
                perspective={perspective}
                userId={userId}
                horizonData={horizonData}
                freedomPct={freedomPct}
                currentAge={currentAge}
                currentNetWorth={currentNetWorth}
              />
            </Suspense>
          }
        />
      </RondleidingProvider>
      </StaleDataGuard>
    </>
  )
}
