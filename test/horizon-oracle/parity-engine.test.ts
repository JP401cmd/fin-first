import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, getSheet, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { compareGrid, type CellMismatch, type GridComparison } from '@/lib/horizon-kernel/oracle/compare'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { runKernelProjection, type KernelProjection } from '@/lib/horizon-kernel/engine'
import { HORIZON_MONTHS } from '@/lib/horizon-kernel/types'
import type { BelRow } from '@/lib/horizon-kernel/tables/bel'
import type { CFRow } from '@/lib/horizon-kernel/tables/cf'
import type { OntRow } from '@/lib/horizon-kernel/tables/ont'
import type { AfRow } from '@/lib/horizon-kernel/tables/af'
import type { ToenameAfnameRow } from '@/lib/horizon-kernel/tables/toename-afname'
import type { VerdelingRow } from '@/lib/horizon-kernel/tables/verdeling'
import type { WaterfallResult } from '@/lib/horizon-kernel/tables/verdeling/waterfall'
import type { BezRow } from '@/lib/horizon-kernel/tables/bez'
import type { SRow } from '@/lib/horizon-kernel/tables/s'
import type { PrognoseRow } from '@/lib/horizon-kernel/tables/prognose'
import type { WerkStrategieRow } from '@/lib/horizon-kernel/tables/werk-strategie'
import type { PTRow } from '@/lib/horizon-kernel/tables/pt'

/**
 * PARITY — de **integrale forward-recursie-engine** (`runKernelProjection`) tegen
 * het Excel-oracle (ADR 0032). Dit is de kroon op de tabel-ports: waar de
 * teacher-forced tests elke tabel geïsoleerd bewezen (deps uit de fixture), voedt
 * de engine de deps uit **eigen berekende toestand** (m en m−1). Deze test legt
 * ELKE geporte maandtabel die de engine produceert grid-voor-grid tegen de
 * bijbehorende fixture-sheet — met exact dezelfde kolomsets/uitsluitingen als de
 * teacher-tests (hier gerepliceerd; de teacher-tests worden niet gewijzigd).
 *
 * 0 mismatches over 16 fixtures × 1200 maanden × 11 tabellen bewijst dat de
 * recursie zélf exact is: de m−1-voeding, de intra-maand-volgorde en de anker-
 * vastlegging (guardrails-anker P!B82 = eigen Prognose!J(fireMaand−1)) lopen niet
 * uit de pas — foutophoping over 1200 maanden zou hier zichtbaar worden.
 *
 * FIRE-leeftijd is een PARAMETER: `fireAge = fixture P!B16` (bij `onhaalbaar` op 100
 * geparkeerd — gewoon doorgegeven). Het guardrails-anker wordt door de engine ZELF
 * vastgelegd (default self-capture), niet teacher-forced — de sterkere test.
 */

// ── Kolomletter-helpers (identiek aan de teacher-tests) ──────────────────────────

/** Excel-kolomletters → 0-gebaseerde index (A=0, AA=26, …). */
function colIndex(letters: string): number {
  let idx = 0
  for (const ch of letters.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64)
  return idx - 1
}

/** 0-gebaseerde index → Excel-kolomletters (leesbare mismatch-output). */
function colLetters(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Eén te vergelijken kolom van een tabel: Excel-letter + grid-index + getter. */
interface EngineColumn<TRow> {
  readonly letter: string
  readonly index: number
  readonly get: (row: TRow) => CellValue
}

// ── CF (A–K) — identiek aan parity-cf.test.ts ────────────────────────────────────
const CF_COLUMNS: ReadonlyArray<EngineColumn<CFRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.inkomen) },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.uitgaven) },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.sparen) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.renteVrijval) },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? 0 : r.gebeurtenisBaten) },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? 0 : r.totaalExtraGeld) },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? 0 : r.gebeurtenisNetto) },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? 0 : r.box3VorigeMaand) },
]

// ── Bel (A–N) — identiek aan parity-bel.test.ts ──────────────────────────────────
const BEL_COLUMNS: ReadonlyArray<EngineColumn<BelRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.grondslagSpaar) },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.grondslagInvestering) },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.grondslagSchuld) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.schuldNaDrempel) },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? '' : r.rendementsgrondslag) },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? '' : r.fictiefRendement) },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? '' : r.grondslagSparenBeleggen) },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? '' : r.forfaitaireHeffing) },
  { letter: 'L', index: 11, get: (r) => (r.beyondHorizon ? '' : r.werkelijkRendement) },
  { letter: 'M', index: 12, get: (r) => (r.beyondHorizon ? '' : r.belastingWerkelijk) },
  { letter: 'N', index: 13, get: (r) => (r.beyondHorizon ? '' : r.canoniek) },
]

