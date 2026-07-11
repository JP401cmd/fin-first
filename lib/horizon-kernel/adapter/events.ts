/**
 * Horizon-kernel adapter — `life_events` → kern-invoer (FASE 3, snede 2).
 *
 * De event-laag bovenop het adapter-fundament (snede 1). Zet de app-`LifeEvent[]` om
 * naar de gebeurtenis-gerelateerde kern-invoer:
 *  - **AOW / kinderen / erfenis** → `AutoGebeurtenisParams` (de kern rékent zelf: AOW-
 *    hoogte, NIBUD-fasen, erf-netting V16 — de adapter levert alleen de invoer);
 *  - **pensioen** → `PensioenPot[]` (multipot-slots; de kern annuïtiseert via PMT — de
 *    adapter geeft pot-parameters door, geen uitkeringsbedragen, behalve bij direct-
 *    bruto-metadata, zie `mapPensionPots`);
 *  - **werk** → `WerkStrategieParams` (de kern bouwt de salarisladder → CF!D-delta);
 *  - **slider-werk** (`scenario_origin` `slider:income`/`slider:workdays`) → een
 *    PERMANENTE inkomens-delta die als één bedrag (`salarisDeltaPerMaand`) op het
 *    salaris-kanaal (`nettoJaarinkomen`, snede 1) landt i.p.v. als Geb-rij. Daar geldt de
 *    dynamische FIRE-gate van de kern automatisch (CF!D → F sparen, 0 ná FIRE), zodat de
 *    delta — anders dan een doorlopende Geb-baat in CF!H — NIET de onttrekkingsfase in lekt.
 *    Sliders starten altijd op `currentAge` (= maand 0), dus een vlakke delta op het basis-
 *    salaris heeft dezelfde start-semantiek. De kósten-slider (`slider:savings`) en
 *    `slider:extra_inleg` blijven BEWUST vrije Geb-events (lifestyle/inleg lopen door);
 *  - **alle overige (vrije) typen** → handmatige `GebeurtenisRij[]` (Geb rij 4-13),
 *    via hergebruik van de app-expander `lifeEventsToCashflows` (children/inheritance/
 *    aow/pension/werk/huis/slider-werk worden dáár NIET meegeteld — die zijn hier al gerouteerd).
 *
 * **Dubbeltelling-guard:** de partitie (beheerd vs. vrij) komt uit `guard.ts`; alleen
 * de vrije partitie wordt naar Geb-rijen gemapt. Huis-events (`housing-strategy:`)
 * lopen via de woning-config uit snede 1 en worden hier NOOIT gemapt.
 *
 * **Kern-gaten (snede 2b) — gerapporteerd, niet stilzwijgend gedropt:** `market_shock`
 * (generieke pot-mutatie V9), pensioen > 6 slots, en de Excel-capaciteit 10 Geb-rijen
 * × 3 posten. Deze leveren een `EventMappingNotice` op i.p.v. een stille afwijking.
 *
 * App-zijde (mag app-types importeren). Pure functies; geen Supabase/Date.now.
 */

import type {
  LifeEvent,
  AOWMetadata,
  ChildrenMetadata,
  InheritanceMetadata,
  PensionMetadata,
  WerkMetadata,
} from '@/lib/horizon-data'
import {
  normalizePensionType,
  nibudChildrenCost,
  berekenKinderopvangNetto,
  kinderbijslagPerMaand,
  type CanonicalPensionType,
} from '@/lib/horizon-data'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import type {
  AutoGebeurtenisParams,
  GebPost,
  GebeurtenisRij,
  PensioenPot,
  PotMutatie,
  WerkStrategieParams,
} from '../types'
import { HORIZON_MONTHS } from '../types'
import { NEUTRAL_AUTO_GEBEURTENISSEN, NEUTRAL_WERK_STRATEGIE } from './params'
import { dedupeById, expanderFor, isSliderWorkEvent, partitionEvents } from './guard'

// ── Diagnostiek ──────────────────────────────────────────────────────────────────

/** Eén niet-(volledig-)mapbaar punt voor het orchestrator-/beheer-rapport. */
export interface EventMappingNotice {
  /** `skip` = event/post niet meegenomen · `overflow` = kern-/Excel-capaciteit · `info` = keuze/aanname. */
  readonly kind: 'skip' | 'overflow' | 'info'
  /** Betrokken event-id (indien van toepassing). */
  readonly eventId?: string
  /** Leesbare toelichting (NL). */
  readonly message: string
}

