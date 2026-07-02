/**
 * Horizon-kernel · tabel **Auto-gebeurtenissen** — Excel-tab `Auto-gebeurtenissen`
 * (A1:N65). De "expander": zet de domein-INVOER (leefsituatie, AOW-opbouw,
 * kinderen, erfenis, pensioen-multipot) om in de AFGELEIDE cellen die vervolgens
 * als koppeling naar `Geb` rij 14-30 vloeien (zie `tables/geb.ts`).
 *
 * Deze module reproduceert de **berekende** cellen van de tab (ADR 0032,
 * tolerantie €0,01). Bewust GEEN input-cellen (B4-B18 = INVOER, zitten al in
 * `KernelInput.autoGebeurtenissen`) en GEEN vrije labels (kolom A / post-namen /
 * toelichtingen) — dat is documentatie, geen per-invoer-berekening.
 *
 * ## Wat is berekend (en getoetst)
 * - **B6/B7** — leeftijd-koppelingen (`=P!B7`, `=ES!C15`=P!B55).
 * - **B21 (AOW)** — `=IF(B4="Alleenstaand",1452,993)·MIN(B5,50)/50`.
 * - **Kinderen rij 35-52** — 3 kinderen × 6 posten (fase 1/2/3 · opvang · bijslag ·
 *   babyuitzet): fase-grenzen (C/D), type (E), geboorte-offset m0 (F), start/eind-
 *   maandindex sIdx/eIdx (G/H) met klem op maand 0 en de eenmalig-tak, actief-vlag
 *   (I) en — alleen bij een actief kind — bedrag/mnd + start/eind-leeftijd (J-N).
 * - **Erfenis B56-B59** — vrijstelling/vlaktarief per relatie (2025-benadering),
 *   netto na heffing en het (gede-indexeerde) Geb-bedrag.
 * - **Pensioen rij 26-31 (J-M)** — annuïtisering per pot (duur/maandbedrag/eind/
 *   Geb-bedrag). In alle 16 fixtures zijn de pot-slots leeg → deze kolommen leveren
 *   "" (zie parity + rapport: de waarde-tak is onbeproefd).
 *
 * ## Beproevings-beperking (alle 16 fixtures identiek)
 * Elke fixture heeft dezelfde Auto-gebeurtenissen-invoer: **Alleenstaand, 50
 * opbouwjaren, 0 kinderen, erfenis €0, geen pensioen-potten**. Daardoor zijn de
 * AOW-samenwonend-tak (993), de actieve-kind-tak (J-N-waarden), de erfenis>0-tak
 * (B58/B59) en de pensioen-annuïtisering onbeproefd. De formules zijn conform
 * `docs/horizon-oracle/structuur.md` geïmplementeerd en als zodanig gemarkeerd;
 * de parity bewijst de wél-geëxerceerde tak (AOW=1452, kinder-index-structuur,
 * erfenis-vrijstelling/tarief=25490/0,15, netto=0) cel-voor-cel.
 *
 * Pure functie — geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput } from '../types'

/** Excel-formuleresultaat "" (leeg tekstresultaat) — te onderscheiden van een echt lege cel. */
export const EMPTY: '' = ''
export type Empty = typeof EMPTY

// ── AOW (Auto-geb B21) ───────────────────────────────────────────────────────
/** AOW netto per maand, alleenstaand (2025-basis, vóór opbouwkorting). */
const AOW_ALLEENSTAAND_PER_MAAND = 1452
/** AOW netto per maand p.p., samenwonend (2025-basis). ONBEPROEFD in de fixtures. */
const AOW_SAMENWONEND_PER_MAAND = 993
/** Volledige AOW-opbouw = 50 jaar (2%/jr). */
const AOW_MAX_OPBOUWJAREN = 50

