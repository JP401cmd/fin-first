'use client'

/**
 * Vrijheidsas — de "wanneer kun je stoppen, en hoe stevig is dat?"-blok (mockup-blok ⑤
 * van de wat-als-scenariolaag op /toekomst). Presentational, props-only; alle cijfers
 * komen berekend binnen (consume, niet herrekenen — de FIRE-leeftijden en marge worden
 * in horizon-client uit de scenario-run/`computeStopMarge` afgeleid).
 *
 * Opzet (twee vragen, netjes gescheiden — grid-cols-1 sm:grid-cols-2, mobiel gestapeld):
 *   LINKS  "Wanneer kun je stoppen? — de streep": de draaiknoppen + rendement-per-groep
 *          (via de `draaiknoppen`-slot uit horizon-client).
 *   RECHTS "Hoe stevig is dat? — de marge": de gewenste-stopleeftijd-regel (zie hieronder)
 *          + slider + driezone-band waarop je de héle reis afleest — basis → verwacht →
 *          laatst als markers, de stop-marker als jouw ambitie, en de marge als overspanning
 *          tussen verwacht en stop (bracket + zone-woord) + de onzekerheidszin.
 *   ONDER  volle-breedte cijferrij met de drie grootheden (Basis-vrijheid / Verwacht vrij /
 *          Geambieerde vrijheid). Dit is de énige Figure-gestileerde plek voor de leeftijd-
 *          en marge-getallen; de band toont het marge-getal daarnaast als ruimtelijk
 *          bracket-label (datalabel op de visualisatie, geen tweede figure).
 *
 * Stopleeftijd-regel (één regel, drie grootheden naast elkaar):
 *   `Gewenste stopleeftijd  |  {stop} · verwacht {berekende leeftijd} · {X mnd eerder/later vrij}`
 *   — de gekozen stopleeftijd (jouw ambitie), de BEREKENDE leeftijd (in de app-woordenlijst
 *   consequent "verwacht": dezelfde grootheid als de verwacht-tick op de band eronder) en de
 *   afwijking t.o.v. de basislijn ("nu"). De afwijking staat hiér — en dus bewust NIET óók
 *   als sub onder de cijferrij: één duiding, op de plek waar je je keuze maakt.
 *
 * Twee gezichten van sectie 2 (spec lab-haalbaarheid §1, 15 sep 2026): zonder vast anker
 * (solved) is het de marge hierboven; onder een vast anker mét `dekking` is het de
 * DEKKINGSAS ("Reikt je plan?" — slider "Doorwerken tot" + `Dekkingsbalk` met de tegels
 * Reikt tot · Plan tot · Gedekt), zonder marge-band, koppel-checkbox of FIRE-cijferrij.
 *
 * Kleur-conventie:
 *   - module-identiteit (paneel-badges, stop-slider, accentwaarden) via horizon-tokens;
 *   - de driezone-marge-band + marge-bracket (tekort · krap · stevig) in STOPLICHT-status
 *     (red/amber/emerald), nooit het module-accent.
 */

import type { ReactNode } from 'react'
import type { StopMargeZone } from '@/lib/horizon/stop-marge'
import { resolveVoorzichtigeRand, TERUGVAL_RAND_JAREN } from '@/lib/horizon/stop-marge'
import { InlineInfoDisclosure } from '@/components/editorial'
import { rangeTouchSeekProps } from '@/lib/range-touch-seek'
import { DEKKINGSAS_COPY, HEFBOOM_COPY } from '@/lib/horizon/anker-copy'
import { Dekkingsbalk, type DekkingsasData } from './dekkingsbalk'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

// ── Pure koppel-helper (getest) ──────────────────────────────────────────────

/**
 * Nieuwe stopleeftijd wanneer de "schuift mee"-koppeling aan staat: de stop volgt de
 * verwacht-FIRE zó dat de vastgehouden marge (`lockedMarge`) constant blijft. Afgerond
 * op de slider-stap (0,5). `verwacht === null` (onbereikbaar) ⇒ null (koppel inert).
 */
export function computeCoupledStopAge(
  verwacht: number | null,
  lockedMarge: number,
  step = 0.5,
): number | null {
  if (verwacht === null) return null
  const raw = verwacht + lockedMarge
  return Math.round(raw / step) * step
}

// ── deltaLabel-conventie (vrijheidstijd-delta: "X mnd eerder/later vrij") ────
// De beslishulp waar deze conventie ooit uit gespiegeld werd, verviel met ADR 0144;
// deze helper is nu zelf de bron.

type DeltaTone = 'earlier' | 'later' | 'flat' | 'none'

/** Maandelijkse FIRE-delta → editorial vrijheidstijd-label + toon. */
export function fireDeltaLabel(
  deltaMonths: number | null,
  reachable: boolean,
): { text: string; tone: DeltaTone } {
  if (!reachable || deltaMonths === null) return { text: 'onbereikbaar', tone: 'none' }
  if (Math.abs(deltaMonths) < 1) return { text: 'vrijheidsdatum gelijk', tone: 'flat' }
  if (deltaMonths < 0) return { text: `${Math.abs(deltaMonths)} mnd eerder vrij`, tone: 'earlier' }
  return { text: `${deltaMonths} mnd later vrij`, tone: 'later' }
}

const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  earlier: 'text-horizon-700',
  later: 'text-kern-700',
  flat: 'text-[var(--ink-3)]',
  none: 'text-[var(--ink-3)]',
}

const ZONE_TEXT: Record<StopMargeZone, string> = {
  tekort: 'text-red-700',
  krap: 'text-amber-700',
  stevig: 'text-emerald-700',
}

