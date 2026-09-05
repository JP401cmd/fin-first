'use client'

import { useEffect, useState } from 'react'

/**
 * useSpotlightRect — volgt de positie van het element dat de rondleiding
 * uitlicht (ADR 0130, fase 3b).
 *
 * ══ Waarom dit een eigen hook is ══════════════════════════════════════════
 *
 * De spotlight is een GAT in een scrim: vier panelen rondom een rechthoek. Die
 * rechthoek is geen momentopname — hij verschuift zodra er iets instroomt (de
 * hero streamt in blokken), zodra de gebruiker scrollt, en zodra de mobiele
 * adresbalk in- of uitklapt. Een `getBoundingClientRect()` bij het openen van
 * de stap zou het gat laten hangen waar het element ooit stond.
 *
 * ══ Vier eigenaardigheden die hier zijn opgelost ══════════════════════════
 *
 *  1. **Zichtbaar ⇔ `getClientRects().length > 0`.** Niet `offsetParent`, niet
 *     een breedte-check: een element in een `hidden lg:block`-tak bestaat wél
 *     in de DOM en heeft wél een node, maar geen enkele client-rect. Dat is de
 *     enige toets die "staat dit echt op het scherm" beantwoordt zonder een
 *     dure `getComputedStyle`-wandeling.
 *  2. **Het element kan er nog niet zijn.** /overzicht streamt: de grafiekcel
 *     en de utility-cluster komen ná de eerste paint binnen. We wachten dus met
 *     een `MutationObserver` tot `SPOTLIGHT_ZOEK_DEADLINE_MS`; daarna meldt de
 *     hook één keer `onMissing()` en slaat de provider de stap over — beter dan
 *     een gat om niets.
 *  3. **De scroll-container is niet `window`.** Op mobiel scrollt
 *     `[data-scroll-container]`, niet het document. Eén `scroll`-listener op
 *     `window` met `capture: true` vangt beide: capture-fase-scroll-events van
 *     een willekeurige container passeren `window` op weg naar beneden.
 *  4. **`visualViewport`** verschuift bij het in-/uitschuiven van de mobiele
 *     adresbalk zonder dat er een `resize` op `window` valt.
 */

/**
 * Hoe lang de hook op een nog niet bestaand element wacht vóór hij de stap
 * opgeeft. 2,5 s dekt de streaming-instroom van /overzicht ruim; langer zou de
 * rondleiding laten hangen op een element dat er in deze weergave gewoon niet
 * is (bv. de zwevende Fin-companion terwijl de chat gedokt open staat).
 */
export const SPOTLIGHT_ZOEK_DEADLINE_MS = 2500

/**
 * De uitgelichte rechthoek, in viewport-coördinaten. Bewust een plat object en
 * geen `DOMRect`: hij gaat als React-state rond en wordt op waarde vergeleken.
 */
export interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

function leesRect(el: Element): SpotlightRect | null {
  // Zichtbaarheidstoets én meting in één: geen client-rects = niet op het scherm.
  if (el.getClientRects().length === 0) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function gelijk(a: SpotlightRect | null, b: SpotlightRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useSpotlightRect(
  selector: string | null,
  {
    enabled = true,
    onMissing,
  }: {
    /** Uit zodra de rondleiding niet loopt — dan hangen er ook geen listeners. */
    enabled?: boolean
    /**
     * Het element bestaat na de deadline nog steeds niet. Wordt hoogstens één
     * keer per stap aangeroepen; de provider slaat de stap dan over.
     */
    onMissing?: () => void
  } = {},
): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useEffect(() => {
    if (!enabled || !selector || typeof document === 'undefined') {
      setRect(null)
      return
    }

    let afgebroken = false
    let element: Element | null = null
    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    let gemeld = false

    const meet = () => {
      if (afgebroken || !element) return
      const volgende = leesRect(element)
      setRect((vorige) => (gelijk(vorige, volgende) ? vorige : volgende))
    }

    const koppel = (el: Element) => {
      element = el
      // In beeld brengen vóór de eerste meting; anders licht het gat een
      // element uit dat buiten de viewport valt. jsdom kent `scrollIntoView`
      // niet — vandaar de guard, zodat elke test die deze overlay mount niet op
      // een ontbrekende browser-API omvalt.
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        })
      }
      meet()

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(meet)
        resizeObserver.observe(el)
        // Het document erbij: een layout-shift bóven het element verplaatst
        // het zonder dat het element zelf van maat verandert.
        resizeObserver.observe(document.documentElement)
      }
      // capture: true vangt óók de scroll van `[data-scroll-container]`.
      window.addEventListener('scroll', meet, { capture: true, passive: true })
      window.addEventListener('resize', meet)
      window.visualViewport?.addEventListener('resize', meet)
      window.visualViewport?.addEventListener('scroll', meet)
    }

    const zoek = (): boolean => {
      const el = document.querySelector(selector)
      if (!el || leesRect(el) == null) return false
      koppel(el)
      return true
    }

    if (!zoek()) {
      // Nog niet gestreamd (of niet aanwezig in deze weergave): wachten tot de
      // deadline, dan de stap opgeven.
      mutationObserver = new MutationObserver(() => {
        if (afgebroken || element) return
        if (zoek()) {
          mutationObserver?.disconnect()
          mutationObserver = null
          if (deadline) clearTimeout(deadline)
          deadline = null
        }
      })
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-tour', 'hidden'],
      })
      deadline = setTimeout(() => {
        if (afgebroken || element || gemeld) return
        gemeld = true
        onMissing?.()
      }, SPOTLIGHT_ZOEK_DEADLINE_MS)
    }

    return () => {
      afgebroken = true
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      if (deadline) clearTimeout(deadline)
      window.removeEventListener('scroll', meet, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', meet)
      window.visualViewport?.removeEventListener('resize', meet)
      window.visualViewport?.removeEventListener('scroll', meet)
    }
  }, [selector, enabled, onMissing])

  return rect
}