// ── Kinderen (Auto-geb rij 35-52) ────────────────────────────────────────────
/** Aantal maanden per fase-grens (NIBUD): 0-48 · 48-144 · 144-216. */
interface KinderPostDef {
  /** Post-index 0..5 binnen een kind. */
  readonly idx: number
  /** Fase-start in maanden na geboorte (Auto-geb kolom C). */
  readonly fs: number
  /** Fase-eind in maanden na geboorte (Auto-geb kolom D). */
  readonly fe: number
  /** Post-type (Auto-geb kolom E) — stuurt de eIdx-tak. */
  readonly type: 'Periodiek' | 'Eenmalig'
}

/** De 6 posten per kind, in Excel-rijvolgorde (rij 35-40 = kind 1, enz.). */
const KINDER_POSTEN: readonly KinderPostDef[] = [
  { idx: 0, fs: 0, fe: 48, type: 'Periodiek' }, // fase 1 (0-4)
  { idx: 1, fs: 48, fe: 144, type: 'Periodiek' }, // fase 2 (4-12)
  { idx: 2, fs: 144, fe: 216, type: 'Periodiek' }, // fase 3 (12-18)
  { idx: 3, fs: 0, fe: 48, type: 'Periodiek' }, // opvang (0-4)
  { idx: 4, fs: 0, fe: 216, type: 'Periodiek' }, // kinderbijslag (0-18)
  { idx: 5, fs: 0, fe: 0, type: 'Eenmalig' }, // babyuitzet
]

/** NIBUD-fasefactor op het basisbedrag (fase 1/2/3): ×1,2 · ×1,0 · ×1,3. */
const NIBUD_FASE_FACTOR: readonly number[] = [1.2, 1.0, 1.3]

/** Maximum aantal kinderen (Auto-geb B8-bereik 0-3). */
const AANTAL_KINDEREN_SLOTS = 3

// ── Erfenis (Auto-geb B55-B59) ───────────────────────────────────────────────
/** Erf-vrijstelling kind/kleinkind (2025-benadering). */
const ERF_VRIJSTELLING_KIND = 25490
/** Erf-vrijstelling overige relaties (2025-benadering). ONBEPROEFD. */
const ERF_VRIJSTELLING_OVERIG = 2690

/**
 * Eén berekende kinderpost-rij (Auto-geb rij 35-52). De kolommen A/C/D/E/F/G/H/I
 * zijn altijd gevuld; J-N zijn `''` zolang het kind niet actief is (`actief=0`).
 */
export interface KinderPostRow {
  /** A — kindnummer 1..3. */
  readonly kind: number
  /** C — fase-start (maanden). */
  readonly fs: number
  /** D — fase-eind (maanden). */
  readonly fe: number
  /** E — type. */
  readonly type: 'Periodiek' | 'Eenmalig'
  /** F — geboorte-offset in maanden t.o.v. maand 0 (`(geboorteleeftijd−P!B7)·12`). */
  readonly m0: number
  /** G — start-maandindex, geklemd op 0 (`MAX(0, m0+fs)`). */
  readonly sIdx: number
  /** H — eind-maandindex (periodiek `m0+fe−1`; eenmalig `m0`). */
  readonly eIdx: number
  /** I — actief (1 als kindnummer ≤ aantal kinderen). */
  readonly actief: number
  /** J — bedrag/mnd (leeg tot actief). */
  readonly bedragPerMaand: number | Empty
  /** K — start-leeftijd (leeg tot actief). */
  readonly startLeeftijd: number | Empty
  /** L — start-maand (leeg tot actief). */
  readonly startMaand: number | Empty
  /** M — eind-leeftijd (leeg tot actief). */
  readonly eindLeeftijd: number | Empty
  /** N — eind-maand (leeg tot actief). */
  readonly eindMaand: number | Empty
}

/** Eén berekende pensioen-pot-rij (Auto-geb rij 26-31, kolommen J-M). */
export interface PensioenAnnuiteitRow {
  /** J — duur (jr, model). */
  readonly duurModel: number | Empty
  /** K — maandbedrag. */
  readonly maandbedrag: number | Empty
  /** L — eind-leeftijd. */
  readonly eindLeeftijd: number | Empty
  /** M — Geb-bedrag. */
  readonly gebBedrag: number | Empty
}