// ── Ont (A/B/C/D/F/G/H/I) — identiek aan parity-ont.test.ts ──────────────────────
const ONT_COLUMNS: ReadonlyArray<EngineColumn<OntRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => r.leeftijd },
  { letter: 'C', index: 2, get: (r) => r.maandInJaar },
  { letter: 'D', index: 3, get: (r) => r.onttrekking },
  { letter: 'F', index: 5, get: (r) => r.faseFactor },
  { letter: 'G', index: 6, get: (r) => r.liquideNettoVorigeMaand },
  { letter: 'H', index: 7, get: (r) => r.guardrailsFactor },
  { letter: 'I', index: 8, get: (r) => r.actieveFactor },
]

// ── Af (A–D, F, G) — identiek aan parity-af.test.ts ──────────────────────────────
const AF_COLUMNS: ReadonlyArray<EngineColumn<AfRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => r.totaalAfname },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
]

// ── Prognose (A–M) — identiek aan parity-prognose.test.ts ────────────────────────
const PROGNOSE_COLUMNS: ReadonlyArray<EngineColumn<PrognoseRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.totaalBezittingen) },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.totaalSchulden) },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.box3Forfaitair) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.cumulatiefBox3) },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? '' : r.brutoVermogen) },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? '' : r.nettoVermogen) },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? '' : r.nettoLiquide) },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? '' : r.schuldenNegatief) },
  { letter: 'L', index: 11, get: (r) => (r.beyondHorizon ? '' : r.nietLiquideBezit) },
  { letter: 'M', index: 12, get: (r) => (r.beyondHorizon ? '' : r.nietLiquideLeningen) },
]

// ── PT (G–K) — identiek aan parity-pt.test.ts ────────────────────────────────────
const PT_COLUMNS: ReadonlyArray<EngineColumn<PTRow>> = [
  { letter: 'G', index: 6, get: (r) => r.maand },
  { letter: 'H', index: 7, get: (r) => r.partnerLeeftijd },
  { letter: 'I', index: 8, get: (r) => r.werkinkomen },
  { letter: 'J', index: 9, get: (r) => r.aowPensioen },
  { letter: 'K', index: 10, get: (r) => r.totaal },
]

// ── Werk-strategie (N–S) — identiek aan parity-werk-strategie.test.ts ────────────
const WERK_COLUMNS: ReadonlyArray<EngineColumn<WerkStrategieRow>> = [
  { letter: 'N', index: 13, get: (r) => r.maand },
  { letter: 'O', index: 14, get: (r) => r.leeftijd },
  { letter: 'P', index: 15, get: (r) => r.reeelSalaris },
  { letter: 'Q', index: 16, get: (r) => r.reeleDelta },
  { letter: 'R', index: 17, get: (r) => r.nominaleDelta },
  { letter: 'S', index: 18, get: (r) => r.gegateDelta },
]

