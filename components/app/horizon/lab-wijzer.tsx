'use client'

/**
 * LabWijzer — de draaiknop-variant van een doelscenario-knop (ADR 0170).
 *
 * Dezelfde gegevens als `LabSlider`, andere vorm: een halfronde meter waarvan de BOOG de
 * driekleurige schaal draagt (rood → oranje → groen, of gespiegeld bij een dalende knop) en
 * de naald de huidige stand. De vorm is die van de geldstroom-meter op /overzicht/budget/
 * transacties (`components/overview/transacties/geldstroom-gauge.tsx`): halve boog, platte
 * segment-uiteinden, dunne naald in inkt.
 *
 * WAAROM DE NAALD NIET ZELF HET BESTURINGSELEMENT IS. Over de meter ligt een onzichtbare
 * `<input type="range">`. Die draagt de bediening (muis, touch, toetsenbord) en de
 * toegankelijkheid; de SVG is puur tekening. Een zelfgebouwde sleep-interactie op een boog
 * zou pijl-toetsen, `aria-valuetext` en de iOS-tik-afhandeling opnieuw moeten uitvinden —
 * en die drie zijn precies waar zo'n knop in de praktijk op stukloopt.
 *
 * KLEUR: de score-ladder (`--score-bad/-warn/-good`), net als de balk-variant. Semantisch,
 * niet instelbaar — zie de kleurkeuze in `lab-slider.tsx`.
 */

import type { ReactNode } from 'react'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'
import { labGrensRegel, labZoneWoord } from '@/lib/horizon/anker-copy'
import {
  zoneVanWaarde,
  type HefboomBereik,
  type HefboomGrenzen,
  type HefboomRichting,
  type LabZone,
} from '@/lib/horizon/lab-grenzen-types'
import { labSegmenten } from './lab-slider'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/** Boog-kleur per zone — dezelfde ladder als de balk. */
const ARC: Record<LabZone, string> = {
  rood: 'var(--score-bad)',
  oranje: 'var(--score-warn)',
  groen: 'var(--score-good)',
}

/** Tekstkleur van de waarde, per zone van de huidige stand. */
const WAARDE_TEXT: Record<LabZone, string> = {
  rood: 'text-score-bad',
  oranje: 'text-score-warn',
  groen: 'text-score-good',
}

// Geometrie van de halve boog (viewBox 0 0 200 128) — gespiegeld aan de geldstroom-meter.
const CX = 100
const CY = 104
const R = 80
const BAND = 16
/** 180° = links (minimum), 0° = rechts (maximum). */
const HOEK_MIN = 180
const HOEK_MAX = 0

function polar(hoekGraden: number, straal: number): { x: number; y: number } {
  const a = (hoekGraden * Math.PI) / 180
  return { x: CX + straal * Math.cos(a), y: CY - straal * Math.sin(a) }
}

