/**
 * Horizon-kernel — bouw `KernelInput` uit een OracleFixture.
 *
 * **Node/test/server-only** (via de oracle-loader; leest geen fs zelf maar
 * consumeert een reeds geladen fixture). Vertaalt de **volledige** Excel-invoer-
 * oppervlakte naar de domein-vrije `KernelInput` (FASE 2, stap 2). Elke
 * celverwijzing is één-op-één herleidbaar naar `docs/horizon-oracle/inputs.json`
 * + `structuur.md`; het commentaar noemt de cel. Geen gok-mappings: onbeproefde
 * of afgeleide cellen worden bewust NIET als speculatief input-veld opgenomen
 * (zie module-doc van `types.ts` en het rapport).
 *
 * Doel: de komende parallelle tabel-porters hoeven dit bestand (en `types.ts`)
 * niet meer te wijzigen — de hele input staat er al.
 *
 * Bronnen per blok: P-parameters uit tab `P`; potten uit `bens`; prio's uit `TS`;
 * handmatige gebeurtenissen uit `Geb` (rij 4-13); domeininvoer uit
 * `Auto-gebeurtenissen`; partner uit `PT`; salaris uit `Werk-strategie`;
 * onzekerheid uit `P` (scenarioband) + `MC` + `Hist`.
 */

import { getCell } from './oracle/fixture-load'
import type { CellValue, OracleFixture } from './oracle/fixture-types'
import type {
  AfnameStrategie,
  AssetBox3Type,
  AssetCategorie,
  AssetPot,
  AssetRol,
  AutoGebeurtenisParams,
  Box3Method,
  Box3Params,
  DebtBox3Type,
  DebtCategorie,
  DebtPot,
  DebtRol,
  Eindstrategie,
  EindstrategieParams,
  GebeurtenisRij,
  GebPost,
  GebPostType,
  HistParams,
  InkomenUitgavenParams,
  JaNee,
  KernelInput,
  McParams,
  Onttrekkingsprofiel,
  OnttrekkingsprofielParams,
  OnttrekkingStrategie,
  OnzekerheidParams,
  PartnerParams,
  PensioenPot,
  PersoonParams,
  ScenarioBand,
  StrategieSelectors,
  ToenameStrategie,
  TsBezitCategorie,
  TsParams,
  TsSchuldCategorie,
  TsSchuldCategorieLabel,
  VerkoopTrigger,
  WerkStrategieDeeltijd,
  WerkStrategieParams,
  WerkStrategieSprong,
  WoningStrategie,
  WoningStrategieParams,
} from './types'

// ── bens-slot-layout ─────────────────────────────────────────────────────────
const ASSET_SLOTS = 10 // bens rij 4..13
const DEBT_SLOTS = 7 // bens rij 17..23
const ASSET_ROW_START = 4
const DEBT_ROW_START = 17

// Getypte slot-rollen (contract, Controle!K8/K9 + gereserveerde slots).
const ASSET_ROL_HUIS_SLOT = 2 // bens rij 6 = eigen huis
const DEBT_ROL_HYPOTHEEK_SLOT = 0 // bens rij 17 = hypotheek
const DEBT_ROL_OPEET_SLOT = 3 // bens rij 20 = opeethypotheek
const DEBT_ROL_TEKORT_SLOT = 6 // bens rij 23 = tekort-lening

const ASSET_BOX3_TYPES: readonly AssetBox3Type[] = ['Box 3 spaar', 'Box 3 investering', 'Geen Box 3']
const DEBT_BOX3_TYPES: readonly DebtBox3Type[] = ['Box 3 schuld', 'Geen Box 3 schuld']
const ASSET_CATEGORIEEN: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]
const DEBT_CATEGORIEEN: readonly DebtCategorie[] = [
  'Woning',
  'Consumptief',
  'Studie',
  'Zakelijk',
  'Overig',
  'Tekort',
]