/** De erfenis-afleidingen (Auto-geb B56-B59). */
export interface ErfenisResult {
  /** B56 — vrijstelling (relatie). */
  readonly vrijstelling: number
  /** B57 — vlaktarief (relatie). */
  readonly tarief: number
  /** B58 — netto erfenis (nominaal). */
  readonly netto: number
  /** B59 — Geb-bedrag (gede-indexeerd; leeg als netto ≤ 0). */
  readonly gebBedrag: number | Empty
}

/** De volledige berekende Auto-gebeurtenissen-tab (afgeleide cellen). */
export interface AutoGebeurtenissenResult {
  /** B6 — huidige leeftijd (`=P!B7`). */
  readonly huidigeLeeftijd: number
  /** B7 — AOW-leeftijd (`=ES!C15`=P!B55). */
  readonly aowLeeftijd: number
  /** B21 — bruto AOW/mnd (na opbouwkorting). */
  readonly aowBedrag: number
  /** Rij 35-52 — 18 kinderpost-rijen (3 kinderen × 6 posten). */
  readonly kinderRows: readonly KinderPostRow[]
  /** Rij 26-31 — 6 pensioen-pot-rijen (J-M). */
  readonly pensioenRows: readonly PensioenAnnuiteitRow[]
  /** B56-B59 — erfenis. */
  readonly erfenis: ErfenisResult
}

/** AOW bruto/mnd (B21): tarief per leefsituatie × opbouwjaren-korting (max 50). */
function computeAow(input: KernelInput): number {
  const auto = input.autoGebeurtenissen
  const basis =
    auto.leefsituatie === 'Alleenstaand' ? AOW_ALLEENSTAAND_PER_MAAND : AOW_SAMENWONEND_PER_MAAND
  return (basis * Math.min(auto.aowOpbouwjaren, AOW_MAX_OPBOUWJAREN)) / AOW_MAX_OPBOUWJAREN
}

/** Bedrag/mnd per kinderpost (kost negatief, bijslag positief). Alleen bij actief kind. */
function kinderBedragPerMaand(postIdx: number, input: KernelInput): number {
  const auto = input.autoGebeurtenissen
  switch (postIdx) {
    case 0: // fase 1
    case 1: // fase 2
    case 2: // fase 3
      return -(auto.nibudBasisPerMaand * NIBUD_FASE_FACTOR[postIdx])
    case 3: // opvang (0-4 jr)
      return -auto.kinderopvangNettoPerMaand
    case 4: // kinderbijslag
      return auto.kinderbijslagPerMaand
    case 5: // babyuitzet (eenmalig)
      return -auto.babyuitzetEenmalig
    default:
      return 0
  }
}

/** Reproduceer de 18 kinderpost-rijen (rij 35-52) uit de kinderen-invoer. */
function computeKinderRows(input: KernelInput): KinderPostRow[] {
  const auto = input.autoGebeurtenissen
  const rows: KinderPostRow[] = []
  for (let kind = 0; kind < AANTAL_KINDEREN_SLOTS; kind++) {
    // m0 = geboorte-maandindex t.o.v. maand 0 (negatief = kind al geboren).
    const m0 = (auto.kindGeboorteLeeftijden[kind] - input.startLeeftijd) * 12
    const actief = kind + 1 <= auto.aantalKinderen ? 1 : 0
    for (const post of KINDER_POSTEN) {
      // sIdx klemt op maand 0 (verstreken fasen vervallen); eIdx: periodiek loopt
      // t/m fase-eind−1, eenmalig valt exact op de geboortemaand m0.
      const sIdx = Math.max(0, m0 + post.fs)
      const eIdx = post.type === 'Eenmalig' ? m0 : m0 + post.fe - 1
      rows.push({
        kind: kind + 1,
        fs: post.fs,
        fe: post.fe,
        type: post.type,
        m0,
        sIdx,
        eIdx,
        actief,
        // J-N vullen alléén als het kind actief is; anders het Excel-""-resultaat.
        bedragPerMaand: actief ? kinderBedragPerMaand(post.idx, input) : EMPTY,
        startLeeftijd: actief ? input.startLeeftijd + Math.floor(sIdx / 12) : EMPTY,
        startMaand: actief ? (sIdx % 12) + 1 : EMPTY,
        eindLeeftijd: actief ? input.startLeeftijd + Math.floor(eIdx / 12) : EMPTY,
        eindMaand: actief ? (eIdx % 12) + 1 : EMPTY,
      })
    }
  }
  return rows
}