/** Border-tint voor de marge-bracket, in dezelfde stoplicht-familie als de band-vlakken. */
const ZONE_BORDER: Record<StopMargeZone, string> = {
  tekort: 'border-red-400',
  krap: 'border-amber-400',
  stevig: 'border-emerald-400',
}

/** Eén korte duidende zin per zone (mockup-toon), getoond onder de band. */
const ZONE_NOTE: Record<StopMargeZone, string> = {
  tekort: 'je stopt vóór de streep — dit plan komt geld tekort',
  krap: 'na de streep, maar niet voorzichtig gerekend gedekt — houdbaar, maar dun',
  stevig: 'ruim voorbij de voorzichtige rand — robuust',
}

/**
 * 'stevig'-zin wanneer de voorzichtige rand een TERUGVAL is (`laatst = null`, rand op
 * verwacht + TERUGVAL_RAND_JAREN): geen "voorzichtige rand"-claim voeren voor een rand
 * die niet bestaat — dat was precies het vals-groen-bezwaar. Houdbaarheid beloven mag wél.
 */
const STEVIG_TERUGVAL_NOTE = 'ruim na de streep — ook met flinke tegenwind houdbaar'

// ── Marge-eenheid-helper (getest) ─────────────────────────────────────────────

/**
 * Signed marge-weergave met adaptieve eenheid: |marge| < 1 jaar → maanden
 * ("+8 mnd" / "−4 mnd"), anders 1-decimaal jaren ("+2,5 jr" / "−1,0 jr").
 * Gebruikt overal waar het marge-getal staat (cijferrij + bracket + aria-valuetext), zodat
 * kleine marges niet als "+0,1 jr" verdwijnen. `−` = U+2212 (typografische min).
 */
export function formatMargeShort(margeJaren: number): string {
  const sign = margeJaren < 0 ? '−' : '+'
  const abs = Math.abs(margeJaren)
  if (abs < 1) return `${sign}${Math.round(abs * 12)} mnd`
  return `${sign}${abs.toFixed(1).replace('.', ',')} jr`
}

// ── Driezone-marge-band-breedtes (getest) ─────────────────────────────────────

/**
 * Minimale amber-buffer-breedte (percentpunten van de as-span). De marge-band (rood ·
 * amber · groen) krijgt een strakke, vaste amber-zone rond de verwacht-streep zodat de
 * VERWACHT- en LAATST-labels nóóit samenvallen — óók niet wanneer de scenario-randen
 * (bijna) op elkaar liggen (bv. vroegst≈laatst≈verwacht). Puur visueel: de zone-
 * classificatie én de marge komen onveranderd uit `computeStopMarge`.
 */
export const MARGE_BAND_MIN_AMBER_PCT = 6

/**
 * Rood/amber/groen-grenzen (in % van de as-span) voor de driezone-marge-band.
 * - rood loopt tot de verwacht-streep;
 * - amber (de buffer) van verwacht tot de voorzichtige rand, maar minstens
 *   `minAmberPct` breed zodat de labels op de rand van amber altijd van elkaar liggen;
 * - groen vult de rest.
 * De voorzichtige rand komt stroomopwaarts uit `resolveVoorzichtigeRand` (stop-marge.ts):
 * de echte laatst-leeftijd, of de terugval-rand verwacht + TERUGVAL_RAND_JAREN wanneer de
 * voorzichtige variant het doel nooit haalt — dezelfde rand als de zone-classificatie,
 * zodat band en zone-woord niet kunnen drijven. Krijgt deze functie tóch `laatstPct = null`
 * binnen (defensief pad), dan loopt amber door tot het einde — geen groen verzinnen.
 * `verwachtPct`/`laatstPct` zijn al posities (0–100) — hier wordt niets aan de FIRE-
 * leeftijden of marge herrekend.
 */
export function computeMargeBandPct(
  verwachtPct: number,
  laatstPct: number | null,
  minAmberPct = MARGE_BAND_MIN_AMBER_PCT,
): { amberStartPct: number; amberEndPct: number } {
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  const start = clamp(verwachtPct)
  if (laatstPct == null) return { amberStartPct: start, amberEndPct: 100 }
  const end = clamp(Math.max(clamp(laatstPct), start + minAmberPct))
  return { amberStartPct: start, amberEndPct: end }
}

/**
 * Minimale afstand (percentpunten) die de basis-marker van de verwacht-streep moet
 * houden om apart getoond te worden. Ligt de basis er dichterbij (bv. zonder actief
 * scenario, waar basis == verwacht), dan valt-ie samen met verwacht → weglaten.
 * Ondergrens = LABEL_WIDTH_PCT + halve "basis"-labelbreedte: het rechts-uitgelijnde
 * verwacht-label beslaat ~9pp links van de streep, dus een kleinere gap laat de
 * gecentreerde basis-tekst daar dwars doorheen lopen.
 */
export const BASIS_MARKER_MIN_GAP_PCT = 12

/**
 * Houd een zwevend (gecentreerd, nowrap) band-label binnen het band-vlak: bij extreme
 * slider-standen (stop op de as-rand) zou het label anders buiten beeld knippen of het
 * buurpaneel inlopen. `margin` = halve labelbreedte in percentpunten van de as-span.
 */
export function clampLabelPct(pct: number, margin: number): number {
  return Math.max(margin, Math.min(100 - margin, pct))
}

/**
 * Benaderde breedte (percentpunten van de as-span) van de VERWACHT/LAATST-band-labels.
 * Ondergrens voor het rechts-uitgelijnde verwacht-label: zit de amber-zone tegen de
 * linkerrand van de as (extreme slider-stand), dan schuift het label net genoeg naar
 * rechts om binnen het vlak te blijven; laatst schuift dan mee zodat ze nooit botsen.
 */
