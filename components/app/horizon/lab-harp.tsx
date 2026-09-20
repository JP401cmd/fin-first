'use client'

/**
 * LabHarp — de mobiele vorm van het doelscenario waarin vijf stroken één figuur worden
 * (ADR 0170 B12).
 *
 * Vijf compacte stroken van 44 px onder elkaar, elk met de bestaande driekleurige band, het
 * "nu"-streepje en het gedekt-merk. Dwars door alle vijf lopen twee lijnen: een DOORGETROKKEN
 * lijn door de vijf duimen — jouw plan als één vorm — en een GESTREEPTE lijn door de vijf
 * gedekt-merken — de grens als één vorm. Dat is het hele idee: draai je aan één strook, dan
 * zie je de gestreepte lijn op de andere vier knikken. De koppeling uit B2 (elke knop verschuift
 * de grens van álle knoppen) staat daarmee letterlijk in beeld, wat de balken en de wijzers
 * alleen via kleur laten zien en het rad alleen via vijf punten.
 *
 * WAAROM GEEN EIGEN POINTER-HANDLER. Elke strook is een echte `<input type="range">` op de
 * band, precies zoals `LabSlider`: de browser doet de gesture-arbitrage (veeg = schuiven,
 * verticaal = scrollen), dus geen scrollconflict en niets te heruitvinden. De twee lijnen zijn
 * een `aria-hidden` SVG-laag met `pointer-events: none` — dezelfde lagenregel als de greep van
 * de wijzer. De tekening voegt niets toe aan de toegankelijkheidsboom; de vijf inputs dragen
 * die, met per strook een sr-only grensregel.
 *
 * NORMALISATIE. De vijf eenheden (€/mnd, €/jr, €, jaren) staan op één figuur omdat elke strook
 * 0–100 % van zijn EIGEN bereik loopt; de echte getallen staan rechts. Zonder dat zou de
 * nalatenschap (tienduizenden euro's) alles domineren — de klassieke valkuil van parallelle
 * coördinaten.
 */

import { useState, type ReactNode } from 'react'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'
import { LAB_COPY, labGrensRegel, labZoneWoord } from '@/lib/horizon/anker-copy'
import {
  zoneVanWaarde,
  type HefboomBereik,
  type HefboomGrenzen,
  type HefboomKey,
  type HefboomRichting,
  type LabZone,
} from '@/lib/horizon/lab-grenzen-types'
import { labSegmenten } from './lab-slider'

/** Hoogte van één strook in px — het minimale raakvlak, en de maat van de figuur. */
export const HARP_STROOK_PX = 44
/** Breedte (in %) van de label- en de waardekolom; de band en de lijnen delen wat overblijft. */
const LABEL_PCT = 27
const WAARDE_PCT = 30

const SEGMENT: Record<LabZone, string> = {
  rood: 'bg-score-bad',
  oranje: 'bg-score-warn',
  groen: 'bg-score-good',
}

export interface LabHarpItem {
  key: HefboomKey
  label: string
  value: number
  baseValue: number
  bereik: HefboomBereik
  richting: HefboomRichting
  grenzen: HefboomGrenzen | null
  formatValue: (v: number) => string
  formatGrens: (v: number) => string
  detail?: string | null
  onChange: (v: number) => void
}

export interface LabHarpProps {
  items: LabHarpItem[]
  pending?: boolean
  /** Onder de figuur, na de grensregel van de laatst aangeraakte strook. */
  children?: ReactNode
}

function posOf(v: number, bereik: HefboomBereik): number {
  const span = bereik.max - bereik.min
  if (!(span > 0)) return 0
  return Math.max(0, Math.min(100, ((v - bereik.min) / span) * 100))
}

function binnen(v: number | null, bereik: HefboomBereik): boolean {
  return v != null && v >= bereik.min && v <= bereik.max
}

/** Middelpunt (y) van strook `i`, in px vanaf de bovenkant van de figuur. */
function strookY(i: number): number {
  return i * HARP_STROOK_PX + HARP_STROOK_PX / 2
}

/**
 * De punten van de plan-lijn: één per strook, altijd aanwezig.
 * Geëxporteerd voor de test — de figuur is precies deze reeks.
 */
export function planPunten(items: Pick<LabHarpItem, 'value' | 'bereik'>[]): { x: number; y: number }[] {
  return items.map((it, i) => ({ x: posOf(it.value, it.bereik), y: strookY(i) }))
}

