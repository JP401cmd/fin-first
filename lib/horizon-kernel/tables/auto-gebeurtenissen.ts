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
 * - **Pensioen rij 26-31 (J-M)** — annuïtisering per pot: duur-model J (SWITCH op
 *   type), maandbedrag K (`PMT(inflatie/12, duur·12, −inleg)` bij modus "pot"),
 *   eind-leeftijd L=C+J en Geb-bedrag M. Naamloze/lege slots leveren "".
 *
 * ## Beproevings-dekking
 * De 16 basis-fixtures delen dezelfde Auto-gebeurtenissen-invoer (**Alleenstaand,
 * 50 opbouwjaren, 0 kinderen, erfenis €0, geen pensioen-potten**); zij bewijzen de
 * AOW-alleenstaand-tak (1452), de inactieve-kind-index-structuur en de erfenis=0-
 * tak (B58=0). Fixture **`gezin`** (17e) exerceert de resterende takken cel-voor-
 * cel: AOW-samenwonend (993), actieve-kind J-N-waarden, erfenis>0 (B58=105.833,50
 * / B59 gede-indexeerd) en de pensioen-annuïtisering (lijfrente_bancair-slot).
 * Nog onbeproefd (conform de structuur geïmplementeerd, geen fixture): de niet-
 * bancaire pensioen-typen, modus "direct bruto" en geïndexeerd="Nee".
 *
 * Pure functie — geen fs/Supabase/Date.now/Math.random.
 */

import { MAX_AGE, type KernelInput, type PensioenPot } from '../types'

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
  // B58 EXCEL-EXACT: netto = MAX(0, bruto − vrijstelling) × (1 − tarief).
  // NB — modeleigenaardigheid: de vrijstelling keert NIET terug in het netto-
  // bedrag; het (1 − tarief) valt óók op de al-vrijgestelde voet i.p.v. alleen op
  // het belaste deel. Dit wijkt af van de intuïtieve "bruto − heffing" (die de
  // vrijstelling wél zou uitkeren). Bewust 1-op-1 het oracle gevolgd — geen eigen
  // correctie; voorgelegd aan de model-eigenaar en op 2026-07-02 AKKOORD bevonden
  // (bewuste modelkeuze, geen bug — zie plan-doc §7, besluit V16).
  const netto = Math.max(0, auto.erfenisBruto - vrijstelling) * (1 - tarief)
  // Eénmalig, niet-geïndexeerd → vooraf gede-indexeerd zodat CF!H's centrale
  // indexatie de post nominaal-constant maakt. Leeg als er niets te erven valt.
  const jarenTotErfenis = auto.erfenisLeeftijd - input.startLeeftijd
  const gebBedrag =
    netto > 0 ? netto / Math.pow(1 + input.inflatie, jarenTotErfenis) : EMPTY
  return { vrijstelling, tarief, netto, gebBedrag }
}

/** Excel `PMT(rate, nper, pv)` met fv=0, type=0 (annuïteit-betaling per periode). */
function pmt(rate: number, nper: number, pv: number): number {
  if (nper <= 0) return 0
  if (rate === 0) return -pv / nper
  const growth = Math.pow(1 + rate, nper)
  return -(pv * rate * growth) / (growth - 1)
}

/**
 * Duur-model J (Auto-geb rij 26-31, kolom J) — een verborgen ArrayFormula:
 * `SWITCH(type; lijfrente_bancair→MAX(G;5); bedrijf|levenslang→100−C; tijdelijk→
 * MIN(MAX(G;5);10))`, met G = duur-invoer (kolom G) en C = ingangsleeftijd. Alleen
 * `lijfrente_bancair` is beproefd (fixture `gezin`, J=MAX(20;5)=20); de overige
 * takken zijn conform de structuur geïmplementeerd maar onbeproefd.
 */