export const LABEL_WIDTH_PCT = 9

/** Halve breedte (pp) van het marge-bracket-label ("marge +X jr · zone", gecentreerd). */
const MARGE_LABEL_CLAMP_PCT = 11
/** Halve breedte (pp) van het "verkenning X"-label (gecentreerd boven de band). */
const STOP_LABEL_CLAMP_PCT = 9
/** Halve breedte (pp) van het "basis"-label (gecentreerd onder de band). */
const BASIS_LABEL_CLAMP_PCT = 4

// ── Props ────────────────────────────────────────────────────────────────────

export interface VrijheidsasProps {
  /** Huidige leeftijd (as-start). */
  currentAge: number
  /** FIRE-uitkomst van de BASISLIJN (fractioneel); null = onbereikbaar. */
  baseFireAge: number | null
  /** FIRE-uitkomst van het ACTIEVE pad (scenario indien actief, anders basis). */
  verwachtFireAge: number | null
  /** FIRE-uitkomst van de VOORZICHTIGE variant van het actieve pad; null = nooit bereikt.
   *  Vormt samen met `vroegstFireAgeFractional` de "band" van de verwachting (laatst = rand). */
  laatstFireAge: number | null
  /** FIRE-uitkomst van de OPTIMISTISCHE variant (+2 pp-rendement) — de vroegste rand van de
   *  verwachtingsband. Samen met `laatstFireAge` voedt dit de onzekerheidszin. Optioneel. */
  vroegstFireAgeFractional?: number | null
  /** Actief scenario aanwezig? Zonder scenario geen wat-als-accent/delta. */
  hasScenario: boolean
  /** Gekozen (effectieve) stopleeftijd — altijd een concreet getal (parent levert default). */
  stopAge: number
  onStopAgeChange: (v: number) => void
  /** Koppelmodus: stopkeuze schuift mee met de verwacht-streep (marge blijft gelijk). */
  stopKoppel: boolean
  onStopKoppelChange: (v: boolean) => void
  /** Driezone-status van de marge (uit `computeStopMarge`). */
  zone: StopMargeZone | null
  /** stopAge − verwacht (jaren); null = verwacht onbereikbaar. */
  margeJaren: number | null
  /** Er is een doel vastgelegd — toont de doel-i-zin onder de kop. */
  doelActief?: boolean
  /**
   * ADR 0127 — eindstrategie 'Nu stoppen': het stopmoment is dan een INSTELLING
   * (vandaag), geen schuif. De rechterhelft ("Hoe stevig is dat?" — stop-slider,
   * marge-band, koppel-checkbox) verdwijnt dan, net als de cijferrij die drie
   * FIRE-leeftijden toont die onder dit anker alle drie de huidige leeftijd zijn.
   * Twee schuiven die hetzelfde besturen is een bug in de maak; twee getallen die
   * hetzelfde zeggen ook.
   *
   * De draaiknoppen (wat-als) blijven staan — die veranderen het plan, niet het
   * stopmoment.
   */
  stopKeuzeVerborgen?: boolean
  /** Vervangende duiding op de plek van de stopkeuze (alleen bij `stopKeuzeVerborgen`). */
  stopKeuzeNotitie?: ReactNode
  /** Linker-vlak-inhoud (draaiknoppen + rendement-per-groep) uit horizon-client. */
  draaiknoppen?: ReactNode
  /**
   * ADR 0129 F3b — het plan heeft een VAST stopmoment (aow/age). De slider is dan een
   * VERKENNING tegen het plan (default = `planStopAge`); verkennen is nooit destructief.
   * Het plan verandert alleen via `onMaakPlan` (TPR-09: bevestiging, dan het VOLLEDIGE
   * plan) of via de plan-keuzes (`onKeuzesOpenen`) — zie die props. Mét `dekking`
   * wordt sectie 2 de dekkingsas (reikt het plan tot de eindleeftijd?) i.p.v. de marge.
   */
  ankerVast?: boolean
  /**
   * ADR 0145 — de UITKOMST van het plan onder een vast stopmoment (dekking: reikt het,
   * voor hoeveel procent, valt er iets vast te leggen). Alleen gerenderd bij `ankerVast`
   * met zichtbare stopkeuze; de parent levert de zin (`dekkingAsNotitie`).
   */
  uitkomstNotitie?: ReactNode
  /**
   * Spec lab-haalbaarheid §1 (15 sep 2026): onder een vast anker is sectie 2 de
   * DEKKINGSAS — schaal stop→eind, slider "Doorwerken tot", tegels Reikt tot · Plan tot ·
   * Gedekt. Geen marge-band/verwacht-streep/koppel-checkbox/FIRE-tegels: die meten een
   * grootheid die de gebruiker onder een vast anker niet gekozen heeft. `null` ⇒ het
   * solved-gezicht (ongewijzigd).
   */
  dekking?: DekkingsasData | null
  /** Het stopmoment van het plan (fractioneel) — de referentie voor "nu rekent het met stoppen op …". */
  planStopAge?: number | null
  /**
   * AOW-leeftijd (fractioneel) uit de gebruikerstabel. Voedde tot melding B-038 de
   * snelkoppeling "Op AOW-leeftijd"; sinds die knop weg is bepaalt hij alleen nog
   * mee hoe ver de as loopt (zie `candidates`), zodat de AOW binnen bereik blijft.
   */
  aowAge?: number | null
  /**
   * Opent de plek waar het stopmoment én de andere plan-keuzes staan (de
   * strategie-modal op /toekomst). Melding B-038: hier stonden twee knoppen —
   * "Op AOW-leeftijd" (zette alleen de slider) en "Maak dit mijn plan" (zette
   * alléén het stop-anker vast). Samen suggereerden ze dat dít de plek was om
   * je stopmoment te kiezen, terwijl ze maar twee van de vijf keuzes raakten:
   * AOW-of-een-leeftijd, en verder niets over eindleeftijd, eind-vorm of
   * nalatenschap. Eén verwijzing naar de plek waar álle keuzes staan is
   * eerlijker dan twee snelknoppen die de rest onzichtbaar laten.
   */
  onKeuzesOpenen?: () => void
  /**
   * TPR-09 (eigenaarsbesluit 13 sep 2026) — "Maak dit mijn plan": de verkende
   * stopleeftijd wordt het plan-anker (`fire_stop_anchor = 'age'`). Twee
   * stopleeftijden stonden naast elkaar zonder dat de UI zei welke wat doet: de
   * scenario-marker (alleen de lijn hier) en het plan-anker (de hele app).
   *
   * Waarom dit níet de B-038-knop terugbrengt: die schreef een HALF plan (alleen
   * het anker) en stond naast een AOW-snelknop. Deze CTA (a) schrijft via de
   * consumer het VOLLEDIGE plan (`planDraftToFireSettingsBody`, route-contract R3),
   * (b) draagt vóór de klik keuze · effect · waarom en vraagt een bevestiging, en
   * (c) staat náást de verwijzing naar de plan-keuzes, niet in plaats ervan. De
   * eindleeftijd, eind-vorm en nalatenschap blijven wat ze zijn — en dát staat er.
   * Afwezig ⇒ geen knop (alleen de verwijzing).
   */
  onMaakPlan?: (stopAge: number) => void
  /** PUT in-flight — blokkeert de knop. */
  maakPlanBusy?: boolean
  /** De verkende leeftijd IS al het plan-anker (`age` op exact deze leeftijd) → knop inert. */
  planIsDezeStop?: boolean
}