/** De gebeurtenis-gerelateerde kern-invoer + diagnostiek. */
export interface EventInputs {
  readonly autoGebeurtenissen: AutoGebeurtenisParams
  readonly werkStrategie: WerkStrategieParams
  readonly gebeurtenissen: readonly GebeurtenisRij[]
  /**
   * Permanente netto-inkomens-delta per maand (€) uit de slider-werk-flows
   * (`slider:income`/`slider:workdays`), gesommeerd. De barrel telt dit op bij
   * `nettoJaarinkomen` (× 12) zodat het via het FIRE-gegate salaris-kanaal loopt i.p.v. als
   * levenslange Geb-baat. 0 wanneer er geen slider-werk-events zijn (byte-identiek aan snede 1).
   */
  readonly salarisDeltaPerMaand: number
  /**
   * Generieke pot-mutaties uit `market_shock`-events (buiten oracle-domein, V9).
   * Leeg wanneer er geen portfolio-schokken zijn. Voedt `KernelInput.potMutaties`.
   */
  readonly potMutaties: readonly PotMutatie[]
  readonly notices: readonly EventMappingNotice[]
}

/** Context die de mapping deelt (tijdas + indexatie voor de de-indexatie van Geb-posten). */
export interface EventMappingContext {
  /** P!B7 — startleeftijd (hele jaren). */
  readonly startLeeftijd: number
  /** P!B14 — algemene inflatie per jaar (voor het gede-indexeren van niet-geïndexeerde posten). */
  readonly inflatie: number
}

// ── Excel-/kern-capaciteiten ───────────────────────────────────────────────────────

/** Pensioen-multipot: Auto-gebeurtenissen rij 26-31 = 6 fysieke slots. */
const PENSION_MAX_SLOTS = 6
/** Handmatige gebeurtenissen: Geb rij 4-13 = 10 rijen. */
const MAX_GEB_ROWS = 10
/** Posten per Geb-rij (kolommen C/J/Q) = 3. */
const MAX_POSTS_PER_ROW = 3
/** Eerste Excel-rij van het handmatige Geb-blok. */
const GEB_FIRST_ROW = 4
/** Kinderen: Auto-gebeurtenissen B8-bereik 0-3. */
const KIND_MAX_SLOTS = 3
/** AOW volledige opbouw (2%/jr → 50 jaar). */
const AOW_VOLLE_OPBOUW_JAREN = 50

// ── Publieke ingang ────────────────────────────────────────────────────────────────

/**
 * Bouw de gebeurtenis-gerelateerde kern-invoer uit de app-`LifeEvent[]`.
 * Dedupliceert eerst op id (visuele herhalingen), houdt alleen actieve events, en
 * partitioneert via de guard: beheerd → param-blokken, vrij → Geb-rijen. Een lege
 * lijst levert exact de neutrale snede-1-defaults (determinisme-invariant).
 */
export function buildEventInputs(
  events: readonly LifeEvent[],
  ctx: EventMappingContext,
): EventInputs {
  const active = dedupeById(events).filter((e) => e.is_active)

  // Slider-werk-flows (inkomen/werkdagen) worden eerst afgevangen: hun permanente inkomens-
  // delta gaat via het salaris-kanaal (FIRE-gegate), niet via een Geb-rij. Wat overblijft
  // partitioneert de guard als vanouds (beheerd → param-blokken, vrij → Geb-rijen).
  const salarisDeltaEvents = active.filter(isSliderWorkEvent)
  const rest = active.filter((e) => !isSliderWorkEvent(e))
  const salarisDeltaPerMaand = sumSalarisDeltaPerMaand(salarisDeltaEvents)

  const { strategieGestuurd, vrij } = partitionEvents(rest)

  const notices: EventMappingNotice[] = []
  const potMutaties: PotMutatie[] = []
  const autoGebeurtenissen = buildAutoGebeurtenissen(strategieGestuurd, notices)
  const werkStrategie = buildWerkStrategie(strategieGestuurd, notices)
  const gebeurtenissen = buildManualGebeurtenissen(vrij, ctx, notices, potMutaties)

  return { autoGebeurtenissen, werkStrategie, gebeurtenissen, potMutaties, notices, salarisDeltaPerMaand }
}