/**
 * De gedekt-lijn als losse stukken: alleen tussen opeenvolgende stroken die beide een merk
 * hebben. Ligt de grens buiten bereik, dan breekt de lijn daar — een grens die je niet kunt
 * aanwijzen, teken je niet (zelfde regel als het merkteken op de balk).
 */
export function gedektStukken(
  items: Pick<LabHarpItem, 'grenzen' | 'bereik'>[],
): { x: number; y: number }[][] {
  const stukken: { x: number; y: number }[][] = []
  let huidig: { x: number; y: number }[] = []
  items.forEach((it, i) => {
    const g = it.grenzen?.gedekt ?? null
    if (binnen(g, it.bereik)) {
      huidig.push({ x: posOf(g!, it.bereik), y: strookY(i) })
    } else {
      if (huidig.length > 1) stukken.push(huidig)
      huidig = []
    }
  })
  if (huidig.length > 1) stukken.push(huidig)
  return stukken
}

function redenVoor(grenzen: HefboomGrenzen | null, richting: HefboomRichting) {
  return grenzen == null
    ? ('onbekend' as const)
    : grenzen.heel === 'gedekt'
      ? ('heel-gedekt' as const)
      : grenzen.heel === 'ongedekt'
        ? ('heel-ongedekt' as const)
        : grenzen.gedekt == null
          ? ('onbekend' as const)
          : richting === 'stijgend'
            ? ('boven-bereik' as const)
            : ('onder-bereik' as const)
}

