'use client'

/**
 * LabSlider — één knop van het doelscenario, met de driekleurige schaal (ADR 0170).
 *
 * Presentational en props-only: alle getallen komen berekend binnen. De twee grenzen
 * (`gedekt` = rood→oranje, `ruim` = oranje→groen) komen uit `computeLabGrenzen`
 * (`lib/horizon/lab-grenzen.ts`, draait in de kernel-worker); hier worden ze alleen naar
 * posities op de as omgerekend. Géén eigen som, geen dekkingspercentage, geen kernel-run.
 *
 * WAAROM DE SCHAAL OP DE KNOP ZIT. Tot ADR 0170 stond de duiding náást de knoppen: een
 * marge-band, een dekkingsbalk met drie tegels en per knop een antwoordregel met een
 * "Reken hiermee"-knop. Die antwoorden claimden bewust geen uitkomst ("hoort bij een gedekt
 * plan"), want het hint-bedrag dekte het plan niet echt. De gekleurde schaal doet wat die
 * drie lagen samen probeerden: ze zegt per knop waar de grens ligt, en ze beweegt mee zodra
 * een andere knop schuift.
 *
 * KLEUR = STOPLICHT, NOOIT MODULE-ACCENT (CLAUDE.md-kleurconventie). Rood/oranje/groen zijn
 * hier semantiek (haalt je plan het?), geen identiteit; de gebruiker kan ze niet instellen.
 */

import type { ReactNode } from 'react'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'
import { LAB_COPY, labGrensRegel, labZoneWoord } from '@/lib/horizon/anker-copy'
import {
  zoneVanWaarde,
  type HefboomBereik,
  type HefboomGrenzen,
  type HefboomRichting,
  type LabZone,
} from '@/lib/horizon/lab-grenzen-types'

/**
 * Achtergrond per zone voor de delta-badge — de zachte tint met de FELLE tekstkleur erop.
 * Zie de kleurkeuze hieronder voor waarom de tekst uit de score-ladder komt.
 */
const ZONE_BADGE: Record<LabZone, string> = {
  rood: 'bg-negative-bg text-score-bad',
  oranje: 'bg-warning-bg text-score-warn',
  groen: 'bg-positive-bg text-score-good',
}

/**
 * Vulkleur van de drie segmenten op de as — de SCORE-ladder, niet de editorial
 * value-change-tokens (`--positive`/`--warning`/`--negative`). Die laatste staan bewust op
 * lage chroma (0,09–0,11): ze zijn gemaakt om als TEKST naast een bedrag te staan. Als vlak
 * van 8 px leest dat als bruin–olijf–donkergroen en verliest de schaal precies wat ze moet
 * doen: in één oogopslag zeggen waar je staat. De score-tokens (chroma 0,17–0,22) zijn
 * gedocumenteerd voor exact dit doel — "duidelijke band-kleuren in ring/balken" — en blijven
 * semantisch: de gebruiker kan ze niet instellen (CLAUDE.md-kleurconventie).
 */
const SEGMENT: Record<LabZone, string> = {
  rood: 'bg-score-bad',
  oranje: 'bg-score-warn',
  groen: 'bg-score-good',
}

export interface LabSliderProps {
  /** Stabiele id — voedt het range-element en de `aria-describedby` van de grensregel. */
  id: string
  label: string
  value: number
  /** De waarde waarmee het plan nu rekent ("nu"-notch). */
  baseValue: number
  bereik: HefboomBereik
  richting: HefboomRichting
  /** De twee grenzen; `null` = niet bepaalbaar → grijze as, geen kleur. */
  grenzen: HefboomGrenzen | null
  /** Er loopt een herberekening: de vorige grenzen blijven staan, gedempt. */
  pending?: boolean
  formatValue: (v: number) => string
  /** Delta t.o.v. `baseValue`; weglaten = geen delta-badge. */
  formatDelta?: (delta: number) => string
  /** Korte vorm voor de grensregel en de randlabels. */
  formatGrens: (v: number) => string
  /** Tweede regel onder de waarde (bv. de spaarquote of het maandbedrag). */
  detail?: string | null
  onChange: (v: number) => void
  /** Slot onder de grensregel — de host hangt hier bv. de plan-acties van de stop-knop. */
  children?: ReactNode
}

