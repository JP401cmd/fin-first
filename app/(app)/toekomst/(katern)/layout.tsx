import type { ReactNode } from 'react'
import { PageVerdictOpening, EditorialDeck } from '@/components/editorial'
import { resolveRouteTitle } from '@/lib/nav-config'
import { getPageInfo, hasPageInfo, type PageInfoContent } from '@/lib/page-info-content'
import type { KaternId } from '@/lib/horizon/katern-copy'
import {
  DeficitNoticeProvider,
  DeficitNoticeDot,
} from '@/components/app/horizon/deficit-notice-provider'
import { AowNoticeProvider, AowNoticeDot } from '@/components/app/horizon/aow-notice-provider'
import {
  EindsituatieNoticeProvider,
  EindsituatieNoticeDot,
} from '@/components/app/horizon/eindsituatie-notice-provider'
import { PlanReviewProvider } from '@/components/future/plan-review/plan-review-provider'
import { ToekomstStateProvider } from '@/components/toekomst/state/toekomst-state-provider'
import { ToekomstCanvas } from '@/components/toekomst/canvas/toekomst-canvas'
import { ToekomstOverlayHost } from '@/components/toekomst/overlays/toekomst-overlay-host'
import { ToekomstRekenGrens } from '@/components/toekomst/layout/toekomst-reken-grens'
import {
  ToekomstKaternKoppen,
  ToekomstKaternInfo,
} from '@/components/toekomst/layout/toekomst-katern-navigatie'
import { loadToekomstData } from '@/lib/toekomst/load-toekomst-data'

/** Alleen de katernen met een "Wat zie ik hier?"-tekst gaan mee naar de client. */
function metInhoud(
  inhoud: Record<KaternId, PageInfoContent>,
): Partial<Record<KaternId, PageInfoContent>> {
  return Object.fromEntries(
    Object.entries(inhoud).filter(([, content]) => hasPageInfo(content)),
  ) as Partial<Record<KaternId, PageInfoContent>>
}

/**
 * De katern-layout van /toekomst (ADR 0179 D1, fase 1 stap 15).
 *
 * Eén server-layout voor Plan (`/toekomst`), Doelen en Instellingen: de kop, de
 * state-provider, het canvas, de katern-koppen en de overlay-host staan hier en
 * blijven gemonteerd bij een katernwissel; alleen `{children}` (het katern-paneel)
 * wisselt. Een layout rendert bij client-navigatie tussen de katernen niet opnieuw op
 * de server; verse data komt via `router.refresh()` (kaart GW2).
 *
 * Rendervolgorde: kop (oordeelzin + statuspunten + i + deck) → canvas → katern-koppen
 * → katern → overlays. De dubbele kop en de kicker van de oude tijdas vervallen, net als
 * de vier navkaarten (GW6); de Tips-toggle staat in de canvas-kopregel.
 *
 * De lading (`loadToekomstData`, React-`cache()`'d) is dezelfde als de oude
 * /toekomst-page deed; een katern-page die hem ook aanroept deelt dezelfde lading.
 */
