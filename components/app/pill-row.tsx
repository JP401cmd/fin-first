'use client'

/**
 * PillRow — een rij bedieningspillen die NOOIT op twee regels valt.
 *
 * Regel (gebruiker, aug 2026): "als de pillen zoveel ruimte innemen haal dan
 * tekst weg, nooit 2 lagen met pillen. tot het minimum alleen iconen over zijn."
 * Twee rijen pillen boven een grafiek eten verticale ruimte die de grafiek zelf
 * nodig heeft, en een tweede rij leest als een aparte groep terwijl het dezelfde
 * bediening is.
 *
 * ## Werking
 * De rij meet zichzelf. Passen alle pillen mét label op één regel, dan blijven
 * de labels staan. Past het niet, dan valt **élk** label weg en houdt de rij
 * alleen iconen over — het minimum uit de regel hierboven. Bewust niet
 * gedeeltelijk: labels één voor één laten vallen maakt welke pil tekst houdt
 * afhankelijk van de volgorde, en dat springt bij elke toggle.
 *
 * `flex-nowrap` is de harde belofte: wrappen kan structureel niet, ook niet als
 * de meting ooit faalt of nooit draait (SSR). De meting bepaalt alleen of de
 * labels mee mogen.
 *
 * ## Waarom de meting eruitziet zoals hij eruitziet
 *
 * **Meten op elke commit, niet op een dependency.** Een eerdere versie triggerde
 * op `Children.count`. Dat is stil kapot op precies het soort callsite waarvoor
 * dit component bestaat: `{voorwaarde && <>…vier knoppen…</>}` telt als ÉÉN
 * child, of de voorwaarde nu waar is of niet. Op de Toekomst-balk stond die
 * telling permanent op 7 en her-mat de rij dus nooit — niet bij een modus-wissel
 * die vijf pillen laat verdwijnen, en niet als een pil een telbadge of percentage
 * krijgt (dat verandert de breedte wél, de kinder-telling niet). Het layout-effect
 * hieronder draait daarom zonder dependency-array: elke commit meet opnieuw.
 *
 * **Meten op de natuurlijke breedte.** De meting zet de rij eerst even in de
 * labels-aan-stand, leest de breedte, en zet 'm dan terug. Zonder die stap zou
 * een al-compacte rij zichzelf meten en concluderen "past prima", waarna de
 * labels terugklappen en de volgende meting ze weer weghaalt — flikkering.
 * Dat gebeurt binnen één synchrone layout-pass, dus zonder extra render.
 *
 * **Geen `overflow-x-auto`.** Voor de hand liggend als vangnet, maar fout hier:
 * `overflow-x: auto` met `overflow-y: visible` laat de y-as meecomputeren naar
 * `auto` (CSS Overflow L3), waardoor de ~30px hoge rij in béíde richtingen een
 * clipbox wordt. Twee kinderen openen een popover ín die rij — de
 * scenario-overlay-picker en de ChartTips-"i" — en die zouden tot een sliver
 * geknipt worden; `z-index` ontsnapt niet aan een clipbox. In de uiterste staart
 * is zichtbaar overlopen beter dan de popovers slopen.
 *
 * ## Gebruik
 * Geef het label binnen een pil het attribuut `data-pill-label`; de rij verbergt
 * die in compacte stand (regel in `app/globals.css`). Het mobiel-gedrag blijft
 * van de pil zelf (`hidden sm:inline`) — daar zijn labels sowieso al weg.
 * Elke pil houdt een `title` + `aria-label` zodat de betekenis niet aan de tekst
 * hangt; zonder label ís het icoon de hele knop.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/** SSR-veilig: `useLayoutEffect` bestaat niet op de server. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Loopt de inhoud buiten de rij? Vergelijkt de rechterrand van het meest
 * rechtse kind met die van de rij zelf.
 *
 * Bewust niet `scrollWidth > clientWidth`: dat is alleen betrouwbaar op een
 * scroll-container, en die mag deze rij juist niet zijn (zie de popover-noot
 * hierboven). Deze meting werkt ongeacht de overflow-stand.
 *
 * `margin-left: auto` op de rechter groep valt bij overloop vanzelf terug naar
 * 0, dus die groep schuift dan écht voorbij de rechterrand. Past alles, dan
 * ligt hij er exact tegenaan — vandaar de pixel marge tegen sub-pixel-
 * afronding op fractionele zoomniveaus.
 */
function overflowsRow(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect()
  let rightMost = box.left
  for (const child of Array.from(el.children)) {
    const r = child.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.right > rightMost) rightMost = r.right
  }
  return rightMost > box.right + 1
}

export function PillRow({
  children,
  className = '',
  ariaLabel,
}: {
  children: ReactNode
  /** Extra classes — bv. marges. Layout-classes van de rij zelf niet overschrijven. */
  className?: string
  /** Toolbar-label voor screenreaders (bv. "Grafiek-opties"). */
  ariaLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Even naar de labels-aan-stand om de natuurlijke breedte te lezen, dan
    // terug. `getBoundingClientRect` forceert een layout-herberekening, dus de
    // CSS-regel op `data-compact` is op dat moment al verwerkt.
    const before = el.dataset.compact
    el.dataset.compact = 'false'
    const overflows = overflowsRow(el)
    if (before !== undefined) el.dataset.compact = before
    // Zelfde waarde ⇒ React bailt uit, dus dit kan niet gaan rondzingen.
    setCompact(overflows)
  }, [])

  // Elke commit opnieuw meten: de inhoud kan gewijzigd zijn zonder dat de
  // kinder-telling of de rijbreedte veranderde (zie de doc hierboven).
  useIsomorphicLayoutEffect(measure)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      data-pill-row=""
      data-compact={compact ? 'true' : 'false'}
      className={`flex min-w-0 flex-nowrap items-center gap-1.5 ${className}`}
    >
      {children}
    </div>
  )
}