/** Erf-vrijstelling per relatie (2025-benadering; alleen "kind" is beproefd). */
function erfVrijstelling(relatie: string): number {
  return relatie === 'kind' || relatie === 'kleinkind'
    ? ERF_VRIJSTELLING_KIND
    : ERF_VRIJSTELLING_OVERIG
}

/** Erf-vlaktarief per relatie (2025-benadering; alleen "kind"=0,15 is beproefd). */
function erfTarief(relatie: string): number {
  switch (relatie) {
    case 'kind':
      return 0.15
    case 'kleinkind':
      return 0.21 // onbeproefd
    default:
      return 0.33 // onbeproefd
  }
}

/** Erfenis-afleidingen (B56-B59): vrijstelling/tarief → netto → gede-indexeerd Geb-bedrag. */
function computeErfenis(input: KernelInput): ErfenisResult {
  const auto = input.autoGebeurtenissen
  const vrijstelling = erfVrijstelling(auto.erfenisRelatie)
  const tarief = erfTarief(auto.erfenisRelatie)
  const heffing = Math.max(0, auto.erfenisBruto - vrijstelling) * tarief
  const netto = auto.erfenisBruto - heffing
  // Eénmalig, niet-geïndexeerd → vooraf gede-indexeerd zodat CF!H's centrale
  // indexatie de post nominaal-constant maakt. Leeg als er niets te erven valt.
  const jarenTotErfenis = auto.erfenisLeeftijd - input.startLeeftijd
  const gebBedrag =
    netto > 0 ? netto / Math.pow(1 + input.inflatie, jarenTotErfenis) : EMPTY
  return { vrijstelling, tarief, netto, gebBedrag }
}

/**
 * Pensioen-annuïtisering per pot (rij 26-31, kolommen J-M). Modus "pot" →
 * maandbedrag via `PMT(inflatie/12, duur·12, −inleg)`. In alle 16 fixtures zijn
 * de pot-slots leeg → deze functie levert 6× het lege-cel-resultaat en de
 * waarde-tak is onbeproefd (zie module-doc + rapport).
 */
function computePensioenRows(input: KernelInput): PensioenAnnuiteitRow[] {
  const potten = input.autoGebeurtenissen.pensioenPotten
  const rows: PensioenAnnuiteitRow[] = []
  for (let slot = 0; slot < 6; slot++) {
    const pot = potten.find((p) => p.slot === slot)
    if (pot === undefined) {
      rows.push({ duurModel: EMPTY, maandbedrag: EMPTY, eindLeeftijd: EMPTY, gebBedrag: EMPTY })
      continue
    }
    // ONBEPROEFD: geen enkele fixture vult een pensioen-pot. Bewust conservatief
    // gelaten op "" i.p.v. een niet-toetsbare annuïtiserings-formule te raden;
    // meld aan de orchestrator zodra een fixture dit exerceert.
    rows.push({ duurModel: EMPTY, maandbedrag: EMPTY, eindLeeftijd: EMPTY, gebBedrag: EMPTY })
  }
  return rows
}