/** Positie (0–100 %) van een waarde op de as; buiten bereik wordt geklemd. */
function posOf(v: number, bereik: HefboomBereik): number {
  const span = bereik.max - bereik.min
  if (!(span > 0)) return 0
  return Math.max(0, Math.min(100, ((v - bereik.min) / span) * 100))
}

/** Ligt de grens binnen het zichtbare bereik? Daarbuiten kan de knop er niet naartoe. */
function binnen(v: number | null, bereik: HefboomBereik): boolean {
  return v != null && v >= bereik.min && v <= bereik.max
}

/**
 * De drie segmentbreedtes (in % van de as). Bij `stijgend` ligt groen rechts (meer verdienen,
 * later stoppen), bij `dalend` links (minder uitgeven na pensioen, minder nalaten). Een grens
 * buiten het bereik klemt op 0 of 100, zodat het segment verdwijnt in plaats van de as te
 * vervormen. Geëxporteerd zodat de test de breedtes kan narekenen zonder de DOM te meten.
 */
export function labSegmenten(
  grenzen: HefboomGrenzen | null,
  bereik: HefboomBereik,
  richting: HefboomRichting,
): { zone: LabZone; breedte: number }[] | null {
  if (grenzen == null) return null
  if (grenzen.gedekt == null) {
    if (grenzen.heel === 'gedekt') return [{ zone: 'groen', breedte: 100 }]
    if (grenzen.heel === 'ongedekt') return [{ zone: 'rood', breedte: 100 }]
    return null
  }
  const g = posOf(grenzen.gedekt, bereik)
  const r = grenzen.ruim == null ? null : posOf(grenzen.ruim, bereik)
  if (richting === 'stijgend') {
    const eindOranje = r == null ? 100 : Math.max(g, r)
    return [
      { zone: 'rood', breedte: g },
      { zone: 'oranje', breedte: Math.max(0, eindOranje - g) },
      { zone: 'groen', breedte: Math.max(0, 100 - eindOranje) },
    ]
  }
  const startOranje = r == null ? 0 : Math.min(g, r)
  return [
    { zone: 'groen', breedte: startOranje },
    { zone: 'oranje', breedte: Math.max(0, g - startOranje) },
    { zone: 'rood', breedte: Math.max(0, 100 - g) },
  ]
}