export function LabHarp({ items, pending = false, children }: LabHarpProps) {
  // Welke strook het laatst is aangeraakt: die krijgt de zichtbare grensregel + detailregel
  // onder de figuur. Elke strook heeft daarnaast een sr-only regel voor `aria-describedby`.
  const [laatst, setLaatst] = useState<HefboomKey | null>(null)
  const laatsteItem = items.find((it) => it.key === laatst) ?? items[0] ?? null

  const hoogte = items.length * HARP_STROOK_PX
  const plan = planPunten(items)
  const gedekt = gedektStukken(items)
  const naarPunten = (p: { x: number; y: number }[]) => p.map((q) => `${q.x},${q.y}`).join(' ')

  const grensRegelVoor = (it: LabHarpItem) =>
    labGrensRegel({
      gedekt: binnen(it.grenzen?.gedekt ?? null, it.bereik) ? it.formatGrens(it.grenzen!.gedekt!) : null,
      ruim: binnen(it.grenzen?.ruim ?? null, it.bereik) ? it.formatGrens(it.grenzen!.ruim!) : null,
      reden: redenVoor(it.grenzen, it.richting),
    })

  return (
    <div data-testid="lab-harp">
      <div className="relative" style={{ height: hoogte }}>
        {items.map((it, i) => {
          const zone = zoneVanWaarde(it.value, it.grenzen, it.richting)
          const segmenten = labSegmenten(it.grenzen, it.bereik, it.richting)
          const nuPct = posOf(it.baseValue, it.bereik)
          const gedektPct = binnen(it.grenzen?.gedekt ?? null, it.bereik) ? posOf(it.grenzen!.gedekt!, it.bereik) : null
          const grensId = `${it.key}-grens`
          return (
            <div
              key={it.key}
              data-testid={`lab-knop-${it.key}`}
              className="absolute inset-x-0 flex items-center"
              style={{ top: i * HARP_STROOK_PX, height: HARP_STROOK_PX }}
            >
              {/* Twee regels mogen: "Uitgave na pensioen" past niet op één regel in 27 % van een
                  telefoonbreedte, en afkappen maakt van vijf namen drie raadsels. */}
              <span
                className={`line-clamp-2 shrink-0 pr-2 font-sans text-[10px] font-semibold uppercase leading-[1.15] tracking-[0.03em] ${
                  laatst === it.key ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
                }`}
                style={{ width: `${LABEL_PCT}%` }}
              >
                {it.label}
              </span>

              <div className="relative h-full min-w-0 flex-1">
                <div
                  aria-hidden
                  data-testid={`lab-knop-${it.key}-as`}
                  className={`absolute left-0 right-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--border-ed)] transition-opacity ${
                    pending ? 'opacity-45' : 'opacity-100'
                  }`}
                >
                  {segmenten?.map((seg, j) => (
                    <span
                      key={`${seg.zone}-${j}`}
                      data-testid={`lab-knop-${it.key}-segment-${seg.zone}`}
                      className={`h-full ${SEGMENT[seg.zone]} motion-safe:transition-[width] motion-safe:duration-300`}
                      style={{ width: `${seg.breedte}%` }}
                    />
                  ))}
                </div>
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 z-20 h-[18px] w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--ink-3)]"
                  style={{ left: `${nuPct}%` }}
                />
                {gedektPct != null && (
                  <span
                    aria-hidden
                    data-testid={`lab-knop-${it.key}-grensmerk`}
                    className="pointer-events-none absolute top-1/2 z-20 h-[22px] w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--ink)] motion-safe:transition-[left] motion-safe:duration-300"
                    style={{ left: `${gedektPct}%` }}
                  />
                )}
                <input
                  type="range"
                  id={it.key}
                  min={it.bereik.min}
                  max={it.bereik.max}
                  step={it.bereik.stap}
                  value={it.value}
                  onChange={(e) => it.onChange(Number(e.target.value))}
                  onPointerDown={() => setLaatst(it.key)}
                  onFocus={() => setLaatst(it.key)}
                  aria-label={it.label}
                  aria-valuetext={`${it.formatValue(it.value)}, ${labZoneWoord(zone)}`}
                  aria-describedby={grensId}
                  aria-busy={pending || undefined}
                  // 9 px uitsteken aan beide kanten: de native duim loopt van t/2 tot W−t/2, de lijn en
                  // de merken staan op f·W. Zo valt het duimmidden exact op de lijn (t ≈ 18 px).
                  className="slider-module slider-op-band absolute inset-y-0 -left-[9px] -right-[9px] z-30 h-full"
                  {...rangeTouchSeekProps}
                />
                <span id={grensId} className="sr-only">{grensRegelVoor(it)}</span>
              </div>

              <span
                className="shrink-0 whitespace-nowrap pl-2 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]"
                style={{ width: `${WAARDE_PCT}%` }}
              >
                {it.formatValue(it.value)}
              </span>
            </div>
          )
        })}

        {/* De twee lijnen door alle stroken — één laag over de bandkolom, geen aanrakingen. */}
        {/* Breedte en hoogte EXPLICIET: een absoluut gepositioneerde SVG is een replaced
            element en neemt bij `auto` zijn intrinsieke maat, niet de afstand tussen
            top/bottom — dan rekt de figuur uit en lopen de lijnen onder de stroken door. */}
        <svg
          aria-hidden
          data-testid="lab-harp-lijnen"
          className={`pointer-events-none absolute top-0 z-10 transition-opacity ${pending ? 'opacity-45' : 'opacity-100'}`}
          style={{ left: `${LABEL_PCT}%`, width: `${100 - LABEL_PCT - WAARDE_PCT}%`, height: hoogte }}
          viewBox={`0 0 100 ${hoogte}`}
          preserveAspectRatio="none"
        >
          {gedekt.map((stuk, i) => (
            <polyline
              key={i}
              data-testid="lab-harp-gedekt"
              points={naarPunten(stuk)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {plan.length > 1 && (
            <polyline
              data-testid="lab-harp-plan"
              points={naarPunten(plan)}
              fill="none"
              stroke="var(--module-active-500, var(--color-horizon-500))"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      {/* Legenda van de twee lijnen + de regel van de laatst aangeraakte strook. */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 font-sans text-[11px] leading-snug">
        <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
          <svg aria-hidden width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--module-active-500, var(--color-horizon-500))" strokeWidth="2" /></svg>
          {LAB_COPY.harpPlanLijn}
        </span>
        <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
          <svg aria-hidden width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          {LAB_COPY.harpGrensLijn}
        </span>
        {laatsteItem && (
          <span data-testid="lab-harp-regel" className="text-[var(--ink-2)]">
            <span className="font-semibold uppercase tracking-[0.03em] text-[var(--ink-3)]">{laatsteItem.label}</span>
            {' · '}
            {grensRegelVoor(laatsteItem)}
            {laatsteItem.detail && <span className="font-mono text-[10px] text-[var(--ink-3)]"> · {laatsteItem.detail}</span>}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