// ── Toename en afname (88 kolommen A–CH + CL/CM) — identiek aan parity-toename-afname ──
function buildTaColumns(): EngineColumn<ToenameAfnameRow>[] {
  const cols: EngineColumn<ToenameAfnameRow>[] = []
  const add = (index: number, get: (r: ToenameAfnameRow) => CellValue) =>
    cols.push({ letter: colLetters(index), index, get })
  const inH =
    (get: (r: Extract<ToenameAfnameRow, { beyondHorizon: false }>) => number) =>
    (r: ToenameAfnameRow): CellValue =>
      r.beyondHorizon ? '' : get(r)

  const BEZIT_COL_START = 7
  const BEZIT_COL_STRIDE = 9
  const SCHULD_COL_START = 61
  const SCHULD_COL_STRIDE = 5
  const CL_COL = 89
  const CM_COL = 90

  add(0, (r) => r.maand)
  add(1, inH((r) => r.leeftijd))
  add(2, inH((r) => r.maandInJaar))
  add(3, inH((r) => r.totaalExtraGeld))
  add(4, inH((r) => r.afname))
  add(5, inH((r) => r.onttrekking))
  add(6, inH((r) => r.totaal))
  for (let i = 0; i < 6; i++) {
    const base = BEZIT_COL_START + BEZIT_COL_STRIDE * i
    add(base + 0, inH((r) => r.bezit[i].toenamePct))
    add(base + 1, inH((r) => r.bezit[i].toenameEur))
    add(base + 2, inH((r) => r.bezit[i].afnamePct))
    add(base + 3, inH((r) => r.bezit[i].afnameEur))
    add(base + 4, inH((r) => r.bezit[i].onttrekkingPct))
    add(base + 5, inH((r) => r.bezit[i].onttrekkingEur))
    add(base + 6, inH((r) => r.bezit[i].totaalEur))
    add(base + 7, inH((r) => r.bezit[i].aantal))
    add(base + 8, inH((r) => r.bezit[i].perStukEur))
  }
  for (let j = 0; j < 5; j++) {
    const base = SCHULD_COL_START + SCHULD_COL_STRIDE * j
    add(base + 0, inH((r) => r.schuld[j].toenamePct))
    add(base + 1, inH((r) => r.schuld[j].toenameEur))
    add(base + 2, inH((r) => r.schuld[j].totaalEur))
    add(base + 3, inH((r) => r.schuld[j].aantal))
    add(base + 4, inH((r) => r.schuld[j].perStukEur))
  }
  add(CL_COL, inH((r) => r.leeftijd))
  add(CM_COL, inH((r) => r.maandInJaar))
  return cols
}
const TA_COLUMNS = buildTaColumns()

// ── Bez (53 kolommen) — identiek aan parity-bez.test.ts ──────────────────────────
const bezWaardeCol = (slot: number): number => 3 + slot * 3
const bezRendementCol = (slot: number): number => 4 + slot * 3
const bezInlegCol = (slot: number): number => 5 + slot * 3

function buildBezColumns(): EngineColumn<BezRow>[] {
  const cols: EngineColumn<BezRow>[] = []
  const push = (index: number, get: (r: BezRow) => CellValue) =>
    cols.push({ letter: colLetters(index), index, get })

  push(0, (r) => r.maand)
  push(1, (r) => (r.beyondHorizon ? '' : r.leeftijd))
  push(2, (r) => (r.beyondHorizon ? '' : r.maandInJaar))
  for (let slot = 0; slot < 10; slot++) {
    push(bezWaardeCol(slot), (r) => (r.beyondHorizon ? '' : r.slots[slot].waarde))
    push(bezRendementCol(slot), (r) => (r.beyondHorizon ? '' : r.slots[slot].rendement))
    push(bezInlegCol(slot), (r) => (r.beyondHorizon ? 0 : r.slots[slot].inleg))
  }
  push(33, (r) => (r.beyondHorizon ? '' : r.totaalBox3Spaar)) // AH
  push(34, (r) => (r.beyondHorizon ? '' : r.totaalBox3Investering)) // AI
  push(35, (r) => (r.beyondHorizon ? '' : r.totaalGeenBox3)) // AJ
  push(36, (r) => (r.beyondHorizon ? '' : r.totaalRendement)) // AK
  push(37, (r) => (r.beyondHorizon ? '' : r.totaalInleg)) // AL
  push(38, (r) => (r.beyondHorizon ? '' : r.totaalSpaargeld)) // AM
  push(39, (r) => (r.beyondHorizon ? '' : r.totaalBeleggingen)) // AN
  push(40, (r) => (r.beyondHorizon ? '' : r.totaalPensioen)) // AO
  push(41, (r) => (r.beyondHorizon ? '' : r.totaalVastgoed)) // AP
  push(42, (r) => (r.beyondHorizon ? '' : r.totaalOverig)) // AQ
  push(43, (r) => (r.beyondHorizon ? '' : r.totaalEigenHuis)) // AR
  push(47, (r) => (r.beyondHorizon ? '' : r.avLeeftijd)) // AV
  push(48, (r) => (r.beyondHorizon ? '' : r.awMaand)) // AW
  push(50, (r) => (r.beyondHorizon ? 0 : r.woning.verkocht)) // AY
  push(51, (r) => (r.beyondHorizon ? 0 : r.woning.verkoopopbrengst)) // AZ
  push(52, (r) => (r.beyondHorizon ? 0 : r.woning.huurPerMaand)) // BA
  push(53, (r) => (r.beyondHorizon ? 0 : r.woning.vervallenHypotheeklast)) // BB
  push(54, (r) => (r.beyondHorizon ? 0 : r.woning.overwaardeVorig)) // BC
  push(55, (r) => (r.beyondHorizon ? 0 : r.woning.opeetCap)) // BD
  push(56, (r) => (r.beyondHorizon ? 0 : r.woning.opeetOpname)) // BE
  return cols
}
const BEZ_COLUMNS = buildBezColumns()

