'use client'

/**
 * LabRad — het draairad dat in de compacte vorm van het doelscenario het ONDERWERP kiest
 * (ADR 0170 B11). Ernaast staat één balk voor dat onderwerp; samen zijn ze één element van
 * ~90 px hoog, tegen ~500 (balken) en ~600 (wijzers) op een telefoon. Verticale ruimte was
 * de reden voor deze vorm.
 *
 * VORM. Een verticale kiezer zoals op iOS: het gekozen onderwerp in inkt in het midden, de
 * buren gedempt erboven en eronder, en het woord rólt naar het volgende. Naast elke naam
 * staat een stoplichtpunt met de zone van dát onderwerp. Dat punt is niet decoratief: de
 * kern van het lab (B2) is dat de grens op álle knoppen meebeweegt als je aan één draait, en
 * met één balk in beeld zou dat inzicht verdwijnen. Vijf namen met vijf punten laten de hele
 * stand zien — en een punt dat van kleur verspringt terwijl je aan een andere knop draait,
 * laat de koppeling nog steeds zien.
 *
 * BEDIENING = VEGEN (eigenaarskeuze 20 sep 2026). Het rad is een echte scroll-container met
 * `scroll-snap`, zodat het native aanvoelt en de browser het snappen doet. Er staat bewust
 * GEEN tik-op-een-rij: de eigenaar koos voor het zuivere rad. `overscroll-behavior: contain`
 * houdt een veeg voorbij het einde binnen het rad in plaats van de pagina mee te trekken.
 * Toetsenbord (pijl omhoog/omlaag) blijft — dat is toegankelijkheid, geen tweede bediening.
 *
 * Presentational: de zones komen berekend binnen (`zoneVanWaarde` in de host), hier wordt
 * niets herrekend.
 */

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { LAB_COPY, labZoneWoord } from '@/lib/horizon/anker-copy'
import type { HefboomKey, LabZone } from '@/lib/horizon/lab-grenzen-types'

/** Hoogte van één rij, in px. Drie rijen zichtbaar: de gekozen plus één buur aan elke kant. */
export const RAD_RIJ_PX = 28
const ZICHTBAAR = 3

export interface LabRadItem {
  key: HefboomKey
  label: string
  /** Zone van de huidige stand van dít onderwerp; `null` = nog geen oordeel. */
  zone: LabZone | null
}

export interface LabRadProps {
  items: LabRadItem[]
  actief: HefboomKey
  onChange: (key: HefboomKey) => void
  pending?: boolean
}

/** Zelfde ladder als de segmenten op de knoppen (zie `lab-slider.tsx`). */
const PUNT: Record<LabZone, string> = {
  rood: 'bg-score-bad',
  oranje: 'bg-score-warn',
  groen: 'bg-score-good',
}

/** Rij-index → het onderwerp dat in het midden staat, geklemd op de lijst. */
export function indexVanScroll(scrollTop: number, aantal: number): number {
  if (aantal <= 0) return 0
  return Math.max(0, Math.min(aantal - 1, Math.round(scrollTop / RAD_RIJ_PX)))
}

export function LabRad({ items, actief, onChange, pending = false }: LabRadProps) {
  const lijstRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actiefIndex = Math.max(0, items.findIndex((it) => it.key === actief))

  // Het rad volgt de stand van buiten (eerste render, of een onderwerp dat verdwijnt) —
  // maar alleen als het niet al op die rij staat, anders vecht het met de veeg van de
  // gebruiker.
  useEffect(() => {
    const el = lijstRef.current
    if (!el) return
    if (indexVanScroll(el.scrollTop, items.length) === actiefIndex) return
    // `scrollTop` i.p.v. `scrollTo`: geen animatie nodig (de gebruiker veegt zelf), en het
    // werkt ook waar `scrollTo` op elementen ontbreekt.
    el.scrollTop = actiefIndex * RAD_RIJ_PX
  }, [actiefIndex, items.length])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Na het snappen (scrollend waar de browser 'm kent, anders een korte rust) landt de rij
  // in het midden als het gekozen onderwerp.
  const land = () => {
    const el = lijstRef.current
    if (!el) return
    const idx = indexVanScroll(el.scrollTop, items.length)
    const item = items[idx]
    if (item && item.key !== actief) onChange(item.key)
  }
  const onScroll = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(land, 90)
  }
  const onScrollEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    land()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const volgende = e.key === 'ArrowDown' ? actiefIndex + 1 : actiefIndex - 1
    const item = items[Math.max(0, Math.min(items.length - 1, volgende))]
    if (item && item.key !== actief) onChange(item.key)
  }

  return (
    // De focusring staat op deze BUITENSTE wrapper: het rad zelf draagt een `mask-image`, en
    // een mask knipt op de border-box — een outline met offset erbuiten verdween daardoor.
    // Het toetsenbord is de enige bediening naast vegen; zonder zichtbare focus is dat pad dood.
    <div className="rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ink)]">
    <div
      ref={lijstRef}
      role="listbox"
      tabIndex={0}
      aria-label={LAB_COPY.radLabel}
      aria-activedescendant={`lab-rad-${actief}`}
      data-testid="lab-rad"
      onScroll={onScroll}
      onScrollEnd={onScrollEnd}
      onKeyDown={onKeyDown}
      className="relative snap-y snap-mandatory overflow-y-auto overscroll-y-contain rounded-md outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        height: RAD_RIJ_PX * ZICHTBAAR,
        touchAction: 'pan-y',
        // De buren vervagen naar boven en beneden: dat maakt van drie regels een rad.
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
      }}
    >
      {/* Eén lege rij boven en onder, zodat ook het eerste en laatste onderwerp in het
          midden kunnen landen. */}
      <div style={{ height: RAD_RIJ_PX }} aria-hidden />
      {items.map((it) => {
        const isActief = it.key === actief
        return (
          <div
            key={it.key}
            id={`lab-rad-${it.key}`}
            role="option"
            aria-selected={isActief}
            data-testid={`lab-rad-${it.key}`}
            // Iets strakkere letterspatiëring dan de knoplabels elders (0,08em): het rad is
            // smal, en "Uitgave na pensioen" moet er op 42% van een telefoonbreedte in passen.
            className={`flex snap-center items-center gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.03em] transition-colors ${
              isActief ? 'text-[var(--ink)]' : 'text-[var(--ink-4)]'
            }`}
            style={{ height: RAD_RIJ_PX }}
          >
            <span
              aria-hidden
              data-testid={`lab-rad-${it.key}-punt`}
              data-zone={it.zone ?? 'onbekend'}
              className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${
                it.zone ? PUNT[it.zone] : 'bg-[var(--border-md)]'
              } ${pending ? 'opacity-45' : 'opacity-100'}`}
            />
            {/* Twee regels mogen: "Uitgave na pensioen" past niet op één regel in een radkolom
                van ~115 px, en afkappen maakt er "…PEN…" van. Twee regels van 11 px passen in 28. */}
            <span className="line-clamp-2 leading-[1.1]">{it.label}</span>
            {/* De zone óók in woorden voor wie het punt niet ziet. */}
            {it.zone && <span className="sr-only">, {labZoneWoord(it.zone)}</span>}
          </div>
        )
      })}
      <div style={{ height: RAD_RIJ_PX }} aria-hidden />
    </div>
    </div>
  )
}
