'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 13).
//
// Overlay- en deeplink-state: welke modal/pane open staat, plus de deeplink-afhandeling E2
// en de scroll-landing E13. Mag de route lezen (URL-opruiming, besluit Q7); de katern-
// componenten doen dat niet (ADR 0179 D8).
//
// Pure move: de statements staan in dezelfde onderlinge volgorde als in horizon-client,
// met dezelfde dependency-arrays. De provider (`toekomst-state-provider.tsx`) roept deze
// hook aan en deelt het resultaat per concern via een eigen context.

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import type { NaturalMilestone } from '@/lib/natural-milestones'
import { buildDeeplinkCleanupUrl } from '@/lib/horizon/deeplink-cleanup'
import { instellingenRijHref } from '@/lib/toekomst/instellingen-rij'

const UITGAVE_RIJ_HREF = instellingenRijHref('uitgave-na-pensioen')
import type { ActiveModal, ClusterSheet, EventPaneMode, ActiveFaseModal } from '@/components/toekomst/state/types'
import { useStabielObject } from './use-stabiel-object'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'

/** Ritme waarop de `?whatif=open`-scroll kijkt of het lab er al staat. */
const WHATIF_SCROLL_INTERVAL_MS = 120
/** Plafond: na ~6 s zonder lab (bv. geen sim-uitkomst) geeft de scroll het op. */
const WHATIF_SCROLL_MAX_POGINGEN = 50