export function LabSlider({
  id,
  label,
  value,
  baseValue,
  bereik,
  richting,
  grenzen,
  pending = false,
  formatValue,
  formatDelta,
  formatGrens,
  detail = null,
  onChange,
  children,
}: LabSliderProps) {
  const grensId = `${id}-grens`
  const zone = zoneVanWaarde(value, grenzen, richting)
  const segmenten = labSegmenten(grenzen, bereik, richting)
  const notchPct = posOf(baseValue, bereik)
  const toonNotchLabel = notchPct > 10 && notchPct < 90
  const delta = value - baseValue
  const toonDelta = formatDelta != null && Math.abs(delta) > 1e-9

  // De grensregel noemt alleen grenzen die de knop kan bereiken; anders de reden. Zo staat er
  // nooit een grens die je niet kunt aanwijzen, en nooit een lege regel.
  const gedektBinnen = binnen(grenzen?.gedekt ?? null, bereik)
  const ruimBinnen = binnen(grenzen?.ruim ?? null, bereik)

  // Merkteken op de grens rood→oranje: het punt waar het plan precies gedekt is (of, onder
  // "zo vroeg als het kan", de haalbare vrijheidsleeftijd). Diezelfde grens staat al in de
  // regel eronder als BEDRAG; dit merkteken zet 'm op de as, zodat je ziet hoe ver je er
  // vandaan staat en — omdat elke andere knop de grens verschuift — hoe hij meebeweegt.
  // Zelfde vorm als het "nu"-streepje, maar in volle inkt: "nu" is waar je staat, dit is
  // waar je moet komen.
  const gedektPct = gedektBinnen ? posOf(grenzen!.gedekt!, bereik) : null
  // Het label wijkt voor het "nu"-label: twee woorden op dezelfde plek leest als één.
  const toonGedektLabel =
    gedektPct != null && gedektPct > 8 && gedektPct < 92 && Math.abs(gedektPct - notchPct) > 9
  const reden: Parameters<typeof labGrensRegel>[0]['reden'] =
    grenzen == null
      ? 'onbekend'
      : grenzen.heel === 'gedekt'
        ? 'heel-gedekt'
        : grenzen.heel === 'ongedekt'
          ? 'heel-ongedekt'
          : grenzen.gedekt == null
            ? 'onbekend'
            : richting === 'stijgend'
              ? 'boven-bereik'
              : 'onder-bereik'
  const grensRegel = labGrensRegel({
    gedekt: gedektBinnen ? formatGrens(grenzen!.gedekt!) : null,
    ruim: ruimBinnen ? formatGrens(grenzen!.ruim!) : null,
    reden,
  })

  return (
    <div className="py-3" data-testid={`lab-knop-${id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {label}
        </span>
        <span className="flex shrink-0 items-baseline">
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">{formatValue(value)}</span>
          {toonDelta && (
            <span
              data-testid={`lab-knop-${id}-delta`}
              className={`ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${
                zone ? ZONE_BADGE[zone] : 'bg-[var(--subtle)] text-[var(--ink-2)]'
              }`}
            >
              {formatDelta(delta)}
            </span>
          )}
        </span>
      </div>
      {detail && (
        <p className="mt-0.5 text-right font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{detail}</p>
      )}

      <div className="relative mt-2 h-8">
        {/* De as: drie segmenten in stoplichtkleur, of grijs zonder bruikbare grenzen. */}
        <div
          aria-hidden
          data-testid={`lab-knop-${id}-as`}
          className={`absolute left-0 right-0 top-1/2 flex h-3 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--border-ed)] transition-opacity ${
            pending ? 'opacity-45' : 'opacity-100'
          }`}
        >
          {segmenten?.map((seg, i) => (
            <span
              key={`${seg.zone}-${i}`}
              data-testid={`lab-knop-${id}-segment-${seg.zone}`}
              className={`h-full ${SEGMENT[seg.zone]} motion-safe:transition-[width] motion-safe:duration-300`}
              style={{ width: `${seg.breedte}%` }}
            />
          ))}
        </div>
        {/* "nu"-notch op de plan-waarde. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-20 h-[18px] w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--ink-3)]"
          style={{ left: `${notchPct}%` }}
        />
        {/* De gedekt-grens: hoger en in volle inkt, en hij schuift mee (zelfde duur als de
            segmenten, zodat merkteken en kleurgrens als één beweging lezen). */}
        {gedektPct != null && (
          <span
            aria-hidden
            data-testid={`lab-knop-${id}-grensmerk`}
            className="pointer-events-none absolute top-1/2 z-20 h-[22px] w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--ink)] motion-safe:transition-[left] motion-safe:duration-300"
            style={{ left: `${gedektPct}%` }}
          />
        )}
        <input
          type="range"
          id={id}
          min={bereik.min}
          max={bereik.max}
          step={bereik.stap}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          aria-valuetext={`${formatValue(value)}, ${labZoneWoord(zone)}`}
          aria-describedby={grensId}
          aria-busy={pending || undefined}
          className="slider-module slider-op-band absolute inset-0 z-30 h-8 w-full"
          {...rangeTouchSeekProps}
        />
      </div>

      <div className="relative flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
        <span>{formatGrens(bereik.min)}</span>
        {toonNotchLabel && (
          <span
            aria-hidden
            className="absolute -translate-x-1/2 font-mono text-[10px] text-[var(--ink-3)]"
            style={{ left: `${notchPct}%` }}
          >
            nu
          </span>
        )}
        {toonGedektLabel && (
          <span
            aria-hidden
            className="absolute -translate-x-1/2 font-sans text-[10px] font-semibold text-[var(--ink)] motion-safe:transition-[left] motion-safe:duration-300"
            style={{ left: `${gedektPct}%` }}
          >
            {LAB_COPY.grensGedekt}
          </span>
        )}
        <span>{formatGrens(bereik.max)}</span>
      </div>

      {/* De grensregel is TEKST, geen knop: de knop ís de actie. Eerder stond hier een
          "Reken hiermee"-knop naast een bedrag dat het plan niet echt dekte (ADR 0170). */}
      <p
        id={grensId}
        data-testid={`lab-knop-${id}-grens`}
        className="mt-1.5 font-sans text-[11px] leading-snug text-[var(--ink-2)]"
      >
        {grensRegel}
      </p>
      {children}
    </div>
  )
}
