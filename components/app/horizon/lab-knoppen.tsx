'use client'

/**
 * LabKnoppen — het doelscenario-blok onder de grafiek op /toekomst (ADR 0170).
 *
 * De vraag bovenaan, de uitkomst in één regel, de vijf knoppen met hun driekleurige schaal en
 * onderaan het ingeklapte blok met de rendement-aannames. Presentational: elk getal en elke
 * string komt geformatteerd binnen (de host kent de euro-weergave, de privacy-weergave en de
 * lab-uitkomst) — dit component rekent niets en deflateert niets.
 *
 * Wat hier VERVING: twee genummerde panelen ("Waar draai je aan?" / "Reikt je plan?"), de
 * driezone-marge-band met basis/verwacht/laatst-markers, de koppel-checkbox, de dekkingsbalk
 * met drie tegels, een uitleg-disclosure van drie alinea's en per knop een antwoordregel met
 * een "Reken hiermee"-knop. De grens staat nu op de knop zelf.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Kicker } from '@/components/editorial'
import { ChevronDown } from 'lucide-react'
import { LAB_COPY, HEFBOOM_COPY, labKnopGezetMelding, labZoneWoord } from '@/lib/horizon/anker-copy'
import {
  HEFBOOM_KEYS,
  HEFBOOM_RICHTING,
  zoneVanWaarde,
  type HefboomBereik,
  type HefboomGrenzen,
  type HefboomKey,
  type LabZone,
} from '@/lib/horizon/lab-grenzen-types'
import { KNOP_WEERGAVEN, type KnopWeergave } from '@/lib/horizon/toekomst-scenario'
import { LabHarp } from './lab-harp'
import { LabVijfhoek } from './lab-vijfhoek'
import { LabRad, type LabRadItem } from './lab-rad'
import { LabSlider } from './lab-slider'
import { LabWijzer } from './lab-wijzer'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/** De vraag als h2 of h3 — één plek, zodat er nooit een niveau wordt overgeslagen. */
function Kop({
  level,
  children,
  ...rest
}: { level: 'h2' | 'h3'; children: ReactNode } & React.HTMLAttributes<HTMLHeadingElement>) {
  return level === 'h2' ? <h2 {...rest}>{children}</h2> : <h3 {...rest}>{children}</h3>
}

/** Eén knop zoals de host hem levert. */
export interface LabKnopConfig {
  value: number
  /** De waarde waarmee het plan nu rekent ("nu"-notch). */
  basis: number
  bereik: HefboomBereik
  grenzen: HefboomGrenzen | null
  detail?: string | null
  onChange: (v: number) => void
}

/** De drie formatters per knop — elke knop heeft zijn eigen eenheid. */
export interface LabKnopFormatters {
  value: (v: number) => string
  delta?: (delta: number) => string
  grens: (v: number) => string
}

/**
 * De uitkomstregel, AL GEFORMATTEERD. Onder een vast stopmoment de drie grootheden die de
 * dekkingsbalk-tegels toonden; onder "zo vroeg als het kan" de vrijheidsleeftijd.
 */
export type LabUitkomstRegel =
  | { kind: 'dekking'; reikt: string; gedekt: string; eindvermogen: string | null }
  | { kind: 'vrijheidsleeftijd'; vrijOp: string; verschil: string }

export interface LabKnoppenProps {
  /** De vraag die het plan stelt ("Kun je op 62 stoppen?") — draagt de modus, geen systeemlabel. */
  vraag: string
  /**
   * Koppenniveau van de vraag. Default `h2`: op /toekomst is dit blok de EERSTE kop na de
   * sr-only h1 van de shell (de grafiekkaart draagt zelf geen kop, en `SectionLabel` is een
   * div). Een `h3` zou daar een niveau overslaan (ADR 0110). Staat het blok ooit ónder een
   * echte h2, geef dan `h3` mee.
   */
  level?: 'h2' | 'h3'
  /** Alleen de knoppen die hier staan worden getoond; een ontbrekende key is verborgen. */
  knoppen: Partial<Record<HefboomKey, LabKnopConfig>>
  /** Vervangt de nalatenschap-knop wanneer de eind-vorm er geen kent. */
  nalatenschapNotitie?: string | null
  uitkomst: LabUitkomstRegel | null
  /** Zone van de huidige stand; `null` = nog geen oordeel. */
  zone: LabZone | null
  /** Er loopt een herberekening van de grenzen. */
  pending?: boolean
  formatters: Record<HefboomKey, LabKnopFormatters>
  /** Slot onder de stop-knop — de plan-acties (TPR-09 / B-038). */
  stopSlot?: ReactNode
  /** Het ingeklapte blok met de rendement-aannames per categorie; `null` = geen blok. */
  marktbias?: ReactNode
  /**
   * In welke vorm de knoppen staan: als WIJZER (de standaard — de halfronde meter uit de
   * geldstroom-kaart, vijf naast elkaar), als BALK (breder, precieser af te lezen bij een
   * grens dicht bij je stand), als RAD (compact: één draairad kiest het onderwerp, ernaast
   * één balk — ~90 px hoog, voor de telefoon), als HARP (vijf stroken als één figuur met de
   * plan- en gedekt-lijn, mobiel) of als VIJFHOEK (pentagram met sleepbare hoekpunten, laptop).
   * Puur weergave: dezelfde grenzen, dezelfde standen, dezelfde bediening eronder.
   */
  weergave?: LabKnopWeergave
  /** Afwezig ⇒ geen schakelaar (de host bewaart de keuze niet). */
  onWeergaveChange?: (v: LabKnopWeergave) => void
}

