import { Suspense, type ReactNode } from 'react'
import { PageVerdictOpening } from '@/components/editorial'
import { resolveRouteTitle } from '@/lib/nav-config'
import { getPageInfo, hasPageInfo, type PageInfoContent } from '@/lib/page-info-content'
import type { KaternId } from '@/lib/horizon/katern-copy'
import { PlanReviewProvider } from '@/components/future/plan-review/plan-review-provider'
import { ToekomstStateProvider } from '@/components/toekomst/state/toekomst-state-provider'
import { ToekomstCanvas } from '@/components/toekomst/canvas/toekomst-canvas'
import { CanvasZijkolom } from '@/components/toekomst/layout/canvas-zijkolom'
import { ToekomstKaternStand, DOELEN_MOBIEL_COMPACT } from '@/components/toekomst/layout/toekomst-katern-stand'
import { ToekomstOverlayHost } from '@/components/toekomst/overlays/toekomst-overlay-host'
import { ToekomstRekenGrens } from '@/components/toekomst/layout/toekomst-reken-grens'
import { ToekomstAnkerregel } from '@/components/toekomst/layout/toekomst-ankerregel'
import { OudeTabParam } from '@/components/toekomst/layout/oude-tab-param'
import {
  ToekomstKaternKoppen,
  ToekomstKaternInfo,
} from '@/components/toekomst/layout/toekomst-katern-navigatie'
import {
  ToekomstKaternMeldingenProvider,
  ToekomstKaternMeldingSlot,
  type ToekomstKaternMeldingenBron,
} from '@/components/toekomst/meldingen/toekomst-katern-meldingen'
import { bouwDoelenBron, voorkeurenOpen } from '@/components/toekomst/meldingen/meldingen-bron'
import { loadToekomstData } from '@/lib/toekomst/load-toekomst-data'
import { bouwGebeurtenissenBron } from '@/lib/toekomst/gebeurtenissen-bron'

/** Alleen de katernen met een "Wat zie ik hier?"-tekst gaan mee naar de client. */
function metInhoud(
  inhoud: Record<KaternId, PageInfoContent>,
): Partial<Record<KaternId, PageInfoContent>> {
  return Object.fromEntries(
    Object.entries(inhoud).filter(([, content]) => hasPageInfo(content)),
  ) as Partial<Record<KaternId, PageInfoContent>>
}

/**
 * De katern-layout van /toekomst (ADR 0179 D1, fase 1 stap 15; fase 2 kop en meldingen).
 *
 * Eén server-layout voor Plan (`/toekomst`), Doelen en Instellingen: de kop, de
 * state-provider, het canvas, de katern-koppen, het meldingenslot en de overlay-host staan
 * hier en blijven gemonteerd bij een katernwissel; alleen `{children}` (het katern-paneel)
 * wisselt. Een layout rendert bij client-navigatie tussen de katernen niet opnieuw op
 * de server; verse data komt via `router.refresh()` (kaart GW2).
 *
 * Rendervolgorde: kop (oordeelzin + i, ankerregel) → canvas → katern-koppen →
 * meldingenslot → katern → overlays. De kop draagt geen statuspunten meer (ADR 0179 D2);
 * het punt van een melding staat op de katern-kop van het katern waar ze woont (D6).
 *
 * Waarom het meldingenslot HIER en niet in de pages: één plek voor drie katernen, de
 * `aria-live`-regio blijft gemount bij een katernwissel, en de katern-pages hoeven de
 * route niet te kennen (D8) — het slot kiest via `useActiefKatern` en de pages blijven
 * zuivere panelen.
 *
 * De lading (`loadToekomstData`, React-`cache()`'d) is dezelfde als de oude
 * /toekomst-page deed; een katern-page die hem ook aanroept deelt dezelfde lading.
 */
