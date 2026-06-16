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
 * Elke marker opent op hover (desktop) of tik (mobiel) de volledige ballon als
 * popover (kicker + uitleg + CTA naar een bestaande in-page editor). Geen eigen
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
  Wallet,
  TrendingDown,
  TrendingUp,
  Landmark,
  Umbrella,
  Flag,
  ArrowDownWideNarrow,
  Home,
  CalendarPlus,
  PiggyBank,
  CreditCard,
  X,
} from 'lucide-react'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { formatMaskedCurrency } from '@/lib/format'

/** Welke grafiekfase een ballon accentueert bij openen. */
type OverlayEmphasis = 'accumulation' | 'withdrawal' | 'fire' | null

/** In welke rij (boven of onder de grafiek) de marker staat. */
type BalloonRow = 'top' | 'bottom'

export interface OverlayBalloonDef {
  id: string
  icon: ReactNode
  /** Korte editorial kop (mono) — dient óók als zichtbaar marker-label. */
  kicker: string
  /** Eén zin uitleg — leek-taal, vrijheidstijd-framing waar passend. */
  body: string
  /** CTA-label op de knop. */
  cta: string
  /** Rij: 'top' (boven de grafiek) of 'bottom' (onder de grafiek). */
  row: BalloonRow
  /** Grafiekfase die deze ballon accentueert bij openen. */
  emphasis: OverlayEmphasis
  /** Opent de bijbehorende in-page editor. */
  onActivate: () => void
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
}

export interface ToekomstOverlayProps {
  /** Of de tips-modus aan staat (toggle in de header). */
  visible: boolean
  /** Ballon-definities (door horizon-client samengesteld + gewired). */
  balloons: OverlayBalloonDef[]
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
}

export function ToekomstOverlay({
  visible,
  balloons,
  summary,
  onEmphasisChange,
  children,
  onClose,
}: ToekomstOverlayProps) {
  // Apparaten met echte hover (desktop) openen de popover bij hover; touch
  // gebruikt tik-om-te-openen + tik-naast/✕ om te sluiten.
  const canHover = useMediaQuery('(hover: hover)')
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

  // Reset wanneer de tips uitgaan of de component unmount.
  useEffect(() => {
    if (!visible) close()
    return clearCloseTimer
  }, [visible, close, clearCloseTimer])

  // Escape: eerst een open popover sluiten, anders de hele tips-overlay.
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (openId) close()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, openId, close, onClose])

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
    if (el && typeof el.scrollIntoView === 'function') {
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
  }, [visible])

  const topBalloons = balloons.filter((b) => b.row === 'top')
  const bottomBalloons = balloons.filter((b) => b.row === 'bottom')

  const rowProps = {
    canHover,
    openId,
    onOpen: open,
    onScheduleClose: scheduleClose,
    onCloseNow: close,
  }

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

      {/* Bovenste rij — alleen als de tips aan staan. */}
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

      {/* Onderste rij — alleen als de tips aan staan. */}
      {visible && bottomBalloons.length > 0 && (
        <MarkerRow position="bottom" balloons={bottomBalloons} {...rowProps} />
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
  const { netWorth, freedomAge, masked, isPensioen } = summary
  // Hele jaren — "rond je 65e" leest natuurlijker dan "65.0".
  const ageLabel =
    freedomAge != null ? (
      isPensioen ? (
        <>
          je pensioen valt rond je{' '}
          <span className="font-semibold text-[var(--module-active-800)]">{Math.round(freedomAge)}e</span>
        </>
      ) : (
        <>
          werken wordt een keuze rond je{' '}
          <span className="font-semibold text-[var(--module-active-800)]">{Math.round(freedomAge)}e</span>
        </>
      )
    ) : (
      <span className="text-[var(--ink-3)]">vrijheid nog niet in zicht</span>
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

function MarkerRow({
  position,
  balloons,
  canHover,
  openId,
  onOpen,
  onScheduleClose,
  onCloseNow,
}: {
  position: BalloonRow
  balloons: OverlayBalloonDef[]
  canHover: boolean
  openId: string | null
  onOpen: (def: OverlayBalloonDef) => void
  onScheduleClose: () => void
  onCloseNow: () => void
}) {
  return (
    <div
      // Stop pointerdown van bubbelen naar de ZoomableChartContainer: die doet
      // `setPointerCapture` op élke pointerdown, waardoor anders de klik/tap op een
      // marker of CTA-knop wordt opgeslokt (CTA navigeert niet, mobiele tik voelt
      // dood). Zelfde patroon als de Inkomen&Uitgaven-toggle in horizon-client.
      onPointerDown={(e) => e.stopPropagation()}
      className={`relative z-10 flex flex-wrap items-center justify-center gap-2 px-3 ${
        position === 'top' ? 'pb-3' : 'pt-3'
      }`}
    >
      {balloons.map((b) => (
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
      ))}
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
            <button
              type="button"
              onClick={def.onActivate}
              className="mt-2.5 inline-flex min-h-[36px] items-center gap-1 rounded-[var(--r-sm)] border border-[var(--module-active-300)] bg-[var(--module-active-50)] px-2.5 py-1 font-sans text-[12px] font-medium not-italic text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)]"
            >
              {def.cta}
            </button>

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

// ── Iconen voor de standaard-ballonset ─────────────────────────────────────
// Geëxporteerd zodat horizon-client dezelfde iconen hergebruikt bij het
// samenstellen van de ballon-definities (één bron, geen drift).
export const OVERLAY_ICONS = {
  income: <Wallet className="h-3.5 w-3.5" />,
  incomeStrategy: <TrendingUp className="h-3.5 w-3.5" />,
  aow: <Umbrella className="h-3.5 w-3.5" />,
  assets: <PiggyBank className="h-3.5 w-3.5" />,
  debts: <CreditCard className="h-3.5 w-3.5" />,
  expenses: <TrendingDown className="h-3.5 w-3.5" />,
  pension: <Landmark className="h-3.5 w-3.5" />,
  end: <Flag className="h-3.5 w-3.5" />,
  withdrawal: <ArrowDownWideNarrow className="h-3.5 w-3.5" />,
  housing: <Home className="h-3.5 w-3.5" />,
  event: <CalendarPlus className="h-3.5 w-3.5" />,
} as const