/**
 * Som de permanente maandelijkse inkomens-delta over de slider-werk-events. Beide bronnen
 * dragen de delta op `monthly_income_change` (income-slider: raise/verlaging; werkdagen-slider:
 * het inkomensverlies, negatief). Sliders zetten `target_age = currentAge` (= maand 0), dus de
 * delta start synchroon met het basissalaris — een vlakke optelling op `nettoJaarinkomen`
 * heeft dezelfde start-semantiek. Geen delta / lege lijst → 0 (byte-identiek aan snede 1).
 */
function sumSalarisDeltaPerMaand(events: readonly LifeEvent[]): number {
  let som = 0
  for (const ev of events) {
    const delta = Number(ev.monthly_income_change ?? 0)
    if (Number.isFinite(delta)) som += delta
  }
  return som
}

// ── Auto-gebeurtenissen (AOW + pensioen + kinderen + erfenis) ───────────────────────

/**
 * Combineer de vier auto-expander-brokken tot één `AutoGebeurtenisParams`. Vertrekt
 * van de neutrale snede-1-defaults en overschrijft alléén de velden waarvoor een
 * event bestaat; ontbreekt een expander, dan blijft z'n neutrale (inerte) waarde staan.
 */
function buildAutoGebeurtenissen(
  managed: readonly LifeEvent[],
  notices: EventMappingNotice[],
): AutoGebeurtenisParams {
  const aow = mapAow(pick(managed, 'aow'), notices)
  const children = mapChildren(pick(managed, 'kinderen'), notices)
  const inheritance = mapInheritance(pick(managed, 'erfenis'), notices)
  const pensioenPotten = mapPensionPots(pick(managed, 'pensioen'), notices)

  return {
    ...NEUTRAL_AUTO_GEBEURTENISSEN,
    ...aow,
    ...children,
    ...inheritance,
    pensioenPotten,
  }
}

/** Selecteer de beheerde events die door een specifieke expander worden geconsumeerd. */
function pick(managed: readonly LifeEvent[], kind: ReturnType<typeof expanderFor>): LifeEvent[] {
  return managed.filter((e) => expanderFor(e) === kind)
}

/**
 * AOW → `leefsituatie` + `aowOpbouwjaren`. De kern rekent de AOW-hoogte + startleeftijd
 * zelf (basis 1452/993 uit `tables/auto-gebeurtenissen.ts`; START = `persoon.aowLeeftijd`
 * uit snede 1). Het event-`target_age` wordt dus BEWUST genegeerd voor de startmaand —
 * de canonieke AOW-leeftijd wint (bij mismatch = oracle). `aowOpbouwjaren = 50 −
 * jaren-buiten-NL` (2%/jr korting; spiegelt `computeAowMonthly`).
 */
function mapAow(events: LifeEvent[], notices: EventMappingNotice[]): Partial<AutoGebeurtenisParams> {
  if (events.length === 0) return {}
  if (events.length > 1) {
    notices.push({
      kind: 'info',
      message: `${events.length} AOW-events aangeboden; de kern kent één AOW-config — het eerste wordt gebruikt.`,
    })
  }
  const m = (events[0]!.metadata ?? {}) as AOWMetadata
  const jarenBuitenNL = clamp(Number(m.jarenBuitenNL ?? m.jarenInNL ?? 0), 0, AOW_VOLLE_OPBOUW_JAREN)
  return {
    // De kern vergelijkt op exact 'Alleenstaand'; al het andere → samenwonend-tarief (993).
    leefsituatie: m.leefsituatie === 'samenwonend' ? 'Samenwonend' : 'Alleenstaand',
    aowOpbouwjaren: AOW_VOLLE_OPBOUW_JAREN - jarenBuitenNL,
  }
}

/** App-pensioentype (canoniek) → Excel-slottype (de vier takken in `pensioenDuurModel`). */
const APP_TO_EXCEL_PENSION_TYPE: Record<CanonicalPensionType, string> = {
  bedrijf: 'bedrijf',
  lijfrente_levenslang: 'lijfrente_levenslang',
  lijfrente_bancair: 'lijfrente_bancair',
  // Excel-tak heet 'lijfrente_tijdelijk' (MIN(MAX(G;5);10)); app-canoniek is 'tijdelijke_oudedagslijfrente'.
  tijdelijke_oudedagslijfrente: 'lijfrente_tijdelijk',
}