// TS-categorie-rijen (vaste volgorde = categorie-identiteit).
const TS_BEZIT_ROWS: readonly { rij: number; categorie: AssetCategorie }[] = [
  { rij: 5, categorie: 'Spaargeld' },
  { rij: 6, categorie: 'Beleggingen' },
  { rij: 7, categorie: 'Pensioen' },
  { rij: 8, categorie: 'Vastgoed' },
  { rij: 9, categorie: 'Eigen huis' },
  { rij: 10, categorie: 'Overig' },
]
const TS_SCHULD_ROWS: readonly { rij: number; categorie: TsSchuldCategorieLabel }[] = [
  { rij: 16, categorie: 'Woning' },
  { rij: 17, categorie: 'Consumptief' },
  { rij: 18, categorie: 'Studie' },
  { rij: 19, categorie: 'Zakelijk' },
  { rij: 20, categorie: 'Overig' },
  { rij: 21, categorie: 'Tekort-lening' },
]

// Geb-post-kolommen (per post 1/2/3): type / bedrag / start-lt / start-mnd / eind-lt / eind-mnd.
const GEB_POST_COLS: readonly {
  type: string
  bedrag: string
  startLt: string
  startMnd: string
  eindLt: string
  eindMnd: string
}[] = [
  { type: 'B', bedrag: 'C', startLt: 'E', startMnd: 'F', eindLt: 'G', eindMnd: 'H' },
  { type: 'I', bedrag: 'J', startLt: 'L', startMnd: 'M', eindLt: 'N', eindMnd: 'O' },
  { type: 'P', bedrag: 'Q', startLt: 'S', startMnd: 'T', eindLt: 'U', eindMnd: 'V' },
]

// ── celhelpers ───────────────────────────────────────────────────────────────

/** Lees een verplicht getal; gooit een duidelijke fout bij een ander celtype. */
function num(fx: OracleFixture, ref: string, label: string): number {
  const v = getCell(fx, ref)
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`KernelInput: ${label} (${ref}) verwacht een getal, kreeg ${JSON.stringify(v)}`)
  }
  return v
}