export default async function ToekomstKaternLayout({ children }: { children: ReactNode }) {
  const {
    horizonData,
    finData,
    planReviewProgress,
    deficitMinimizedPeak,
    aowMinimizedFlag,
    eindsituatieMinimizedFlag,
    planVerdict,
  } = await loadToekomstData()

  // De i toont per katern de tekst van zijn eigen route; de keuze maakt de client
  // (alleen de layout kent de route, D8).
  const katernInfo = metInhoud({
    plan: getPageInfo('/toekomst'),
    doelen: getPageInfo('/toekomst/doelen'),
    instellingen: getPageInfo('/toekomst/instellingen'),
  })

  return (
    // De tekort-lening-melding leeft in katern Plan, maar haar geminimaliseerde vorm
    // is een statuspunt náást de pagina-'i' in de kop. Deze provider omspant daarom
    // béíde: hij deelt de piek uit de horizon-run met het punt en onthoudt
    // minimaliseren server-side (jsonb-pref → PUT /api/overzicht/page-status). Zie
    // `components/app/horizon/deficit-notice-provider.tsx`. De registratie-hooks draaien
    // in de state-provider (altijd gemount, GW3b), dus de punten blijven op elk katern
    // staan (besluit Q6); fase 2 verhuist ze naar de katern-koppen.
    <DeficitNoticeProvider initialMinimizedPeak={deficitMinimizedPeak}>
      {/* TPR-04 — zusje van de tekort-provider: de "AOW ontbreekt"-melding deelt haar
          toestand met een tweede statuspunt naast de 'i'; eigen pref-only sleutel. */}
      <AowNoticeProvider initialMinimizedFlag={aowMinimizedFlag}>
        {/* Plan 17 sep (D) — de informatieve eindsituatie-uitleg: derde zusje, eigen
            pref-only sleutel, statuspunt in horizon-tint naast de 'i'. */}
        <EindsituatieNoticeProvider initialMinimizedFlag={eindsituatieMinimizedFlag}>
          {/* TPR-01 — plan-review: montert de review-pane (ShellOverlay pane) naast het
              canvas, zodat de grafiek zichtbaar blijft. Consumeert ook de deeplink
              `?planreview=open`. */}
          <PlanReviewProvider initialProgress={planReviewProgress}>
            <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-6 print:hidden">
              <div className="mb-3 flex items-start justify-between gap-3">
                {/* Aanhef als ZIN (ADR 0174 D6): onder een vast stopmoment de dekking
                    van je plan ("Je toekomstplan is *voor 96% gedekt*."), onder "zo
                    vroeg mogelijk" de haalbaarheid. Zonder oordeel blijft de kale
                    paginanaam staan. Een h2: de shell draagt de enige h1 (ADR 0110). */}
                <PageVerdictOpening
                  className="min-w-0 flex-1"
                  pageName={resolveRouteTitle('/toekomst') ?? 'Toekomst'}
                  sentence={planVerdict.sentence}
                  tone={planVerdict.status}
                />
                <div className="flex shrink-0 items-center gap-2">
                  {/* Statuspunt van een geminimaliseerde melding: links naast de 'i',
                      zelfde h-7 w-7-familie, stoplichtkleur (géén module-accent). De
                      kop is een flex-cluster, dus DOM-volgorde + gap-2 (8px) geeft
                      dezelfde plaatsing als de absolute offsets van de conventie. */}
                  <EindsituatieNoticeDot />
                  <AowNoticeDot />
                  <DeficitNoticeDot />
                  <ToekomstKaternInfo inhoud={katernInfo} />
                </div>
              </div>

              {/* Deck vol-breed onder de kop-rij: in de `deck`-prop van de aanhef zou
                  de knoppen-cluster rechts zijn breedte over de vólle hoogte
                  reserveren (op mobiel wikkelde de intro dan in vier smalle regels).
                  ADR 0165: geld lévert tijd op. */}
              <EditorialDeck className="mb-4">
                Je tijdas met doelen, gebeurtenissen en voorkeuren. Zo zie je hoeveel tijd je geld
                oplevert.
              </EditorialDeck>
            </section>

            {/* `goals` = dezelfde slice die de dashboard-widget consumeert (M36): doelen
                met een streefdatum krijgen een marker op de tijdas. Staat in de layout,
                zodat de markers op elk katern dezelfde zijn (kaart V16). */}
            <ToekomstStateProvider initialData={horizonData} goals={finData.goals}>
              <ToekomstRekenGrens>
                <div className="mx-auto max-w-6xl py-5 sm:py-8 px-4 sm:px-6">
                  <ToekomstCanvas />
                  <ToekomstKaternKoppen className="mt-6" />
                  {children}
                </div>
                <ToekomstOverlayHost />
              </ToekomstRekenGrens>
            </ToekomstStateProvider>
          </PlanReviewProvider>
        </EindsituatieNoticeProvider>
      </AowNoticeProvider>
    </DeficitNoticeProvider>
  )
}