/** De vormen waarin de knoppen kunnen staan — één lijst met de voorkeur (`KNOP_WEERGAVEN`). */
export type LabKnopWeergave = KnopWeergave

const WEERGAVE_VOLGORDE = KNOP_WEERGAVEN
const WEERGAVE_LABEL: Record<LabKnopWeergave, string> = {
  balk: LAB_COPY.weergaveBalk,
  wijzer: LAB_COPY.weergaveWijzer,
  rad: LAB_COPY.weergaveRad,
  harp: LAB_COPY.weergaveHarp,
  vijfhoek: LAB_COPY.weergaveVijfhoek,
}

/** Zelfde ladder als de segmenten op de knoppen (zie `lab-slider.tsx`). */
const ZONE_PILL: Record<LabZone, string> = {
  rood: 'bg-negative-bg text-score-bad',
  oranje: 'bg-warning-bg text-score-warn',
  groen: 'bg-positive-bg text-score-good',
}

const LABEL: Record<HefboomKey, string> = {
  verdienen: HEFBOOM_COPY.meerVerdienen,
  uitgeven: HEFBOOM_COPY.minderUitgeven,
  uitgaveNaPensioen: HEFBOOM_COPY.uitgaveNaPensioen,
  nalatenschap: HEFBOOM_COPY.nalatenschap,
  stop: HEFBOOM_COPY.stopleeftijd,
}

/** Eén cel van de uitkomstregel: kicker + waarde. */
function Uitkomst({ kicker, waarde, testId }: { kicker: string; waarde: string; testId: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-sans text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{kicker}</span>
      <span data-testid={testId} className="font-mono text-[12px] tabular-nums text-[var(--ink)]">
        {waarde}
      </span>
    </span>
  )
}

