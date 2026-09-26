// lib/horizon/katern-copy.ts
//
// De canonieke kopij van /toekomst in drie katernen (ADR 0179, fase 2).
//
// ÉÉN bron voor tekst: de kopij-toets
// `docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-kopij.md` (merkstem +
// compliance-check, 26 sep 2026). Nooit de concepttekst uit de ontwerpspec. Waar de
// app een formulering al heeft (`ankerVrijZin`, `ankerTitel`, `labZoneWoord`,
// `ANKER_KPI_LABEL`, `heroFireAgeYear`, `PLAN_REVIEW_NAAM`) consumeren we die, zodat
// één gegeven één formulering houdt.
//
// Pure module: geen React, geen Supabase, geen rekenwerk. Alle getallen komen als
// invoer binnen (uit de bundel/kernel); hier wordt alleen geformuleerd en afgerond
// voor weergave (hele jaren via `heroFireAgeYear`, percentages via `Math.round`).

import {
  ANKER_KPI_LABEL,
  ankerReachYear,
  ankerTitel,
  ankerVrijZin,
  formatStopAge,
  labZoneWoord,
  type AnkerReach,
  type AnkerStop,
} from './anker-copy'
import { heroFireAgeYear } from './hero-fire-age'
import type { LabZone } from './lab-grenzen-types'
import { PLAN_REVIEW_NAAM } from '@/lib/plan-review/types'

const SCHEIDING = ' · '

// ── Katernen (kopij-toets §4) ────────────────────────────────────────────────

export type KaternId = 'plan' | 'doelen' | 'instellingen'

/** Vaste volgorde van de koppen: Plan · Doelen · Instellingen (eigenaarsbesluit 26 sep). */
export const KATERN_VOLGORDE: readonly KaternId[] = ['plan', 'doelen', 'instellingen']

export const KATERN_LABEL: Record<KaternId, string> = {
  plan: 'Plan',
  doelen: 'Doelen',
  instellingen: 'Instellingen',
}

/** Toegankelijke naam van de `<nav>` met de katern-koppen. */
export const KATERN_NAV_LABEL = 'Onderdelen van je toekomstplan'

/** De naam van de wizard-ingang bovenaan Instellingen — dezelfde bron als pane-titel en ⌘K. */
export const KATERN_WIZARD_NAAM = PLAN_REVIEW_NAAM

/**
 * Het label van het statuspunt voor schermlezers (kopij-toets §4, WCAG 1.4.1):
 * "Instellingen, melding: AOW ontbreekt". Kleur alleen is geen informatie.
 */
export function katernStatuspuntLabel(katern: KaternId, kort: string): string {
  return `${KATERN_LABEL[katern]}, melding: ${kort}`
}

// ── Ankerregel (kopij-toets §2) ──────────────────────────────────────────────

/**
 * Het anker waar de kop over gaat. `solved` = de app zoekt de vrijheidsleeftijd
 * (`solvedFireAge` `null` = onbereikbaar binnen het plan); `vast` = een gekozen
 * stopmoment (`AnkerStop`, uit `ankerStopFromSim`).
 */
export type KaternAnker =
  | { readonly kind: 'solved'; readonly solvedFireAge: number | null; readonly currentAge: number | null }
  | { readonly kind: 'vast'; readonly stop: AnkerStop }

/**
 * De ene ankerregel onder de oordeelzin.
 *
 * - solved: de bestaande `ankerVrijZin` ("Vrij mogelijk vanaf je 52e.", onbereikbaar ⇒
 *   de canonieke nul-tak). Het stopmoment-argument is `now`: onder `solved` ís er
 *   geen gekozen stopmoment, en de `now`-tak zegt precies de gesolvede zin.
 * - vast: `ankerTitel` plus punt ("Je rekent met stoppen op 60.", nu-anker "Je rekent
 *   alsof je nu stopt."). Nooit het dekkingspercentage — dat staat al in de oordeelzin.
 */
export function katernAnkerregel(anker: KaternAnker): string {
  if (anker.kind === 'vast') return `${ankerTitel(anker.stop)}.`
  return ankerVrijZin({
    solvedFireAge: anker.solvedFireAge,
    currentAge: anker.currentAge,
    stop: { kind: 'now' },
  })
}

/** Het label van KPI 1: de vrijheidsleeftijd, onder een vast anker "Reikt tot". */
export function katernKpi1Label(anker: KaternAnker): string {
  return anker.kind === 'vast' ? ANKER_KPI_LABEL : 'Vrijheidsleeftijd'
}

