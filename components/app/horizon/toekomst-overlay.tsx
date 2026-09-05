'use client'

/**
 * ToekomstOverlay — "Tips-modus" rond de FIRE-grafiek.
 *
 * Wikkelt de grafiek. Zolang de tips AAN staan:
 *   • verschijnt er een rij gelabelde markers BOVEN en een rij ONDER de grafiek
 *     (icoon + titel), buiten het tekengebied — ze staan dus nooit over de lijn;
 *   • vervaagt de grafiek zelf (blur) zodat de markers de aandacht trekken.
 * De rijen worden alleen TOEGEVOEGD als de tips aan staan; de grafiek behoudt
 * zijn volledige hoogte (geen krimp). Tips uit → scherpe, interactieve grafiek
 * zonder markers.
 *
 * Op ruime schermen (≥1024px) tonen de markers hun volledige inhoud (kicker +
 * uitleg) DIRECT leesbaar als statische kaart — niet uitklapbaar. Op smallere
 * schermen, waar de volle bodies niet naast elkaar passen, vallen de markers
 * terug op een inklapbare popover die op hover (desktop) of tik (mobiel) opent.
 * De tip-teksten zijn puur informatief (uitleg van de grafiek in
 * "Geld is opgeslagen tijd"-geest), zonder navigerende CTA. Geen eigen
 * rekenlogica — `onEmphasisChange` laat de parent de relevante grafiekfase
 * accentueren via `SimChart.emphasis`.
 *
 * Module-accent: Toekomst = horizon/paars via `--module-active-*`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  TrendingDown,
  TrendingUp,
  Flag,
  X,
} from 'lucide-react'
import { useIsLgUp, useMediaQuery } from '@/lib/hooks/use-media-query'
import { formatMaskedCurrency } from '@/lib/format'
import { acquireOverlay } from '@/lib/overlay-signal'
import { buildVrijheidsleeftijdZin } from '@/lib/horizon/vrijheidsleeftijd-zin'
import type { NuStoppenReach } from '@/lib/horizon/nu-stoppen-copy'
import type { AnkerReach, AnkerStop } from '@/lib/horizon/anker-copy'
import type { StopAnchor } from '@/lib/fire-strategy'

/** Welke grafiekfase een ballon accentueert bij openen. */
type OverlayEmphasis = 'accumulation' | 'withdrawal' | 'fire' | null

/** In welke rij (boven of onder de grafiek) de marker staat. */
type BalloonRow = 'top' | 'bottom'

/**
 * Gewogen plaatsing van een ballon rond de gecentreerde grafiek:
 *  • 'bottom-left'  — Opbouw, wijst naar het opbouw-segment;
 *  • 'top-center'   — Financiële vrijheid, wijst naar de FIRE-stip;
 *  • 'bottom-right' — Afbouw, wijst naar het afbouw-segment.
 * Alleen actief op ruime schermen (weighted layout). Op smal scherm vallen we
 * terug op de bestaande marker/popover-rijen via `row`.
 */
type BalloonSlot = 'bottom-left' | 'top-center' | 'bottom-right'

export interface OverlayBalloonDef {
  id: string
  icon: ReactNode
  /** Korte editorial kop (mono) — dient óók als zichtbaar marker-label. */
  kicker: string
  /** Eén zin uitleg — informatief/leek-taal, vrijheidstijd-framing waar passend. */
  body: string
  /**
   * Optioneel CTA-label op een knop. De standaard tip-ballonnen zijn puur
   * informatief en hebben dit NIET (de knop wordt alleen gerenderd als zowel
   * `cta` als `onActivate` aanwezig zijn). Behouden als optioneel zodat de
   * component een actie-knop blijft ondersteunen waar dat ooit nodig is.
   */
  cta?: string
  /** Rij: 'top' (boven de grafiek) of 'bottom' (onder de grafiek). Smal-scherm-fallback. */
  row: BalloonRow
  /** Gewogen plaatsing rond de grafiek (ruim scherm). */
  slot: BalloonSlot
  /** Grafiekfase die deze ballon accentueert bij openen. */
  emphasis: OverlayEmphasis
  /** Optioneel: opent een bijbehorende in-page editor (alleen samen met `cta`). */
  onActivate?: () => void
}

/**
 * Horizontale geometrie van de grafiek, zodat de overlay leader-lines, fase-
 * kaders en de FIRE-cirkel pixelnauwkeurig over de grafiek kan leggen ZONDER de
 * SVG-interne coördinaten te kennen.
 *
 * Het tekengebied (plot) van SimChart loopt van `padLeft` px vanaf de linker-
 * kaartrand tot `padRight` px vanaf de rechterrand (de as-goot). Een leeftijd
 * `a` met fractie `f = (a − minAge)/(maxAge − minAge)` landt op CSS
 * `left: calc(padLeft + (100% − padLeft − padRight) · f)`. We geven de fracties
 * van het FIRE-punt + de begin/eind van het zichtbare bereik door; de overlay
 * rekent de CSS-posities uit met `calc()` (responsive, geen breedte nodig).
 *
 * Consume-only: alle fracties worden door de parent uit de canonieke sim-data
 * afgeleid — de overlay herberekent niets.
 */
export interface ToekomstOverlayGeometry {
  /** Plot-inset links in px (as-goot). */
  padLeft: number
  /** Plot-inset rechts in px. */
  padRight: number
  /** Plot-inset boven in px (waar de lijn-top ongeveer begint). */
  padTop: number
  /** Plot-inset onder in px (x-as). */
  padBottom: number
  /** Horizontale fractie (0..1) van het FIRE-punt binnen het plot. null = niet in zicht. */
  fireFraction: number | null
}

/**
 * Compacte samenvatting bovenin de tips-overlay: twee feiten in één regel.
 * Gestructureerde data zodat formattering + maskering hier editorial-consistent
 * gebeurt (geen vooraf-geformatteerde string van de parent).
 */