/** Lees een getal; lege/niet-numerieke cel → 0 (Excel-semantiek voor leeg-numeriek). */
function numOr0(fx: OracleFixture, ref: string): number {
  const v = getCell(fx, ref)
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

/** Lees een optioneel getal; lege/niet-numerieke cel → null. */
function optNum(fx: OracleFixture, ref: string): number | null {
  const v = getCell(fx, ref)
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

/** Lees een optionele string (lege/niet-string → null). */
function optStr(fx: OracleFixture, ref: string): string | null {
  const v = getCell(fx, ref)
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

/** Lees een verplichte niet-lege string. */
function str(fx: OracleFixture, ref: string, label: string): string {
  const v = optStr(fx, ref)
  if (v === null) {
    throw new Error(`KernelInput: ${label} (${ref}) verwacht een tekst, kreeg ${JSON.stringify(getCell(fx, ref))}`)
  }
  return v
}

/** 1/0 (getal of numerieke string) → boolean; leeg → false. */
function bool01(fx: OracleFixture, ref: string): boolean {
  const v = getCell(fx, ref)
  if (v === 1 || v === '1') return true
  if (v === 0 || v === '0' || v === null || v === '') return false
  throw new Error(`KernelInput: ${ref} verwacht 1/0, kreeg ${JSON.stringify(v)}`)
}

/** "Ja"/"Nee" (case-insensitief) → boolean; leeg → false. */
function boolJaNee(fx: OracleFixture, ref: string): boolean {
  const v = getCell(fx, ref)
  if (v === null || v === '') return false
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (t === 'ja') return true
    if (t === 'nee') return false
  }
  throw new Error(`KernelInput: ${ref} verwacht Ja/Nee, kreeg ${JSON.stringify(v)}`)
}

/** Valideer een cel tegen een gesloten optielijst (strikt; vangt fixture-drift). */
function parseEnum<T extends string>(
  fx: OracleFixture,
  ref: string,
  options: readonly T[],
  label: string,
): T {
  const v = getCell(fx, ref)
  if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T
  throw new Error(
    `KernelInput: ${label} (${ref}) verwacht één van [${options.join(', ')}], kreeg ${JSON.stringify(v)}`,
  )
}

// ── Box 3 ──────────────────────────────────────────────────────────────────────

/** P!B90 → Box3-methode. */
function parseBox3Method(v: CellValue): Box3Method {
  if (v === 'forfaitair' || v === 'werkelijk') return v
  throw new Error(`KernelInput: onbekende Box3-methode (P!B90): ${JSON.stringify(v)}`)
}

function buildBox3(fx: OracleFixture): Box3Params {
  return {
    method: parseBox3Method(getCell(fx, 'P!B90')),
    tarief: num(fx, 'P!B20', 'Box3-tarief'),
    forfaitSpaar: num(fx, 'P!B21', 'forfait spaargeld'),
    forfaitOverig: num(fx, 'P!B22', 'forfait overige bezittingen'),
    forfaitSchuld: num(fx, 'P!B23', 'forfait schulden'),
    heffingvrijVermogenPP: num(fx, 'P!B18', 'heffingvrij vermogen p.p.'),
    personen: num(fx, 'P!B19', 'aantal personen'),
    schuldendrempelPP: num(fx, 'P!B24', 'schuldendrempel p.p.'),
    heffingvrijInkomenTotaal: num(fx, 'P!B92', 'heffingvrij inkomen totaal'),
  }
}

// ── potten (bens) ──────────────────────────────────────────────────────────────

/** bens!D{rij} → asset-box3-type of null (lege slot). */
function parseAssetBox3(v: CellValue): AssetBox3Type | null {
  return typeof v === 'string' && (ASSET_BOX3_TYPES as readonly string[]).includes(v)
    ? (v as AssetBox3Type)
    : null
}

/** bens!F{rij} → schuld-box3-type of null (lege slot). */
function parseDebtBox3(v: CellValue): DebtBox3Type | null {
  return typeof v === 'string' && (DEBT_BOX3_TYPES as readonly string[]).includes(v)
    ? (v as DebtBox3Type)
    : null
}

function assetRol(slot: number): AssetRol | null {
  return slot === ASSET_ROL_HUIS_SLOT ? 'eigenHuis' : null
}

function debtRol(slot: number): DebtRol | null {
  switch (slot) {
    case DEBT_ROL_HYPOTHEEK_SLOT:
      return 'hypotheek'
    case DEBT_ROL_OPEET_SLOT:
      return 'opeethypotheek'
    case DEBT_ROL_TEKORT_SLOT:
      return 'tekortLening'
    default:
      return null
  }
}

function buildAssetPotten(fx: OracleFixture): AssetPot[] {
  const potten: AssetPot[] = []
  for (let slot = 0; slot < ASSET_SLOTS; slot++) {
    const rij = ASSET_ROW_START + slot
    const box3Type = parseAssetBox3(getCell(fx, `bens!D${rij}`))
    if (box3Type === null) continue // leeg slot (geen box3-type)
    potten.push({
      slot,
      naam: optStr(fx, `bens!A${rij}`),
      box3Type,
      categorie: parseEnum(fx, `bens!E${rij}`, ASSET_CATEGORIEEN, `bezitting-categorie rij ${rij}`),
      startwaarde: numOr0(fx, `bens!B${rij}`),
      rendement: numOr0(fx, `bens!C${rij}`),
      investering: bool01(fx, `bens!F${rij}`),
      rol: assetRol(slot),
    })
  }
  return potten
}

function buildSchuldPotten(fx: OracleFixture): DebtPot[] {
  const potten: DebtPot[] = []
  for (let slot = 0; slot < DEBT_SLOTS; slot++) {
    const rij = DEBT_ROW_START + slot
    const box3Type = parseDebtBox3(getCell(fx, `bens!F${rij}`))
    if (box3Type === null) continue // leeg slot
    potten.push({
      slot,
      naam: optStr(fx, `bens!A${rij}`),
      box3Type,
      categorie: parseEnum(fx, `bens!I${rij}`, DEBT_CATEGORIEEN, `schuld-categorie rij ${rij}`),
      startwaarde: numOr0(fx, `bens!B${rij}`),
      aflossingPct: numOr0(fx, `bens!C${rij}`),
      aflossingEur: numOr0(fx, `bens!D${rij}`),
      rente: numOr0(fx, `bens!E${rij}`),
      liquide: boolJaNee(fx, `bens!G${rij}`),
      inSparenNaAflossing: boolJaNee(fx, `bens!H${rij}`),
      rol: debtRol(slot),
    })
  }
  return potten
}

// ── P-parameterblokken ─────────────────────────────────────────────────────────

function buildPersoon(fx: OracleFixture): PersoonParams {
  return {
    geboortejaar: num(fx, 'P!B5', 'geboortejaar'),
    startjaar: num(fx, 'P!B6', 'startjaar'),
    aowLeeftijd: num(fx, 'P!B55', 'AOW-leeftijd'),
  }
}

function buildInkomenUitgaven(fx: OracleFixture): InkomenUitgavenParams {
  return {
    nettoJaarinkomen: num(fx, 'P!B10', 'netto jaarinkomen'),
    nettoJaaruitgaven: num(fx, 'P!B11', 'netto jaaruitgaven'),
    uitgaveNaPensioenPerJaar: num(fx, 'P!B15', 'uitgave na pensioen'),
  }
}

const TOENAME_STRATEGIEEN: readonly ToenameStrategie[] = [
  'Sparen',
  'gelijk verdelen over bezittingen',
  'Eerst schulden aflossen (hoge rente eerst)',
  'Beleggen',
  'Eigen indeling',
]
const AFNAME_STRATEGIEEN: readonly AfnameStrategie[] = [
  'Spaargeld eerst',
  'gewogen onttrekken uit bezittingen behalve eigen huis',
  'Uit beleggingen',
  'Eigen indeling',
]
const ONTTREKKING_STRATEGIEEN: readonly OnttrekkingStrategie[] = [
  'Toegankelijk eerst (default)',
  'Rendement laten doorgroeien',
  'Pensioen/huis ontzien',
  'Eigen indeling',
]

function buildStrategie(fx: OracleFixture): StrategieSelectors {
  return {
    toename: parseEnum(fx, 'P!B28', TOENAME_STRATEGIEEN, 'toename-strategie'),
    afname: parseEnum(fx, 'P!B29', AFNAME_STRATEGIEEN, 'afname-strategie'),
    onttrekking: parseEnum(fx, 'P!B30', ONTTREKKING_STRATEGIEEN, 'onttrekking-strategie'),
  }
}

const EINDSTRATEGIEEN: readonly Eindstrategie[] = [
  'Vermogen opeten',
  'Nalatenschap',
  'Eeuwigdurend',
  'Pensioenleeftijd',
]
const JA_NEE: readonly JaNee[] = ['Ja', 'Nee']

function buildEindstrategie(fx: OracleFixture): EindstrategieParams {
  return {
    selector: parseEnum(fx, 'P!B48', EINDSTRATEGIEEN, 'eindstrategie'),
    eindleeftijdOpeten: num(fx, 'P!B51', 'eindleeftijd opeten'),
    eindleeftijdNalatenschap: num(fx, 'P!B52', 'eindleeftijd nalatenschap'),
    nalatenschapBedrag: num(fx, 'P!B53', 'nalatenschapbedrag'),
    nietLiquideMeetellen: parseEnum(fx, 'P!B54', JA_NEE, 'niet-liquide meetellen'),
  }
}

const WONING_STRATEGIEEN: readonly WoningStrategie[] = [
  'Meerekenen',
  'Uitsluiten',
  'Verkopen',
  'Opeethypotheek',
]
const VERKOOP_TRIGGERS: readonly VerkoopTrigger[] = ['Vaste leeftijd', 'Wanneer nodig']

function buildWoning(fx: OracleFixture): WoningStrategieParams {
  return {
    selector: parseEnum(fx, 'P!B57', WONING_STRATEGIEEN, 'woning-strategie'),
    trigger: parseEnum(fx, 'P!B58', VERKOOP_TRIGGERS, 'verkoop-trigger'),
    verkoopleeftijd: num(fx, 'P!B59', 'verkoopleeftijd'),
    drempelMaandenUitgave: num(fx, 'P!B60', 'drempel maanden-uitgave'),
    verkoopprijsPctWoz: num(fx, 'P!B61', 'verkoopprijs % WOZ'),
    verkoopkostenPct: num(fx, 'P!B62', 'verkoopkosten %'),
    huurNaVerkoopPctWozPerJaar: num(fx, 'P!B63', 'huur na verkoop % WOZ/jr'),
    opeetStartleeftijdOpname: num(fx, 'P!B64', 'startleeftijd opname'),
    opeetMaxLeningPctOverwaarde: num(fx, 'P!B65', 'max lening % overwaarde'),
    opeetRentePerJaar: num(fx, 'P!B66', 'rente opeethypotheek'),
    opeetMaandopname: optNum(fx, 'P!B67'), // leeg = auto
  }
}

const ONTTREKKINGSPROFIELEN: readonly Onttrekkingsprofiel[] = ['Vast', 'Afnemend', 'Oplopend', 'Guardrails']

function buildOnttrekkingsprofiel(fx: OracleFixture): OnttrekkingsprofielParams {
  return {
    profiel: parseEnum(fx, 'P!B69', ONTTREKKINGSPROFIELEN, 'onttrekkingsprofiel'),
    fase1TotLeeftijd: num(fx, 'P!B71', 'fase 1 t/m leeftijd'),
    factor1Pct: num(fx, 'P!B72', 'factor 1'),
    fase2TotLeeftijd: num(fx, 'P!B73', 'fase 2 t/m leeftijd'),
    factor2Pct: num(fx, 'P!B74', 'factor 2'),
    factor3Pct: num(fx, 'P!B75', 'factor 3'),
    guardrailFloor: num(fx, 'P!B77', 'guardrails floor'),
    guardrailCeiling: num(fx, 'P!B78', 'guardrails ceiling'),
    guardrailOnderdrempelRatio: num(fx, 'P!B79', 'guardrails onderdrempel-ratio'),
    guardrailBovendrempelRatio: num(fx, 'P!B80', 'guardrails bovendrempel-ratio'),
    guardrailStap: num(fx, 'P!B81', 'guardrails stap'),
  }
}

// ── onzekerheid (scenarioband + MC + Hist) ──────────────────────────────────────

const SCENARIO_BANDEN: readonly ScenarioBand[] = ['Pessimistisch', 'Verwacht', 'Optimistisch']
const HIST_REEKS_ROW_START = 4 // Hist!B4
const HIST_REEKS_ROW_END = 99 // Hist!B99

function buildMc(fx: OracleFixture): McParams {
  return {
    aantalRuns: num(fx, 'MC!B1', 'MC aantal runs'),
    sigma: num(fx, 'MC!B3', 'MC sigma'),
    actief: bool01(fx, 'MC!B5'),
  }
}

function buildHist(fx: OracleFixture): HistParams {
  const rendementReeks: (number | null)[] = []
  for (let rij = HIST_REEKS_ROW_START; rij <= HIST_REEKS_ROW_END; rij++) {
    rendementReeks.push(optNum(fx, `Hist!B${rij}`))
  }
  return {
    startjaar: num(fx, 'Hist!B1', 'Hist startjaar'),
    actief: bool01(fx, 'Hist!B2'),
    rendementReeks,
  }
}

function buildOnzekerheid(fx: OracleFixture): OnzekerheidParams {
  return {
    scenario: parseEnum(fx, 'P!B42', SCENARIO_BANDEN, 'scenarioband'),
    shift: num(fx, 'P!B43', 'scenarioband-shift'),
    shiftAlleenInvestering: bool01(fx, 'P!B44'),
    mc: buildMc(fx),
    hist: buildHist(fx),
  }
}

// ── TS (prio's + niet-liquide) ──────────────────────────────────────────────────

function buildTs(fx: OracleFixture): TsParams {
  const bezitCategorien: TsBezitCategorie[] = TS_BEZIT_ROWS.map(({ rij, categorie }) => ({
    categorie,
    prioToename: numOr0(fx, `TS!B${rij}`),
    prioAfname: numOr0(fx, `TS!C${rij}`),
    prioOnttrekking: numOr0(fx, `TS!D${rij}`),
    gevuld: bool01(fx, `TS!G${rij}`),
    nietLiquide: boolJaNee(fx, `TS!H${rij}`),
  }))
  const schuldCategorien: TsSchuldCategorie[] = TS_SCHULD_ROWS.map(({ rij, categorie }) => ({
    categorie,
    prioAflossing: optNum(fx, `TS!B${rij}`), // TS!C/D structureel leeg voor schulden
    gevuld: bool01(fx, `TS!G${rij}`),
    nietLiquide: boolJaNee(fx, `TS!H${rij}`),
  }))
  return { bezitCategorien, schuldCategorien }
}

// ── Geb (handmatige gebeurtenissen rij 4-13) ────────────────────────────────────

function parseGebPostType(v: CellValue): GebPostType | null {
  return v === 'Eenmalig' || v === 'Periodiek' ? v : null
}

function readGebPost(
  fx: OracleFixture,
  rij: number,
  cols: (typeof GEB_POST_COLS)[number],
): GebPost | null {
  const type = parseGebPostType(getCell(fx, `Geb!${cols.type}${rij}`))
  if (type === null) return null // lege post
  return {
    type,
    bedrag: numOr0(fx, `Geb!${cols.bedrag}${rij}`),
    startLeeftijd: numOr0(fx, `Geb!${cols.startLt}${rij}`),
    startMaand: numOr0(fx, `Geb!${cols.startMnd}${rij}`),
    eindLeeftijd: optNum(fx, `Geb!${cols.eindLt}${rij}`),
    eindMaand: optNum(fx, `Geb!${cols.eindMnd}${rij}`),
  }
}

const GEB_HANDMATIG_ROW_START = 4
const GEB_HANDMATIG_ROW_END = 13

function buildGebeurtenissen(fx: OracleFixture): GebeurtenisRij[] {
  const rijen: GebeurtenisRij[] = []
  for (let rij = GEB_HANDMATIG_ROW_START; rij <= GEB_HANDMATIG_ROW_END; rij++) {
    const posten = GEB_POST_COLS.map((cols) => readGebPost(fx, rij, cols)).filter(
      (p): p is GebPost => p !== null,
    )
    const naam = optStr(fx, `Geb!A${rij}`)
    if (posten.length === 0 && naam === null) continue // lege rij
    rijen.push({ rij, naam, posten })
  }
  return rijen
}

// ── Auto-gebeurtenissen (invoer B4-B18 + pensioen-multipot) ─────────────────────

const AUTO = 'Auto-gebeurtenissen'
const PENSIOEN_ROW_START = 26
const PENSIOEN_ROW_END = 31

/** Neem een pensioen-pot-slot alleen op als er iets ingevuld is. */
function readPensioenPot(fx: OracleFixture, rij: number): PensioenPot | null {
  const naam = optStr(fx, `${AUTO}!A${rij}`)
  const type = optStr(fx, `${AUTO}!B${rij}`)
  const bruto = optNum(fx, `${AUTO}!E${rij}`)
  const inleg = optNum(fx, `${AUTO}!F${rij}`)
  if (naam === null && type === null && bruto === null && inleg === null) return null // leeg slot
  return {
    slot: rij - PENSIOEN_ROW_START,
    naam,
    type,
    ingangsLeeftijd: optNum(fx, `${AUTO}!C${rij}`),
    invoermodus: optStr(fx, `${AUTO}!D${rij}`),
    brutoPerMaand: bruto,
    inlegPot: inleg,
    duurJaarInvoer: optNum(fx, `${AUTO}!G${rij}`),
    geindexeerd: optStr(fx, `${AUTO}!H${rij}`),
    partnerUitkeringPct: optNum(fx, `${AUTO}!I${rij}`),
  }
}

function buildAutoGebeurtenissen(fx: OracleFixture): AutoGebeurtenisParams {
  const pensioenPotten: PensioenPot[] = []
  for (let rij = PENSIOEN_ROW_START; rij <= PENSIOEN_ROW_END; rij++) {
    const pot = readPensioenPot(fx, rij)
    if (pot !== null) pensioenPotten.push(pot)
  }
  return {
    leefsituatie: str(fx, `${AUTO}!B4`, 'leefsituatie'),
    aowOpbouwjaren: num(fx, `${AUTO}!B5`, 'AOW-opbouwjaren'),
    aantalKinderen: num(fx, `${AUTO}!B8`, 'aantal kinderen'),
    kindGeboorteLeeftijden: [
      num(fx, `${AUTO}!B9`, 'kind 1 geboorte-leeftijd'),
      num(fx, `${AUTO}!B10`, 'kind 2 geboorte-leeftijd'),
      num(fx, `${AUTO}!B11`, 'kind 3 geboorte-leeftijd'),
    ],
    nibudBasisPerMaand: num(fx, `${AUTO}!B12`, 'NIBUD basis/mnd'),
    kinderopvangNettoPerMaand: num(fx, `${AUTO}!B13`, 'kinderopvang netto/mnd'),
    kinderbijslagPerMaand: num(fx, `${AUTO}!B14`, 'kinderbijslag/mnd'),
    babyuitzetEenmalig: num(fx, `${AUTO}!B15`, 'babyuitzet eenmalig'),
    erfenisBruto: num(fx, `${AUTO}!B16`, 'erfenis bruto'),
    erfenisRelatie: str(fx, `${AUTO}!B17`, 'erfenis relatie'),
    erfenisLeeftijd: num(fx, `${AUTO}!B18`, 'erfenis leeftijd'),
    pensioenPotten,
    // `aowBasisPerMaand` wordt hier BEWUST NIET gezet: zonder injectie valt de kern
    // terug op de Excel-oracle-basis 1452/993 (tables/auto-gebeurtenissen.ts) en blijft
    // B21 byte-identiek aan `Core calc v5.xlsm`. Alleen het app-pad injecteert de
    // canonieke SVB-bedragen (adapter, gap-besluit V20 / ADR 0064).
  }
}

// ── PT (partner) ────────────────────────────────────────────────────────────────

function buildPartner(fx: OracleFixture): PartnerParams {
  return {
    aanwezig: bool01(fx, 'PT!B2'),
    geboortejaar: num(fx, 'PT!B3', 'partner geboortejaar'),
    nettoJaarinkomen: num(fx, 'PT!B4', 'partner netto jaarinkomen'),
    aowLeeftijd: num(fx, 'PT!B5', 'partner AOW-leeftijd'),
    pensioenBrutoPerJaar: num(fx, 'PT!B6', 'partner pensioen bruto/jr'),
    pensioenStartleeftijd: num(fx, 'PT!B7', 'partner pensioen-startleeftijd'),
    pensioenGeindexeerd: bool01(fx, 'PT!B8'),
    aowBedragPpPerJaar: num(fx, 'PT!B9', 'partner AOW-bedrag p.p./jr'),
  }
}

// ── Werk-strategie ──────────────────────────────────────────────────────────────

const WERK = 'Werk-strategie'
const WERK_LADDER_ROW_START = 3
const WERK_LADDER_ROW_END = 8

function buildWerkStrategie(fx: OracleFixture): WerkStrategieParams {
  const sprongen: WerkStrategieSprong[] = []
  const deeltijd: WerkStrategieDeeltijd[] = []
  for (let rij = WERK_LADDER_ROW_START; rij <= WERK_LADDER_ROW_END; rij++) {
    const bijLeeftijd = optNum(fx, `${WERK}!D${rij}`)
    if (bijLeeftijd !== null) {
      sprongen.push({ bijLeeftijd, deltaNettoPerMaand: numOr0(fx, `${WERK}!E${rij}`) })
    }
    const vanafLeeftijd = optNum(fx, `${WERK}!G${rij}`)
    if (vanafLeeftijd !== null) {
      deeltijd.push({ vanafLeeftijd, pct: numOr0(fx, `${WERK}!H${rij}`) })
    }
  }
  return {
    basisNettoPerMaand: numOr0(fx, `${WERK}!B1`),
    reeleGroei: numOr0(fx, `${WERK}!B2`),
    groeiTotLeeftijd: optNum(fx, `${WERK}!B3`),
    plafondNettoPerMaand: numOr0(fx, `${WERK}!B4`),
    sprongen,
    deeltijd,
  }
}

// ── builder ──────────────────────────────────────────────────────────────────

/** Bouw de statische, VOLLEDIGE `KernelInput` uit een geladen oracle-fixture. */
export function buildKernelInput(fx: OracleFixture): KernelInput {
  return {
    // kern-scaffold (Bel-tabel hangt hieraan)
    startLeeftijd: num(fx, 'P!B7', 'startleeftijd'),
    inflatie: num(fx, 'P!B14', 'inflatie'),
    box3: buildBox3(fx),
    assetPotten: buildAssetPotten(fx),
    schuldPotten: buildSchuldPotten(fx),

    // P-parameterblokken
    persoon: buildPersoon(fx),
    inkomenUitgaven: buildInkomenUitgaven(fx),
    tekortLeningRente: num(fx, 'P!B25', 'rente tekort-lening'),
    strategie: buildStrategie(fx),
    eindstrategie: buildEindstrategie(fx),
    woning: buildWoning(fx),
    onttrekkingsprofiel: buildOnttrekkingsprofiel(fx),
    onzekerheid: buildOnzekerheid(fx),

    // overige invoer-tabbladen
    ts: buildTs(fx),
    gebeurtenissen: buildGebeurtenissen(fx),
    autoGebeurtenissen: buildAutoGebeurtenissen(fx),
    partner: buildPartner(fx),
    werkStrategie: buildWerkStrategie(fx),
  }
}