export function useToekomstOverlayState({ perspectief }: { perspectief: ToekomstPerspectief }) {
  const {
    isHouseholdView,
    householdRetireInfo,
  } = perspectief
  const router = useRouter()
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [activeFaseModal, setActiveFaseModal] = useState<ActiveFaseModal>(null)

  // Huishoud-aanpasflow (uitgave na pensioen) — geopend vanaf de "Na pensioen"-KPI
  // in huishoudweergave. candidates/method komen uit de combined-projectie.
  const [householdRetireOpen, setHouseholdRetireOpen] = useState(false)
  // Klik op de "Na pensioen"-KPI (desktop + mobiel delen deze ene handler).
  // De huishoud-variant bestaat alleen als `householdRetireInfo` gevuld is — dat
  // gebeurt uitsluitend wanneer buildHouseholdProjectionInput() hasHousehold=true
  // teruggeeft (>= 2 geaccepteerde leden). De perspectief-switcher biedt
  // 'Huishouden' al eerder aan (app/api/perspective/route.ts: profielveld
  // 'samen'/'gezin' óf >= 1 lid), dus `isHouseholdView` alleen is geen bewijs
  // dat de pane kán renderen: bij die kloof opende de klik voorheen niets
  // (WF-REKEN-23-bug4). Zonder huishoud-info valt de klik terug op de eigen
  // instelling: de rij "Uitgave na pensioen" in katern Instellingen (ADR 0179 fase 3;
  // de uitgaven-pane op Plan is opgeheven, één ingang per instelling).
  const openRetirementExpensePane = useCallback(() => {
    if (isHouseholdView && householdRetireInfo) setHouseholdRetireOpen(true)
    else router.push(UITGAVE_RIJ_HREF)
  }, [isHouseholdView, householdRetireInfo, router])
  const [eventPaneOpen, setEventPaneOpen] = useState(false)
  const [eventPaneEditingId, setEventPaneEditingId] = useState<string | null>(null)
  const [eventPaneMode, setEventPaneMode] = useState<EventPaneMode>('catalog')
  /**
   * Eén opener voor de ene EventPane van /toekomst (spec §4.2 regel 8, "één sheet
   * tegelijk"). De deeplinks `?event=new` / `?event=<id>` (en de alias `?nieuw=1`) lopen
   * hierlangs, en de gebeurtenissenlijst onder het plan ook — die mount geen eigen pane
   * meer. `'new'` = de catalogus; een id opent die gebeurtenis in `mode` (standaard view).
   */
  const openEventPane = useCallback((doel: 'new' | string, mode: 'view' | 'edit' = 'view') => {
    if (doel === 'new') {
      setEventPaneEditingId(null)
      setEventPaneMode('catalog')
    } else {
      setEventPaneEditingId(doel)
      setEventPaneMode(mode)
    }
    setEventPaneOpen(true)
  }, [])
  const [clusterSheet, setClusterSheet] = useState<ClusterSheet>(null)
  // Mobile KPI's tonen nu volledig 2x2 — `horizonHeroExpanded` toggle is verwijderd.

  // ── Scroll naar het doelscenario-lab (feature #795) ──────────────
  // Een teller, geen boolean: elke `?whatif=open` is een nieuw scrollverzoek. De provider
  // staat in de katern-layout en blijft staan bij een katernwissel; een boolean die nooit
  // terugvalt scrolde daardoor maar één keer per sessie.
  const [whatIfScrollVerzoek, setWhatIfScrollVerzoek] = useState(0)
  const verkenSectionRef = useRef<HTMLElement | null>(null)

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const pathname = usePathname()
  useEffect(() => {
    const modal = searchParams.get('modal')
    let shouldReplace = false

    if (modal) {
      // Geen 'withdrawal' en geen 'strategie' meer: die modals zijn opgeheven (ADR 0179
      // fase 1 stap 13 resp. fase 3) en `next.config.ts` stuurt beide door naar hun rij in
      // Instellingen (`?rij=onttrekking`, `?rij=stopmoment`). De meereizende param wordt
      // hier alleen opgeruimd.
      if (modal === 'scenarios' || modal === 'simulations' || modal === 'backtesting') {
        setActiveModal(modal)
      } else if (modal === 'life_events') {
        // Het legacy-gebeurtenisformulier is weg (ADR 0179 fase 1 stap 2): deze
        // oude deeplink opent voortaan de EventPane-catalogus, net als `?event=new`.
        openEventPane('new')
      }
      shouldReplace = true
    }

    // `?strategie=open` opende hier de Strategieën-modal (opgeheven, ADR 0179 fase 3);
    // `next.config.ts` stuurt hem door naar `/toekomst/instellingen?rij=stopmoment`.
    // Op Instellingen is `?strategie=<aow|pensioen|huis|werk>` een alias van `?rij=`.

    // `?uitgaven=open` opende hier de uitgaven-pane; sinds ADR 0179 fase 3 stuurt
    // `next.config.ts` hem door naar de rij Uitgave na pensioen in Instellingen.

    // Support ?event=new | ?event=<id> | ?event=<id>&edit=true
    // `?nieuw=1|true` is de alias van `?event=new` (ADR 0179, addendum 26 sep): tot dan
    // opende de gebeurtenissenlijst in Instellingen zelf een catalogus op `?nieuw=`. Eén
    // manier om via een link een gebeurtenis toe te voegen: deze, op elk katern.
    const nieuwParam = searchParams.get('nieuw')
    const eventParam = nieuwParam === '1' || nieuwParam === 'true' ? 'new' : searchParams.get('event')
    const eventEditParam = searchParams.get('edit')
    if (nieuwParam != null) shouldReplace = true
    if (eventParam) {
      openEventPane(eventParam, eventEditParam === 'true' ? 'edit' : 'view')
      shouldReplace = true
    }

    // Feature #795+#800: ?whatif=open — opens inline what-if sliders (was: dream gate).
    const whatifParam = searchParams.get('whatif')
    if (whatifParam === 'open') {
      setWhatIfScrollVerzoek((n) => n + 1)
      shouldReplace = true
    }

    // Opschonen mag NOOIT van route wisselen. Dit stond hier als een
    // hardgecodeerd `router.replace('/horizon')`, en `/horizon` redirect op de
    // routing-laag naar `/toekomst` (next.config.ts). Elke deeplink maakte
    // zichzelf daarmee ongedaan: state gezet → router wisselt van route → boom
    // remount → de gezette state weer op de beginwaarde, gebruiker op een
    // kale /toekomst zonder paneel (UR2-11). Zie `lib/horizon/deeplink-cleanup.ts`.
    if (shouldReplace) {
      router.replace(buildDeeplinkCleanupUrl(pathname, searchParams, window.location.hash), { scroll: false })
    }

  }, [searchParams, router, pathname, openEventPane])

  // Deeplink `?whatif=open` → scroll naar het doelscenario. Sinds ADR 0170 staat dat blok
  // altijd open, dus alleen nog scrollen. Het lab rendert pas als de sim-uitkomst er is;
  // een eenmalige timeout vond de sectie daardoor vaak nog niet (vangnet §3.3). Daarom
  // kijken we op een vast ritme tot de sectie er is, en geven we het na een plafond op.
  useEffect(() => {
    if (whatIfScrollVerzoek === 0) return
    let pogingen = 0
    const t = setInterval(() => {
      const sectie = verkenSectionRef.current
      pogingen += 1
      if (sectie) sectie.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (sectie || pogingen >= WHATIF_SCROLL_MAX_POGINGEN) clearInterval(t)
    }, WHATIF_SCROLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [whatIfScrollVerzoek])

  // ── Natuurlijke-mijlpaal info-sheet state ─────────────────────────────
  const [selectedNaturalMilestone, setSelectedNaturalMilestone] =
    useState<NaturalMilestone | null>(null)

  // ── Year-details sheet state — kassabon per jaar ──────────────────────
  // Opent bij klik op een kolom in de WealthCompositionChart. Toont de
  // opbouw van bezittingen, schulden, kosten/inkomsten + gebeurtenissen
  // voor dat specifieke projectiejaar.
  const [selectedYearAge, setSelectedYearAge] = useState<number | null>(null)

  return useStabielObject({
    activeModal,
    setActiveModal,
    simModalOpen,
    setSimModalOpen,
    activeFaseModal,
    setActiveFaseModal,
    householdRetireOpen,
    setHouseholdRetireOpen,
    openRetirementExpensePane,
    eventPaneOpen,
    setEventPaneOpen,
    openEventPane,
    eventPaneEditingId,
    setEventPaneEditingId,
    eventPaneMode,
    setEventPaneMode,
    clusterSheet,
    setClusterSheet,
    verkenSectionRef,
    selectedNaturalMilestone,
    setSelectedNaturalMilestone,
    selectedYearAge,
    setSelectedYearAge,
  })
}

export type ToekomstOverlayState = ReturnType<typeof useToekomstOverlayState>
