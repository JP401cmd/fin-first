'use client'

/**
 * LabVijfhoek — de laptop-vorm van het doelscenario (ADR 0170 B12): één pentagram waarin de
 * vijf knoppen samen één figuur vormen, met naast de tekening een legenda die de echte
 * getallen draagt.
 *
 * WAT DE VORM TOEVOEGT. De balken, de wijzers en het rad tonen vijf knoppen náást elkaar; de
 * vijfhoek toont de SAMENHANG. Elke spaak draagt dezelfde driekleurige schaal als de andere
 * vormen (rood → oranje → groen, door `labSegmenten` — één bron, zodat geen twee vormen
 * kunnen drijven over waar de grens ligt), en de gesloten lijn door de vijf standen laat in
 * één blik zien welke kant van je plan doorzakt. Dat is precies het B2-inzicht: beweegt één
 * knop, dan verschuiven de grenzen op alle vijf.
 *
 * GEEN GEVULD VLAK. De plan-vijfhoek is een LIJN zonder vulling. Een gevuld radardiagram
 * suggereert oppervlak, en dat oppervlak is vertekend: het hangt af van de volgorde van de
 * assen en van hun (onderling onvergelijkbare) eenheden. Twee plannen met dezelfde standen in
 * een andere as-volgorde zouden een ander "oppervlak" tonen. Daarom ook een VASTE
 * as-volgorde: `HEFBOOM_KEYS`, verdienen bovenaan en dan met de klok mee — de vorm van de
 * figuur mag alleen veranderen doordat je aan een knop draait, nooit doordat de app de assen
 * anders neerlegt.
 *
 * GROF + FIJN. Slepen aan een hoekpunt is de grove beweging (je ziet de hele figuur
 * meebewegen); fijnregelen gebeurt op de legenda-regel, waar over elk getal een écht
 * `<input type="range">` ligt. Dat invoerveld draagt óók de volledige toegankelijkheid
 * (pijltoetsen, `aria-valuetext`, de iOS-tik-afhandeling via `rangeTouchSeekProps`): de SVG
 * is `aria-hidden` en puur tekening, net als bij `lab-wijzer.tsx`. Een schermlezer hoort elke
 * knop dus één keer.
 *
 * HITBOX ALS HTML-ELEMENT met een vaste maat (44 px), geen SVG-cirkel: die zou meeschalen met
 * de viewBox en op een smal scherm terugzakken onder de a11y-norm — precies waar de vinger
 * 'm nodig heeft. De grepen liggen in een eigen laag ná de tekening; alleen de greep zelf
 * vangt aanrakingen, zodat een veeg elders op de figuur gewoon de pagina scrollt.
 *
 * KLEUR. De band is de score-ladder (`--score-bad/-warn/-good`) — semantiek, niet instelbaar
 * (zie de kleurkeuze in `lab-slider.tsx`). De greep en de plan-lijn dragen het module-accent:
 * dezelfde bediening als de balk-duim, dus dezelfde kleurtaal.
 *
 * Presentational: alle getallen en grenzen komen berekend binnen. Hier worden alleen posities
 * gerekend — geen kernel-run, geen eigen grens.
 */

import { useRef, useState } from 'react'
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
import { snapNaarStap, standUitVinger } from './lab-wijzer'

/** Bandkleur per zone — dezelfde ladder als de balk en de wijzer. */
const BAND_KLEUR: Record<LabZone, string> = {
  rood: 'var(--score-bad)',
  oranje: 'var(--score-warn)',
  groen: 'var(--score-good)',
}

/** Stoplichtpunt in de legenda — zelfde ladder, als Tailwind-klasse. */
const PUNT: Record<LabZone, string> = {
  rood: 'bg-score-bad',
  oranje: 'bg-score-warn',
  groen: 'bg-score-good',
}

// Geometrie van het pentagram (viewBox 0 0 360 360).
const VB = 360
/**
 * Het zichtbare venster is RUIMER dan het pentagram: de as-labels staan buiten de spaken en
 * moeten mee in de viewBox, anders knipt de SVG ze af ("…EFTIJD", "MINDE") of lopen ze onder
 * `lg` buiten de kaart. Alles schaalt zo mee; geen `overflow-visible`, geen zijmarge.
 */