export interface ToekomstOverlaySummary {
  /** Netto vermogen (= bezittingen − schulden), uit de canonieke bron. */
  netWorth: number
  /** Vrijheids-/FIRE-leeftijd zoals de pagina 'm toont; null = nog niet in zicht. */
  freedomAge: number | null
  /** Privacy-maskering — volgt dezelfde toggle als de marker-bedragen. */
  masked: boolean
  /** Pensioenmodus → frame de leeftijd als "pensioenleeftijd" i.p.v. een keuze. */
  isPensioen?: boolean
  /** ADR 0127 — 'Nu stoppen': de samenvattingsregel gaat over bereik, niet over een moment. */
  nuStoppenReach?: NuStoppenReach | null
  /** ADR 0129 F3b — het plan-anker (bepaalt "pensioen"- vs "keuze"-woordkeuze onder 'free'). */
  anchor?: StopAnchor | null
  /** ADR 0129 F3b — het bereik onder een vast anker (alias van `nuStoppenReach`, anker-generiek). */
  ankerReach?: AnkerReach | null
  /** ADR 0129 F3b — het stopmoment bij `ankerReach` ("nu" / "op 58,5"). */
  ankerStop?: AnkerStop | null
}

export interface ToekomstOverlayProps {
  /** Of de tips-modus aan staat (toggle in de header). */
  visible: boolean
  /** Ballon-definities (door horizon-client samengesteld + gewired). */
  balloons: OverlayBalloonDef[]
  /**
   * Horizontale grafiek-geometrie voor de gewogen layout (leader-lines, fase-
   * kaders, FIRE-cirkel). Alleen op ruime schermen gebruikt. Ontbreekt 'ie, dan
   * valt de overlay terug op de marker/popover-rijen (geen leader-lines).
   */
  geometry?: ToekomstOverlayGeometry
  /**
   * Optionele één-regel-samenvatting bovenin de overlay (netto vermogen +
   * vrijheidsleeftijd). Alleen gerenderd als `visible && summary`.
   */
  summary?: ToekomstOverlaySummary
  /** Accentueer de gegeven grafiekfase (of reset met null). */
  onEmphasisChange: (emphasis: OverlayEmphasis) => void
  /** De grafiek zelf — staat in de overlay gecentreerd op een witte kaart. */
  children: ReactNode
  /** Sluit de tips-overlay (zet de "Tips"-toggle uit). */
  onClose: () => void
  /**
   * Schort de eigen Escape-afhandeling op zolang een ánder venster Escape
   * exclusief bezit. Sinds M38 sluit de overlay direct (de bevestiging is een
   * niet-blokkerende toast geworden), dus er is geen venster meer dat de
   * overlay open houdt — de prop blijft bestaan als vangnet voor een toekomstig
   * geval en staat standaard uit.
   */
  escapeSuspended?: boolean
  /**
   * Of het scroll-in-beeld-effect (centreer/lijn de overlay uit bij openen) mag
   * vuren. Default `true`. De ouder zet dit pas op `true` zodra de opgeslagen
   * voorkeur (`horizon_overlay_visible`) ná hydratie is ingelezen, zodat de
   * pre-restore default `visible={true}` op de eerste render NIET onterecht naar
   * de grafiek scrolt wanneer de gebruiker de tips eerder had uitgezet. Voorkomt
   * de race tussen de initiële state-waarde en de localStorage-restore — zonder
   * de SSR/eerste-render DOM te veranderen (geen hydratie-mismatch).
   */
  autoScrollIntoView?: boolean
}