// ── Samenvattingen op de inactieve katern-koppen (kopij-toets §4) ─────────────

/**
 * Plan. Gesolved: "61% van je doelbedrag" (het vrijheids-% uit de bundel, afgerond
 * zoals elders in de app). Vast anker: "reikt tot je 88e" (`ankerReachYear`).
 * `null` = geen samenvatting (geen getal om te noemen).
 */
export type PlanSamenvattingInput =
  | { readonly kind: 'solved'; readonly doelbedragPct: number | null }
  | { readonly kind: 'vast'; readonly reach: AnkerReach }

export function planSamenvatting(input: PlanSamenvattingInput): string | null {
  if (input.kind === 'solved') {
    const pct = input.doelbedragPct
    if (pct == null || !Number.isFinite(pct)) return null
    return `${Math.round(pct)}% van je doelbedrag`
  }
  const jaar = ankerReachYear(input.reach)
  if (jaar == null) return null
  return `${ANKER_KPI_LABEL.toLowerCase()} je ${jaar}e`
}

/** Het doelscenario zoals samenvatting en uitkomstregel het noemen. `null` = geen scenario. */
export interface DoelscenarioStand {
  /** Stopmoment van het doelscenario (fractioneel toegestaan, "58,5"). */
  readonly stopAge: number
  /** Zone van de huidige stand (`zoneVanHuidig`); `null` = de batch rekent nog. */
  readonly zone: LabZone | null
}

function doelscenarioTekst(stand: DoelscenarioStand): string {
  return `stopmoment ${formatStopAge(stand.stopAge)}${SCHEIDING}${labZoneWoord(stand.zone)}`
}

/** Doelen: "stopmoment 58 · ruim gedekt", of "nog geen doelscenario". */
export function doelenSamenvatting(stand: DoelscenarioStand | null): string {
  return stand == null ? 'nog geen doelscenario' : doelscenarioTekst(stand)
}