function pensioenDuurModel(type: string | null, duurInvoer: number, ingang: number): number {
  const gMin5 = Math.max(duurInvoer, 5)
  switch (type) {
    case 'lijfrente_bancair':
      return gMin5
    case 'lijfrente_levenslang':
    case 'bedrijf':
      return MAX_AGE - ingang // 100 − C → eind-leeftijd 100 (onbeproefd)
    case 'lijfrente_tijdelijk':
      return Math.min(gMin5, 10) // onbeproefd
    default:
      return gMin5 // onbeproefd
  }
}

/** Afgeleide J/K/L/M van één ACTIEVE pensioen-pot (+ ingang/geïndexeerd voor Geb). */
interface PensioenDerived {
  /** C — ingangsleeftijd (Geb-startleeftijd). */
  readonly ingang: number
  /** J — duur (jr, model). */
  readonly duurModel: number
  /** K — maandbedrag. */
  readonly maandbedrag: number
  /** L — eind-leeftijd = C + J. */
  readonly eindLeeftijd: number
  /** M — Geb-bedrag. */
  readonly gebBedrag: number
  /** H = "Ja" → geïndexeerd. */
  readonly geindexeerd: boolean
}

/**
 * Leid J/K/L/M af voor één pensioen-pot. `null` = inactief slot (geen naam):
 * A26 is de gate van zowel de J-M-formules als de Geb-rij (structuur.md).
 */
function derivePensioenPot(input: KernelInput, pot: PensioenPot): PensioenDerived | null {
  if (pot.naam === null) return null // A26-gate
  const ingang = pot.ingangsLeeftijd ?? 0
  const duurModel = pensioenDuurModel(pot.type, pot.duurJaarInvoer ?? 0, ingang)
  // K — modus "pot" annuïtiseert de inleg via PMT(inflatie/12, duur·12, −inleg);
  // een direct-bruto-modus (onbeproefd) neemt kolom E rechtstreeks.
  const maandbedrag =
    pot.invoermodus === 'pot'
      ? pmt(input.inflatie / 12, duurModel * 12, -(pot.inlegPot ?? 0))
      : (pot.brutoPerMaand ?? 0)
  const geindexeerd = pot.geindexeerd === 'Ja'
  // M — geïndexeerd ⇒ = K; niet-geïndexeerd (onbeproefd) ⇒ vooraf gede-indexeerd
  // naar de ingangsleeftijd zodat CF!H centraal terug-indexeert.
  const gebBedrag = geindexeerd
    ? maandbedrag
    : maandbedrag / Math.pow(1 + input.inflatie, ingang - input.startLeeftijd)
  return { ingang, duurModel, maandbedrag, eindLeeftijd: ingang + duurModel, gebBedrag, geindexeerd }
}

/**
 * Pensioen-annuïtisering per pot (rij 26-31, kolommen J-M). Modus "pot" →
 * maandbedrag via `PMT(inflatie/12, duur·12, −inleg)`; lege/naamloze slots leveren
 * het lege-cel-resultaat (""). Beproefd door fixture `gezin` (slot 0); de overige
 * type-/geïndexeerd-takken zijn conform de structuur maar onbeproefd.
 */