export function ToekomstOverlay({
  visible,
  balloons,
  geometry,
  summary,
  onEmphasisChange,
  children,
  onClose,
  escapeSuspended = false,
  autoScrollIntoView = true,
}: ToekomstOverlayProps) {
  // Apparaten met echte hover (desktop) openen de popover bij hover; touch
  // gebruikt tik-om-te-openen + tik-naast/✕ om te sluiten.
  const canHover = useMediaQuery('(hover: hover)')
  // Adaptieve weergave: op ruime schermen (≥1024px, de `lg:`-breakpoint die ook
  // de lock-/scroll-logica hieronder gebruikt) tonen we de volledige ballon-
  // inhoud (kicker + body) DIRECT leesbaar als statische kaart — niet
  // uitklapbaar. Op smallere schermen passen 5-6 volle bodies per rij niet naast
  // elkaar zonder overlap/overflow, dus vallen we terug op de inklapbare popover
  // (tik/hover om te openen). Eén verdedigbare heuristiek, hergebruikt de
  // bestaande breakpoint zodat layout-gedrag consistent kantelt.
  const inline = useIsLgUp()
  // Portal-mount voor het ✕ (document bestaat niet tijdens SSR).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const wrapperRef = useRef<HTMLDivElement>(null)
  // De échte scroll-container (`ChatLayoutWrapper`, `[data-scroll-container]`,
  // `contain: layout`). De blur-scrim moet een DIRECTE child hiervan zijn — niet
  // genest in de z-[50]-grafiek-wrapper — anders sampelt `backdrop-filter` alleen
  // binnen die wrapper en blijft de rest van de pagina scherp.
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setScrollContainer(
      (wrapperRef.current?.closest('[data-scroll-container]') as HTMLElement | null) ??
        document.body,
    )
  }, [])
  // Volledige inhoudshoogte van de scroll-container. De scrim is een child van die
  // container (moet dáár blijven: de shell-wrapper is `position: fixed` → eigen
  // stacking-context, dus een body-scrim zou ÓVER de grafiek vallen). Binnen de
  // container is positionering relatief aan de (gescrolde) inhoud, niet de viewport
  // — een `inset-0`/`fixed` scrim is daardoor maar één viewport hoog en hangt aan de
  // inhoud-oorsprong. Bij scrollTop > 0 (we centreren de grafiek bij openen) dekt 'ie
  // dan alleen de bovenste strook en lijkt de blur "te hoog". Door 'm de VOLLE
  // scrollHeight te geven dekt 'ie alle inhoud, ongeacht de scrollpositie.
  const [scrimHeight, setScrimHeight] = useState<number | null>(null)
  useEffect(() => {
    if (!visible || !scrollContainer) return
    const measure = () => setScrimHeight(scrollContainer.scrollHeight)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [visible, scrollContainer])
  const [openId, setOpenId] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const open = useCallback(
    (def: OverlayBalloonDef) => {
      clearCloseTimer()
      setOpenId(def.id)
      onEmphasisChange(def.emphasis)
    },
    [clearCloseTimer, onEmphasisChange],
  )

  const close = useCallback(() => {
    clearCloseTimer()
    setOpenId(null)
    onEmphasisChange(null)
  }, [clearCloseTimer, onEmphasisChange])

  // Hover-uit met korte vertraging zodat de muis van marker naar popover kan
  // bewegen zonder dat 'ie tussendoor dichtklapt.
  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      setOpenId(null)
      onEmphasisChange(null)
    }, 140)
  }, [clearCloseTimer, onEmphasisChange])

  // Inline-kaarten (≥1024px) zijn niet uitklapbaar, maar accentueren bij hover
  // wél de bijbehorende grafiekfase — net als de popover-markers deden. Bewust
  // EMPHASIS-ONLY: géén `openId` zetten. Anders zou (a) Escape op de overlay
  // `close()` doen ("sluit popover") i.p.v. `onClose()` ("verlaat tips"), en
  // (b) zouden de kaarten elkaar gaan dimmen. De korte leave-vertraging voorkomt
  // geflikker van de grafiek-emphasis bij het bewegen tussen kaarten.
  const emphasize = useCallback(
    (def: OverlayBalloonDef) => {
      clearCloseTimer()
      onEmphasisChange(def.emphasis)
    },
    [clearCloseTimer, onEmphasisChange],
  )
  const releaseEmphasis = useCallback(() => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => onEmphasisChange(null), 140)
  }, [clearCloseTimer, onEmphasisChange])

  // Reset wanneer de tips uitgaan of de component unmount.
  useEffect(() => {
    if (!visible) close()
    return clearCloseTimer
  }, [visible, close, clearCloseTimer])

  // Meld je aan als open overlay zolang de tips-tour zichtbaar is (M15).
  // Zonder dit signaal bleven de zwevende Fin-hulplagen dwars door de tourtekst
  // heen staan. Bewust GEEN scroll-lock: de tour is
  // pagina-inhoud waar je doorheen scrollt, geen modale sheet — alleen het
  // pill-/FAB-signaal wordt gedeeld. Zie lib/overlay-signal.ts.
  useEffect(() => {
    if (!visible) return
    return acquireOverlay()
  }, [visible])

  // Escape: eerst een open popover sluiten, anders de hele tips-overlay — die
  // dan direct sluit (M38). Bij `escapeSuspended` registreert de overlay zelfs
  // geen listener, zodat er nooit twee window-keydown-handlers tegelijk vuren.
  useEffect(() => {
    if (!visible || escapeSuspended) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (openId) close()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, escapeSuspended, openId, close, onClose])

  // Geschatte hoogte van de sticky paginakop/TopBar (binnen de tray): ~48px
  // (`h-12`) plus wat lucht. We trekken 'm van de viewport af om de beschikbare
  // hoogte voor de overlay te bepalen — en hij is de doel-top bij `block:'start'`.
  const HEADER_OFFSET = 64

  // Scroll-lock — MAAR alleen als de hele overlay (samenvatting + beide
  // marker-rijen + grafiek) binnen de beschikbare viewport-hoogte past. Past 'ie
  // → statische spotlight (lock voorkomt dat de blur weggescrold wordt). Past 'ie
  // NIET (kleine schermen: de onderste markers vallen eraf) → NIET locken, zodat
  // de gebruiker naar de onderste bubbels kan scrollen. De scrim dekt de volle
  // scrollHeight, dus de blur blijft de hele pagina vervagen tijdens het scrollen
  // en de grafiek (z-[50]) blijft scherp boven de scrim (z-[45]).
  useEffect(() => {
    if (!visible) return
    // 1. Lijn de overlay (top-markerrij → grafiek → bottom-markerrij) in beeld
    //    VOORDAT we eventueel de scroll vergrendelen, zodat de juiste info
    //    zichtbaar is.
    //    - Mobiel: zo HOOG mogelijk (block:'start'), net onder de sticky paginakop
    //      via scroll-margin-top (zie de wrapper-div), zodat het geheel hoog in
    //      beeld start.
    //    - Desktop (ruimer scherm): centreren blijft de mooiste weergave.
    //    (defensief: scrollIntoView bestaat niet in elke omgeving, bv. jsdom.)
    const el = wrapperRef.current
    const isCompact =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1023px)').matches
    // Alleen scrollen wanneer dit een échte (gebruikers-/voorkeur-bevestigde)
    // open is — niet op de transiënte pre-restore default `visible={true}`.
    if (autoScrollIntoView && el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: isCompact ? 'start' : 'center', behavior: 'auto' })
    }

    // 2. Bepaal of de overlay overflowt: is de inhoudshoogte van de wrapper groter
    //    dan de beschikbare viewport (viewport − header)? Meet op de wrapper zelf
    //    (niet de paginabrede scrollHeight, die is altijd groter). We her-meten bij
    //    resize zodat een draai/herschaal de lock-conditie corrigeert.
    let restores: Array<() => void> = []

    const lock = (node: HTMLElement | null | undefined) => {
      if (!node) return
      const prev = node.style.overflow
      node.style.overflow = 'hidden'
      restores.push(() => {
        node.style.overflow = prev
      })
    }

    const release = () => {
      restores.forEach((fn) => fn())
      restores = []
    }

    const applyLock = () => {
      release()
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const available =
        (typeof window !== 'undefined' ? window.innerHeight : 0) - HEADER_OFFSET
      // Inhoudshoogte van de overlay (samenvatting + beide marker-rijen + grafiek).
      const contentHeight = wrapper.scrollHeight
      const overflows = contentHeight > available
      // Past alles → lock (statische spotlight). Overflow → NIET locken: laat de
      // scroll-container scrollen zodat de onderste bubbels bereikbaar zijn.
      if (overflows) return
      lock(document.documentElement)
      lock(document.body)
      let node = wrapper.parentElement ?? null
      while (node) {
        const oy = getComputedStyle(node).overflowY
        if (oy === 'auto' || oy === 'scroll') lock(node)
        node = node.parentElement
      }
    }

    // Eerste meting (na de scrollIntoView). Layout-waarden zijn dan stabiel.
    applyLock()
    // Her-meet bij resize: een draai of toetsenbord-overlap verandert de
    // beschikbare hoogte en dus de lock-conditie.
    window.addEventListener('resize', applyLock)
    return () => {
      window.removeEventListener('resize', applyLock)
      release()
    }
  }, [visible, autoScrollIntoView])

  const topBalloons = balloons.filter((b) => b.row === 'top')
  const bottomBalloons = balloons.filter((b) => b.row === 'bottom')

  const rowProps = {
    inline,
    canHover,
    openId,
    onOpen: open,
    onScheduleClose: scheduleClose,
    onCloseNow: close,
    onEmphasize: emphasize,
    onReleaseEmphasis: releaseEmphasis,
  }

  // Gewogen layout alleen op ruime schermen MÉT geometrie: daar is genoeg
  // ruimte voor de bubbels rondom de grafiek + leader-lines. Op smal scherm
  // (geen `inline`) of zonder geometrie vallen we terug op de marker/popover-
  // rijen, zodat niets buiten beeld valt.
  const weighted = inline && !!geometry

  return (
    // Tips UIT → grafiek gewoon in-flow. Tips AAN → spotlight: de grafiek blijft op
    // EXACT dezelfde plek (in-flow, z-[50] erboven), de pagina is scroll-locked en de
    // rest vervaagt via een scrim; de markers staan in een rij boven + onder. De
    // grafiek (`children`) staat in beide gevallen op dezelfde plek in de React-tree
    // zodat 'ie niet re-mount/re-animeert.
    // `scroll-mt-2` (0.5rem = 8px): wanneer de tips de overlay met block:'start'
    // naar boven scrollen (mobiel), landt de samenvattingsregel zo hóóg mogelijk —
    // net onder de paginakop. De scroll-container (`<main>`) begint al ONDER de
    // sticky TopBar (~48px `h-12`), dus hier is alleen nog een kleine ademruimte
    // nodig; een grotere marge zou de overlay onnodig naar beneden duwen.
    // (HEADER_OFFSET in de lock-effect is een aparte, conservatieve drempel voor
    // de overflow-detectie en hoeft hier niet mee overeen te komen.)
    <div ref={wrapperRef} className={visible ? 'relative z-[50] scroll-mt-2' : 'relative'}>
      {/* Blur-scrim als DIRECTE child van de scroll-container (niet genest in de
          z-[50]-grafiek-wrapper) zodat `backdrop-filter` de HÉLE pagina vervaagt.
          z-[45] → onder de grafiek + markers (z-[50]) maar boven de rest. Klik sluit.
          `top-0` + expliciete `height` = de VOLLE inhoudshoogte van de container: een
          `inset-0`-scrim is maar één viewport hoog en hangt aan de inhoud-oorsprong,
          dus bij scrollTop > 0 (de grafiek wordt gecentreerd) dekt 'ie alleen de
          bovenkant en lijkt de blur "te hoog". De volle scrollHeight dekt alle inhoud,
          ongeacht de scrollpositie. */}
      {visible &&
        scrollContainer &&
        createPortal(
          <button
            type="button"
            aria-label="Tips sluiten"
            onClick={onClose}
            // Stop pointerdown van bubbelen (via de React-portal-tree) naar de
            // ZoomableChartContainer: die doet `setPointerCapture` op élke
            // pointerdown, waardoor de pointer-capture de click naar de grafiek
            // omleidt en deze sluit-knop nooit zijn `onClick` krijgt. Zelfde
            // guard als de markers/✕.
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-0 right-0 top-0 z-[45] cursor-default bg-[var(--ink)]/15 backdrop-blur-md"
            style={{ height: scrimHeight ?? '100%' }}
          />,
          scrollContainer,
        )}

      {/* ✕ — via portal naar <body> zodat 'ie écht rechtsboven in het SCHERM staat en
          klikbaar is. De shell zet `contain: layout`; een gewone position:fixed zou
          anders t.o.v. de content-container i.p.v. de viewport staan (en buiten beeld
          scrollen). */}
      {visible &&
        mounted &&
        createPortal(
          <button
            type="button"
            onClick={onClose}
            // Zonder dit kaapt de ZoomableChartContainer de klik: deze knop is via
            // de portal weliswaar een DOM-kind van <body>, maar in de REACT-tree
            // nog steeds een afstammeling van de grafiek-container, dus de
            // pointerdown bubbelt daarheen en `setPointerCapture` leidt de click weg
            // (→ ✕ leek dood). Stop de pointerdown vóór de container 'm ziet.
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Tips sluiten"
            className="pointer-events-auto fixed right-3 z-[250] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] shadow-lg transition-colors hover:text-[var(--ink)]"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>,
          document.body,
        )}

      {/* Slanke samenvatting bovenin — eerste element van de overlay. Eén regel
          (twee op smal scherm), met dunne divider eronder. Mag de bubbels nauwelijks
          omlaag duwen, zodat de mobiele top-alignment hoog in beeld blijft. */}
      {visible && summary && <SummaryLine summary={summary} />}

      {weighted ? (
        // ── Gewogen layout (ruim scherm) ──────────────────────────────────
        // De grafiek staat gecentreerd; de 3 bubbels staan gewogen eromheen
        // (Opbouw links-onder, Financiële vrijheid midden-boven, Afbouw
        // rechts-onder) en wijzen elk met een leader-line + kader/cirkel naar
        // hun deel van de grafiek.
        <WeightedLayout
          balloons={balloons}
          geometry={geometry!}
          onEmphasize={emphasize}
          onReleaseEmphasis={releaseEmphasis}
          visibleTips={visible}
        >
          {children}
        </WeightedLayout>
      ) : (
        <>
          {/* Bovenste rij — alleen als de tips aan staan (smal-scherm-fallback). */}
          {visible && topBalloons.length > 0 && (
            <MarkerRow position="top" balloons={topBalloons} {...rowProps} />
          )}

          {/* Witte kaart achter de grafiek (alleen in tips-modus) zodat de vervaagde
              pagina niet door de grafiek heen schijnt. De grafiek blijft op z'n plek. */}
          <div
            className={
              visible
                ? 'overflow-hidden rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl'
                : ''
            }
          >
            {children}
          </div>

          {/* Onderste rij — alleen als de tips aan staan (smal-scherm-fallback). */}
          {visible && bottomBalloons.length > 0 && (
            <MarkerRow position="bottom" balloons={bottomBalloons} {...rowProps} />
          )}
        </>
      )}

      {/* Subtiele hint: hoe je dit Tips-scherm later terugvindt. `onPointerDown`
          stopPropagation net als de markers/samenvatting (consistentie; staat
          buiten een MarkerRow). */}
      {visible && (
        <p
          onPointerDown={(e) => e.stopPropagation()}
          className="relative z-10 mx-auto mt-1.5 max-w-[min(34rem,calc(100vw-2rem))] px-3 text-center text-[11px] leading-snug text-[var(--ink-3)]"
        >
          Je kan dit scherm weer vinden als je op{' '}
          <span className="font-medium text-[var(--ink-2)]">De toekomst</span> drukt
          en <span className="font-medium text-[var(--ink-2)]">Tips</span> aanzet.
        </p>
      )}
    </div>
  )
}