// ── S (42 kolommen A–AN + AR + AS) — identiek aan parity-s.test.ts ───────────────
const sSaldoCol = (slot: number): number => 3 + slot * 4
function buildSColumns(): EngineColumn<SRow>[] {
  const cols: EngineColumn<SRow>[] = [
    { letter: 'A', index: 0, get: (r) => r.maand },
    { letter: 'B', index: 1, get: (r) => r.leeftijd },
    { letter: 'C', index: 2, get: (r) => r.maandInJaar },
  ]
  for (let slot = 0; slot < 7; slot++) {
    const base = sSaldoCol(slot)
    cols.push({ letter: colLetters(base), index: base, get: (r) => r.slots[slot].saldo })
    cols.push({ letter: colLetters(base + 1), index: base + 1, get: (r) => r.slots[slot].aflossing })
    cols.push({ letter: colLetters(base + 2), index: base + 2, get: (r) => r.slots[slot].extra })
    cols.push({ letter: colLetters(base + 3), index: base + 3, get: (r) => r.slots[slot].rente })
  }
  cols.push({ letter: 'AF', index: 31, get: (r) => r.totaalBox3 })
  cols.push({ letter: 'AG', index: 32, get: (r) => r.totaalGeenBox3 })
  cols.push({ letter: 'AH', index: 33, get: (r) => r.totaalAflossing })
  cols.push({ letter: 'AI', index: 34, get: (r) => r.totaalRente })
  cols.push({ letter: 'AJ', index: 35, get: (r) => r.totaalWoning })
  cols.push({ letter: 'AK', index: 36, get: (r) => r.totaalConsumptief })
  cols.push({ letter: 'AL', index: 37, get: (r) => r.totaalStudie })
  cols.push({ letter: 'AM', index: 38, get: (r) => r.totaalZakelijk })
  cols.push({ letter: 'AN', index: 39, get: (r) => r.totaalOverig })
  cols.push({ letter: 'AR', index: 43, get: (r) => r.helperLeeftijd })
  cols.push({ letter: 'AS', index: 44, get: (r) => r.helperMaand })
  return cols
}
const S_COLUMNS = buildSColumns()