/**
 * Pensioen-events → `PensioenPot[]` (max 6 slots). Per pot:
 *  - `type` = Excel-slottype (mapping hierboven; stuurt de duur-SWITCH in de kern);
 *  - **inleg-modus** (`inlegBedrag > 0`): `invoermodus='pot'` + `inlegPot` → de kern
 *    annuïtiseert via `PMT(inflatie/12, duur·12, −inleg)`. Bewust GEEN app-
 *    `annuitizePension` (geen dubbele annuïtisering; de kern is de rekenmotor);
 *  - **direct-bruto-modus** (geen inleg): `invoermodus='bruto'` + `brutoPerMaand` — de
 *    ENIGE plek waar de adapter een uitkeringsbedrag doorgeeft, omdat de app-metadata
 *    dan geen pot kent (gedocumenteerde uitzondering, task-eis).
 * `partnerUitkeringPct` alleen bij levenslange lijfrente (spiegelt de app). Meer dan
 * 6 pensioenen → gerapporteerd, niet gedropt-zonder-melding.
 */
function mapPensionPots(events: LifeEvent[], notices: EventMappingNotice[]): PensioenPot[] {
  const pots: PensioenPot[] = []
  events.forEach((ev, i) => {
    if (i >= PENSION_MAX_SLOTS) return // overloop hieronder gerapporteerd
    const m = (ev.metadata ?? {}) as PensionMetadata
    const canonical = normalizePensionType(m.pensioenType)
    const inleg = Number(m.inlegBedrag ?? 0)
    const isPot = inleg > 0
    const uitkeringsduur = m.uitkeringsduur
    const duurJaarInvoer =
      uitkeringsduur !== undefined && uitkeringsduur !== 'levenslang' ? Number(uitkeringsduur) : 0
    pots.push({
      slot: i,
      // De kern gate't een pot op naam !== null (A26-gate); vul altijd een naam.
      naam: ev.name || `Pensioen ${i + 1}`,
      type: APP_TO_EXCEL_PENSION_TYPE[canonical],
      ingangsLeeftijd: m.ingangLeeftijd ?? ev.target_age ?? null,
      invoermodus: isPot ? 'pot' : 'bruto',
      brutoPerMaand: isPot ? null : Number(m.brutoBedrag ?? ev.monthly_income_change ?? 0),
      inlegPot: isPot ? inleg : null,
      duurJaarInvoer,
      geindexeerd: (m.isGeindexeerd ?? ev.is_indexed ?? false) ? 'Ja' : 'Nee',
      partnerUitkeringPct:
        canonical === 'lijfrente_levenslang' ? (m.partnerUitkeringPct ?? null) : null,
    })
  })
  if (events.length > PENSION_MAX_SLOTS) {
    notices.push({
      kind: 'overflow',
      message: `${events.length} pensioen-events > ${PENSION_MAX_SLOTS} kern-slots; ${events.length - PENSION_MAX_SLOTS} niet gemapt (kern-uitbreiding, snede 2b).`,
    })
  }
  return pots
}

/**
 * Kinderen → NIBUD-params. De kern is per-kind (fase-factor × `nibudBasisPerMaand` per
 * actief kind), de app-`lifeEventsToCashflows` rekent per aantal-kinderen met
 * schaalvoordeel. We aggregeren de counts over alle kinderen-events (elk kind op de
 * `target_age` van z'n event) en herleiden de per-kind-basis uit de app-totalen
 * (÷ aantal) zodat de kern-som globaal aansluit. Documenteerde benadering — buiten het
 * Excel-domein, geen euro-parity vereist. > 3 kinderen → gerapporteerd (kern kent 3 slots).
 */