/**
 * Eén-regel-samenvatting: netto vermogen + de leeftijd waarop werken een keuze
 * wordt. Understated/editorial zodat 'ie de markers niet overschreeuwt; bedrag in
 * mono/tabular-nums; module-accent via `--module-active-*`. Geen eigen rekenlogica
 * — alle getallen komen kant-en-klaar uit de parent (single-source).
 */
function SummaryLine({ summary }: { summary: ToekomstOverlaySummary }) {
  const { netWorth, freedomAge, masked, isPensioen, nuStoppenReach, anchor, ankerReach, ankerStop } = summary
  // Woorden + afronding komen uit de gedeelde bron (S15) — dezelfde als de
  // welkomstkaart en de duidingsregel op de pagina zelf. Hele jaren, want
  // "rond je 65e" leest natuurlijker dan "65.0"; alleen de ópmaak is hier lokaal.
  const zin = buildVrijheidsleeftijdZin({
    freedomAge,
    isPensioen,
    anchor,
    ankerReach: ankerReach ?? nuStoppenReach,
    ankerStop,
    variant: 'inline',
  })
  const ageLabel =
    zin.ageLabel != null ? (
      <>
        {zin.lead}
        <span className="font-semibold text-[var(--module-active-800)]">{zin.ageLabel}</span>
      </>
    ) : (
      <span className="text-[var(--ink-3)]">{zin.lead}</span>
    )

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="relative z-10 mx-auto mb-3 flex max-w-[min(34rem,calc(100vw-2rem))] flex-col items-center gap-y-0.5 border-b border-[var(--border-md)] px-3 pb-2.5 text-center"
    >
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[13px] leading-snug text-[var(--ink-2)]">
        <span>
          <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
            {formatMaskedCurrency(netWorth, masked)}
          </span>{' '}
          <span className="text-[var(--ink-2)]">netto vermogen</span>
        </span>
        <span aria-hidden className="text-[var(--ink-4)]">
          ·
        </span>
        <span>{ageLabel}</span>
      </p>
    </div>
  )
}