// ── Verdeling (218 kolommen A–HK, HA uitgesloten) — identiek aan parity-verdeling ──
function verdelingSpacer(index: number): EngineColumn<VerdelingRow> {
  return { letter: colLetters(index), index, get: () => null }
}
function verdelingCol(
  index: number,
  get: (r: VerdelingRow) => CellValue,
): EngineColumn<VerdelingRow> {
  return { letter: colLetters(index), index, get }
}
function verdelingSubject(
  getSubj: (r: VerdelingRow) => WaterfallResult,
  nCats: number,
  layout: {
    budget: number
    capsStart: number
    passBase: number
    leftover: number
    reserveDenom: number
    reserveAllocStart: number
    eindStart: number
    onbenut: number
  },
): EngineColumn<VerdelingRow>[] {
  const out: EngineColumn<VerdelingRow>[] = []
  out.push(verdelingCol(layout.budget, (r) => getSubj(r).budget))
  for (let i = 0; i < nCats; i++) out.push(verdelingCol(layout.capsStart + i, (r) => getSubj(r).caps[i]))
  const passWidth = 2 + nCats
  for (let p = 0; p < 6; p++) {
    const base = layout.passBase + p * passWidth
    out.push(verdelingCol(base, (r) => getSubj(r).passRest[p]))
    out.push(verdelingCol(base + 1, (r) => getSubj(r).passSumW[p]))
    for (let i = 0; i < nCats; i++) {
      out.push(verdelingCol(base + 2 + i, (r) => getSubj(r).passAlloc[p][i]))
    }
  }
  out.push(verdelingCol(layout.leftover, (r) => getSubj(r).leftover))
  out.push(verdelingCol(layout.reserveDenom, (r) => getSubj(r).reserveDenom))
  for (let i = 0; i < nCats; i++) {
    out.push(verdelingCol(layout.reserveAllocStart + i, (r) => getSubj(r).reserveAlloc[i]))
  }
  for (let i = 0; i < nCats; i++) {
    out.push(verdelingCol(layout.eindStart + i, (r) => getSubj(r).eind[i]))
  }
  out.push(verdelingCol(layout.onbenut, (r) => getSubj(r).onbenut))
  return out
}
function buildVerdelingColumns(): EngineColumn<VerdelingRow>[] {
  const cols: EngineColumn<VerdelingRow>[] = [
    verdelingCol(0, (r) => r.maand),
    verdelingCol(1, (r) => (r.beyondHorizon ? '' : r.leeftijd)),
    verdelingCol(2, (r) => (r.beyondHorizon ? '' : r.maandInJaar)),
  ]
  cols.push(
    ...verdelingSubject((r) => r.afname, 6, {
      budget: colIndex('D'),
      capsStart: colIndex('E'),
      passBase: colIndex('L'),
      leftover: colIndex('BH'),
      reserveDenom: colIndex('BI'),
      reserveAllocStart: colIndex('BJ'),
      eindStart: colIndex('BP'),
      onbenut: colIndex('BV'),
    }),
  )
  cols.push(verdelingSpacer(colIndex('K')))
  cols.push(verdelingSpacer(colIndex('BW')))
  cols.push(
    ...verdelingSubject((r) => r.onttrekking, 6, {
      budget: colIndex('BX'),
      capsStart: colIndex('BY'),
      passBase: colIndex('CE'),
      leftover: colIndex('EA'),
      reserveDenom: colIndex('EB'),
      reserveAllocStart: colIndex('EC'),
      eindStart: colIndex('EI'),
      onbenut: colIndex('EO'),
    }),
  )
  cols.push(verdelingSpacer(colIndex('EP')))
  cols.push(
    ...verdelingSubject((r) => r.aflossing, 5, {
      budget: colIndex('EQ'),
      capsStart: colIndex('ER'),
      passBase: colIndex('EW'),
      leftover: colIndex('GM'),
      reserveDenom: colIndex('GN'),
      reserveAllocStart: colIndex('GO'),
      eindStart: colIndex('GT'),
      onbenut: colIndex('GY'),
    }),
  )
  cols.push(verdelingSpacer(colIndex('GZ')))
  cols.push(verdelingSpacer(colIndex('HB')))
  for (let i = 0; i < 6; i++) cols.push(verdelingCol(colIndex('HC') + i, (r) => r.overflow[i]))
  cols.push(verdelingSpacer(colIndex('HI')))
  cols.push(verdelingCol(colIndex('HJ'), (r) => (r.beyondHorizon ? '' : r.leeftijd)))
  cols.push(verdelingCol(colIndex('HK'), (r) => (r.beyondHorizon ? '' : r.maandInJaar)))
  return cols.sort((a, b) => a.index - b.index)
}
const VERDELING_COLUMNS = buildVerdelingColumns()

// ── Vergelijker: engine-rijen grid-voor-grid tegen een fixture-sheet ─────────────

/** Compacte weergave van een celwaarde voor mismatch-output. */
function fmtCell(v: CellValue): string {
  if (v === null) return '∅'
  if (v === '') return '""'
  if (typeof v === 'number') return v.toFixed(6)
  return String(v)
}

/** Eén tabel-vergelijkingsresultaat. */
interface TableResult {
  readonly sheet: string
  readonly comparison: GridComparison
  readonly lines: string[]
  readonly columnCount: number
}

/**
 * Vergelijk de engine-rijen van één tabel grid-voor-grid tegen de fixture-sheet,
 * met de teacher-identieke kolomset/uitsluitingen (`compareGrid`, €0,01).
 */