function mapChildren(
  events: LifeEvent[],
  notices: EventMappingNotice[],
): Partial<AutoGebeurtenisParams> {
  if (events.length === 0) return {}

  const births: number[] = []
  let opvangDagen = 0
  let gebruikBijslag = true
  let babyuitzet = 0
  for (const ev of events) {
    if (ev.target_age == null) {
      notices.push({ kind: 'skip', eventId: ev.id, message: `kinderen-event '${ev.name}' zonder leeftijd — overgeslagen.` })
      continue
    }
    const m = (ev.metadata ?? {}) as ChildrenMetadata
    const count = Math.max(1, Math.floor(Number(m.aantalKinderen ?? 1)))
    for (let k = 0; k < count; k++) births.push(ev.target_age)
    opvangDagen = Math.max(opvangDagen, Number(m.kinderopvangDagen ?? 0))
    if (m.kinderbijslag === false) gebruikBijslag = false
    babyuitzet = Math.max(babyuitzet, Number(m.babyuitzet ?? 0))
  }
  if (births.length === 0) return {}

  const totaal = births.length
  const capped = Math.min(KIND_MAX_SLOTS, totaal)
  if (totaal > KIND_MAX_SLOTS) {
    notices.push({
      kind: 'overflow',
      message: `${totaal} kinderen > ${KIND_MAX_SLOTS} kern-slots; de eerste ${KIND_MAX_SLOTS} worden gemodelleerd.`,
    })
  }
  // Vaste lengte 3 (de kern indexeert rij 0/1/2); niet-actieve slots op 0.
  const kindGeboorteLeeftijden = [births[0] ?? 0, births[1] ?? 0, births[2] ?? 0]

  // Per-kind-basis uit de app-totalen (÷ aantal): kern-som ≈ app-som per fase.
  const perKindNibud = Math.round(nibudChildrenCost(capped) / capped)
  const perKindOpvang =
    opvangDagen > 0 ? Math.round(berekenKinderopvangNetto(opvangDagen, capped) / capped) : 0
  const perKindBijslag = gebruikBijslag ? Math.round(kinderbijslagPerMaand(capped) / capped) : 0

  return {
    aantalKinderen: capped,
    kindGeboorteLeeftijden,
    nibudBasisPerMaand: perKindNibud,
    kinderopvangNettoPerMaand: perKindOpvang,
    kinderbijslagPerMaand: perKindBijslag,
    babyuitzetEenmalig: babyuitzet,
  }
}

/**
 * Erfenis → `erfenisBruto` / `erfenisRelatie` / `erfenisLeeftijd`. De kern rekent de
 * vrijstellings-netting zelf (V16: netto = MAX(0, bruto − vrijstelling) × (1 − tarief)).
 * De app-`erfbelastingSchijf` (`kind|kleinkind|partner|overig`) gaat rechtstreeks door;
 * de kern kent 'kind'/'kleinkind' beproefd, 'partner'/'overig' via de onbeproefde tak
 * (oracle wint, V16-akkoord). De kern kent één erfenis — meerdere → eerste + melding.
 */
function mapInheritance(
  events: LifeEvent[],
  notices: EventMappingNotice[],
): Partial<AutoGebeurtenisParams> {
  if (events.length === 0) return {}
  const ev = events.find((e) => e.target_age != null)
  if (ev === undefined) {
    notices.push({ kind: 'skip', message: 'erfenis-event(s) zonder leeftijd — overgeslagen.' })
    return {}
  }
  if (events.length > 1) {
    notices.push({
      kind: 'info',
      message: `${events.length} erfenis-events aangeboden; de kern kent één erfenis — het eerste (met leeftijd) wordt gebruikt.`,
    })
  }
  const m = (ev.metadata ?? {}) as InheritanceMetadata
  return {
    erfenisBruto: Number(m.brutoBedrag ?? 0),
    erfenisRelatie: m.erfbelastingSchijf ?? 'overig',
    erfenisLeeftijd: ev.target_age!,
  }
}

// ── Werk-strategie ─────────────────────────────────────────────────────────────────

/**
 * Werk → `WerkStrategieParams`. De adapter geeft de RUWE ladder-parameters door;
 * de kern (`tables/werk-strategie.ts`) bouwt zelf de salarisladder → CF!D-delta.
 * We hergebruiken dus de werk-metadata-interpretatie (velden/eenheden) maar NIET de
 * app-cashflow-expansie (`werkMetadataToCashflows`) — dat zou dubbel rekenen. Eenheden:
 * `reeleGroeiPct`/`plafondNettoMaand` 1:1; sprongen `atAge`→afgerond `bijLeeftijd`
 * (kern matcht op hele leeftijd); deeltijd `pct` 0-100 → fractie (kern: 1 = voltijd).
 * Meerdere werk-events → eerste + melding; ontbrekend basisinkomen → inert.
 */