/** Boog van `van` naar `tot` over de bovenkant (180° → 0°). */
function boog(van: number, tot: number, straal: number): string {
  const s = polar(van, straal)
  const e = polar(tot, straal)
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${straal} ${straal} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

/** Fractie 0–1 (links→rechts) → hoek op de boog. */
export function hoekVanFractie(fractie: number): number {
  const f = Math.max(0, Math.min(1, fractie))
  return HOEK_MIN + f * (HOEK_MAX - HOEK_MIN)
}

export interface LabWijzerProps {
  id: string
  label: string
  value: number
  baseValue: number
  bereik: HefboomBereik
  richting: HefboomRichting
  grenzen: HefboomGrenzen | null
  pending?: boolean
  formatValue: (v: number) => string
  formatGrens: (v: number) => string
  detail?: string | null
  onChange: (v: number) => void
  children?: ReactNode
}

function fractieVan(v: number, bereik: HefboomBereik): number {
  const span = bereik.max - bereik.min
  if (!(span > 0)) return 0
  return Math.max(0, Math.min(1, (v - bereik.min) / span))
}

function binnen(v: number | null, bereik: HefboomBereik): boolean {
  return v != null && v >= bereik.min && v <= bereik.max
}

export function LabWijzer({
  id,
  label,
  value,
  baseValue,
  bereik,
  richting,
  grenzen,
  pending = false,
  formatValue,
  formatGrens,
  detail = null,
  onChange,
  children,
}: LabWijzerProps) {
  const grensId = `${id}-grens`
  const zone = zoneVanWaarde(value, grenzen, richting)
  // Dezelfde segment-afleiding als de balk — één bron, zodat de twee vormen niet kunnen
  // drijven over waar de grens ligt.
  const segmenten = labSegmenten(grenzen, bereik, richting)

  // Segmentbreedtes (%) → boog-hoeken, op volgorde van links naar rechts.
  let cursor = 0
  const bogen = (segmenten ?? []).map((seg) => {
    const van = hoekVanFractie(cursor / 100)
    cursor += seg.breedte
    return { zone: seg.zone, van, tot: hoekVanFractie(cursor / 100) }
  })

  const naaldHoek = hoekVanFractie(fractieVan(value, bereik))
  const naaldPunt = polar(naaldHoek, R - BAND / 2 - 6)
  const naaldVoet = polar(naaldHoek, 10)
  const nuHoek = hoekVanFractie(fractieVan(baseValue, bereik))
  const nuBuiten = polar(nuHoek, R + BAND / 2 - 1)
  const nuBinnen = polar(nuHoek, R - BAND / 2 + 1)

  const gedektBinnen = binnen(grenzen?.gedekt ?? null, bereik)
  const ruimBinnen = binnen(grenzen?.ruim ?? null, bereik)
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
      <div className="text-center font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </div>

      {/* De focusring hoort om de METER, niet om het onzichtbare sleepvlak: dat is 44 px hoog
          en tekende een zwarte rechthoek dwars over de aflezing. */}
      <div className="relative mx-auto mt-1 w-full max-w-[220px] rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ink)]">
        <svg
          viewBox="0 0 200 128"
          className={`block w-full transition-opacity ${pending ? 'opacity-45' : 'opacity-100'}`}
          aria-hidden="true"
          data-testid={`lab-knop-${id}-meter`}
        >
          {/* Lege boog: de as bestaat ook zonder grenzen (dan grijs). */}
          <path
            d={boog(HOEK_MIN, HOEK_MAX, R)}
            fill="none"
            stroke="var(--border-ed)"
            strokeWidth={BAND}
            strokeLinecap="butt"
          />
          {bogen.map((b, i) =>
            b.van === b.tot ? null : (
              <path
                key={`${b.zone}-${i}`}
                data-testid={`lab-knop-${id}-segment-${b.zone}`}
                d={boog(b.van, b.tot, R)}
                fill="none"
                stroke={ARC[b.zone]}
                strokeWidth={BAND}
                strokeLinecap="butt"
              />
            ),
          )}
          {/* "nu"-streepje dwars over de band, op de stand van het plan. */}
          <line
            x1={nuBuiten.x}
            y1={nuBuiten.y}
            x2={nuBinnen.x}
            y2={nuBinnen.y}
            stroke="var(--paper)"
            strokeWidth={2.5}
          />
          {/* Naald + spil. */}
          <line
            x1={naaldVoet.x}
            y1={naaldVoet.y}
            x2={naaldPunt.x}
            y2={naaldPunt.y}
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
        </svg>

        {/* Het échte besturingselement: onzichtbaar over de meter. */}
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
          className="slider-module slider-onzichtbaar absolute inset-x-0 bottom-0 h-11 w-full"
          {...rangeTouchSeekProps}
        />
      </div>

      {/* De leeswaarde ONDER de boog, niet erin: in de boog botst hij met de naald en met
          de spil — en juist die naald is wat de meter leesbaar maakt. */}
      <div className="mt-0.5 text-center">
        <div
          className={`font-display text-[18px] font-black leading-none tabular-nums ${
            zone ? WAARDE_TEXT[zone] : 'text-[var(--ink)]'
          }`}
          style={{ fontFamily: PLAYFAIR }}
        >
          {formatValue(value)}
        </div>
        {detail && (
          <div className="mt-0.5 font-mono text-[10px] leading-snug tabular-nums text-[var(--ink-3)]">{detail}</div>
        )}
      </div>

      <div className="mt-1 flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
        <span>{formatGrens(bereik.min)}</span>
        <span>{formatGrens(bereik.max)}</span>
      </div>

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