const VB_X0 = -80
const VB_Y0 = -20
const VB_W = 520
const VB_H = 400

/**
 * Positie op de spaak: "verder naar buiten = beter" op ÁLLE spaken. Bij een dalende knop
 * (uitgave na pensioen, nalatenschap) is een lage waarde de goede kant op, dus daar wordt de
 * fractie gespiegeld. Zonder dit zeggen drie assen "buiten = gedekt" en twee "binnen =
 * gedekt", en houdt de lezing "ligt mijn vijfhoek buiten de gedekte?" niet stand — terwijl
 * elke spaak afzonderlijk wél goed kleurt (ADR 0170 B12). Involutie: heen en terug dezelfde.
 */
export function opSpaak(fractie: number, richting: HefboomRichting): number {
  return richting === 'dalend' ? 1 - fractie : fractie
}
const CX = 180
const CY = 180
/** Straal van de buitenrand van een spaak (fractie 1). */
export const SPAAK_R = 118
const BAND = 10
/** Ring waar de as-labels staan — buiten de band, zodat tekst nooit over kleur valt. */
const LABEL_R = SPAAK_R + 24

/** Hoek van spaak `i` van `n`: de eerste staat rechtop, daarna met de klok mee. */
export function hoekVanIndex(index: number, aantal: number): number {
  if (aantal <= 0) return 90
  return 90 - (index * 360) / aantal
}

/** Poolcoördinaat → viewBox-punt (hoek in graden, 90° = recht omhoog). */
function punt(hoekGraden: number, straal: number): { x: number; y: number } {
  const a = (hoekGraden * Math.PI) / 180
  return { x: CX + straal * Math.cos(a), y: CY - straal * Math.sin(a) }
}

/**
 * Projectie van een cursorvector op één spaak → fractie 0–1.
 *
 * `dx` naar rechts, `dyOmhoog` naar boven (dus al omgeklapt t.o.v. schermcoördinaten), beide
 * in viewBox-eenheden. De component rekent de clientmaten eerst terug naar de viewBox, zodat
 * deze functie puur meetkunde is en los te toetsen valt.
 *
 * Alleen de component LÁNGS de spaak telt: loodrecht erop blijft de stand staan (je sleept
 * langs een as, niet over het vlak), achter het middelpunt klemt hij op 0 en voorbij de rand
 * op 1.
 */
export function fractieOpSpaak(dx: number, dyOmhoog: number, hoekGraden: number): number {
  const a = (hoekGraden * Math.PI) / 180
  const langs = dx * Math.cos(a) + dyOmhoog * Math.sin(a)
  return Math.max(0, Math.min(1, langs / SPAAK_R))
}

/** Positie van een waarde op de spaak, als fractie 0–1; buiten bereik klemt het. */
function fractieVan(v: number, bereik: HefboomBereik): number {
  const span = bereik.max - bereik.min
  if (!(span > 0)) return 0
  return Math.max(0, Math.min(1, (v - bereik.min) / span))
}

/** Ligt de grens binnen het zichtbare bereik? Daarbuiten kan de knop er niet naartoe. */
function binnen(v: number | null, bereik: HefboomBereik): boolean {
  return v != null && v >= bereik.min && v <= bereik.max
}

/** Streepje dwars op de spaak, op fractie `f` — `uit` px aan elke kant van het hart. */
function dwars(hoekGraden: number, f: number, uit: number) {
  const a = (hoekGraden * Math.PI) / 180
  const p = punt(hoekGraden, f * SPAAK_R)
  // Loodrecht op de spaak: (−sin, cos) in y-omhoog, dus y omgeklapt naar schermcoördinaten.
  const nx = -Math.sin(a)
  const ny = -Math.cos(a)
  return { x1: p.x - nx * uit, y1: p.y - ny * uit, x2: p.x + nx * uit, y2: p.y + ny * uit }
}