/**
 * Leeftijd-formatter van de cijferrij ("52,1", "54"). Geëxporteerd zodat de
 * ingeklapte KATERN II-samenvatting in horizon-client exact dezelfde weergave
 * gebruikt als de Figure-drieslag hieronder (één bron, geen drift).
 */
export function formatAge(v: number | null): string {
  if (v === null) return '—'
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

export function Vrijheidsas({
  currentAge,
  baseFireAge,
  verwachtFireAge,
  laatstFireAge,
  vroegstFireAgeFractional = null,
  hasScenario,
  stopAge,
  onStopAgeChange,
  stopKoppel,
  onStopKoppelChange,
  zone,
  margeJaren,
  doelActief = false,
  stopKeuzeVerborgen = false,
  stopKeuzeNotitie,
  draaiknoppen,
  ankerVast = false,
  uitkomstNotitie = null,
  dekking = null,
  planStopAge = null,
  aowAge = null,
  onKeuzesOpenen,
  onMaakPlan,
  maakPlanBusy = false,
  planIsDezeStop = false,
}: VrijheidsasProps) {
  // ── As-schaal (jaren, lineair, min-span 20 jr) — enkel voor de marge-band-posities ──
  const minAge = Math.floor(currentAge)
  const candidates = [baseFireAge, verwachtFireAge, laatstFireAge, stopAge, aowAge].filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  const rawMax = (candidates.length ? Math.max(...candidates) : minAge + 20) + 3
  const maxAge = Math.max(rawMax, minAge + 20)
  const span = maxAge - minAge || 1
  const posOf = (v: number) => Math.max(0, Math.min(100, ((v - minAge) / span) * 100))

  const reachable = verwachtFireAge !== null
  const deltaMonths =
    verwachtFireAge !== null && baseFireAge !== null
      ? Math.round((verwachtFireAge - baseFireAge) * 12)
      : null
  const delta = fireDeltaLabel(deltaMonths, reachable)

  // De afwijking-t.o.v.-de-basislijn hoort op de stopleeftijd-regel; zonder actief scenario
  // (of bij een onbereikbare verwacht-FIRE) is er geen zinnige duiding om te tonen.
  const showStopDelta = hasScenario && reachable && delta.tone !== 'none'

  // Marge-band-grenzen (rood/amber/groen), met strakke amber-buffer rond de verwacht-streep.
  // De rand komt uit resolveVoorzichtigeRand — echte laatst-leeftijd, of de terugval-rand
  // (verwacht + TERUGVAL_RAND_JAREN) wanneer de voorzichtige variant het doel nooit haalt.
  const verwachtPos = verwachtFireAge !== null ? posOf(verwachtFireAge) : null
  const voorzichtigeRand = resolveVoorzichtigeRand(verwachtFireAge, laatstFireAge)
  const bandLaatstPct = voorzichtigeRand !== null ? posOf(voorzichtigeRand) : null
  const band =
    reachable && verwachtPos !== null
      ? computeMargeBandPct(verwachtPos, bandLaatstPct)
      : null

  const stopPos = posOf(stopAge)

  // Basis-marker op de band — alleen als de basis merkbaar los ligt van de verwacht-streep
  // (anders vallen ze samen, bv. zonder actief scenario).
  const basisPos = baseFireAge !== null ? posOf(baseFireAge) : null
  const showBasisMarker =
    reachable &&
    basisPos !== null &&
    verwachtPos !== null &&
    Math.abs(basisPos - verwachtPos) >= BASIS_MARKER_MIN_GAP_PCT

  // Marge als overspanning: bracket tussen de verwacht-streep en de stop-marker.
  const showMargeBracket = reachable && verwachtPos !== null && margeJaren !== null
  const margeSpanLeft = verwachtPos !== null ? Math.min(stopPos, verwachtPos) : stopPos
  const margeSpanWidth = verwachtPos !== null ? Math.abs(stopPos - verwachtPos) : 0
  const margeSpanMid = verwachtPos !== null ? (stopPos + verwachtPos) / 2 : stopPos
  const margeBracketLabel =
    margeJaren !== null ? `marge ${formatMargeShort(margeJaren)}${zone ? ` · ${zone}` : ''}` : ''

  const margeText =
    margeJaren === null ? 'marge onbekend' : `marge ${formatMargeShort(margeJaren)}`

  // Gewone-taal-onzekerheidszin (zichtbaar zodra de band-randen bekend zijn). Consumeert
  // exact dezelfde vroegst/laatst-waarden als de band — niets herrekend. Degeneratie-guard:
  // vallen vroegst en laatst na afronding samen, dan is "tussen X en Y" betekenisloos →
  // enkelvoudige formulering ("rond de X").
  const onzekerheid =
    vroegstFireAgeFractional != null &&
    Number.isFinite(vroegstFireAgeFractional) &&
    laatstFireAge !== null
      ? {
          vroegst: formatAge(Math.round(vroegstFireAgeFractional * 2) / 2),
          laatst: formatAge(Math.round(laatstFireAge * 2) / 2),
        }
      : null
  const onzekerheidDegenereert = onzekerheid !== null && onzekerheid.vroegst === onzekerheid.laatst

  // Het stopmoment van het plan, op halve jaren — de referentie in de intro
  // ("nu rekent het met stoppen op …"). `aowAge` voedt alleen nog het bereik van
  // de as (zie `candidates` hierboven); de AOW-snelknop is met B-038 vervallen.
  const planStopHalf = planStopAge != null && Number.isFinite(planStopAge) ? Math.round(planStopAge * 2) / 2 : null
  // Verwijzing naar de plek waar de plan-keuzes staan (B-038). Onder het
  // nu-anker is er geen stopkeuze om naartoe te wijzen: de sectie toont daar
  // geen schuif, dus ook geen "waar stel ik dit in?"-vraag.
  const toonKeuzesLink = onKeuzesOpenen != null && !stopKeuzeVerborgen
  // TPR-09 — de verkenning tot plan maken. Alleen wanneer de consumer het schrijfpad
  // aanbiedt; onder het nu-anker is er geen schuif en dus niets te verankeren.
  const toonMaakPlan = onMaakPlan != null && !stopKeuzeVerborgen
  // Spec lab-haalbaarheid §1 — onder een vast anker (mét dekking-data) is sectie 2 de
  // dekkingsas. Onder het nu-anker blijft die sectie dan staan (zonder slider): de balk
  // toont hoe ver het plan reikt.
  const dekkingsas = ankerVast && dekking != null
  const toonSectie2 = !stopKeuzeVerborgen || dekkingsas

  return (
    <div>
      {/* i-uitleg (patroon LevensinkomenStrook/Dekkingsradar) */}
      <InlineInfoDisclosure label="Uitleg vrijheidsas">
        <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
          {stopKeuzeVerborgen ? 'Zo lees je deze sectie' : 'Zo lees je deze twee vragen'}
        </div>
        {stopKeuzeVerborgen ? (
          <p className="m-0">
            Je plan rekent alsof je <b className="text-[var(--ink)]">nu</b> stopt: het stopmoment
            is vastgezet op vandaag. Er is hier dus geen stopkeuze en geen marge tot een streep —
            de vraag is hoe ver je liquide vermogen reikt. Aan de knoppen hieronder verander je je
            aannames (inkomen, sparen, rendement) en zie je dat bereik meebewegen.
          </p>
        ) : (
        <>
        <p className="m-0">
          <b className="text-[var(--ink)]">Links</b> bepaal je wanneer je vrij kúnt zijn — de{' '}
          <b className="text-[var(--ink)]">streep</b>, een uitkomst van je aannames en gedrag.{' '}
          <b className="text-[var(--ink)]">Rechts</b> kies je wanneer je zélf wilt stoppen; de afstand
          tot je streep is je <b className="text-[var(--ink)]">marge</b>.{' '}
          <b className="text-red-700">Rood</b> — je wilt stoppen vóór je vrij bent.{' '}
          <b className="text-amber-700">Amber</b> — haalbaar op de verwachting, maar niet in een
          voorzichtig scenario. <b className="text-emerald-700">Groen</b> — ook voorzichtig gerekend
          gedekt, of ten minste {TERUGVAL_RAND_JAREN} jaar voorbij de streep.
        </p>
        <p className="m-0 mt-2">
          Op de <b className="text-[var(--ink)]">band</b> lees je de hele reis af:{' '}
          <b className="text-[var(--ink)]">basis</b> → <b className="text-[var(--ink)]">verwacht</b> →{' '}
          <b className="text-[var(--ink)]">laatst</b> zijn de FIRE-leeftijden (van je basislijn, je
          actieve pad en de voorzichtige variant). De <b className="text-[var(--ink)]">stop-marker</b> is
          jouw <b className="text-[var(--ink)]">verkenning</b> — een stopleeftijd die je hier uitprobeert
          en die alleen deze lijn verschuift; je plan verandert pas als je hem tot je plan maakt. De{' '}
          <b className="text-[var(--ink)]">marge</b> is de overspanning tussen verwacht en stop.
        </p>
        </>
        )}
        {doelActief && !stopKeuzeVerborgen && (
          <p className="m-0 mt-2">
            Dit is je <b className="text-[var(--ink)]">vastgelegde doel</b>.
          </p>
        )}
      </InlineInfoDisclosure>

      {/* Intro — de twee vragen, netjes gescheiden */}
      <p className="mt-3 font-sans text-[12px] leading-snug text-[var(--ink-3)]">
        {stopKeuzeVerborgen ? (
          <>
            Je stopmoment ligt vast op <b className="font-semibold text-[var(--ink-2)]">vandaag</b> — dat
            volgt uit je plan, niet uit een schuif. Hieronder draai je aan je aannames.
          </>
        ) : ankerVast ? (
          // ADR 0129 — vast anker: de slider verkent, het plan blijft staan.
          // "…pas als je het vastzet" verwees naar de CTA die met B-038 verviel;
          // wijzen naar een knop die er niet meer is, is erger dan geen zin.
          <>
            Verken een ander stopmoment. Je plan verandert er niet van
            {planStopHalf !== null && (
              <> — nu rekent het met stoppen op <b className="font-semibold text-[var(--ink-2)]">{formatAge(planStopHalf)}</b></>
            )}
            .
          </>
        ) : (
          <>
            Links bepaal je <b className="font-semibold text-[var(--ink-2)]">wanneer je vrij kúnt zijn</b> —
            de streep. Rechts kies je <b className="font-semibold text-[var(--ink-2)]">wanneer je stopt</b>;
            het verschil is je marge.
          </>
        )}
      </p>

      {/* ── Twee vlakken naast elkaar (mobiel gestapeld) ── */}
      <div
        className={`mt-4 grid grid-cols-1 gap-6 sm:gap-5 ${toonSectie2 ? 'sm:grid-cols-2' : ''}`}
      >
        {/* LINKS — Wanneer kun je stoppen? (de streep) */}
        <section
          className={`min-w-0 ${toonSectie2 ? 'sm:border-r sm:border-[var(--border-ed)] sm:pr-5' : ''}`}
        >
          {stopKeuzeVerborgen || ankerVast ? (
            <PanelHeader num="1" title="Waar draai je aan?" tag="je aannames" />
          ) : (
            <PanelHeader num="1" title="Wanneer kun je stoppen?" tag="de streep" />
          )}
          {stopKeuzeVerborgen && stopKeuzeNotitie && (
            <div className="mt-3">{stopKeuzeNotitie}</div>
          )}
          {ankerVast && !stopKeuzeVerborgen && uitkomstNotitie && (
            <div className="mt-3">{uitkomstNotitie}</div>
          )}

          {draaiknoppen && <div className="mt-4 space-y-5">{draaiknoppen}</div>}
        </section>

        {/* RECHTS — Hoe stevig is dat? (de marge). Verborgen onder 'Nu stoppen'
            (ADR 0127): het stopmoment is daar een instelling, geen schuif — behalve als
            dekkingsas (spec lab-haalbaarheid §1): dan blijft de balk, zonder slider. */}
        {toonSectie2 && (
        <section className="min-w-0">
          <PanelHeader
            num="2"
            title={dekkingsas ? DEKKINGSAS_COPY.kop : ankerVast ? 'Kun je dan stoppen?' : 'Hoe stevig is dat?'}
            tag={dekkingsas ? DEKKINGSAS_COPY.tag : 'de marge'}
          />

          {!stopKeuzeVerborgen && (
          <>
          {/* Gewenste stopleeftijd · berekende (verwacht-)leeftijd · afwijking t.o.v. de
              basislijn — alle drie op ÉÉN regel, zodat je je ambitie, de uitkomst en het
              effect van je wat-als in één oogopslag naast elkaar leest. De duiding staat
              hier en niet (meer) óók als sub in de cijferrij. Wrapt pas op zeer smalle
              schermen; de gekozen leeftijd blijft dan de eerste, zwaarste waarde. */}
          <div className="mt-4 mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {dekkingsas ? DEKKINGSAS_COPY.sliderLabel : 'Gewenste stopleeftijd'}
            </span>
            {/* TPR-09 — de marker is een VERKENNING, geen plan: dat staat er nu bij. */}
            <span className="rounded-full border border-horizon-300 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-horizon-700">
              verkenning
            </span>
            <span className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
              <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatAge(stopAge)}
              </span>
              {!dekkingsas && verwachtFireAge !== null && (
                <>
                  <span aria-hidden className="font-mono text-[10px] text-[var(--ink-4)]">
                    ·
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                    verwacht {formatAge(verwachtFireAge)}
                  </span>
                </>
              )}
              {!dekkingsas && showStopDelta && (
                <>
                  <span aria-hidden className="font-mono text-[10px] text-[var(--ink-4)]">
                    ·
                  </span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${DELTA_TONE_CLASS[delta.tone]}`}
                  >
                    {delta.text}
                  </span>
                </>
              )}
            </span>
          </div>

          <input
            type="range"
            min={minAge}
            max={maxAge}
            step={0.5}
            value={stopAge}
            onChange={e => onStopAgeChange(Number(e.target.value))}
            className="slider-module w-full"
            {...rangeTouchSeekProps}
            aria-label={dekkingsas ? DEKKINGSAS_COPY.sliderLabel : 'Gewenste stopleeftijd'}
            aria-valuetext={
              dekkingsas
                ? `${formatAge(stopAge)} jaar`
                : `${formatAge(stopAge)} jaar${
                    margeJaren !== null
                      ? `, marge ${formatMargeShort(margeJaren)}${zone ? ` (${zone})` : ''}`
                      : ''
                  }`
            }
          />

          {/* Verkenning vs. plan (TPR-09, bovenop melding B-038).
              B-038 haalde hier twee snelknoppen weg — "Op AOW-leeftijd" (zette
              alleen de slider) en een "Maak dit mijn plan" dat alléén het
              stop-anker schreef en zo een half plan achterliet — en zette er één
              verwijzing naar de volledige plan-keuzes voor in de plaats. Wat
              overbleef was het omgekeerde gat: twee stopleeftijden op het scherm
              (de marker hier, het anker in het plan) zonder dat de UI zei welke wat
              doet. Daarom nu, in gewone taal: welke keuze je maakt · wat het effect
              is · waarom het relevant is — plus één knop die de verkenning tot plan
              maakt via het VOLLEDIGE plan (consumer: planDraftToFireSettingsBody),
              náást de verwijzing naar de plek waar de rest van het plan staat. */}
          {(toonKeuzesLink || toonMaakPlan) && (
            // Tekst en acties op één linkerlijn, de acties op een EIGEN regel — zelfde
            // recept als het meta-blok op /overzicht/bezittingen. Bewust niet
            // inline in de zin: het tapdoel van 44px rekt dan de regelhoogte van
            // precies die ene tekstregel op, wat de alinea scheef laat ogen.
            <div className="mt-2 flex flex-col items-start">
              <p className="font-sans text-[11px] leading-snug text-[var(--ink-3)]">
                {dekkingsas
                  ? `${HEFBOOM_COPY.laterEerder}: dit is een verkenning — je plan verandert er niet van.`
                  : 'Dit is een verkenning: de lijn verschuift alleen hier.'}
                {toonMaakPlan && (
                  <> Maak je het je plan, dan rekent de hele app met deze stopleeftijd. Relevant omdat je
                  plan je vrijheidsleeftijd en je doelen bepaalt.</>
                )}
                {toonKeuzesLink && (
                  <> Tot welke leeftijd je geld moet reiken en wat er dan nog over moet zijn, kies je bij je
                  plan-keuzes.</>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-x-4">
                {toonMaakPlan && (
                  <button
                    type="button"
                    onClick={() => onMaakPlan(stopAge)}
                    disabled={maakPlanBusy || planIsDezeStop}
                    aria-disabled={maakPlanBusy || planIsDezeStop}
                    className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-semibold text-horizon-700 underline underline-offset-2 transition-colors hover:text-horizon-800 disabled:no-underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    {planIsDezeStop ? 'Dit is al je plan' : maakPlanBusy ? 'Opslaan…' : 'Maak dit mijn plan'}
                  </button>
                )}
                {toonKeuzesLink && (
                  <button
                    type="button"
                    onClick={onKeuzesOpenen}
                    className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-medium text-[var(--ink-2)] underline underline-offset-2 transition-colors hover:text-horizon-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    Je plan-keuzes &rarr;
                  </button>
                )}
              </div>
            </div>
          )}
          </>
          )}

          {dekkingsas ? (
            <Dekkingsbalk data={dekking} />
          ) : (
          <>
          {/* driezone-band (stoplicht) met basis/verwacht/laatst-markers, stop-marker
              (ambitie) en de marge als overspanning. */}
          <div className="relative mt-12">
            {/* marge-overspanning-label (bovenste rij) */}
            {showMargeBracket && margeSpanWidth > 0 && (
              <div
                className={`absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums ${
                  zone ? ZONE_TEXT[zone] : 'text-[var(--ink-3)]'
                }`}
                style={{ top: '-42px', left: `${clampLabelPct(margeSpanMid, MARGE_LABEL_CLAMP_PCT)}%` }}
              >
                {margeBracketLabel}
              </div>
            )}

            {/* stop-label (tweede rij, altijd boven de marge-bracket). TPR-09: de
                marker heet wat hij is — een verkenning, geen plan. */}
            <div
              className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums text-horizon-700"
              style={{ top: '-24px', left: `${clampLabelPct(stopPos, STOP_LABEL_CLAMP_PCT)}%` }}
            >
              verkenning {formatAge(stopAge)}
            </div>

            {/* marge-bracket (⊓ boven de band, opent naar de band toe) */}
            {showMargeBracket && margeSpanWidth > 0 && (
              <div
                className={`absolute h-2 border-t border-l border-r ${
                  zone ? ZONE_BORDER[zone] : 'border-[var(--border-ed)]'
                }`}
                style={{ top: '-8px', left: `${margeSpanLeft}%`, width: `${margeSpanWidth}%` }}
                aria-hidden
              />
            )}

            {/* basis-marker (dun streepje over de band) */}
            {showBasisMarker && basisPos !== null && (
              <div
                className="absolute top-0 h-2.5 w-px -translate-x-1/2 bg-[var(--ink-3)]"
                style={{ left: `${basisPos}%` }}
                aria-hidden
              />
            )}

            <div className="flex h-2.5 overflow-hidden rounded-full">
              {reachable && band ? (
                <>
                  <div className="bg-red-500" style={{ width: `${band.amberStartPct}%` }} />
                  <div
                    className="bg-amber-500"
                    style={{ width: `${Math.max(0, band.amberEndPct - band.amberStartPct)}%` }}
                  />
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${Math.max(0, 100 - band.amberEndPct)}%` }}
                  />
                </>
              ) : (
                <div className="w-full bg-[var(--border-ed)]" />
              )}
            </div>

            {/* stop-marker (verticaal) */}
            <div
              className="absolute -top-1 h-[18px] w-px -translate-x-1/2 bg-[var(--ink)]"
              style={{ left: `${stopPos}%` }}
              aria-hidden
            />

            {/* markers-labels onder de band — basis / verwacht / laatst. Verwacht en laatst
                staan naar buiten uitgelijnd zodat ze, dankzij de strakke amber-buffer, nooit
                botsen; basis krijgt (dankzij de gap-guard) zijn eigen ruimte. */}
            {reachable && band && (
              <div className="relative mt-1 h-3">
                {showBasisMarker && basisPos !== null && (
                  <span
                    className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]"
                    style={{ left: `${clampLabelPct(basisPos, BASIS_LABEL_CLAMP_PCT)}%` }}
                  >
                    basis
                  </span>
                )}
                <span
                  className="absolute -translate-x-full whitespace-nowrap pr-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]"
                  style={{ left: `${Math.max(band.amberStartPct, LABEL_WIDTH_PCT)}%` }}
                >
                  verwacht
                </span>
                {laatstFireAge !== null && (
                  <span
                    className="absolute whitespace-nowrap pl-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]"
                    style={{
                      left: `${Math.max(band.amberEndPct, Math.max(band.amberStartPct, LABEL_WIDTH_PCT))}%`,
                    }}
                  >
                    laatst
                  </span>
                )}
              </div>
            )}
          </div>

          {/* zone-duidende zin — vervangt de verwijderde Marge-figure als duiding onder de band */}
          {zone && (
            <p className={`mt-3 font-mono text-[10px] leading-snug ${ZONE_TEXT[zone]}`}>
              {zone === 'stevig' && laatstFireAge === null ? STEVIG_TERUGVAL_NOTE : ZONE_NOTE[zone]}
            </p>
          )}

          {/* Onzekerheidszin (gewone taal) — met degeneratie-guard */}
          {onzekerheid && (
            <p className="mt-2 font-sans text-[12px] leading-snug text-[var(--ink-3)]">
              {onzekerheidDegenereert ? (
                <>
                  Je bent naar verwachting <b className="text-[var(--ink-2)]">rond je {onzekerheid.vroegst}e</b>{' '}
                  vrij — de scenario’s liggen hier dicht op elkaar.
                </>
              ) : (
                <>
                  Waarschijnlijk ben je vrij tussen <b className="text-[var(--ink-2)]">{onzekerheid.vroegst}</b> en{' '}
                  <b className="text-[var(--ink-2)]">{onzekerheid.laatst}</b> — afhankelijk van hoe de markten lopen.
                </>
              )}
            </p>
          )}

          {/* checkbox: stopkeuze schuift mee */}
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2 font-sans text-[12px] leading-snug text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={stopKoppel}
              onChange={e => onStopKoppelChange(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-horizon-600"
            />
            <span>
              stopkeuze schuift mee met de streep{' '}
              <span className="text-[var(--ink-4)]">(dan blijft je marge gelijk)</span>
            </span>
          </label>
          </>
          )}
        </section>
        )}
      </div>

      {/* ── Cijferrij (volle breedte, onder de twee vlakken) — de drieslag ──
          Weggelaten onder 'Nu stoppen': basis, verwacht én geambieerd vallen daar
          per constructie samen met je huidige leeftijd (ADR 0127 D1). Ook weggelaten onder de
          dekkingsas: de tegels Reikt tot · Plan tot · Gedekt zitten dan in de balk zelf. */}
      {!stopKeuzeVerborgen && !dekkingsas && (
      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[var(--border-ed)] pt-4">
        <Figure kicker="Basis-vrijheid" value={formatAge(baseFireAge)} unit="jr" />
        {/* Geen delta-sub meer: de "X mnd eerder/later vrij"-duiding staat één keer, op de
            stopleeftijd-regel in het rechter vlak (zie de module-doc bovenaan). */}
        {/* "Verwacht vrij" — de streep: wanneer je vrij kúnt zijn (basis, of het
            wat-als/doel-pad als dat draait). Het DOEL is voortaan de stopleeftijd
            rechts ("Geambieerde vrijheid"), dus deze kicker draagt die naam niet meer. */}
        <Figure
          kicker="Verwacht vrij"
          value={formatAge(hasScenario ? verwachtFireAge : baseFireAge)}
          unit="jr"
          highlight={hasScenario}
        />
        <Figure
          kicker={ankerVast ? 'Verkend stopmoment' : 'Geambieerde vrijheid'}
          value={formatAge(stopAge)}
          unit="jr"
          sub={margeText}
          subClass={zone ? ZONE_TEXT[zone] : 'text-[var(--ink-3)]'}
        />
      </div>
      )}
    </div>
  )
}