export function LabKnoppen({
  vraag,
  level = 'h2',
  weergave = 'wijzer',
  onWeergaveChange,
  knoppen,
  nalatenschapNotitie = null,
  uitkomst,
  zone,
  pending = false,
  formatters,
  stopSlot,
  marktbias,
}: LabKnoppenProps) {
  const isWijzer = weergave === 'wijzer'
  const isRad = weergave === 'rad'
  const [marktbiasOpen, setMarktbiasOpen] = useState(false)

  // Rad-vorm (B11): welk onderwerp de ene balk toont. Ephemeral — van onderwerp wisselen is
  // kijken, geen plan-keuze. Verdwijnt het gekozen onderwerp (nalatenschap onder een andere
  // eind-vorm), dan valt de keuze terug op het eerste dat er wél is.
  const [radKeuze, setRadKeuze] = useState<HefboomKey | null>(null)
  const beschikbaar = HEFBOOM_KEYS.filter((k) => knoppen[k] != null)
  const radActief: HefboomKey | null = radKeuze && knoppen[radKeuze] ? radKeuze : (beschikbaar[0] ?? null)
  // Het stoplichtpunt per onderwerp: dezelfde zone-afleiding als de knop zelf gebruikt, zodat
  // rad en balk nooit een andere kleur kunnen zeggen.
  const radItems: LabRadItem[] = beschikbaar.map((k) => ({
    key: k,
    label: LABEL[k],
    zone: zoneVanWaarde(knoppen[k]!.value, knoppen[k]!.grenzen, HEFBOOM_RICHTING[k]),
  }))

  /**
   * Eén item voor harp en vijfhoek: expliciet geplukt, geen spread. Een spread omzeilt de
   * excess-property-check en smokkelde `id` en een per-item `pending` mee die niemand leest —
   * precies de vorm waarin een toekomstig veld stil op de verkeerde plek landt.
   */
  const itemVoor = (k: HefboomKey) => {
    const knop = knoppen[k]!
    return {
      key: k,
      label: LABEL[k],
      value: knop.value,
      baseValue: knop.basis,
      bereik: knop.bereik,
      richting: HEFBOOM_RICHTING[k],
      grenzen: knop.grenzen,
      formatValue: formatters[k].value,
      formatGrens: formatters[k].grens,
      detail: knop.detail ?? null,
      onChange: knop.onChange,
    }
  }

  /** De props die balk en wijzer delen — één plek, ongeacht in welke vorm de knop staat. */
  const propsVoor = (key: HefboomKey, knop: LabKnopConfig) => ({
    id: key,
    label: LABEL[key],
    value: knop.value,
    baseValue: knop.basis,
    bereik: knop.bereik,
    richting: HEFBOOM_RICHTING[key],
    grenzen: knop.grenzen,
    pending,
    formatValue: formatters[key].value,
    formatGrens: formatters[key].grens,
    detail: knop.detail ?? null,
    onChange: knop.onChange,
  })
  // Eén gedeelde sr-only live-regio: de focus blijft op de knop, dus niets anders kondigt de
  // nieuwe stand aan. De teller als `key` laat een herhaalde beweging opnieuw voorlezen.
  const [melding, setMelding] = useState<{ tekst: string; n: number }>({ tekst: '', n: 0 })
  const vorigeStanden = useRef<Partial<Record<HefboomKey, string>>>({})
  useEffect(() => {
    for (const key of HEFBOOM_KEYS) {
      const knop = knoppen[key]
      if (!knop) continue
      const tekst = formatters[key].value(knop.value)
      const vorige = vorigeStanden.current[key]
      vorigeStanden.current[key] = tekst
      if (vorige !== undefined && vorige !== tekst) {
        setMelding((prev) => ({ tekst: labKnopGezetMelding(LABEL[key], tekst), n: prev.n + 1 }))
      }
    }
    // De standen zelf zijn de trigger; `formatters` is stabiel per render-cyclus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knoppen])

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Kicker>{LAB_COPY.kicker}</Kicker>
          <Kop
            level={level}
            className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {vraag}
          </Kop>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onWeergaveChange && (
            <div
              role="group"
              aria-label={LAB_COPY.weergaveLabel}
              data-testid="lab-weergave"
              className="inline-flex overflow-hidden border border-[var(--border-md)]"
            >
              {WEERGAVE_VOLGORDE.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onWeergaveChange(v)}
                  aria-pressed={weergave === v}
                  className={`min-h-[30px] px-2 font-sans text-[10px] font-medium transition-colors ${
                    weergave === v
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {WEERGAVE_LABEL[v]}
                </button>
              ))}
            </div>
          )}
          <span
            role="status"
            data-testid="lab-zone"
            className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.04em] ${
              zone ? ZONE_PILL[zone] : 'bg-[var(--subtle)] text-[var(--ink-3)]'
            }`}
          >
            {labZoneWoord(zone)}
          </span>
        </div>
      </div>

      {uitkomst && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {uitkomst.kind === 'dekking' ? (
            <>
              <Uitkomst kicker={LAB_COPY.uitkomstReikt} waarde={uitkomst.reikt} testId="lab-uitkomst-reikt" />
              <Uitkomst kicker={LAB_COPY.uitkomstGedekt} waarde={uitkomst.gedekt} testId="lab-uitkomst-gedekt" />
              {uitkomst.eindvermogen != null && (
                <Uitkomst
                  kicker={LAB_COPY.uitkomstEindvermogen}
                  waarde={uitkomst.eindvermogen}
                  testId="lab-uitkomst-eindvermogen"
                />
              )}
            </>
          ) : (
            <>
              <Uitkomst kicker={LAB_COPY.uitkomstVrijOp} waarde={uitkomst.vrijOp} testId="lab-uitkomst-vrij-op" />
              <Uitkomst
                kicker={LAB_COPY.uitkomstVerschil}
                waarde={uitkomst.verschil}
                testId="lab-uitkomst-verschil"
              />
            </>
          )}
        </div>
      )}

      {/* De legenda van de schaal — één regel, want de kleuren zijn op elke knop hetzelfde. */}
      <p className="mt-2 font-sans text-[11px] leading-snug text-[var(--ink-3)]">
        <span className="font-semibold text-score-bad">rood</span> {LAB_COPY.schaalRood} ·{' '}
        <span className="font-semibold text-score-warn">oranje</span> {LAB_COPY.schaalOranje} ·{' '}
        <span className="font-semibold text-score-good">groen</span> {LAB_COPY.schaalGroen}
      </p>

      {/* RAD (B11): één rij — links het draairad dat het onderwerp kiest, rechts de balk van
          dát onderwerp. De balk verbergt zijn eigen label: het rad ís het label. De
          nalatenschap-notitie hoort hier niet: een onderwerp dat er niet is, staat gewoon
          niet op het rad. */}
      {/* HARP (B12, mobiel): vijf stroken als één figuur — de plan-lijn door de duimen, de
          gedekt-lijn door de merken. Alle vijf blijven bedienbaar; de plan-acties hangen
          eronder, want de stop-strook is te smal voor twee tekstlinks. */}
      {/* VIJFHOEK (B12, laptop): één pentagram met sleepbare hoekpunten; de legenda draagt de
          echte inputs (fijnregeling + toetsenbord). Zelfde item-vorm als de harp. */}
      {weergave === 'vijfhoek' ? (
        <div className="mt-2">
          <LabVijfhoek
            pending={pending}
            items={beschikbaar.map(itemVoor)}
          />
        </div>
      ) : weergave === 'harp' ? (
        <div className="mt-2">
          <LabHarp
            pending={pending}
            items={beschikbaar.map(itemVoor)}
          />
        </div>
      ) : isRad && radActief ? (
        <div className="mt-2 flex items-center gap-4" data-testid="lab-rad-rij">
          <div className="w-[42%] max-w-[180px] shrink-0">
            <LabRad items={radItems} actief={radActief} onChange={setRadKeuze} pending={pending} />
          </div>
          <div className="min-w-0 flex-1">
            <LabSlider
              {...propsVoor(radActief, knoppen[radActief]!)}
              labelVerborgen
              formatDelta={formatters[radActief].delta}
            />
          </div>
        </div>
      ) : (
      /* De vijf knoppen naast elkaar. De WIJZERS zijn smal en vierkant, dus ze passen op een
          breed scherm alle vijf op één rij; op de telefoon twee per rij. De BALKEN hebben
          breedte nodig om hun schaal af te lezen — daar blijft het één kolom op de telefoon
          en twee vanaf tablet, met de stopleeftijd over de volle breedte omdat daar de
          plan-acties onder hangen. */
      <div
        className={`mt-2 grid gap-x-5 ${
          isWijzer ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-1 gap-x-6 sm:grid-cols-2'
        }`}
      >
        {HEFBOOM_KEYS.map((key) => {
          const knop = knoppen[key]
          const span = !isWijzer && key === 'stop' ? 'sm:col-span-2' : ''
          // Hairlines tussen de rijen, niet tussen de kolommen: een verticale scheiding
          // naast een halfronde meter leest als een kader om één knop. Staan alle vijf op
          // één rij, dan is er geen rij om te scheiden.
          const rand = isWijzer
            ? 'border-t border-dashed border-[var(--border-ed)] [&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(3)]:border-t-0 lg:border-t-0'
            : 'border-t border-dashed border-[var(--border-ed)] first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0'
          if (!knop) {
            // De nalatenschap-knop bestaat niet bij elke eind-vorm; zeg dát in plaats van
            // 'm stil weg te laten (de gebruiker zoekt anders naar een knop die er hoort).
            if (key === 'nalatenschap' && nalatenschapNotitie) {
              return (
                <p
                  key={key}
                  data-testid="lab-knop-nalatenschap-notitie"
                  className={`${rand} ${span} py-3 font-sans text-[11px] leading-snug text-[var(--ink-3)]`}
                >
                  {nalatenschapNotitie}
                </p>
              )
            }
            return null
          }
          const gedeeld = propsVoor(key, knop)
          // In wijzer-vorm is de cel te smal voor de plan-acties; die staan dan onder het
          // hele blok (zie hieronder) in plaats van geknepen onder één meter.
          const slot = !isWijzer && key === 'stop' && stopSlot ? <div className="mt-1">{stopSlot}</div> : null
          return (
            <div key={key} className={`${rand} ${span} min-w-0`}>
              {isWijzer ? (
                <LabWijzer {...gedeeld}>{slot}</LabWijzer>
              ) : (
                <LabSlider {...gedeeld} formatDelta={formatters[key].delta}>
                  {slot}
                </LabSlider>
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* In wijzer- en rad-vorm staan de plan-acties onder het blok: de cel van één meter is te
          smal voor twee tekstlinks, in rad-vorm is de stop-knop niet altijd in beeld, en ze
          gaan over het plan als geheel — niet over die ene knop. */}
      {weergave === 'balk' ? null : stopSlot && (
        <div className="mt-1 border-t border-dashed border-[var(--border-ed)] pt-2">{stopSlot}</div>
      )}

      {marktbias && (
        <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
          <button
            type="button"
            onClick={() => setMarktbiasOpen((prev) => !prev)}
            aria-expanded={marktbiasOpen}
            className="flex min-h-11 items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            {LAB_COPY.marktbiasTitel}
            <ChevronDown
              aria-hidden
              className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
                marktbiasOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {marktbiasOpen && <div className="mt-2">{marktbias}</div>}
        </div>
      )}

      <p aria-live="polite" className="sr-only" data-testid="lab-knop-melding">
        {melding.tekst !== '' && <span key={melding.n}>{melding.tekst}</span>}
      </p>
    </div>
  )
}