export interface LabVijfhoekItem {
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

export interface LabVijfhoekProps {
  items: LabVijfhoekItem[]
  /** Er loopt een herberekening: de vorige figuur blijft staan, gedempt. */
  pending?: boolean
}

/** Alles wat één spaak nodig heeft om zichzelf te tekenen — één keer gerekend per render. */
interface Spaak {
  item: LabVijfhoekItem
  hoek: number
  zone: LabZone | null
  segmenten: { zone: LabZone; breedte: number }[] | null
  standFractie: number
  hoekpunt: { x: number; y: number }
  gedektFractie: number | null
  grensRegel: string
}

export function LabVijfhoek({ items, pending = false }: LabVijfhoekProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const invoerRefs = useRef<Partial<Record<HefboomKey, HTMLInputElement | null>>>({})
  /**
   * Welke spaak er sleept, waar de vinger hem pakte en waar de stand toen stond. Bewust een
   * ref en niet alleen state: de eerste `pointermove` kan vóór de re-render binnenkomen, en
   * die beweging mag niet verloren gaan.
   */
  const pakRef = useRef<{ key: HefboomKey; pak: number; stand: number } | null>(null)
  const [sleeptKey, setSleeptKey] = useState<HefboomKey | null>(null)

  const spaken: Spaak[] = items.map((item, i) => {
    const zone = zoneVanWaarde(item.value, item.grenzen, item.richting)
    const standFractie = opSpaak(fractieVan(item.value, item.bereik), item.richting)
    const hoek = hoekVanIndex(i, items.length)
    const gedektBinnen = binnen(item.grenzen?.gedekt ?? null, item.bereik)
    const ruimBinnen = binnen(item.grenzen?.ruim ?? null, item.bereik)
    // Letterlijk dezelfde reden-afleiding als de balk en de wijzer: de regel noemt alleen
    // grenzen die de knop kan bereiken, anders waaróm er geen grens staat.
    const reden: Parameters<typeof labGrensRegel>[0]['reden'] =
      item.grenzen == null
        ? 'onbekend'
        : item.grenzen.heel === 'gedekt'
          ? 'heel-gedekt'
          : item.grenzen.heel === 'ongedekt'
            ? 'heel-ongedekt'
            : item.grenzen.gedekt == null
              ? 'onbekend'
              : item.richting === 'stijgend'
                ? 'boven-bereik'
                : 'onder-bereik'
    return {
      item,
      hoek,
      zone,
      // `labSegmenten` spiegelt de kleuren al voor een dalende knop (groen links); op de
      // gespiegelde spaak (`opSpaak`) moeten ze dan in omgekeerde volgorde van het
      // middelpunt naar buiten — zodat groen op élke spaak aan de buitenkant ligt.
      segmenten: (() => {
        const seg = labSegmenten(item.grenzen, item.bereik, item.richting)
        return seg && item.richting === 'dalend' ? [...seg].reverse() : seg
      })(),
      standFractie,
      hoekpunt: punt(hoek, standFractie * SPAAK_R),
      gedektFractie: gedektBinnen ? opSpaak(fractieVan(item.grenzen!.gedekt!, item.bereik), item.richting) : null,
      grensRegel: labGrensRegel({
        gedekt: gedektBinnen ? item.formatGrens(item.grenzen!.gedekt!) : null,
        ruim: ruimBinnen ? item.formatGrens(item.grenzen!.ruim!) : null,
        reden,
      }),
    }
  })

  /** Fractie onder de vinger op één spaak, teruggerekend van client- naar viewBox-maten. */
  const fractieBijPunt = (hoek: number, clientX: number, clientY: number): number | null => {
    const kader = svgRef.current?.getBoundingClientRect()
    if (!kader || !(kader.width > 0)) return null
    // Schaal en middelpunt volgen het RUIMERE venster (VB_*), niet het pentagram zelf.
    const schaal = kader.width / VB_W
    const dx = (clientX - (kader.left + (CX - VB_X0) * schaal)) / schaal
    const dyOmhoog = (kader.top + (CY - VB_Y0) * schaal - clientY) / schaal
    return fractieOpSpaak(dx, dyOmhoog, hoek)
  }

  const volgVinger = (spaak: Spaak, clientX: number, clientY: number) => {
    const greep = pakRef.current
    if (greep == null || greep.key !== spaak.item.key) return
    const f = fractieBijPunt(spaak.hoek, clientX, clientY)
    if (f == null) return
    // Alles hierboven is in spaak-ruimte (buiten = beter); terug naar waarde-ruimte via
    // dezelfde involutie.
    const fractie = opSpaak(standUitVinger(f, greep.pak, greep.stand), spaak.item.richting)
    const { bereik } = spaak.item
    const v = snapNaarStap(bereik.min + fractie * (bereik.max - bereik.min), bereik)
    if (v !== spaak.item.value) spaak.item.onChange(v)
  }

  /** Einde van de sleep — óók als de browser de capture zelf intrekt. */
  const laatLos = () => {
    pakRef.current = null
    setSleeptKey(null)
  }

  // De gedekt-vijfhoek breekt op elke spaak zonder merk: een gestreepte lijn naar een punt
  // dat er niet is, zou een grens suggereren die deze knop niet kan bereiken. Daarom losse
  // segmenten tussen opeenvolgende spaken die BEIDE een merk hebben.
  const gedektSegmenten = spaken.flatMap((spaak, i) => {
    const volgende = spaken[(i + 1) % spaken.length]
    if (spaken.length < 2 || spaak.gedektFractie == null || volgende.gedektFractie == null) return []
    const a = punt(spaak.hoek, spaak.gedektFractie * SPAAK_R)
    const b = punt(volgende.hoek, volgende.gedektFractie * SPAAK_R)
    return [{ key: `${spaak.item.key}-${volgende.item.key}`, a, b }]
  })

  const planPunten = spaken.map((s) => `${s.hoekpunt.x.toFixed(2)},${s.hoekpunt.y.toFixed(2)}`).join(' ')

  return (
    <div
      role="group"
      aria-label={LAB_COPY.vijfhoekLabel}
      data-testid="lab-vijfhoek"
      className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6"
    >
      {/* Het venster (VB_*) is ruimer dan het pentagram, zodat de as-labels erin vallen en
          meeschalen — geen `overflow-visible`, geen zijmarge die onder `lg` ontbreekt. */}
      <div className="relative mx-auto w-full max-w-[480px] shrink-0">
        {/* De tekening is puur beeld: de legenda-invoervelden dragen de bediening én de
            toegankelijkheid (vandaar `aria-hidden` en bewust géén `role="img"`). */}
        <svg
          ref={svgRef}
          viewBox={`${VB_X0} ${VB_Y0} ${VB_W} ${VB_H}`}
          className={`block w-full transition-opacity ${pending ? 'opacity-45' : 'opacity-100'}`}
          aria-hidden="true"
          data-testid="lab-vijfhoek-figuur"
        >
          {spaken.map((spaak) => {
            const key = spaak.item.key
            // Lege spaak: de as bestaat ook zonder grenzen (dan grijs).
            const van = punt(spaak.hoek, 0)
            const tot = punt(spaak.hoek, SPAAK_R)
            let cursor = 0
            const banden = (spaak.segmenten ?? []).map((seg, i) => {
              const f0 = cursor / 100
              cursor += seg.breedte
              const f1 = cursor / 100
              return { zone: seg.zone, i, a: punt(spaak.hoek, f0 * SPAAK_R), b: punt(spaak.hoek, f1 * SPAAK_R) }
            })
            const nu = dwars(spaak.hoek, opSpaak(fractieVan(spaak.item.baseValue, spaak.item.bereik), spaak.item.richting), BAND / 2)
            const merk = spaak.gedektFractie == null ? null : dwars(spaak.hoek, spaak.gedektFractie, BAND / 2 + 3)
            const labelPunt = punt(spaak.hoek, LABEL_R)
            const cos = Math.cos((spaak.hoek * Math.PI) / 180)
            const sin = Math.sin((spaak.hoek * Math.PI) / 180)
            return (
              <g key={key}>
                <line
                  x1={van.x}
                  y1={van.y}
                  x2={tot.x}
                  y2={tot.y}
                  stroke="var(--border-ed)"
                  strokeWidth={BAND}
                  strokeLinecap="butt"
                />
                {banden.map((b) =>
                  b.a.x === b.b.x && b.a.y === b.b.y ? null : (
                    <line
                      key={`${b.zone}-${b.i}`}
                      data-testid={`lab-vijfhoek-${key}-segment-${b.zone}`}
                      x1={b.a.x}
                      y1={b.a.y}
                      x2={b.b.x}
                      y2={b.b.y}
                      stroke={BAND_KLEUR[b.zone]}
                      strokeWidth={BAND}
                      strokeLinecap="butt"
                    />
                  ),
                )}
                {/* "nu" = waar het plan nu rekent; valt binnen de band. */}
                <line
                  data-testid={`lab-vijfhoek-${key}-nu`}
                  x1={nu.x1}
                  y1={nu.y1}
                  x2={nu.x2}
                  y2={nu.y2}
                  stroke="var(--paper)"
                  strokeWidth={2.5}
                />
                {/* "gedekt" = waar je moet komen; in volle inkt en iets breder dan de band. */}
                {merk && (
                  <line
                    data-testid={`lab-vijfhoek-${key}-grensmerk`}
                    x1={merk.x1}
                    y1={merk.y1}
                    x2={merk.x2}
                    y2={merk.y2}
                    stroke="var(--ink)"
                    strokeWidth={2}
                  />
                )}
                <text
                  x={labelPunt.x}
                  y={labelPunt.y}
                  textAnchor={cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle'}
                  dominantBaseline={sin > 0.25 ? 'auto' : sin < -0.25 ? 'hanging' : 'middle'}
                  fontSize={11}
                  letterSpacing="0.06em"
                  fill="var(--ink-3)"
                  data-testid={`lab-vijfhoek-${key}-aslabel`}
                >
                  {spaak.item.label.toUpperCase()}
                </text>
              </g>
            )
          })}

          {/* De gedekte grens als gestreepte figuur, in inkt. */}
          {gedektSegmenten.map((seg) => (
            <line
              key={seg.key}
              data-testid="lab-vijfhoek-gedekt-segment"
              x1={seg.a.x}
              y1={seg.a.y}
              x2={seg.b.x}
              y2={seg.b.y}
              stroke="var(--ink)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ))}

          {/* Jouw plan: een LIJN zonder vulling — zie de kop van dit bestand. */}
          {spaken.length > 0 && (
            <polygon
              data-testid="lab-vijfhoek-plan"
              points={planPunten}
              fill="none"
              stroke="var(--module-active-500, var(--color-horizon-500))"
              strokeWidth={2}
            />
          )}

          {/* De hoekpunten: dezelfde greep-vorm als op de wijzer (accent + inkt-rand). */}
          {spaken.map((spaak) => {
            const actief = sleeptKey === spaak.item.key
            return (
              <circle
                key={spaak.item.key}
                data-testid={`lab-vijfhoek-${spaak.item.key}-punt`}
                cx={spaak.hoekpunt.x}
                cy={spaak.hoekpunt.y}
                r={actief ? 11 : 9}
                fill={`var(--module-active-${actief ? '700' : '500'}, var(--color-horizon-${actief ? '700' : '500'}))`}
                stroke="var(--ink)"
                strokeWidth={2.5}
              />
            )
          })}
        </svg>

        {/* De sleeplaag: alleen de grepen vangen aanrakingen, de laag zelf niet. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {spaken.map((spaak) => {
            const actief = sleeptKey === spaak.item.key
            return (
              <div
                key={spaak.item.key}
                aria-hidden="true"
                data-testid={`lab-vijfhoek-${spaak.item.key}-greep`}
                // Bij lage standen kruipen de hoekpunten samen rond het middelpunt en overlappen
                // de grepen; de greep onder de muis en de greep in de hand winnen dan.
                className={`pointer-events-auto absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full hover:z-10 ${
                  actief ? 'z-20' : ''
                }`}
                style={{
                  left: `${((spaak.hoekpunt.x - VB_X0) / VB_W) * 100}%`,
                  top: `${((spaak.hoekpunt.y - VB_Y0) / VB_H) * 100}%`,
                  touchAction: 'none',
                  cursor: actief ? 'grabbing' : 'grab',
                }}
                onPointerDown={(e) => {
                  // Alleen de primaire knop sleept; aanraking en pen melden zich óók als 0.
                  if (e.button !== 0) return
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  invoerRefs.current[spaak.item.key]?.focus({ preventScroll: true })
                  // Vastpakken verzet de stand NIET: we onthouden alleen wáár je 'm pakte,
                  // zodat de sleep vanaf dat punt meeloopt (zie `standUitVinger`).
                  const stand = spaak.standFractie
                  pakRef.current = {
                    key: spaak.item.key,
                    pak: fractieBijPunt(spaak.hoek, e.clientX, e.clientY) ?? stand,
                    stand,
                  }
                  setSleeptKey(spaak.item.key)
                }}
                onPointerMove={(e) => volgVinger(spaak, e.clientX, e.clientY)}
                onPointerUp={laatLos}
                onPointerCancel={laatLos}
                // Zonder deze bleef de sleep hangen als de browser de capture introk.
                onLostPointerCapture={laatLos}
              />
            )
          })}
        </div>
      </div>

      {/* De legenda draagt de getallen én de fijnregeling: over elke regel ligt het échte
          invoerveld, dus slepen over een getal verzet de knop en pijltoetsen nudgen hem. */}
      {/* Begrensd: op een brede kaart zou `flex-1` de getallen een halve meter van hun label
          zetten. De legenda is een kolom, geen tabel over de volle breedte. */}
      <div className="min-w-0 flex-1 lg:max-w-[380px]">
        <ul className="space-y-1">
          {spaken.map((spaak) => {
            const { item } = spaak
            const grensId = `${item.key}-grens`
            return (
              <li
                key={item.key}
                data-testid={`lab-vijfhoek-${item.key}-regel`}
                className="relative min-h-11 rounded-md px-1 py-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ink)]"
              >
                <div className="flex min-h-9 items-center gap-2">
                  <span
                    aria-hidden
                    data-testid={`lab-vijfhoek-${item.key}-zonepunt`}
                    data-zone={spaak.zone ?? 'onbekend'}
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      spaak.zone ? PUNT[spaak.zone] : 'bg-[var(--border-md)]'
                    } ${pending ? 'opacity-45' : 'opacity-100'}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                    {item.label}
                  </span>
                  {/* Het invoerveld ligt ALLEEN over het getal, niet over de hele rij: een klik
                      op het label zou anders de stand naar het minimum zetten (het element
                      springt native naar de klikpositie). Vaste breedte + 44 px hoog, zodat
                      het getal een echt raakvlak is. */}
                  <span className="relative flex min-h-11 min-w-[104px] shrink-0 items-center justify-end font-mono text-sm tabular-nums text-[var(--ink)]">
                    {item.formatValue(item.value)}
                    <input
                      ref={(el) => {
                        invoerRefs.current[item.key] = el
                      }}
                      type="range"
                      id={item.key}
                      min={item.bereik.min}
                      max={item.bereik.max}
                      step={item.bereik.stap}
                      value={item.value}
                      onChange={(e) => item.onChange(Number(e.target.value))}
                      aria-label={item.label}
                      aria-valuetext={`${item.formatValue(item.value)}, ${labZoneWoord(spaak.zone)}`}
                      aria-describedby={grensId}
                      aria-busy={pending || undefined}
                      className="slider-module slider-onzichtbaar absolute inset-0 h-full w-full"
                      {...rangeTouchSeekProps}
                    />
                  </span>
                </div>
                {item.detail && (
                  <p className="ml-4 font-mono text-[10px] leading-snug tabular-nums text-[var(--ink-3)]">
                    {item.detail}
                  </p>
                )}
                {/* De grensregel is er voor iedereen, maar staat in de legenda alleen in de
                    toegankelijkheidsboom: de figuur zégt al waar de grens ligt (het merk op
                    de spaak), en de regel twee keer neerzetten maakt de kolom onleesbaar. */}
                <span id={grensId} data-testid={`lab-vijfhoek-${item.key}-grens`} className="sr-only">
                  {spaak.grensRegel}
                </span>
              </li>
            )
          })}
        </ul>

        {/* Voetregel: welke lijn is wat. Twee lijnstijlen, geen kleurcodes — de plan-lijn
            draagt het module-accent, de gedekte grens inkt. */}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[10px] text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden="true" className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke="var(--module-active-500, var(--color-horizon-500))"
                strokeWidth={2}
              />
            </svg>
            {LAB_COPY.vijfhoekPlan}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden="true" className="shrink-0">
              <line x1="0" y1="3" x2="18" y2="3" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
            </svg>
            {LAB_COPY.vijfhoekGedekt}
          </span>
        </p>
      </div>
    </div>
  )
}