function buildWerkStrategie(
  managed: readonly LifeEvent[],
  notices: EventMappingNotice[],
): WerkStrategieParams {
  const events = pick(managed, 'werk')
  if (events.length === 0) return NEUTRAL_WERK_STRATEGIE
  if (events.length > 1) {
    notices.push({
      kind: 'info',
      message: `${events.length} werk-events aangeboden; de kern kent één inkomenslijn — het eerste wordt gebruikt.`,
    })
  }
  const m = (events[0]!.metadata ?? {}) as WerkMetadata
  const basis = Math.max(0, Number(m.huidigNettoMaand ?? 0))
  if (basis <= 0) {
    notices.push({
      kind: 'info',
      eventId: events[0]!.id,
      message: `werk-event '${events[0]!.name}' zonder basisinkomen — inkomenslijn inert gelaten.`,
    })
    return NEUTRAL_WERK_STRATEGIE
  }
  return {
    basisNettoPerMaand: basis,
    reeleGroei: Number(m.reeleGroeiPct ?? 0),
    groeiTotLeeftijd: m.groeiTotLeeftijd ?? null,
    plafondNettoPerMaand: Math.max(0, Number(m.plafondNettoMaand ?? 0)),
    sprongen: (m.sprongen ?? []).map((s) => ({
      bijLeeftijd: Math.round(Number(s.atAge)),
      deltaNettoPerMaand: Number(s.deltaNettoMaand),
    })),
    deeltijd: (m.faseStappen ?? []).map((f) => ({
      vanafLeeftijd: Number(f.fromAge),
      pct: Math.max(0, Number(f.pct)) / 100,
    })),
  }
}

// ── Handmatige gebeurtenissen (vrije events → Geb rij 4-13) ─────────────────────────

/**
 * Vrije events → `GebeurtenisRij[]`. Per event één rij; de posten komen uit de
 * hergebruikte app-expander `lifeEventsToCashflows` (dekt generieke bedragen, custom
 * cashflows, begrafenis-netting, children-fasen zijn hier al weggerouteerd). Elke
 * `SimCashflow` wordt een `GebPost` volgens de postconventie (README §Geb-post):
 *  - `one_time` → Eenmalig (geen eind);
 *  - `recurring` met `toAge` → Periodiek met eind; zonder `toAge` → Periodiek doorlopend
 *    (de kern loopt tot de horizon).
 * Baten positief / kosten negatief (Geb-conventie). Niet-geïndexeerde flows worden
 * gede-indexeerd naar hun startmaand (CF!H/Af!D indexeren centraal terug — spiegelt de
 * kern-erfenis/pensioen-conventie). `market_shock` (portfolio-mutatie) wordt sinds
 * snede 2b naar `KernelInput.potMutaties` gerouteerd (buiten oracle-domein, V9) i.p.v.
 * overgeslagen — de bronschok is een investeringspot-mutatie (`alleenInvestering`).
 * Capaciteit 10 rijen × 3 posten (Excel-max) → overloop gerapporteerd.
 */