/**
 * Gewogen layout op ruime schermen: de grafiek staat gecentreerd, met de drie
 * bubbels gewogen eromheen en leader-lines + fase-kaders + een FIRE-cirkel die
 * elk naar het juiste deel van de grafiek wijzen.
 *
 * We meten de gerenderde grootte van de grafiek-kaart (ResizeObserver) en tekenen
 * één SVG-leader-laag in échte pixels eroverheen — zo blijven de lijnen correct en
 * de FIRE-cirkel rond, ongeacht de breedte. De bubbels zelf staan als absolute
 * kinderen om de kaart; hun ankerpunt (waar de leader-line eindigt) ligt op de
 * bubbel-rand richting de grafiek. Consume-only: alle x-fracties komen uit
 * `geometry` (afgeleid uit de canonieke sim-data), niets wordt herberekend.
 */
function WeightedLayout({
  balloons,
  geometry,
  onEmphasize,
  onReleaseEmphasis,
  visibleTips,
  children,
}: {
  balloons: OverlayBalloonDef[]
  geometry: ToekomstOverlayGeometry
  onEmphasize: (def: OverlayBalloonDef) => void
  onReleaseEmphasis: () => void
  visibleTips: boolean
  children: ReactNode
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = chartRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const bySlot = (slot: BalloonSlot) => balloons.find((b) => b.slot === slot)
  const opbouw = bySlot('bottom-left')
  const vrijheid = bySlot('top-center')
  const afbouw = bySlot('bottom-right')

  const { padLeft, padRight, padTop, padBottom, fireFraction } = geometry

  // Pixel-x van een plot-fractie f (0..1) binnen de gerenderde kaartbreedte.
  const xAt = (f: number) =>
    box ? padLeft + (box.w - padLeft - padRight) * Math.min(Math.max(f, 0), 1) : 0
  // Verticale ankerlijn voor de leader-lines: net binnen het plot, onder de
  // x-as voor de onder-bubbels, boven de plot-top voor de FIRE-bubbel.
  const plotBottomY = box ? box.h - padBottom : 0
  const plotTopY = padTop

  // Fracties (defensief: zonder FIRE-punt centreren we de cirkel ongeveer in het
  // midden en laten de kaders het halve plot beslaan).
  const fFire = fireFraction ?? 0.5
  const accMidF = fFire / 2
  const decMidF = (fFire + 1) / 2

  return (
    <div className="relative">
      {/* Bovenste bubbel-zone (Financiële vrijheid, midden-boven). Alleen in de
          tips-overlay; staan de tips uit, dan blijft alleen de grafiek staan
          (geen stray-marge). */}
      {visibleTips && vrijheid && (
        <div className="relative mb-4 flex justify-center">
          <WeightedBubble
            def={vrijheid}
            onEmphasize={() => onEmphasize(vrijheid)}
            onReleaseEmphasis={onReleaseEmphasis}
          />
        </div>
      )}

      {/* Grafiek-kaart + leader-laag. */}
      <div ref={chartRef} className="relative">
        {/* Witte kaart achter de grafiek (alleen in tips-modus). */}
        <div
          className={
            visibleTips
              ? 'overflow-hidden rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl'
              : ''
          }
        >
          {children}
        </div>

        {/* Leader-laag: fase-kaders (opbouw/afbouw), FIRE-cirkel + lijnen naar de
            bubbels. pointer-events none zodat de grafiek interactief blijft waar
            nodig (de tips dimmen 'm toch). */}
        {visibleTips && box && fireFraction != null && (
          <svg
            className="pointer-events-none absolute inset-0 z-[12] h-full w-full overflow-visible"
            aria-hidden
          >
            {/* Kader over het OPBOUW-segment [0 .. fire]. */}
            <rect
              x={xAt(0)}
              y={plotTopY}
              width={Math.max(xAt(fFire) - xAt(0), 0)}
              height={Math.max(plotBottomY - plotTopY, 0)}
              rx={6}
              fill="var(--module-active-500)"
              fillOpacity={0.06}
              stroke="var(--module-active-500)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {/* Kader over het AFBOUW-segment [fire .. 1]. */}
            <rect
              x={xAt(fFire)}
              y={plotTopY}
              width={Math.max(xAt(1) - xAt(fFire), 0)}
              height={Math.max(plotBottomY - plotTopY, 0)}
              rx={6}
              fill="var(--kern-t, #58362d)"
              fillOpacity={0.05}
              stroke="var(--kern-t, #58362d)"
              strokeOpacity={0.5}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {/* Leader-line: Opbouw-bubbel (links-onder) → midden opbouw-segment. */}
            {opbouw && (
              <line
                x1={xAt(accMidF) * 0.5}
                y1={box.h + 18}
                x2={xAt(accMidF)}
                y2={plotBottomY}
                stroke="var(--module-active-500)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
            {/* Leader-line: Afbouw-bubbel (rechts-onder) → midden afbouw-segment. */}
            {afbouw && (
              <line
                x1={xAt(decMidF) + (box.w - xAt(decMidF)) * 0.5}
                y1={box.h + 18}
                x2={xAt(decMidF)}
                y2={plotBottomY}
                stroke="var(--kern-t, #58362d)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
          </svg>
        )}
      </div>

      {/* Onderste bubbel-zone: Opbouw links, Afbouw rechts. Alleen in de tips-
          overlay; staan de tips uit, dan toont de pagina enkel de grafiek. */}
      {visibleTips && (
        <div className="relative mt-4 flex items-start justify-between gap-3">
          <div className="flex justify-start">
            {opbouw && (
              <WeightedBubble
                def={opbouw}
                onEmphasize={() => onEmphasize(opbouw)}
                onReleaseEmphasis={onReleaseEmphasis}
              />
            )}
          </div>
          <div className="flex justify-end">
            {afbouw && (
              <WeightedBubble
                def={afbouw}
                onEmphasize={() => onEmphasize(afbouw)}
                onReleaseEmphasis={onReleaseEmphasis}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Eén gewogen bubbel — editorial kaart (kicker + body) die bij hover de
 * bijbehorende grafiekfase accentueert (emphasis-only, net als InlineBalloonCard).
 * Niet-interactief van zichzelf (geen knop): de uitleg is altijd leesbaar; de
 * highlight is progressieve verrijking voor muis/trackpad.
 */
function WeightedBubble({
  def,
  onEmphasize,
  onReleaseEmphasis,
}: {
  def: OverlayBalloonDef
  onEmphasize: () => void
  onReleaseEmphasis: () => void
}) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={onEmphasize}
      onMouseLeave={onReleaseEmphasis}
      className="relative z-20 w-[min(17rem,calc((100vw-8rem)/3))] shrink-0 bg-[var(--paper)]/97 p-3.5 text-left text-sm leading-snug text-[var(--ink-2)] shadow-md backdrop-blur-sm transition-shadow duration-200 hover:shadow-lg"
      style={{
        fontFamily: 'var(--font-source-serif, Georgia, serif)',
        border: '1px solid var(--ink)',
        borderLeftWidth: '4px',
        borderLeftColor: 'var(--module-active-500)',
      }}
    >
      <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] not-italic text-[var(--module-active-800)]">
        <span aria-hidden className="inline-flex text-[var(--module-active-600)]">
          {def.icon}
        </span>
        {def.kicker}
      </div>
      <p className="italic">{def.body}</p>
    </div>
  )
}

function MarkerRow({
  position,
  balloons,
  inline,
  canHover,
  openId,
  onOpen,
  onScheduleClose,
  onCloseNow,
  onEmphasize,
  onReleaseEmphasis,
}: {
  position: BalloonRow
  balloons: OverlayBalloonDef[]
  inline: boolean
  canHover: boolean
  openId: string | null
  onOpen: (def: OverlayBalloonDef) => void
  onScheduleClose: () => void
  onCloseNow: () => void
  onEmphasize: (def: OverlayBalloonDef) => void
  onReleaseEmphasis: () => void
}) {
  return (
    <div
      // Stop pointerdown van bubbelen naar de ZoomableChartContainer: die doet
      // `setPointerCapture` op élke pointerdown, waardoor anders de klik/tap op een
      // marker of CTA-knop wordt opgeslokt (mobiele tik voelt dood). Zelfde patroon
      // als de Inkomen&Uitgaven-toggle in horizon-client.
      onPointerDown={(e) => e.stopPropagation()}
      className={`relative z-10 flex flex-wrap items-stretch justify-center gap-2 px-3 ${
        position === 'top' ? 'pb-3' : 'pt-3'
      }`}
    >
      {balloons.map((b) =>
        inline ? (
          // Ruim scherm: volledige inhoud direct leesbaar als statische kaart.
          // flex-wrap (op de rij) + vaste max-breedte hier garandeert dat de
          // kaarten netjes naar meerdere regels breken — geen overlap, niets valt
          // van het scherm.
          <InlineBalloonCard
            key={b.id}
            def={b}
            onEmphasize={() => onEmphasize(b)}
            onReleaseEmphasis={onReleaseEmphasis}
          />
        ) : (
          <MarkerWithPopover
            key={b.id}
            def={b}
            position={position}
            isOpen={openId === b.id}
            dimmed={openId != null && openId !== b.id}
            canHover={canHover}
            onOpen={() => onOpen(b)}
            onScheduleClose={onScheduleClose}
            onCloseNow={onCloseNow}
          />
        ),
      )}
    </div>
  )
}

/**
 * Statische, volledig-leesbare ballon-kaart (kicker + body) — gebruikt op ruime
 * schermen (≥1024px) waar er genoeg ruimte is om alle tips tegelijk te tonen
 * zonder uitklappen. Vaste breedte + flex-wrap op de rij voorkomen overlap en
 * van-het-scherm-vallen. Geen open/close-state, geen CTA: puur informatief.
 *
 * Bij hover accentueert de kaart wél de bijbehorende grafiekfase (emphasis-only,
 * via de parent) — zo blijft de visuele koppeling kaart↔grafiek die de
 * popover-markers ook hadden, zonder de kaart uitklapbaar te maken. De kaart
 * zelf is niet-interactief (geen knop, geen tab-stop): de uitleg is altijd
 * volledig leesbaar, de highlight is een progressieve verrijking voor
 * muis-/trackpad-gebruikers (precies de apparaten waar inline-modus speelt).
 */
function InlineBalloonCard({
  def,
  onEmphasize,
  onReleaseEmphasis,
}: {
  def: OverlayBalloonDef
  onEmphasize: () => void
  onReleaseEmphasis: () => void
}) {
  return (
    <div
      onMouseEnter={onEmphasize}
      onMouseLeave={onReleaseEmphasis}
      className="w-[min(15rem,calc((100vw-6rem)/3))] shrink-0 bg-[var(--paper)]/97 p-3 text-left text-sm leading-snug text-[var(--ink-2)] shadow-md backdrop-blur-sm transition-shadow duration-200 hover:shadow-lg"
      style={{
        fontFamily: 'var(--font-source-serif, Georgia, serif)',
        border: '1px solid var(--ink)',
        borderLeftWidth: '4px',
        borderLeftColor: 'var(--module-active-500)',
      }}
    >
      <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] not-italic text-[var(--module-active-800)]">
        <span aria-hidden className="inline-flex text-[var(--module-active-600)]">
          {def.icon}
        </span>
        {def.kicker}
      </div>
      <p className="italic">{def.body}</p>
    </div>
  )
}

function MarkerWithPopover({
  def,
  position,
  isOpen,
  dimmed,
  canHover,
  onOpen,
  onScheduleClose,
  onCloseNow,
}: {
  def: OverlayBalloonDef
  position: BalloonRow
  isOpen: boolean
  dimmed: boolean
  canHover: boolean
  onOpen: () => void
  onScheduleClose: () => void
  onCloseNow: () => void
}) {
  const popoverId = useId()
  const popRef = useRef<HTMLDivElement>(null)
  // Horizontale verschuiving zodat de popover niet van het scherm valt (mobiel);
  // de pijl blijft op de marker staan, alleen het kaartje schuift mee in beeld.
  const [shiftX, setShiftX] = useState(0)
  useLayoutEffect(() => {
    if (!isOpen) {
      setShiftX(0)
      return
    }
    const el = popRef.current
    if (!el) return
    // Meet de natuurlijke (gecentreerde) positie, bepaal dan de clamp.
    el.style.transform = 'translateX(-50%)'
    const rect = el.getBoundingClientRect()
    const margin = 8
    let shift = 0
    if (rect.left < margin) shift = margin - rect.left
    else if (rect.right > window.innerWidth - margin) shift = window.innerWidth - margin - rect.right
    setShiftX(shift)
  }, [isOpen])

  // Bovenste rij opent omlaag (over de grafiek), onderste rij omhoog. De
  // `-translate-x-1/2` zit in de inline-style (samen met de clamp-shift).
  const popoverPos = position === 'top' ? 'top-full mt-2 left-1/2' : 'bottom-full mb-2 left-1/2'
  const tailPos =
    position === 'top'
      ? '-top-[5px] left-1/2 -translate-x-1/2'
      : '-bottom-[5px] left-1/2 -translate-x-1/2'
  const tailShadow = position === 'top' ? '-1px -1px 0 0 var(--ink)' : '1px 1px 0 0 var(--ink)'

  // Hover (alleen hover-apparaten) + focus (toetsenbord) op de WRAPPER zodat
  // focus van marker → CTA in de popover binnen dezelfde subtree blijft.
  //
  // ⚠️ `onFocus`/`onBlur` MOETEN — net als de mouse-handlers — op `canHover`
  // gegate zijn. Op touch (geen hover) focust de pointerdown de knop al vóór de
  // click; een ongegate `onFocus={onOpen}` opent dan de popover, waarna de
  // daaropvolgende `onClick`-toggle 'm meteen weer sluit → "eerste tik doet
  // niets, tweede tik opent". Op touch togglet alleen de klik; toetsenbord-focus
  // op hover-apparaten opent nog steeds de popover.
  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (canHover) onOpen()
      }}
      onMouseLeave={() => {
        if (canHover) onScheduleClose()
      }}
      onFocus={() => {
        if (canHover) onOpen()
      }}
      onBlur={() => {
        if (canHover) onScheduleClose()
      }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-label={`Tip: ${def.kicker}`}
        onClick={() => {
          // Op hover-apparaten doet hover/focus het werk; op touch togglet de klik.
          if (canHover) return
          if (isOpen) onCloseNow()
          else onOpen()
        }}
        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border bg-[var(--paper)]/90 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] shadow-sm backdrop-blur-sm transition sm:min-h-[34px] sm:px-2.5 ${
          dimmed ? 'opacity-40' : 'opacity-100'
        }`}
        style={{
          borderColor: isOpen ? 'var(--module-active-500)' : 'var(--module-active-300)',
          color: 'var(--module-active-800)',
          boxShadow: isOpen ? '0 0 0 1px var(--module-active-400)' : undefined,
        }}
      >
        <span aria-hidden className="inline-flex text-[var(--module-active-600)]">
          {def.icon}
        </span>
        <span className="whitespace-nowrap">{def.kicker}</span>
      </button>

      {isOpen && (
        <div
          ref={popRef}
          id={popoverId}
          role="group"
          aria-label={def.kicker}
          // Eigen pointerdown-guard op de popover (naast die op de MarkerRow): de
          // CTA hierin navigeert; zonder deze guard kan de `setPointerCapture` van
          // de ZoomableChartContainer de click naar de grafiek omleiden waardoor de
          // link-knop niet werkt. Zelf-beschermend, los van de ancestor-structuur.
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute z-20 w-[min(15rem,calc(100vw-2.5rem))] ${popoverPos}`}
          style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
        >
          <div
            className="relative bg-[var(--paper)]/97 p-3 text-sm leading-snug text-[var(--ink-2)] shadow-md backdrop-blur-sm motion-safe:animate-sheet-enter"
            style={{
              fontFamily: 'var(--font-source-serif, Georgia, serif)',
              border: '1px solid var(--ink)',
              borderLeftWidth: '4px',
              borderLeftColor: 'var(--module-active-500)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] not-italic text-[var(--module-active-800)]">
              <span aria-hidden className="inline-flex">
                {def.icon}
              </span>
              {def.kicker}
            </div>
            <p className="italic">{def.body}</p>
            {/* Optionele actie-knop — de standaard tip-ballonnen zijn puur
                informatief (geen cta/onActivate), dus deze blijft normaliter weg.
                Alleen gerenderd als de def expliciet een actie meegeeft. */}
            {def.cta && def.onActivate && (
              <button
                type="button"
                onClick={def.onActivate}
                className="mt-2.5 inline-flex min-h-[36px] items-center gap-1 rounded-[var(--r-sm)] border border-[var(--module-active-300)] bg-[var(--module-active-50)] px-2.5 py-1 font-sans text-[12px] font-medium not-italic text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)]"
              >
                {def.cta}
              </button>
            )}

            {/* Sluit-knopje — vooral handig op touch (geen hover-uit). */}
            {!canHover && (
              <button
                type="button"
                onClick={onCloseNow}
                aria-label="Tip sluiten"
                className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}

            {/* Pijltje naar de marker. */}
            <span
              aria-hidden
              className={`absolute h-2.5 w-2.5 rotate-45 bg-[var(--paper)] ${tailPos}`}
              style={{ boxShadow: tailShadow }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Iconen voor de drie fase-ballonnen ─────────────────────────────────────
// Geëxporteerd zodat horizon-client dezelfde iconen hergebruikt bij het
// samenstellen van de ballon-definities (één bron, geen drift). Sinds de
// gewogen 3-bubbel-layout (opbouw / vrijheid / afbouw) zijn alleen deze drie
// nog nodig.
export const OVERLAY_ICONS = {
  /** Opbouwfase — stijgende vermogenslijn. */
  accumulation: <TrendingUp className="h-3.5 w-3.5" />,
  /** Financiële vrijheid — de FIRE-mijlpaal. */
  freedom: <Flag className="h-3.5 w-3.5" />,
  /** Afbouwfase — dalende lijn nadat werken een keuze wordt. */
  withdrawal: <TrendingDown className="h-3.5 w-3.5" />,
} as const