function compareTable<TRow>(
  fx: OracleFixture,
  sheet: string,
  headerRows: number,
  rows: readonly TRow[],
  columns: ReadonlyArray<EngineColumn<TRow>>,
): TableResult {
  const grid = getSheet(fx, sheet).values
  const expected: CellValue[][] = []
  const actual: CellValue[][] = []
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const gridRow = grid[headerRows + m] ?? []
    const row = rows[m]
    const expRow: CellValue[] = []
    const actRow: CellValue[] = []
    for (const col of columns) {
      expRow.push(gridRow[col.index] ?? null)
      actRow.push(col.get(row))
    }
    expected.push(expRow)
    actual.push(actRow)
  }
  const comparison = compareGrid(expected, actual)
  const lines = comparison.mismatches.map((mm: CellMismatch) => {
    const col = columns[mm.col]
    const excelRow = headerRows + mm.row + 1
    const delta = mm.diff !== null ? ` Δ=${mm.diff.toFixed(6)}` : ''
    return `  ${sheet}!${col.letter}${excelRow} (maand ${mm.row}): verwacht=${fmtCell(mm.expected)} actueel=${fmtCell(mm.actual)}${delta}`
  })
  return { sheet, comparison, lines, columnCount: columns.length }
}

/** Eén fixture: draai de engine en vergelijk alle 11 geporte maandtabellen. */
interface FixtureResult {
  readonly scenario: string
  readonly projection: KernelProjection
  readonly tables: readonly TableResult[]
}

function runFixture(fx: OracleFixture): FixtureResult {
  const input = buildKernelInput(fx)
  const b16 = getCell(fx, 'P!B16')
  const fireAge = typeof b16 === 'number' ? b16 : 0 // onhaalbaar: B16 op 100 geparkeerd
  const projection = runKernelProjection(input, { fireAge })
  const tables: TableResult[] = [
    compareTable(fx, 'CF', 1, projection.cf, CF_COLUMNS),
    compareTable(fx, 'Bel', 1, projection.bel, BEL_COLUMNS),
    compareTable(fx, 'Ont', 1, projection.ont, ONT_COLUMNS),
    compareTable(fx, 'Af', 1, projection.af, AF_COLUMNS),
    compareTable(fx, 'Toename en afname', 2, projection.toenameAfname, TA_COLUMNS),
    compareTable(fx, 'Verdeling', 3, projection.verdeling, VERDELING_COLUMNS),
    compareTable(fx, 'Bez', 3, projection.bez, BEZ_COLUMNS),
    compareTable(fx, 'S', 3, projection.s, S_COLUMNS),
    compareTable(fx, 'Prognose', 1, projection.prognose, PROGNOSE_COLUMNS),
    compareTable(fx, 'Werk-strategie', 1, projection.werkStrategie, WERK_COLUMNS),
    compareTable(fx, 'PT', 1, projection.pt, PT_COLUMNS),
  ]
  return { scenario: fx.meta.scenario, projection, tables }
}

// ── Testrun ──────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · integrale engine-parity (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = listFixtures(FIXTURE_DIR).map((f) => runFixture(loadFixture(f)))

  describe('horizon-kernel · integrale forward-recursie-engine tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste tripwire: een nieuwe fixture-ronde moet hier zichtbaar afketsen.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      for (const table of result.tables) {
        it(`${result.scenario}: ${table.sheet} (engine) cel-voor-cel binnen €0,01`, () => {
          const { mismatchCount, maxAbsDiff } = table.comparison
          expect(
            mismatchCount,
            mismatchCount === 0
              ? undefined
              : `${mismatchCount} mismatch(es) in ${table.sheet} (${result.scenario}), ` +
                  `max |Δ|=${maxAbsDiff}:\n${table.lines.join('\n')}`,
          ).toBe(0)
        })
      }
    }

    it('elke tabel omvat 1200 maandrijen per fixture', () => {
      for (const result of results) {
        expect(result.projection.cf.length).toBe(1200)
        expect(result.projection.verdeling.length).toBe(1200)
        expect(result.projection.bez.length).toBe(1200)
        expect(result.projection.s.length).toBe(1200)
        expect(result.projection.prognose.length).toBe(1200)
      }
    })

    it('rapporteert per tabel de max |Δ| (0 bij volledige parity)', () => {
      // Geaggregeerde diagnostiek: bij een groene suite is elke maxAbsDiff 0.
      const perTable: Record<string, number> = {}
      for (const result of results) {
        for (const table of result.tables) {
          perTable[table.sheet] = Math.max(perTable[table.sheet] ?? 0, table.comparison.maxAbsDiff)
        }
      }
      for (const [, maxDiff] of Object.entries(perTable)) {
        expect(maxDiff).toBeLessThanOrEqual(0.01)
      }
    })
  })
}