// ── Sub-componenten ────────────────────────────────────────────────────────────

function PanelHeader({ num, title, tag }: { num: string; title: string; tag: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-horizon-600 font-mono text-[10px] font-bold leading-none text-[var(--paper)]">
        {num}
      </span>
      <h3
        className="font-display text-[13px] font-semibold leading-snug text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {title}{' '}
        <span className="font-serif text-[12px] font-normal italic text-[var(--ink-3)]">— {tag}</span>
      </h3>
    </div>
  )
}

function Figure({
  kicker,
  value,
  unit,
  highlight = false,
  valueClass,
  sub,
  subClass,
}: {
  kicker: string
  value: string
  unit: string
  highlight?: boolean
  /** Kleurtoon voor de hoofdwaarde (bv. zone-kleur voor de marge). */
  valueClass?: string
  sub?: string
  subClass?: string
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
        {kicker}
      </div>
      <div
        className={`flex items-baseline gap-1 text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums ${valueClass ?? 'text-[var(--ink)]'}`}
        style={{ fontFamily: PLAYFAIR }}
      >
        {highlight ? (
          <span
            className="inline px-1"
            style={{ backgroundImage: 'linear-gradient(transparent 60%, var(--module-active-200) 60%)' }}
          >
            {value}
          </span>
        ) : (
          <span>{value}</span>
        )}
        {unit && <span className="text-[11px] font-normal text-[var(--ink-3)]">{unit}</span>}
      </div>
      {sub && (
        <div className={`mt-1 font-mono text-[10px] tabular-nums ${subClass ?? 'text-[var(--ink-3)]'}`}>
          {sub}
        </div>
      )}
    </div>
  )
}