/** De uitkomstregel boven de knoppen in Doelen (kopij-toets §6): "Stopmoment 58 · gedekt …". */
export function doelenUitkomstregel(stand: DoelscenarioStand): string {
  const t = doelscenarioTekst(stand)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * OPEN EIGENAARSBESLUIT (kopij-toets §4): toont de samenvatting van Instellingen de
 * wizard-stand ("nog 2 voorkeuren open")? `true` = zoals de kopij-toets voorstelt;
 * `false` = alleen "AOW ontbreekt", en zonder melding een lege regel. De keuze staat
 * uitsluitend hier, zodat een besluit één regel raakt.
 */
export const INSTELLINGEN_SAMENVATTING_TOONT_WIZARDSTAND = true

export interface InstellingenSamenvattingInput {
  /** Aantal open stappen van de plan-review (0 = afgerond). */
  readonly voorkeurenOpen: number
  /** Draagt de run de AOW-ontbreekt-melding (`aowOntbreekt`)? */
  readonly aowOntbreekt: boolean
}

/** Instellingen: "nog 2 voorkeuren open · AOW ontbreekt". `null` = niets te melden. */
export function instellingenSamenvatting(
  input: InstellingenSamenvattingInput,
  toontWizardstand: boolean = INSTELLINGEN_SAMENVATTING_TOONT_WIZARDSTAND,
): string | null {
  const delen: string[] = []
  const open = Math.max(0, Math.floor(input.voorkeurenOpen))
  if (toontWizardstand && open > 0) {
    delen.push(`nog ${open} ${open === 1 ? 'voorkeur' : 'voorkeuren'} open`)
  }
  if (input.aowOntbreekt) delen.push('AOW ontbreekt')
  return delen.length > 0 ? delen.join(SCHEIDING) : null
}

// ── Aannamesregel (kopij-toets §3, alleen in Plan) ───────────────────────────

export const AANNAMES_PREFIX = 'Op basis van:'
export const AANNAMES_LINK_LABEL = 'Naar instellingen'

export interface AannamesInput {
  /** `null` = solved ("stopmoment zo vroeg mogelijk"), anders het vaste anker. */
  readonly stop: AnkerStop | null
  /** Eindleeftijd van het plan. */
  readonly eindleeftijd: number
  /** Inflatie in procenten (2 = "2,0%"), niet als fractie. */
  readonly inflatiePct: number
  /** Rendementsaanname in procenten per jaar (5 = "5,0%"), niet als fractie. */
  readonly rendementPct: number
  /** Aantal actieve gebeurtenissen op de tijdas. */
  readonly gebeurtenissen: number
}

export interface AannamesSegment {
  /** Stabiele sleutel voor React en tests. */
  readonly key: 'stop' | 'eind' | 'inflatie' | 'rendement' | 'gebeurtenissen'
  readonly tekst: string
  /** `true` = alleen in Volledig (de host zet het in `HideInSimple`, ADR 0026). */
  readonly alleenVolledig: boolean
}

const PCT_EEN_DECIMAAL = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function stopSegment(stop: AnkerStop | null): string {
  if (stop == null) return 'stopmoment zo vroeg mogelijk'
  if (stop.kind === 'now') return 'stopmoment nu'
  return `stopmoment ${formatStopAge(stop.stopAge)}`
}

/**
 * De segmenten van de aannamesregel, in leesvolgorde. Volledig: stopmoment · plan
 * tot je 90e · 2,0% inflatie · 5,0% rendement per jaar · 3 gebeurtenissen. Eenvoudig
 * laat inflatie en rendement weg (`alleenVolledig`).
 */
export function aannamesSegmenten(input: AannamesInput): AannamesSegment[] {
  const n = Math.max(0, Math.floor(input.gebeurtenissen))
  return [
    { key: 'stop', tekst: stopSegment(input.stop), alleenVolledig: false },
    { key: 'eind', tekst: `plan tot je ${heroFireAgeYear(input.eindleeftijd)}e`, alleenVolledig: false },
    { key: 'inflatie', tekst: `${PCT_EEN_DECIMAAL.format(input.inflatiePct)}% inflatie`, alleenVolledig: true },
    {
      key: 'rendement',
      tekst: `${PCT_EEN_DECIMAAL.format(input.rendementPct)}% rendement per jaar`,
      alleenVolledig: true,
    },
    {
      key: 'gebeurtenissen',
      tekst: n === 0 ? 'geen gebeurtenissen' : `${n} ${n === 1 ? 'gebeurtenis' : 'gebeurtenissen'}`,
      alleenVolledig: false,
    },
  ]
}

/** De regel als platte tekst (voor tests en een eventuele `aria-label`). */
export function aannamesRegelTekst(input: AannamesInput, modus: 'eenvoudig' | 'volledig'): string {
  const delen = aannamesSegmenten(input)
    .filter((s) => modus === 'volledig' || !s.alleenVolledig)
    .map((s) => s.tekst)
  return `${AANNAMES_PREFIX} ${delen.join(SCHEIDING)}`
}

// ── Canvas-modi (spec §4.2 regel 2, ADR 0179 D3) ─────────────────────────────

export type CanvasModus = 'vermogen' | 'samenstelling' | 'geldstroom'
export type GeldstroomSub = 'lijnen' | 'bronnen'

export const CANVAS_MODUS_VOLGORDE: readonly CanvasModus[] = ['vermogen', 'samenstelling', 'geldstroom']

export const CANVAS_MODUS_LABEL: Record<CanvasModus, string> = {
  vermogen: 'Vermogen',
  samenstelling: 'Samenstelling',
  geldstroom: 'Geldstroom',
}

export const GELDSTROOM_SUB_LABEL: Record<GeldstroomSub, string> = {
  lijnen: 'Lijnen',
  bronnen: 'Bronnen',
}

export const CANVAS_MODUS_GROEP_LABEL = 'Weergave van de grafiek'
export const GELDSTROOM_SUB_GROEP_LABEL = 'Geldstroom tonen als'

// ── Lagen-menu (kopij-toets §5) ──────────────────────────────────────────────

export type LaagId =
  | 'gebeurtenissen'
  | 'mijlpalen'
  | 'doelen'
  | 'doelscenario'
  | 'marktcheck'
  | 'rendementScenarios'
  | 'metHuis'
  | 'speelAf'

/** Menuvolgorde. */
export const LAAG_VOLGORDE: readonly LaagId[] = [
  'gebeurtenissen',
  'mijlpalen',
  'doelen',
  'doelscenario',
  'marktcheck',
  'rendementScenarios',
  'metHuis',
  'speelAf',
]

/** De lagen die Eenvoudig toont; de rest staat in `HideInSimple`. */
export const LAGEN_EENVOUDIG: readonly LaagId[] = ['gebeurtenissen', 'mijlpalen', 'doelen', 'doelscenario']

export const LAGEN_KNOP_LABEL = 'Lagen'
export const LAGEN_KOP = 'Lagen op de grafiek'
/** Achtervoegsel bij een laag die het katern vast aanzet. */
export const LAAG_VAST_LABEL = 'vast'

export const LAAG_LABEL: Record<LaagId, string> = {
  gebeurtenissen: 'Gebeurtenissen',
  mijlpalen: 'Mijlpalen',
  doelen: 'Doelen',
  doelscenario: 'Je doelscenario',
  marktcheck: 'Marktcheck',
  rendementScenarios: 'Rendement hoger en lager',
  metHuis: 'Met je huis',
  speelAf: 'Speel af',
}

export const LAAG_UITLEG: Record<LaagId, string> = {
  gebeurtenissen: 'Wat je zelf op je tijdas zette, zoals een kind of een verhuizing.',
  mijlpalen: 'Momenten die uit je plan volgen, zoals je AOW of een lege pensioenpot.',
  doelen: 'Je vastgelegde doelen als punt op de lijn.',
  doelscenario: 'De stippellijn: je plan met de knoppen uit Doelen.',
  marktcheck:
    'Je plan vaak opnieuw doorgerekend met een ander marktverloop. De band is de middelste helft van de uitkomsten, de lijn erin het midden. Geen voorspelling: het laat zien hoe gevoelig je plan is voor de markt.',
  rendementScenarios: 'Je vermogenspad bij een rendement van 2 procentpunt lager en 2 procentpunt hoger.',
  metHuis: 'Een tweede lijn met je huis erbij. De hoofdlijn is het deel waar je direct bij kunt.',
  speelAf: 'Loopt je plan jaar voor jaar door.',
}

// ── Drie getallen onder de Marktcheck-band (kopij-toets §7, spec §7.6) ───────

export type MarktcheckStand = 'tegenzit' | 'midden' | 'meezit'

export const MARKTCHECK_STAND_VOLGORDE: readonly MarktcheckStand[] = ['tegenzit', 'midden', 'meezit']

export const MARKTCHECK_STAND_LABEL: Record<MarktcheckStand, string> = {
  tegenzit: 'als het tegenzit',
  midden: 'in het midden',
  meezit: 'als het meezit',
}

/**
 * Drie vrijheidsleeftijden uit één marktcheck-run; per stand `null` = dat marktverloop
 * haalt de vrijheid niet binnen de horizon. Structureel gelijk aan
 * `MarktcheckVrijheidsleeftijden` (`lib/horizon-kernel/marktcheck.ts`); de test pint dat
 * in beide richtingen vast.
 */
export type MarktcheckLeeftijden = Record<MarktcheckStand, number | null>

/**
 * De woorden voor een stand die de vrijheid niet binnen de horizon haalt (kopij-toets
 * §7, aanvulling 26 sep). Zelfde betekenis als de nul-tak van `ankerVrijZin`, kort
 * genoeg voor één regel. Beschrijvend, geen oordeel.
 */
export const MARKTCHECK_NIET_BINNEN_PLAN = 'niet binnen je plan'

/**
 * De waarde van één stand: de leeftijd in hele jaren (`heroFireAgeYear`), of
 * `MARKTCHECK_NIET_BINNEN_PLAN` bij `null`.
 */
export function marktcheckStandWaarde(age: number | null): string {
  return age == null ? MARKTCHECK_NIET_BINNEN_PLAN : String(heroFireAgeYear(age))
}

/**
 * "als het tegenzit 55 · in het midden 52 · als het meezit 49" in hele jaren
 * (`heroFireAgeYear`). Een onbereikbare stand (`null`) blijft in de regel staan als
 * "niet binnen je plan": een regel die verdwijnt zodra het tegenzit, verzwijgt juist
 * de uitkomst die het meest zegt (kopij-toets §7, 26 sep).
 *
 * `null` (geen regel) wanneer:
 *  - alle drie de standen onbereikbaar zijn — dan zegt de regel niets wat de rest van
 *    het scherm niet al zegt;
 *  - een waarde een niet-eindig getal is: dat is een datafout, geen "onbereikbaar",
 *    en mag niet als "niet binnen je plan" op het scherm komen.
 * Het vaste stop-anker (hele invoer `null`) vangt de component af.
 */
export function marktcheckGetallenRegel(leeftijden: MarktcheckLeeftijden): string | null {
  const standen = MARKTCHECK_STAND_VOLGORDE.map((stand) => leeftijden[stand])
  if (standen.some((age) => age != null && !Number.isFinite(age))) return null
  if (standen.every((age) => age == null)) return null
  return MARKTCHECK_STAND_VOLGORDE.map(
    (stand) => `${MARKTCHECK_STAND_LABEL[stand]} ${marktcheckStandWaarde(leeftijden[stand])}`,
  ).join(SCHEIDING)
}