export default async function ToekomstKaternLayout({ children }: { children: ReactNode }) {
  const { horizonData, finData, planReviewProgress, katernMinimized, planVerdict, planStatusInput } =
    await loadToekomstData()

  // De i toont per katern de tekst van zijn eigen route; de keuze maakt de client
  // (alleen de layout kent de route, D8).
  const katernInfo = metInhoud({
    plan: getPageInfo('/toekomst'),
    doelen: getPageInfo('/toekomst/doelen'),
    instellingen: getPageInfo('/toekomst/instellingen'),
  })

  // De server-kant van de meldingen per katern: plan-oordeel (mét geboortedatum-poort),
  // opgeslagen minimaliseer-niveau per katern-route, doelvoortgang en wizardstand.
  const meldingenBron: ToekomstKaternMeldingenBron = {
    planStatusInput,
    katernMinimized,
    ...bouwDoelenBron(finData.goals, finData.goalProgresses),
    voorkeurenOpen: voorkeurenOpen(planReviewProgress),
  }

  // De levensgebeurtenissen staan onder het plan (ADR 0179, addendum 26 sep). De layout
  // bouwt hun props uit de bundel die hij al heeft: een katernwissel naar Plan rendert de
  // layout niet opnieuw, dus zo kost die wissel geen tweede server-lading.
  const gebeurtenissen = bouwGebeurtenissenBron(horizonData)

  return (
    // TPR-01 — plan-review: montert de review-pane (ShellOverlay pane) naast het canvas,
    // zodat de grafiek zichtbaar blijft. Consumeert ook de deeplink `?planreview=open`.
    <PlanReviewProvider initialProgress={planReviewProgress}>
      {/* `goals` = dezelfde slice die de dashboard-widget consumeert (M36): doelen met een
          streefdatum krijgen een marker op de tijdas. Staat in de layout, zodat de markers
          op elk katern dezelfde zijn (kaart V16). */}
      <ToekomstStateProvider initialData={horizonData} goals={finData.goals} gebeurtenissen={gebeurtenissen}>
        <ToekomstKaternMeldingenProvider bron={meldingenBron}>
          {/* Een meegereisde `?tab=` van een oude deeplink (next.config-redirect) weg,
              zonder scroll en zonder lus. Suspense: `useSearchParams` in de layout. */}
          <Suspense fallback={null}>
            <OudeTabParam />
          </Suspense>
          {/* Doelen op mobiel: compactere kop en canvas (één-scherm-eis, ADR 0179 D7). */}
          <ToekomstKaternStand>
          <section className={`mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-6 print:hidden ${DOELEN_MOBIEL_COMPACT.kopSectie}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              {/* Aanhef als ZIN (ADR 0174 D6): onder een vast stopmoment de dekking van je
                  plan ("Je toekomstplan is *voor 96% gedekt*."), onder "zo vroeg mogelijk"
                  de haalbaarheid. Zonder oordeel blijft de kale paginanaam staan. Een h2:
                  de shell draagt de enige h1 (ADR 0110). */}
              <PageVerdictOpening
                className={`min-w-0 flex-1 ${DOELEN_MOBIEL_COMPACT.oordeel}`}
                pageName={resolveRouteTitle('/toekomst') ?? 'Toekomst'}
                sentence={planVerdict.sentence}
                tone={planVerdict.status}
              />
              {/* De kop houdt alleen de i (ADR 0179 D2): statuspunten staan op de
                  katern-koppen. */}
              <div className="flex shrink-0 items-center gap-2">
                <ToekomstKaternInfo inhoud={katernInfo} />
              </div>
            </div>

            {/* De ankerregel (spec §4.2 regel 1) vol-breed onder de kop-rij: in de
                `deck`-prop van de aanhef zou de i-kolom zijn breedte over de vólle hoogte
                reserveren. Eén regel, elk getal één keer. */}
            <ToekomstAnkerregel className={`mb-4 ${DOELEN_MOBIEL_COMPACT.ankerregel}`} />
          </section>

          <ToekomstRekenGrens>
            <div className={`mx-auto max-w-6xl py-5 sm:py-8 px-4 sm:px-6 ${DOELEN_MOBIEL_COMPACT.canvasKolom}`}>
              {/* In Doelen staat het lab op desktop naast de grafiek (ADR 0179 D7). */}
              <ToekomstCanvas zijkolom={<CanvasZijkolom />} />
              <ToekomstKaternKoppen className={`mt-6 ${DOELEN_MOBIEL_COMPACT.koppen}`} />
              {/* Meldingen per katern (spec §4.8): bovenaan het actieve katern. */}
              <ToekomstKaternMeldingSlot className="[&>div]:mt-3" />
              {children}
            </div>
            <ToekomstOverlayHost />
          </ToekomstRekenGrens>
          </ToekomstKaternStand>
        </ToekomstKaternMeldingenProvider>
      </ToekomstStateProvider>
    </PlanReviewProvider>
  )
}