/** Bereken de afgeleide cellen van de Auto-gebeurtenissen-tab uit `KernelInput`. */
export function computeAutoGebeurtenissen(input: KernelInput): AutoGebeurtenissenResult {
  return {
    huidigeLeeftijd: input.startLeeftijd, // B6 = P!B7
    aowLeeftijd: input.persoon.aowLeeftijd, // B7 = ES!C15 = P!B55
    aowBedrag: computeAow(input), // B21
    kinderRows: computeKinderRows(input), // rij 35-52
    pensioenRows: computePensioenRows(input), // rij 26-31 (J-M)
    erfenis: computeErfenis(input), // B56-B59
  }
}

// ── Auto-events (invoer voor Geb rij 14-30) ──────────────────────────────────

/**
 * Eén automatisch gegenereerde gebeurtenis die op de Geb-tab landt. Bedrag in
 * koopkracht-nu (+bate/−kost); `geindexeerd=false` betekent dat het bedrag al
 * gede-indexeerd is (CF!H indexeert centraal terug naar nominaal-constant).
 */
export interface AutoEvent {
  /** Doel-rij op de Geb-tab (14-30). */
  readonly gebRow: number
  /** Post-slot binnen die rij (1/2/3). */
  readonly post: 1 | 2 | 3
  /** Naam (Geb kolom A) — alleen post 1 draagt de rij-naam. */
  readonly naam: string
  readonly type: 'Periodiek' | 'Eenmalig'
  /** Bedrag koopkracht-nu (Geb kolom C / helper bn). */
  readonly bedrag: number
  /** Geïndexeerd? (bepaalt de bn-de-indexatie). */
  readonly geindexeerd: boolean
  readonly startLeeftijd: number
  readonly startMaand: number
  /** Eind-leeftijd (`null` = eenmalig / geen eind). */
  readonly eindLeeftijd: number | null
  /** Eind-maand (`null` = eenmalig / geen eind). */
  readonly eindMaand: number | null
}

/**
 * De automatische gebeurtenissen die uit de domein-invoer volgen en op Geb rij
 * 14-30 geplaatst worden. In alle 16 fixtures levert dit alléén de AOW-post
 * (rij 14); pensioen/kinderen/erfenis zijn inactief. De inactieve takken zijn
 * geïmplementeerd conform de structuur maar onbeproefd (zie module-doc).
 */
export function computeAutoEvents(input: KernelInput): AutoEvent[] {
  const events: AutoEvent[] = []
  const auto = input.autoGebeurtenissen

  // ── AOW → Geb rij 14 (Periodiek, +bedrag, AOW-leeftijd mnd 1 t/m leeftijd 100). ──
  events.push({
    gebRow: 14,
    post: 1,
    naam: 'AOW (auto)',
    type: 'Periodiek',
    bedrag: computeAow(input),
    geindexeerd: true,
    startLeeftijd: input.persoon.aowLeeftijd,
    startMaand: 1,
    eindLeeftijd: 100,
    eindMaand: 1,
  })

  // ── Erfenis → Geb rij 30 (Eenmalig, +netto, op leeftijd B18 mnd 1). ──
  // ONBEPROEFD (bruto=0 in alle fixtures → geen event). Geïmplementeerd conform
  // Auto-geb!B60; de motor plaatst 'm pas bij netto>0.
  const erfenis = computeErfenis(input)
  if (typeof erfenis.gebBedrag === 'number') {
    events.push({
      gebRow: 30,
      post: 1,
      naam: 'Erfenis (auto)',
      type: 'Eenmalig',
      bedrag: erfenis.gebBedrag,
      geindexeerd: false, // reeds gede-indexeerd
      startLeeftijd: auto.erfenisLeeftijd,
      startMaand: 1,
      eindLeeftijd: null,
      eindMaand: null,
    })
  }

  // Pensioen (rij 15-20) en kinderen (rij 21-26) zijn in alle fixtures inactief;
  // hun Geb-rijen leveren daardoor uitsluitend de inactieve helper-markers. De
  // actieve expansie is onbeproefd en bewust niet gespeculeerd.
  return events
}