function computePensioenRows(input: KernelInput): PensioenAnnuiteitRow[] {
  const potten = input.autoGebeurtenissen.pensioenPotten
  const rows: PensioenAnnuiteitRow[] = []
  for (let slot = 0; slot < 6; slot++) {
    const pot = potten.find((p) => p.slot === slot)
    const derived = pot === undefined ? null : derivePensioenPot(input, pot)
    if (derived === null) {
      rows.push({ duurModel: EMPTY, maandbedrag: EMPTY, eindLeeftijd: EMPTY, gebBedrag: EMPTY })
      continue
    }
    rows.push({
      duurModel: derived.duurModel,
      maandbedrag: derived.maandbedrag,
      eindLeeftijd: derived.eindLeeftijd,
      gebBedrag: derived.gebBedrag,
    })
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
 * De Geb-events per ACTIEF kind (Geb rij 21-26). Elk kind vult twee Geb-rijen:
 * de fasen-rij (NIBUD-fasen 1/2/3 als post 1/2/3) en de opvang/bijslag/uitzet-rij
 * (opvang/bijslag/babyuitzet als post 1/2/3). Alléén post 1 draagt de rij-naam;
 * `geb.ts` bouwt enkel voor post 1 de event-cellen A-H. De helper-kolommen W:AE
 * (sIdx/eIdx/bn per post) leidt `geb.ts` af uit start/eind + bedrag.
 */
function computeKinderEvents(input: KernelInput): AutoEvent[] {
  const rows = computeKinderRows(input)
  const postenPerKind = KINDER_POSTEN.length // 6 posten per kind
  const events: AutoEvent[] = []
  rows.forEach((row, i) => {
    if (row.actief !== 1) return // inactief kind → geen event (rij blijft inactief)
    const kind0 = Math.floor(i / postenPerKind) // 0-gebaseerd kindnummer
    const postInKind = i % postenPerKind // 0..5
    const isFasenRow = postInKind < 3 // posten 0-2 → fasen-rij, 3-5 → opvang-rij
    const gebRow = (isFasenRow ? 21 : 22) + kind0 * 2
    const post = ((isFasenRow ? postInKind : postInKind - 3) + 1) as 1 | 2 | 3
    const isEenmalig = row.type === 'Eenmalig'
    // Leeftijd/maand uit de (altijd numerieke) sIdx/eIdx; eenmalig heeft geen eind.
    const startLeeftijd = input.startLeeftijd + Math.floor(row.sIdx / 12)
    const startMaand = (row.sIdx % 12) + 1
    const eindLeeftijd = isEenmalig ? null : input.startLeeftijd + Math.floor(row.eIdx / 12)
    const eindMaand = isEenmalig ? null : (row.eIdx % 12) + 1
    events.push({
      gebRow,
      post,
      naam:
        post === 1
          ? isFasenRow
            ? `Kind ${row.kind} – NIBUD fasen (auto)`
            : `Kind ${row.kind} – opvang/bijslag/uitzet (auto)`
          : '', // post 2/3: naam ongebruikt (geen event-cellen)
      type: row.type,
      bedrag: kinderBedragPerMaand(postInKind, input),
      geindexeerd: true, // koopkracht-nu; CF!H indexeert centraal
      startLeeftijd,
      startMaand,
      eindLeeftijd,
      eindMaand,
    })
  })
  return events
}

/**
 * De automatische gebeurtenissen die uit de domein-invoer volgen en op Geb rij
 * 14-30 geplaatst worden: AOW (rij 14), pensioen-multipot (rij 15-20), kinderen
 * (rij 21-26) en erfenis (rij 30). In de 16 basis-fixtures levert dit alléén de
 * AOW-post; fixture `gezin` (17e) exerceert álle overige takken cel-voor-cel.
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
    eindLeeftijd: MAX_AGE,
    eindMaand: 1,
  })

  // ── Pensioen-multipot → Geb rij 15-20 (post 1, Periodiek, +uitkering C-tot-L). ──
  // Gate op A26 (naam); maandbedrag = M (geïndexeerd ⇒ K, anders gede-indexeerd).
  for (const pot of auto.pensioenPotten) {
    const derived = derivePensioenPot(input, pot)
    if (derived === null) continue // naamloos slot → inactief
    events.push({
      gebRow: 15 + pot.slot,
      post: 1,
      naam: `${pot.naam} (pensioen)`,
      type: 'Periodiek',
      bedrag: derived.gebBedrag,
      geindexeerd: derived.geindexeerd,
      startLeeftijd: derived.ingang,
      startMaand: 1,
      eindLeeftijd: derived.eindLeeftijd,
      eindMaand: 1,
    })
  }

  // ── Kinderen → Geb rij 21-26 (2 rijen p. kind, 3 posten p. rij). ──
  events.push(...computeKinderEvents(input))

  // ── Erfenis → Geb rij 30 (Eenmalig, +netto, op leeftijd B18 mnd 1). ──
  // De motor plaatst 'm pas bij netto>0 (bruto=0 in de 16 basis-fixtures → geen event).
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

  return events
}