function buildManualGebeurtenissen(
  vrij: readonly LifeEvent[],
  ctx: EventMappingContext,
  notices: EventMappingNotice[],
  potMutaties: PotMutatie[],
): GebeurtenisRij[] {
  const rijen: GebeurtenisRij[] = []

  for (const ev of vrij) {
    if (ev.target_age == null) {
      notices.push({ kind: 'skip', eventId: ev.id, message: `gebeurtenis '${ev.name}' zonder leeftijd — overgeslagen.` })
      continue
    }

    const posten: GebPost[] = []
    for (const cf of lifeEventsToCashflows([ev])) {
      if (cf.portfolioPct !== undefined && cf.portfolioPct !== 0) {
        // market_shock → generieke pot-mutatie (V9). De app-schok schaalt de
        // lopende (belegde) portefeuille → `alleenInvestering: true`. Maand relatief
        // aan de startleeftijd; buiten de horizon → gerapporteerd, niet toegepast.
        const maand = Math.round((cf.fromAge - ctx.startLeeftijd) * 12)
        if (maand >= 0 && maand < HORIZON_MONTHS) {
          potMutaties.push({ maand, pct: cf.portfolioPct, alleenInvestering: true })
        } else {
          notices.push({
            kind: 'skip',
            eventId: ev.id,
            message: `market_shock '${cf.name}' valt buiten de horizon (maand ${maand}) — niet toegepast.`,
          })
        }
        continue
      }
      const post = cashflowToGebPost(cf, ctx)
      if (post !== null) posten.push(post)
    }
    if (posten.length === 0) continue

    if (posten.length > MAX_POSTS_PER_ROW) {
      notices.push({
        kind: 'overflow',
        eventId: ev.id,
        message: `gebeurtenis '${ev.name}' levert ${posten.length} posten > ${MAX_POSTS_PER_ROW} (Excel-max); de overige posten zijn niet gemapt.`,
      })
    }
    if (rijen.length >= MAX_GEB_ROWS) {
      notices.push({
        kind: 'overflow',
        eventId: ev.id,
        message: `meer dan ${MAX_GEB_ROWS} handmatige gebeurtenis-rijen (Excel-max); '${ev.name}' is niet gemapt.`,
      })
      continue
    }
    rijen.push({
      rij: GEB_FIRST_ROW + rijen.length,
      naam: ev.name ?? null,
      posten: posten.slice(0, MAX_POSTS_PER_ROW),
    })
  }

  return rijen
}

/**
 * `SimCashflow` → `GebPost` (of `null` bij nul-bedrag/lege duur). `bedrag` in
 * koopkracht-nu (+ bate / − kost); geïndexeerde flow = as-is, niet-geïndexeerde flow
 * gede-indexeerd naar de startmaand zodat de centrale CF!H/Af!D-indexatie 'm nominaal-
 * vast maakt (één-op-één de kern-conventie voor erfenis/niet-geïndexeerd pensioen).
 */
function cashflowToGebPost(cf: SimCashflow, ctx: EventMappingContext): GebPost | null {
  const signed = cf.direction === 'income' ? Math.abs(cf.amount) : -Math.abs(cf.amount)
  if (signed === 0) return null

  const startYears = Math.max(0, cf.fromAge - ctx.startLeeftijd)
  const bedrag = cf.indexed ? signed : signed / Math.pow(1 + ctx.inflatie, startYears)

  const startMonths = monthsFromBirth(cf.fromAge)
  const start = postFromMonths(startMonths)

  if (cf.type === 'one_time') {
    return {
      type: 'Eenmalig',
      bedrag,
      startLeeftijd: start.leeftijd,
      startMaand: start.maand,
      eindLeeftijd: null,
      eindMaand: null,
    }
  }

  // recurring
  if (cf.toAge == null) {
    return {
      type: 'Periodiek',
      bedrag,
      startLeeftijd: start.leeftijd,
      startMaand: start.maand,
      eindLeeftijd: null, // doorlopend → de kern loopt tot de horizon (eIdx = 1199)
      eindMaand: null,
    }
  }
  // Laatste actieve maand = maand vóór `toAge` (de app-flow loopt [fromAge, toAge)).
  const lastActive = monthsFromBirth(cf.toAge) - 1
  if (lastActive < startMonths) return null // nul-/negatieve duur
  const end = postFromMonths(lastActive)
  return {
    type: 'Periodiek',
    bedrag,
    startLeeftijd: start.leeftijd,
    startMaand: start.maand,
    eindLeeftijd: end.leeftijd,
    eindMaand: end.maand,
  }
}

// ── Leeftijd ↔ (leeftijd, maand-in-jaar) ─────────────────────────────────────────────

/** Absolute leeftijd → maandindex sinds geboorte (`round(age·12)`; deelt de kern-schaal). */
function monthsFromBirth(age: number): number {
  return Math.round(age * 12)
}

/** Maandindex sinds geboorte → (hele leeftijd, 1-gebaseerde maand-in-jaar). */
function postFromMonths(months: number): { leeftijd: number; maand: number } {
  return { leeftijd: Math.floor(months / 12), maand: (months % 12) + 1 }
}

/** Numerieke clamp (NaN → ondergrens). */
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}
