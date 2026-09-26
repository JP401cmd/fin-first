'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 14).
//
// Lagen en modus van het canvas (ADR 0179 D3: de keuze blijft staan bij een
// katernwissel): de lagenkeuze en haar localStorage-voorkeur (E1), de tips-overlay, `canvasModus`,
// `lifelineAge` + afspelen (E14), de marktcheck-band (E10) en scenario-varianten (E9), de
// markers op de tijdas en hun klik-/sleep-handlers, en de nominale chart-feeds die de
// euro-grens daarna omzet. Alleen canvas-UI zonder feed (`overlayEmphasis`) blijft lokaal
// in de compositie.
//
// Fase 2 (W1): de tien pills zijn één lagenkeuze (`canvasLagenKeuze` + `toggleLaag`) op
// dezelfde voorkeur-opslag; de katern-stand (vaste lagen) legt het canvas er zelf overheen
// (`canvas-stand.ts`), dus die schrijft nooit in de keuze. De markers en de tijdlijn zijn
// daarom ook als bouwfunctie beschikbaar (`bouwChartEventOverlay`, `bouwEventsForTimeline`).

import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue } from 'react'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { useRouter } from 'next/navigation'
import { type HorizonPageData, HORIZON_EXIT_NOTICE_DISMISSED_SLUG } from '@/lib/horizon-data-loader'
import { useToast } from '@/components/app/toast-provider'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { ageAtDate, type LifeEvent } from '@/lib/horizon-data'
import { MARKTCHECK_DEBOUNCE_MS, type MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { deriveNaturalMilestones, naturalMilestoneToLifeEvent } from '@/lib/natural-milestones'
import {
  chartEventOverlayToClusterRow,
  lifeEventSide,
  naturalMilestoneSide,
  type ChartEventKind,
  type ChartEventOverlay,
} from '@/lib/chart-event-overlay'
import { buildGoalChartMarkers, isGoalMarkerId, type GoalMarkerInput } from '@/lib/horizon/goal-chart-markers'
import { primaryChartBasis } from '@/lib/horizon/liquid-wealth-line'
import { applyHousingToComposition } from '@/lib/horizon/wealth-composition-housing'
import { formatStopAge } from '@/lib/horizon/anker-copy'
import { describeEventDuration } from '@/lib/horizon/event-duration-copy'
import { runMarktcheckAsync } from '@/lib/horizon-kernel/worker/run-in-worker'
import { buildScenarioVariants, type ScenarioOverlay, type MonteCarloOverlay } from '@/components/app/horizon/sim-chart'
import { faseAtAge } from '@/lib/horizon/phase-bar-segments'
import { buildBreakdown } from '@/lib/income-expense-breakdown'
import { unifiedRowsToStackedRows, type StackedRow } from '@/lib/wealth-composition'
import type { IeViewMode } from '@/components/toekomst/state/types'
import type { CanvasModus, LaagId } from '@/lib/horizon/katern-copy'
import {
  COLOR_LIFE_INCOME,
  COLOR_LIFE_EXPENSE,
  COLOR_NAT_ASSET,
  COLOR_NAT_DEBT,
  COLOR_NAT_SIM,
  COLOR_NAT_DANGER,
  COLOR_PARTNER_EVENT,
  COLOR_GOAL,
  COLOR_GOAL_OVERDUE,
} from '@/components/toekomst/canvas/marker-kleuren'
import { useStabielObject } from './use-stabiel-object'
import { useGebeurtenisSleep } from './levensgebeurtenis-verplaatsen'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'
import type { ToekomstOverlayState } from './use-toekomst-overlay-state'
import type { ToekomstScenarioState } from './use-toekomst-scenario'
import type { ToekomstSim } from './use-toekomst-sim'
import type { ToekomstMeldingen } from './use-toekomst-meldingen'
import type { ToekomstScenario } from './use-toekomst-scenario'

export function useToekomstLagen({ initialData, goals, perspectief, overlays, scenarioState, sim, meldingen, lab }: { initialData: HorizonPageData; goals: readonly GoalMarkerInput[] | undefined; perspectief: ToekomstPerspectief; overlays: ToekomstOverlayState; scenarioState: ToekomstScenarioState; sim: ToekomstSim; meldingen: ToekomstMeldingen; lab: ToekomstScenario }) {
  const {
    isHouseholdView,
    isPartnerView,
    householdMainLine,
    partnerLine,
    partnerLifeEvents,
    usePartnerMainLine,
    useHouseholdMainLine,
  } = perspectief
  const {
    setEventPaneOpen,
    setEventPaneEditingId,
    setEventPaneMode,
    setClusterSheet,
    setSelectedNaturalMilestone,
  } = overlays
  const {
    scenarioStopAge,
  } = scenarioState
  const {
    fireParams,
    userAowAge,
    debts,
    events,
    setEvents,
    canonicalDailyRate,
    simResult,
    unifiedRows,
    displayEvents,
    eventPanePreviewBaseline,
    loadData,
    effectiveInput,
    currentAge,
    eventStopAge,
    isPensioenMode,
    displayEndAge,
    displayUnifiedRows,
    liquidWealthPoints,
    displaySimRows,
    eigenHuisMortgageIds,
  } = sim
  const {
    deficitLoanNotice,
    reverseMortgageStartAge,
  } = meldingen
  const {
    scenarioLineOverlay,
    showScenarioLine,
    setShowScenarioLine,
    doelGrootboek,
  } = lab
  const { addToast } = useToast()
  const router = useRouter()

  // Scenario overlay state
  const [scenariosExpanded, setScenariosExpanded] = useState(false)
  const [scenarioData, setScenarioData] = useState<ScenarioOverlay[] | null>(null)

  // Marktcheck-overlay ("Monte Carlo"-pil) — de geslaagde uitkomst van de
  // kernel-marktcheck: percentielband op de netto-vermogensgrondslag + de
  // RENDEMENT-MARGE (hoeveel het rendement mag tegenvallen voordat het plan
  // omvalt, op een vaste stopleeftijd). Die marge verving het standhoud-
  // percentage, dat op de gesolvede FIRE-leeftijd per constructie ~51% was.
  // `mcPending` dekt de wachttijd (n volledige kernel-projecties in de worker).
  const [mcExpanded, setMcExpanded] = useState(false)
  const [mcData, setMcData] = useState<Extract<MarktcheckOutcome, { ok: true }> | null>(null)
  const [mcPending, setMcPending] = useState(false)
  /** Laatste marktcheck-run mislukt (geen worker / kern-fout) → faal-affordance. */
  const [mcFailed, setMcFailed] = useState(false)
  /** Monotone generatie: alleen het antwoord van de NIEUWSTE aanvraag telt. */
  const marktcheckGenRef = useRef(0)
  // Sub-weergave van de modus Geldstroom (Lijnen / Bronnen).
  const [ieViewMode, setIeViewMode] = useState<IeViewMode>('lines')
  // Vermogen · Samenstelling · Geldstroom (ADR 0179 D3). Hoort bij het canvas: de keuze
  // blijft staan bij een katernwissel; Instellingen tekent altijd Vermogen zonder deze
  // keuze te overschrijven (`canvas-stand.ts`).
  const [canvasModus, setCanvasModus] = useState<CanvasModus>('vermogen')

  // Levenslijn cijferbar + "speel af" (alleen volledige weergave): de actieve leeftijd
  // wordt gedeeld door de SimChart-hover én de playback-animatie.
  const [lifelineAge, setLifelineAge] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRafRef = useRef<number | null>(null)

  // Natuurlijke mijlpalen toggle — afgeleide events op de tijdlijn
  // (hypotheek afgelost, autolening afgelost, vermogen op, eerste miljoen, etc.).
  // Persistent via localStorage zodat de gebruiker zijn voorkeur niet
  // bij elke refresh opnieuw moet aanvinken.
  const [showNaturalMilestones, setShowNaturalMilestones] = useState(true)
  // Levensgebeurtenissen toggle — handmatig aangemaakte life events tonen/verbergen.
  // Default true. Persistent zoals natuurlijke mijlpalen.
  const [showLifeEvents, setShowLifeEvents] = useState(true)
  // Doelen-laag (M36) — financiële doelen met streefdatum op de as. Zelfde
  // per-apparaat localStorage-voorkeur als de twee buurlagen. Standaard UIT (ADR 0179,
  // spec §4.5): in Plan staan standaard alleen Gebeurtenissen en Mijlpalen aan; in
  // Doelen is deze laag vast aan, los van deze keuze.
  const [showGoals, setShowGoals] = useState(false)
  // ── Grondslag van de PRIMAIRE vermogenslijn (ADR 0114 D1) ────────────────
  // Server-props, dus stabiel over de hydratie heen — daarom hier bovenaan: de
  // voorkeur-sleutel van de tweede-lijn-pill hangt eraan.
  const chartPrimaryBasis = primaryChartBasis(
    initialData.housingContext,
    initialData.housingStrategy.mode,
  )
  // Tweede-grondslag-lijn toggle — de dunne gestippelde lijn in Pad-modus.
  //
  // STANDAARD UIT in álle strategieën (ADR 0114 D5). De eerdere uitzondering
  // (AAN bij uitsluiten) bestond enkel omdat de grafiek daar anders uit de pas
  // liep met de voortgangsbalk; nu de PRIMAIRE lijn daar zelf op J staat is die
  // reden vervallen, en een standaard-tweede lijn zou de "te druk"-melding die
  // spoor A oploste opnieuw openen.
  const [showLiquidLine, setShowLiquidLine] = useState(false)
  // De pill schakelt bij "Uitsluiten" een ÁNDERE lijn (de totaallijn) dan in de
  // overige strategieën (de besteedbaar-lijn). Daarom per rol een eigen
  // localStorage-sleutel: anders zou een oude "zonder je huis: uit" ineens de
  // hoofd-tegenhanger van iemands grafiek uitzetten (ADR 0114 D5).
  const secondaryLinePrefKey =
    chartPrimaryBasis === 'liquid' ? 'horizon_show_total_line' : 'horizon_show_liquid_line'
  // overlayPrefRestored: pas `true` nadat de localStorage-voorkeur ná hydratie is
  // ingelezen. Gate voor het auto-scroll-effect van de overlay — zo scrolt de
  // pre-restore default `overlayVisible={true}` op de eerste render NIET naar de
  // grafiek wanneer de gebruiker de tips eerder had uitgezet (race-fix). De
  // gerenderde DOM hangt NIET van deze flag af → geen hydratie-mismatch.
  const [overlayPrefRestored, setOverlayPrefRestored] = useState(false)
  useEffect(() => {
    try {
      const storedNat = localStorage.getItem('horizon_show_natural_milestones')
      if (storedNat !== null) setShowNaturalMilestones(storedNat === 'true')
      const storedLife = localStorage.getItem('horizon_show_life_events')
      if (storedLife !== null) setShowLifeEvents(storedLife === 'true')
      const storedGoals = localStorage.getItem('horizon_show_goals')
      if (storedGoals !== null) setShowGoals(storedGoals === 'true')
      // Tweede grondslag-lijn: géén key ⇒ de default UIT blijft staan. De sleutel
      // hangt aan de ROL van de pill (zie `secondaryLinePrefKey`).
      const storedLiquid = localStorage.getItem(secondaryLinePrefKey)
      if (storedLiquid !== null) setShowLiquidLine(storedLiquid === 'true')
      // Overlay-zichtbaarheid: default UIT (ADR 0179 fase 2 — de tips zitten achter
      // de canvas-i), daarna de opgeslagen voorkeur.
      const storedOverlay = localStorage.getItem('horizon_overlay_visible')
      if (storedOverlay !== null) setOverlayVisible(storedOverlay === 'true')
    } catch {
      // ignore — localStorage kan disabled zijn (private mode)
    } finally {
      // Voorkeur is nu (al dan niet) toegepast → auto-scroll mag voortaan vuren
      // op een échte open. Bij voorkeur `false` is `overlayVisible` hierboven al
      // op false gezet, dus scrolt het effect niet.
      setOverlayPrefRestored(true)
    }
    // `secondaryLinePrefKey` is uit server-props afgeleid en dus stabiel; hij
    // staat hier zodat de sleutelkeuze zichtbaar bij het effect hoort.
  }, [secondaryLinePrefKey])
  const persistOverlayVisible = useCallback((val: boolean) => {
    setOverlayVisible(val)
    try { localStorage.setItem('horizon_overlay_visible', String(val)) } catch { /* noop */ }
  }, [])
  // ── Tips verlaten: sluiten sluit direct (M38) ────────────────────────────
  //
  // Élke exit van de tips-overlay — ✕, Escape, klik op de achtergrond of de
  // Tips-toggle — verbergt de tips METEEN en onthoudt dat
  // (`horizon_overlay_visible`). De bevestiging komt daarná, als
  // niet-blokkerende toast die vertelt waar je de tips terugvindt, met "Niet
  // meer melden" als optie ter plekke.
  //
  // Hiervóór stond hier een gecentreerde modal (`ToekomstExitNotice`) die de
  // sluiting ophield tot je in een tweede venster nóg een keuze maakte; en de
  // eerste sluiting navigeerde ongevraagd naar /overzicht. Beide zijn weg: het
  // eerste las als "sluiten sluit niet", het tweede stond in geen enkele
  // knoptekst. Terug naar de tips gaat via de Tips-knop boven de grafiek.
  const [exitNoticeDismissed, setExitNoticeDismissed] = useState<boolean>(
    initialData.exitNoticeDismissed,
  )
  /**
   * "Niet meer melden": zet de bevestigings-toast cross-device uit
   * (user_feature_visits, zelfde fire-and-forget-stijl als de welkomstkaart).
   * Raakt de tips-zichtbaarheid NIET — die hangt aan `horizon_overlay_visible`.
   */
  const dismissExitNoticeForever = useCallback(() => {
    setExitNoticeDismissed(true)
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: HORIZON_EXIT_NOTICE_DISMISSED_SLUG }),
    }).catch(() => {})
  }, [])
  const handleOverlayExit = useCallback(() => {
    persistOverlayVisible(false)
    if (exitNoticeDismissed) return
    addToast({
      type: 'info',
      title: 'Tips verborgen',
      message: 'Je zet ze terug aan via de i boven de grafiek.',
      duration: 8000,
      action: { label: 'Niet meer melden', onClick: dismissExitNoticeForever },
    })
  }, [exitNoticeDismissed, persistOverlayVisible, addToast, dismissExitNoticeForever])
  const persistNaturalMilestones = useCallback((val: boolean) => {
    setShowNaturalMilestones(val)
    try { localStorage.setItem('horizon_show_natural_milestones', String(val)) } catch { /* noop */ }
  }, [])
  const persistLifeEvents = useCallback((val: boolean) => {
    setShowLifeEvents(val)
    try { localStorage.setItem('horizon_show_life_events', String(val)) } catch { /* noop */ }
  }, [])
  const persistGoals = useCallback((val: boolean) => {
    setShowGoals(val)
    try { localStorage.setItem('horizon_show_goals', String(val)) } catch { /* noop */ }
  }, [])
  const persistLiquidLine = useCallback((val: boolean) => {
    setShowLiquidLine(val)
    try { localStorage.setItem(secondaryLinePrefKey, String(val)) } catch { /* noop */ }
  }, [secondaryLinePrefKey])

  // ── Toekomst-overlay (ballonnen) ─────────────────────────────────
  // De grafiek wordt sinds juni 2026 altijd getoond (de oude setup-pane is
  // verwijderd). In plaats daarvan een toggle-bare ballonnen-overlay die wijst
  // naar de inline-editors. De eenmalige welkomstkaart is per ADR 0130
  // verdwenen: het welkom woont nu in de rondleiding op /overzicht.
  //
  // overlayVisible: zichtbaarheid van de ballonnen-laag. Default UIT (ADR 0179 fase 2:
  // de tips staan achter de canvas-i en niet standaard aan), daarna gepersisteerd.
  const [overlayVisible, setOverlayVisible] = useState(false)

  // ── Marktcheck-context ────────────────────────────────────────────────────
  // De rauwe kernel-context voor de Monte-Carlo-band: de preview-baseline (die de
  // convergentie-context al canoniek assembleert) + de events van de hoofdrun.
  // BEWUST dezelfde `events` als `useHorizonFireSim` — niet `displayEvents` — zodat
  // band en hoofdlijn per constructie van hetzelfde plan komen.
  const marktcheckContext = useMemo<ConvergentieRawContext | null>(() => {
    if (!eventPanePreviewBaseline) return null
    return { ...eventPanePreviewBaseline.rawContext, lifeEvents: events }
  }, [eventPanePreviewBaseline, events])
  // De marktcheck is ~200× zwaarder dan de hoofdprojectie en deelt met haar één
  // seriële worker. Hij draait daarom op de UITGESTELDE context — dezelfde keuze
  // die `use-horizon-fire-sim` voor de (lichtere) hoofdlijn al maakt.
  const deferredMarktcheckContext = useDeferredValue(marktcheckContext)
  // Het ANKER van de rendement-marge: de gekozen stopleeftijd. Bewust de RAUWE
  // keuze (`scenarioStopAge`, `null` = geen keuze) en niet `effectiveStopAge` —
  // die valt terug op de afgeronde verwacht-FIRE, en een marge op de gesolvede
  // leeftijd is per constructie ≈ 0 (dezelfde val als de 51%-kans). Zonder eigen
  // keuze ankert de motor zelf op de AOW-leeftijd; de copy zegt dat ook.
  // Uitgesteld om dezelfde reden als de context: één job per gebaar.
  const deferredMarktcheckStopAge = useDeferredValue(scenarioStopAge)

  // Lazy scenario computation — replay main sim with variant returns
  useEffect(() => {
    if (!scenariosExpanded) { setScenarioData(null); return }
    if (!simResult || simResult.rows.length === 0) return
    setScenarioData(buildScenarioVariants(simResult.rows, fireParams.grossReturn))
  }, [scenariosExpanded, simResult, fireParams.grossReturn])

  // ── Marktcheck-overlay (de "Monte Carlo"-pil) ───────────────────────────────
  // Alleen bij expand (de expand-klik is de zichtbaarheids-gate). Draait
  // `computeMarktcheck` in de web worker: n VOLLEDIGE kernel-projecties op EXACT
  // dezelfde `ConvergentieRawContext` als de hoofdlijn, zodat de band de hele
  // plan-curve volgt (opbouw, overgang én onttrekking) op dezelfde leeftijdsas en
  // dezelfde grondslag (netto vermogen).
  //
  // DRIE REMMEN, want één marktcheck is ~200× duurder dan de hoofdprojectie en
  // deelt met haar één seriële worker:
  //  1. DEFERRED context — spiegel van `deferredKernelInput` in de hoofd-hook.
  //     Zonder dit draait de
  //     zwaarste run op de rauwste waarde.
  //  2. DEBOUNCE — een marker-drag muteert `events` per hele jaarstap. De
  //     `cancelled`-closure negeert alleen het ANTWOORD; de worker rekent een
  //     eenmaal verstuurde job volledig uit. Een drag over 20 jaar zou dus tot 20
  //     jobs × 200 projecties in de wachtrij zetten, met de hoofdlijn erachter.
  //     Deze rem zorgt dat zulke tussenstanden nooit verstuurd worden.
  //  3. GENERATIE-GUARD — een nieuwere aanvraag VERVANGT de oudere: alleen het
  //     antwoord met de hoogste generatie mag nog state schrijven.
  useEffect(() => {
    if (!mcExpanded) {
      marktcheckGenRef.current += 1
      setMcData(null); setMcPending(false); setMcFailed(false)
      return
    }
    if (!deferredMarktcheckContext) {
      // Context (tijdelijk) weg — niet blijven hangen op "…".
      marktcheckGenRef.current += 1
      setMcPending(false)
      return
    }
    const gen = ++marktcheckGenRef.current
    // Tijdens het herrekenen NOOIT de vorige band laten staan: die hoort bij het
    // vorige plan en zou seconden lang over de al bijgewerkte hoofdlijn liggen —
    // precies de "band en lijn zijn verschillende plannen"-fout die deze motor
    // opruimt.
    setMcData(null)
    setMcFailed(false)
    setMcPending(true)
    const timer = setTimeout(() => {
      runMarktcheckAsync(deferredMarktcheckContext, undefined, deferredMarktcheckStopAge)
        .then((res) => {
          if (gen !== marktcheckGenRef.current) return
          const ok = res !== null && res.ok
          setMcData(ok ? res : null)
          setMcFailed(!ok)
          setMcPending(false)
        })
        .catch((err) => {
          if (gen === marktcheckGenRef.current) { setMcFailed(true); setMcPending(false) }
          console.warn('[horizon-worker] marktcheck faalde', err)
        })
    }, MARKTCHECK_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [mcExpanded, deferredMarktcheckContext, deferredMarktcheckStopAge])

  // ── Natuurlijke mijlpalen ───────────────────────────────────────────────
  // Afgeleide events op de tijdlijn — hypotheek afgelost, autolening
  // afgelost, vermogen op, eerste miljoen, etc. Geen DB-mutatie; puur
  // berekend uit assets/debts/simResult. Toggle persisteert in localStorage.
  const naturalMilestones = useMemo(() => {
    if (!showNaturalMilestones) return []
    return deriveNaturalMilestones({
      debts,
      assets: initialData.assets,
      simResult: simResult ?? null,
      // Schuld-payoff-mijlpaal leest de kernel-rijen (huisverkoop-bewust) i.p.v.
      // het statische amortisatieschema — zie lib/natural-milestones.ts.
      unifiedRows,
      dob: effectiveInput?.dateOfBirth ?? null,
      hasPartner: initialData.hasPartner,
    })
  }, [showNaturalMilestones, debts, initialData.assets, simResult, unifiedRows, effectiveInput?.dateOfBirth, initialData.hasPartner])

  const naturalMilestonesAsEvents = useMemo<LifeEvent[]>(
    () => naturalMilestones.map(naturalMilestoneToLifeEvent),
    [naturalMilestones],
  )

  // Bijvangst B-025: kernel-afgeleide events dragen een FRACTIONELE target_age
  // (de kernel verkoopt de woning in een maand, niet op een verjaardag). De
  // tijdlijn zet die rauw onder de marker — "73.16666666666666j" naast
  // buurlabels als "49j". Gebruikers-events komen uit een integer-kolom, dus
  // dit raakt alleen de afgeleide markers. We ronden op hele jaren af, precies
  // zoals `handleEventDragEnd` dat doet vóór het wegschrijven; label én
  // markerpositie blijven zo bij elkaar.
  //
  // Alleen deze weergave-lijst wordt afgerond. `displayEvents` (EventPane,
  // chart-markers, simulatie-invoer) houdt de exacte kernel-waarde — afronden
  // dáár zou een rekenwaarde verschuiven, en dat is geen weergavekwestie.
  //
  // Als bouwfunctie, zodat het canvas de katern-stand (vaste lagen) kan toepassen
  // zonder de keuze van de gebruiker te overschrijven; `eventsForTimeline` is de
  // bouw met die keuze.
  const bouwEventsForTimeline = useCallback((lagen: { gebeurtenissen: boolean; mijlpalen: boolean }) => {
    const base = lagen.gebeurtenissen ? displayEvents : []
    const alle = lagen.mijlpalen && showNaturalMilestones ? [...base, ...naturalMilestonesAsEvents] : base
    return alle.map(e =>
      e.target_age != null && !Number.isInteger(e.target_age)
        ? { ...e, target_age: Math.round(e.target_age) }
        : e,
    )
  }, [showNaturalMilestones, displayEvents, naturalMilestonesAsEvents])
  const eventsForTimeline = useMemo(
    () => bouwEventsForTimeline({ gebeurtenissen: showLifeEvents, mijlpalen: showNaturalMilestones }),
    [bouwEventsForTimeline, showLifeEvents, showNaturalMilestones],
  )


  // Doelen met een kalender-streefdatum → markers op de leeftijd-as. De
  // omzetting (en alle uitsluitingen) leeft in lib/horizon/goal-chart-markers.ts;
  // hier gebeurt geen enkele doel-berekening — `computeGoalProgress` blijft de
  // enige bron voor voortgang.
  const goalChartMarkers = useMemo<ChartEventOverlay[]>(
    () =>
      buildGoalChartMarkers(goals ?? [], {
        dateOfBirth: effectiveInput?.dateOfBirth ?? null,
        currentAge,
        color: COLOR_GOAL,
        overdueColor: COLOR_GOAL_OVERDUE,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- COLOR_* zijn module-constante strings
    [goals, effectiveInput?.dateOfBirth, currentAge],
  )

  // Bouwfunctie met expliciete lagen (zelfde reden als `bouwEventsForTimeline`).
  // Mijlpalen kunnen alleen aan als de keuze ze berekent (`showNaturalMilestones`):
  // geen katern zet ze vast aan.
  const bouwChartEventOverlay = useCallback((lagen: { gebeurtenissen: boolean; mijlpalen: boolean; doelen: boolean }): ChartEventOverlay[] => {
    const showLifeEvents = lagen.gebeurtenissen
    const showNaturalMilestones = lagen.mijlpalen
    const showGoals = lagen.doelen
    const out: ChartEventOverlay[] = []
    // Partner-view met een precies partner-pad: de hoofdlijn IS de partner z'n
    // lijn, dus de EIGEN events + natuurlijke mijlpalen (op de eigen as) horen
    // er niet bij — we tonen dan uitsluitend de partner-events. Bij privacy-
    // degrade (geen partner-pad) val je terug op de eigen lijn + eigen events.
    const showOwnEvents = !(isPartnerView && partnerLine !== null)
    if (showLifeEvents && showOwnEvents) {
      for (const ev of displayEvents) {
        if (ev.target_age == null) continue
        const side = lifeEventSide(ev)
        out.push({
          id: ev.id,
          label: ev.name,
          age: ev.target_age,
          side,
          color: side === 'above' ? COLOR_LIFE_INCOME : COLOR_LIFE_EXPENSE,
          icon: ev.icon || 'Calendar',
          kind: 'life_event',
          // Looptijd van het maandbedrag als tooltip-detail (gedeelde helper) — alleen
          // bij een maandbedrag; een eenmalige post heeft geen looptijd.
          ...(ev.monthly_cost_change > 0 || ev.monthly_income_change > 0
            ? { detail: describeEventDuration(ev, eventStopAge) }
            : {}),
          // F-1 drag-handler heeft sourceId nodig om de supabase-update
          // te kunnen routeren. Voor life_events is dat de event-id zelf.
          sourceId: ev.id,
        })
      }
    }
    if (showNaturalMilestones && showOwnEvents) {
      for (const m of naturalMilestones) {
        const side = naturalMilestoneSide(m)
        const color =
          m.kind === 'sim_out_of_cash'
            ? COLOR_NAT_DANGER
            : m.category === 'debt'
              ? COLOR_NAT_DEBT
              : m.category === 'asset'
                ? COLOR_NAT_ASSET
                : COLOR_NAT_SIM
        out.push({
          id: m.id,
          label: m.name,
          age: m.target_age,
          side,
          color,
          icon: m.icon,
          kind: 'natural',
          sourceId: m.sourceId,
        })
      }
    }
    // M36 — financiële doelen met streefdatum. Volgen `showOwnEvents`: in een
    // precies partner-perspectief is de hoofdlijn die van de partner, dus horen
    // de EIGEN doelen daar net zo min bij als de eigen levensgebeurtenissen.
    if (showGoals && showOwnEvents) {
      out.push(...goalChartMarkers)
    }
    // Partner-levensgebeurtenissen als READ-ONLY markers (huishouden- +
    // partner-view). Distinctieve partner-kleur (teal) zodat ze visueel
    // verschillen van de eigen events (goud/bruin) én van natuurlijke
    // mijlpalen. Géén sourceId → de click/drag-handlers raken niets aan
    // (de viewer kan de events van de partner niet bewerken). Alleen
    // PERSOONLIJKE partner-events; gedeelde + natuurlijke mijlpalen niet.
    // As-keuze (TPR-07 fase 2a): loopt de hoofdlijn op de as van de partner
    // (partner-view mét partner-pad), dan de opgeslagen leeftijd; anders — huishoud-
    // blik of privacy-degrade naar de eigen lijn — de DOB-verschoven eigen as.
    const partnerAxis = isPartnerView && partnerLine !== null
    if ((isHouseholdView || isPartnerView) && partnerLifeEvents.length > 0) {
      for (const ev of partnerLifeEvents) {
        const age = partnerAxis ? ev.targetAge : ev.targetAgeOnOwnAxis
        if (age == null) continue
        out.push({
          id: `partner-${ev.id}`,
          label: ev.name,
          age,
          side: 'above',
          color: COLOR_PARTNER_EVENT,
          icon: ev.icon || 'Calendar',
          kind: 'life_event',
          // GEEN sourceId + readOnly → geen edit/drag-routing (read-only marker).
          readOnly: true,
        })
      }
    }
    // Partner-AOW op de eigen as (TPR-07 fase 2a) — uit de PT-laag van de kernel
    // via de bridge (consume, don't recompute). De BROWSER-hoofdrun draagt geen
    // partnerblok (rawContextZonderPartner), dus de bron is de gecombineerde run
    // van de huishoud-sectie (`householdMainLine.partnerAowAge`), met de eigen
    // `simResult` als terugval voor een run die het blok wél draagt. Alleen in de
    // huishoudblik; read-only, geen sourceId → geen klik-/sleeproute. Kind 'natural'
    // zodat de zichtbaarheid de natuurlijke mijlpalen volgt (net als de tekort-lening-marker).
    const partnerAowAge = householdMainLine?.partnerAowAge ?? simResult?.partnerAowAge
    if (isHouseholdView && showNaturalMilestones && partnerAowAge != null && Number.isFinite(partnerAowAge)) {
      out.push({
        id: 'partner-aow',
        label: 'AOW partner',
        age: partnerAowAge,
        side: 'above',
        color: COLOR_PARTNER_EVENT,
        icon: 'Landmark',
        kind: 'natural',
        detail: `Je partner bereikt de AOW-leeftijd — op jouw as ${formatStopAge(Math.round(partnerAowAge * 10) / 10)}`,
        readOnly: true,
      })
    }
    // V7 — tekort-lening als read-only waarschuwingsmarker op de eerste leeftijd
    // waarop de lening wordt aangesproken (stoplicht-rood, geen module-accent). Kind
    // 'natural' zonder sourceId → klik is een no-op (geen milestone-sheet) en de
    // marker is niet sleepbaar; volgt de natuurlijke-mijlpaal-zichtbaarheid.
    if (deficitLoanNotice && showNaturalMilestones && showOwnEvents) {
      out.push({
        id: 'deficit-loan',
        label: 'Tekort-lening aangesproken',
        age: deficitLoanNotice.firstAge,
        side: 'below',
        color: COLOR_NAT_DANGER,
        icon: 'AlertTriangle',
        kind: 'natural',
        readOnly: true,
      })
    }
    if (reverseMortgageStartAge != null && showNaturalMilestones && showOwnEvents) {
      out.push({
        id: 'reverse-mortgage-start',
        label: 'Eerste opname opeethypotheek',
        age: reverseMortgageStartAge,
        side: 'above',
        color: COLOR_NAT_ASSET,
        icon: 'Home',
        kind: 'natural',
        readOnly: true,
      })
    }
    return out
  }, [goalChartMarkers, displayEvents, naturalMilestones, isHouseholdView, isPartnerView, partnerLine, partnerLifeEvents, deficitLoanNotice, reverseMortgageStartAge, eventStopAge, householdMainLine?.partnerAowAge, simResult?.partnerAowAge])
  const chartEventOverlay = useMemo<ChartEventOverlay[]>(
    () => bouwChartEventOverlay({ gebeurtenissen: showLifeEvents, mijlpalen: showNaturalMilestones, doelen: showGoals }),
    [bouwChartEventOverlay, showLifeEvents, showNaturalMilestones, showGoals],
  )

  // Klik-handler voor markers op de chart. Life-events openen de EventPane
  // (bestaande slide-in/stack-push flow), natuurlijke mijlpalen openen onze
  // krant-stijl info-sheet, doelen deeplinken naar de doelenpagina.
  const handleChartEventClick = useCallback(
    (id: string, kind: ChartEventKind) => {
      // Read-only partner-marker (id-prefix 'partner-'): geen edit-pane openen —
      // de viewer mag de levensgebeurtenissen van de partner niet bewerken.
      if (id.startsWith('partner-')) return
      // M36 — een doel bewerk je op /toekomst/doelen (daar wordt ook de
      // voortgang herrekend); de tijdas toont 'm alleen.
      if (kind === 'goal' || isGoalMarkerId(id)) {
        router.push('/toekomst/doelen')
        return
      }
      if (kind === 'life_event') {
        setEventPaneEditingId(id)
        setEventPaneMode('view')
        setEventPaneOpen(true)
        return
      }
      const m = naturalMilestones.find(x => x.id === id)
      if (m) setSelectedNaturalMilestone(m)
    },
    [naturalMilestones, router],
  )

  /**
   * M16 — uitgang van een cluster op de chart-markers. Bij de standaard
   * uitgezoomde stand liggen markers uit aangrenzende jaren binnen een paar
   * pixels van elkaar; ze worden dan gebundeld tot een "+N"-badge en dít is wat
   * die badge opent. Hergebruikt bewust `EventClusterSheet` — dezelfde sheet die
   * de EventsTimeline eronder al gebruikt, met dezelfde rij-routing.
   *
   * De marker-laag levert `ChartEventOverlay`s; de sheet leest `LifeEvent`s.
   * Waar een echt LifeEvent bestaat (levensgebeurtenissen + natuurlijke
   * mijlpalen) pakken we dát object, zodat de bedragregel klopt. Doel-markers
   * (M36), read-only partner-gebeurtenissen en de tekort-lening hebben geen
   * LifeEvent-tegenhanger; die gaan door `chartEventOverlayToClusterRow` en
   * dragen een vooraf gezette tekstregel i.p.v. een verzonnen bedrag. Ze
   * WEGLATEN is geen optie: dan telt de badge er meer dan de lijst toont.
   */
  const handleChartClusterOpen = useCallback(
    (clusterEvents: ChartEventOverlay[], centerAge: number) => {
      if (clusterEvents.length === 0) return
      const byId = new Map(eventsForTimeline.map(e => [e.id, e]))
      setClusterSheet({
        events: clusterEvents.map(o => byId.get(o.id) ?? chartEventOverlayToClusterRow(o)),
        centerAge,
      })
    },
    [eventsForTimeline],
  )

  /**
   * F-1/F-5 directe manipulatie: een levensgebeurtenis slepen op de grafiek (de
   * vermogenslijn beweegt live mee) of op de tijdlijn. Alleen life_events zijn
   * sleepbaar; natuurlijke mijlpalen zijn afgeleid en niet bewerkbaar. Vergelijken en
   * terugdraaien gebeurt tegen de plek van vóór de sleep (`useGebeurtenisSleep`).
   */
  const {
    grafiekMove: handleChartEventDragMove,
    grafiekEnd: handleChartEventDragEnd,
    tijdlijnEnd: handleEventDragEnd,
  } = useGebeurtenisSleep({ events, setEvents, currentAge, loadData, addToast })
  // Cijferbar-waarden bij de actieve leeftijd (hover/playback); consumeert de
  // unified-rij + format-helpers, herberekent niets.
  const readoutData = useMemo(() => {
    const rows = displayUnifiedRows ?? []
    if (!rows.length) return null
    const target = lifelineAge ?? (currentAge != null ? Math.round(currentAge) : rows[0].age)
    let row = rows[0]
    let bestDiff = Math.abs(rows[0].age - target)
    for (const r of rows) {
      const d = Math.abs(r.age - target)
      if (d < bestDiff) { bestDiff = d; row = r }
    }
    const dRate = canonicalDailyRate
    // ── PEILMOMENT (H21/F1) ────────────────────────────────────────────────
    // `row.netWorth` is per contract de EINDstand van het blok (bridge.ts:
    // Prognose!I op m = 12k+11), `row.startNetWorth` de BEGINstand (m = 12k−1).
    // De kassabon toonde de eindstand onder het label "leeftijd X · jaar Y",
    // terwijl de zin eronder het netto vermogen van VANDAAG toont. Op k=0 scheelt
    // dat precies één jaar rendement + inleg — in productie €1.731.640 boven
    // €1.619.700, vijf regels uit elkaar, beide gepresenteerd als "nu".
    // (Deflatie verhult het juist: bij k=0 is de inflatiefactor exact 1,0.)
    //
    // Eén peilmoment voor de hele bar: de stand ÓP die leeftijd = het begin van
    // het blok. Daarmee klopt de kassabon per constructie met het leeftijd- en
    // jaarlabel ernaast, en is `k=0` letterlijk het bedrag van vandaag.
    const readoutNetWorth = row.startNetWorth
    const freedomTime = formatFreedomTimeString(calculateFreedomTime(Math.max(0, readoutNetWorth), dRate), 'short')
    const isAcc = row.phase === 'accumulation'
    // Fase uit dezelfde bron als de fasebalk (buildSegments): kernel-rijen
    // kennen geen 'transition' (bridge.ts), dus row.phase ziet Overgang niet.
    const faseId = (simResult != null
      ? faseAtAge({
          currentAge: currentAge ?? rows[0].age,
          fireAge: simResult.fireAge,
          fireAgeFractional: simResult.fireAgeFractional,
          aowAge: userAowAge.fractional,
          endAge: displayEndAge ?? rows[rows.length - 1].age + 1,
          fireReachable: simResult.fireReachable,
          isPensioenMode,
        }, row.age)?.id
      : null) ?? (isAcc ? 'opbouw' : 'onttrekking')
    const phaseLabel = faseId === 'opbouw' ? 'Opbouw' : faseId === 'overgang' ? 'Overgang' : 'Onttrekking'
    const phaseColor = faseId === 'opbouw'
      ? 'var(--hor-t, #8a6e42)'
      : faseId === 'overgang'
        ? 'var(--color-horizon-500)'
        : 'var(--kern-t, #58362d)'
    return {
      age: row.age,
      year: new Date().getFullYear() + row.year,
      phaseLabel,
      phaseColor,
      netWorth: readoutNetWorth,
      // Grondslag in het label: op de huidige leeftijd is de beginstand van het
      // blok letterlijk "nu"; verderop de tijdas is het het begin van dat jaar.
      netWorthMoment:
        currentAge != null && row.age === Math.round(currentAge)
          ? 'nu'
          : `begin ${new Date().getFullYear() + row.year}`,
      freedomTime,
      monthlyLabel: isAcc ? 'Inleg / maand' : 'Ruimte / maand',
      monthlyAmount: isAcc
        ? Math.max(0, row.savings) / 12
        : (row.withdrawalNeed?.totaalNeed ?? (effectiveInput?.monthlyExpenses ?? 0) * 12) / 12,
    }
  }, [displayUnifiedRows, lifelineAge, currentAge, canonicalDailyRate, effectiveInput, simResult, userAowAge.fractional, displayEndAge, isPensioenMode])

  // "Speel af": animeer de actieve leeftijd van de eerste naar de laatste rij.
  useEffect(() => {
    if (!isPlaying) return
    const rows = displayUnifiedRows ?? []
    if (rows.length < 2) { setIsPlaying(false); return }
    const startAge = rows[0].age
    const endAgeVal = rows[rows.length - 1].age
    const durationMs = 7000
    let startTs = 0
    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / durationMs)
      setLifelineAge(Math.round(startAge + t * (endAgeVal - startAge)))
      if (t < 1) {
        playbackRafRef.current = requestAnimationFrame(step)
      } else {
        setIsPlaying(false)
      }
    }
    playbackRafRef.current = requestAnimationFrame(step)
    return () => {
      if (playbackRafRef.current != null) cancelAnimationFrame(playbackRafRef.current)
    }
  }, [isPlaying, displayUnifiedRows])

  // ── Welke grondslagen tekent de grafiek? (ADR 0114 D1/D6) ───────────────
  //
  // `chartPrimaryBasis` (bovenaan, uit server-props) zegt wat de woonstrategie
  // wil; hier komt daar de runtime-werkelijkheid bij. Bij "Uitsluiten" stonden de
  // voortgangsbalk en het vrijheids-% eronder al op de J-grondslag
  // (`homeExcludedFromProgress`) terwijl de grafiek op I stond — dát was het
  // defect.
  //
  // Is er überhaupt een tweede grondslag te tónen? Geen J-punten (o.a.
  // `include_full` — daar valt J exact samen met I) of een vreemde hoofdlijn
  // (partner/huishouden/AOW-stop, die andere rijen tekenen waar deze punten niet
  // bij horen) ⇒ één lijn op de totaal-grondslag, en dus ook geen pill.
  const dualBasisAvailable =
    liquidWealthPoints != null && !usePartnerMainLine && !useHouseholdMainLine
  // De grondslag die de grafiek daadwerkelijk tekent: 'liquid' alleen als de
  // woonstrategie erom vraagt ÉN de J-reeks er ook echt is.
  const effectiveChartPrimaryBasis: 'total' | 'liquid' =
    dualBasisAvailable && chartPrimaryBasis === 'liquid' ? 'liquid' : 'total'
  // De pill schakelt de TWEEDE (dunne, gestippelde) lijn — welke van de twee
  // grondslagen dat is, volgt uit `effectiveChartPrimaryBasis`.
  const secondaryLineVisible = dualBasisAvailable && showLiquidLine

  // Scenario overlays for SimChart (only when expanded + data available)
  const scenarioOverlays = scenariosExpanded && scenarioData ? scenarioData : undefined

  // De rendement-marge van de marktcheck — één bron voor pil, legenda, explainer
  // en aria-label (`lib/horizon/marktcheck-copy.ts` formuleert alle vier).
  // `null` = degeneratie (geen onttrekkingsfase op het anker) ⇒ geen getal tonen.
  const mcMarge = mcExpanded && mcData ? mcData.marge : null

  // Marktcheck-band voor SimChart. `startAge` komt UIT de band (de kernel-as
  // `round(startLeeftijd)`), niet uit een tweede leeftijdsberekening hier — anders
  // kan de band één jaar naast de hoofdlijn komen te liggen.
  //
  // GRONDSLAG (ADR 0114): de band MOET dezelfde grootheid dragen als de primaire
  // lijn die erin ligt. Tekent de grafiek J, dan komt de band uit `bandLiquide`
  // (de J-spiegel uit dezelfde MC-runs, op dezelfde blokranden) — anders omhult
  // hij een ándere grootheid dan de lijn, en bepaalt hij via de bandtop ook nog
  // de ashoogte mee. Bij `include_full` zijn beide banden per constructie gelijk.
  const mcBand = mcData
    ? (effectiveChartPrimaryBasis === 'liquid' ? mcData.bandLiquide : mcData.band)
    : null
  const monteCarloOverlay: MonteCarloOverlay | undefined = mcExpanded && mcBand
    ? {
        startAge: mcBand.startAge,
        p10: [...mcBand.p10],
        p25: [...mcBand.p25],
        p50: [...mcBand.p50],
        p75: [...mcBand.p75],
        p90: [...mcBand.p90],
      }
    : undefined

  // Eén bouwer voor de staven van Samenstelling — het plan én (ADR 0179 fase 4) het
  // doelscenario gaan door exact dezelfde helpers, alleen de rijen verschillen.
  const bouwSamenstelling = useCallback((rows: UnifiedProjectionRow[]): StackedRow[] => {
    if (!rows.length) return []
    const baseRows = unifiedRowsToStackedRows(
      rows,
      new Map(debts.map((d) => [d.id, d.debt_type])),
      eigenHuisMortgageIds,
    )

    const currentAgeFloor = initialData.effectiveInput.dateOfBirth
      ? Math.floor(ageAtDate(initialData.effectiveInput.dateOfBirth))
      : null
    if (currentAgeFloor === null) return baseRows

    // Woonstrategie-injectie (pure helper). De kernel houdt huis + hypotheek (én de
    // verkoop-/opeet-kasstromen) voor ELKE woonstrategie al in het grootboek →
    // `houseInLedger: true` voorkomt dubbeltellen. Dat kort-sluit vóór `isV2` (die
    // daardoor een no-op is; de param blijft alleen omdat de lib-helper 'm nog vereist).
    return applyHousingToComposition(baseRows, {
      housingCfg: initialData.housingStrategy,
      ctx: initialData.housingContext,
      displayEvents,
      currentAgeFloor,
      fireEndAge: initialData.fireStrategy.endAge,
      isV2: true,
      houseInLedger: true,
      // Terugval voor een woning zonder eigen rendement (ADR 0166) — inert onder
      // `houseInLedger`, maar dezelfde grondslag als de kernel zodra het pad leeft.
      terugvalRendement: initialData.fireParams.grossReturn,
    })
  }, [initialData, displayEvents, debts, eigenHuisMortgageIds])

  const wealthCompositionRows: StackedRow[] = useMemo(
    () => (canvasModus === 'samenstelling' ? bouwSamenstelling(displayUnifiedRows) : []),
    [canvasModus, bouwSamenstelling, displayUnifiedRows],
  )
  // Het doelscenario: alleen als er een doelgrootboek is én de modus erom vraagt.
  const doelWealthCompositionRows: StackedRow[] | null = useMemo(
    () =>
      doelGrootboek && canvasModus === 'samenstelling' ? bouwSamenstelling(doelGrootboek.unifiedRows) : null,
    [doelGrootboek, canvasModus, bouwSamenstelling],
  )

  // Lazy compute income/expense breakdown only when user toggles to 'breakdown' mode.
  // Consume de geclipte weergaverijen zodat de bronnen-breakdown niet tot het
  // (verborgen) laatste jaar doorloopt.
  const ieBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown' || !displayUnifiedRows.length || !displaySimRows.length) return null
    return buildBreakdown(displayUnifiedRows, displaySimRows, debts)
  }, [ieViewMode, displayUnifiedRows, displaySimRows, debts])
  // Idem voor het doelscenario (ADR 0179 fase 4): zelfde helper, rijen van de doelrun.
  const doelIeBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown' || doelGrootboek == null) return null
    if (!doelGrootboek.unifiedRows.length || !doelGrootboek.simRows.length) return null
    return buildBreakdown(doelGrootboek.unifiedRows, doelGrootboek.simRows, debts)
  }, [ieViewMode, doelGrootboek, debts])

  // Gememoized samenstelling voor de SimChart-prop: een inline spread op de
  // callsite gaf per render een verse array-identiteit, waardoor de memo() van
  // SimChart bij élke monoliet-setState bail-de en de volledige SVG herbouwde.
  // De wat-als-lijn staat vooraan.
  const combinedScenarioOverlays = useMemo(() => [
    ...(scenarioLineOverlay ? [scenarioLineOverlay] : []),
    ...(scenarioOverlays ?? []),
  ], [scenarioLineOverlay, scenarioOverlays])

  // ── De lagenkeuze van het Lagen-menu (ADR 0179 D3) ─────────────────────────
  // Eén record over de bestaande vlaggen en hun bestaande opslag (localStorage per
  // apparaat; de doelscenario-lijn cross-device via de scenario-prefs) — geen nieuw
  // schema. Dit is de keuze van de gebruiker; vaste lagen van een katern legt het
  // canvas erbovenop en komen hier nooit in terecht.
  const canvasLagenKeuze = useMemo<Record<LaagId, boolean>>(() => ({
    gebeurtenissen: showLifeEvents,
    mijlpalen: showNaturalMilestones,
    doelen: showGoals,
    doelscenario: showScenarioLine,
    marktcheck: mcExpanded,
    rendementScenarios: scenariosExpanded,
    metHuis: showLiquidLine,
    speelAf: isPlaying,
  }), [showLifeEvents, showNaturalMilestones, showGoals, showScenarioLine, mcExpanded, scenariosExpanded, showLiquidLine, isPlaying])

  const toggleLaag = useCallback((id: LaagId) => {
    switch (id) {
      case 'gebeurtenissen': persistLifeEvents(!showLifeEvents); return
      case 'mijlpalen': persistNaturalMilestones(!showNaturalMilestones); return
      case 'doelen': persistGoals(!showGoals); return
      case 'doelscenario': setShowScenarioLine(prev => !prev); return
      case 'marktcheck': setMcExpanded(prev => !prev); return
      case 'rendementScenarios': setScenariosExpanded(prev => !prev); return
      case 'metHuis': persistLiquidLine(!showLiquidLine); return
      case 'speelAf': setIsPlaying(prev => !prev); return
    }
  }, [persistLifeEvents, showLifeEvents, persistNaturalMilestones, showNaturalMilestones, persistGoals, showGoals, setShowScenarioLine, persistLiquidLine, showLiquidLine])

  return useStabielObject({
    scenariosExpanded,
    setScenariosExpanded,
    scenarioData,
    mcExpanded,
    setMcExpanded,
    mcData,
    mcPending,
    mcFailed,
    ieViewMode,
    setIeViewMode,
    canvasModus,
    setCanvasModus,
    canvasLagenKeuze,
    toggleLaag,
    bouwChartEventOverlay,
    bouwEventsForTimeline,
    lifelineAge,
    setLifelineAge,
    isPlaying,
    setIsPlaying,
    showNaturalMilestones,
    showLifeEvents,
    showGoals,
    showLiquidLine,
    overlayPrefRestored,
    persistOverlayVisible,
    handleOverlayExit,
    persistNaturalMilestones,
    persistLifeEvents,
    persistGoals,
    persistLiquidLine,
    overlayVisible,
    naturalMilestones,
    eventsForTimeline,
    goalChartMarkers,
    chartEventOverlay,
    handleChartEventClick,
    handleChartClusterOpen,
    handleChartEventDragMove,
    handleChartEventDragEnd,
    readoutData,
    dualBasisAvailable,
    effectiveChartPrimaryBasis,
    secondaryLineVisible,
    mcMarge,
    monteCarloOverlay,
    wealthCompositionRows,
    ieBreakdownResult,
    doelWealthCompositionRows,
    doelIeBreakdownResult,
    combinedScenarioOverlays,
    handleEventDragEnd,
  })
}

export type ToekomstLagen = ReturnType<typeof useToekomstLagen>
