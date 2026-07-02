/**
 * Horizon-kernel · beheer-transparantie — kolom-serialisatie (server).
 *
 * Zet de rijen van één geporte maandtabel (uit `KernelProjection`) om naar een
 * plat 2D-grid met Excel-kolomletters — exact dezelfde kolomsets/uitsluitingen
 * als de integrale engine-parity-test (`test/horizon-oracle/parity-engine.test.ts`),
 * hier bewust gerepliceerd zodat de beheer-verificatie op precies dezelfde cellen
 * groen/rood is als de testsuite. Bevat de getter-closures en de projectie-typen
 * (geen node); wordt server-side gebruikt door de API-route en de verificatie.
 *
 * BELANGRIJK: de kolom-layout hieronder MOET gelijk blijven aan de parity-test —
 * wijkt hij af, dan meet de beheer-verificatie een andere cel dan de bewaakte suite.
 */

import type { CellValue } from '@/lib/horizon-kernel/oracle/fixture-types'
import type { KernelProjection } from '@/lib/horizon-kernel'
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
import type { KernelTableId } from './table-meta'

/** Weergave-soort van een kolom (stuurt de opmaak in de UI). */
export type ColKind = 'idx' | 'age' | 'eur' | 'num' | 'pct' | 'flag' | 'text'

/** Eén te serialiseren kolom van een tabel. */
export interface KernelColumn {
  readonly letter: string
  readonly index: number
  readonly get: (row: unknown) => CellValue
  /** Optioneel leesbaar label (default = letter in de UI). */
  readonly label?: string
  readonly kind?: ColKind
}

/** Geserialiseerd grid van één tabel (op afroep, per bereik). */
export interface SerializedGrid {
  readonly id: KernelTableId
  readonly columns: ReadonlyArray<{ letter: string; label: string; kind: ColKind }>
  /** Elke rij: [maand, leeftijd|'', ...cellen]. */
  readonly rows: CellValue[][]
  /** Totaal aantal maandrijen in de projectie (1200). */
  readonly totalMonths: number
  /** Aantal teruggegeven rijen. */
  readonly returnedRows: number
}

// ── Kolomletter-helpers (identiek aan de parity-test) ────────────────────────
function colIndex(letters: string): number {
  let idx = 0
  for (const ch of letters.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64)
  return idx - 1
}
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

type C<T> = { letter: string; index: number; get: (row: T) => CellValue; label?: string; kind?: ColKind }

// ── CF (A–K) ─────────────────────────────────────────────────────────────────
const CF_COLUMNS: C<CFRow>[] = [
  { letter: 'A', index: 0, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd), label: 'leeftijd', kind: 'age' },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar), label: 'mnd in jaar', kind: 'num' },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.inkomen), label: 'inkomen', kind: 'eur' },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.uitgaven), label: 'uitgaven', kind: 'eur' },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.sparen), label: 'sparen', kind: 'eur' },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.renteVrijval), label: 'rente-vrijval', kind: 'eur' },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? 0 : r.gebeurtenisBaten), label: 'baten', kind: 'eur' },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? 0 : r.totaalExtraGeld), label: 'totaal extra geld', kind: 'eur' },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? 0 : r.gebeurtenisNetto), label: 'gebeurtenis-netto', kind: 'eur' },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? 0 : r.box3VorigeMaand), label: 'Box 3 (m−1)', kind: 'eur' },
]

// ── Bel (A–N) ──────────────────────────────────────────────────────────────
const BEL_COLUMNS: C<BelRow>[] = [
  { letter: 'A', index: 0, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd), label: 'leeftijd', kind: 'age' },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar), label: 'mnd in jaar', kind: 'num' },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.grondslagSpaar), label: 'grondslag spaar', kind: 'eur' },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.grondslagInvestering), label: 'grondslag beleggen', kind: 'eur' },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.grondslagSchuld), label: 'grondslag schuld', kind: 'eur' },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.schuldNaDrempel), label: 'schuld na drempel', kind: 'eur' },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? '' : r.rendementsgrondslag), label: 'rendementsgrondslag', kind: 'eur' },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? '' : r.fictiefRendement), label: 'fictief rendement', kind: 'eur' },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? '' : r.grondslagSparenBeleggen), label: 'grondslag sparen+beleggen', kind: 'eur' },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? '' : r.forfaitaireHeffing), label: 'forfaitaire heffing', kind: 'eur' },
  { letter: 'L', index: 11, get: (r) => (r.beyondHorizon ? '' : r.werkelijkRendement), label: 'werkelijk rendement', kind: 'eur' },
  { letter: 'M', index: 12, get: (r) => (r.beyondHorizon ? '' : r.belastingWerkelijk), label: 'heffing werkelijk', kind: 'eur' },
  { letter: 'N', index: 13, get: (r) => (r.beyondHorizon ? '' : r.canoniek), label: 'canonieke heffing', kind: 'eur' },
]

// ── Ont (A/B/C/D/F/G/H/I) ────────────────────────────────────────────────────
const ONT_COLUMNS: C<OntRow>[] = [
  { letter: 'A', index: 0, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'B', index: 1, get: (r) => r.leeftijd, label: 'leeftijd', kind: 'age' },
  { letter: 'C', index: 2, get: (r) => r.maandInJaar, label: 'mnd in jaar', kind: 'num' },
  { letter: 'D', index: 3, get: (r) => r.onttrekking, label: 'onttrekking', kind: 'eur' },
  { letter: 'F', index: 5, get: (r) => r.faseFactor, label: 'fasefactor', kind: 'num' },
  { letter: 'G', index: 6, get: (r) => r.liquideNettoVorigeMaand, label: 'liquide (m−1)', kind: 'eur' },
  { letter: 'H', index: 7, get: (r) => r.guardrailsFactor, label: 'guardrail-factor', kind: 'num' },
  { letter: 'I', index: 8, get: (r) => r.actieveFactor, label: 'actieve factor', kind: 'num' },
]

// ── Af (A–D, F, G) ───────────────────────────────────────────────────────────
const AF_COLUMNS: C<AfRow>[] = [
  { letter: 'A', index: 0, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd), label: 'leeftijd', kind: 'age' },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar), label: 'mnd in jaar', kind: 'num' },
  { letter: 'D', index: 3, get: (r) => r.totaalAfname, label: 'totaal afname', kind: 'eur' },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.leeftijd), label: 'leeftijd', kind: 'age' },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar), label: 'mnd in jaar', kind: 'num' },
]

// ── Prognose (A–M) ───────────────────────────────────────────────────────────
const PROGNOSE_COLUMNS: C<PrognoseRow>[] = [
  { letter: 'A', index: 0, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd), label: 'leeftijd', kind: 'age' },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar), label: 'mnd in jaar', kind: 'num' },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.totaalBezittingen), label: 'totaal bezittingen', kind: 'eur' },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.totaalSchulden), label: 'totaal schulden', kind: 'eur' },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.box3Forfaitair), label: 'Box 3 forfaitair', kind: 'eur' },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.cumulatiefBox3), label: 'cumulatief Box 3', kind: 'eur' },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? '' : r.brutoVermogen), label: 'bruto vermogen', kind: 'eur' },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? '' : r.nettoVermogen), label: 'netto vermogen', kind: 'eur' },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? '' : r.nettoLiquide), label: 'netto-liquide', kind: 'eur' },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? '' : r.schuldenNegatief), label: 'schulden (−)', kind: 'eur' },
  { letter: 'L', index: 11, get: (r) => (r.beyondHorizon ? '' : r.nietLiquideBezit), label: 'niet-liquide bezit', kind: 'eur' },
  { letter: 'M', index: 12, get: (r) => (r.beyondHorizon ? '' : r.nietLiquideLeningen), label: 'niet-liquide leningen', kind: 'eur' },
]

// ── PT (G–K) ─────────────────────────────────────────────────────────────────
const PT_COLUMNS: C<PTRow>[] = [
  { letter: 'G', index: 6, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'H', index: 7, get: (r) => r.partnerLeeftijd, label: 'partner-leeftijd', kind: 'age' },
  { letter: 'I', index: 8, get: (r) => r.werkinkomen, label: 'werkinkomen', kind: 'eur' },
  { letter: 'J', index: 9, get: (r) => r.aowPensioen, label: 'AOW + pensioen', kind: 'eur' },
  { letter: 'K', index: 10, get: (r) => r.totaal, label: 'partner-totaal', kind: 'eur' },
]

// ── Werk-strategie (N–S) ─────────────────────────────────────────────────────
const WERK_COLUMNS: C<WerkStrategieRow>[] = [
  { letter: 'N', index: 13, get: (r) => r.maand, label: 'maand', kind: 'idx' },
  { letter: 'O', index: 14, get: (r) => r.leeftijd, label: 'leeftijd', kind: 'age' },
  { letter: 'P', index: 15, get: (r) => r.reeelSalaris, label: 'reëel salaris', kind: 'eur' },
  { letter: 'Q', index: 16, get: (r) => r.reeleDelta, label: 'reële delta', kind: 'eur' },
  { letter: 'R', index: 17, get: (r) => r.nominaleDelta, label: 'nominale delta', kind: 'eur' },
  { letter: 'S', index: 18, get: (r) => r.gegateDelta, label: 'gegate delta → CF', kind: 'eur' },
]

// ── Toename en afname (A–CH + CL/CM) ─────────────────────────────────────────
function buildTaColumns(): C<ToenameAfnameRow>[] {
  const cols: C<ToenameAfnameRow>[] = []
  const add = (index: number, get: (r: ToenameAfnameRow) => CellValue, label?: string, kind: ColKind = 'num') =>
    cols.push({ letter: colLetters(index), index, get, label, kind })
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
  const BEZIT = ['Spaargeld', 'Beleggingen', 'Pensioen', 'Vastgoed', 'Eigen huis', 'Overig']
  const SCHULD = ['Woning', 'Consumptief', 'Studie', 'Zakelijk', 'Overig']

  add(0, (r) => r.maand, 'maand', 'idx')
  add(1, inH((r) => r.leeftijd), 'leeftijd', 'age')
  add(2, inH((r) => r.maandInJaar), 'mnd in jaar')
  add(3, inH((r) => r.totaalExtraGeld), 'totaal extra geld', 'eur')
  add(4, inH((r) => r.afname), 'afname', 'eur')
  add(5, inH((r) => r.onttrekking), 'onttrekking', 'eur')
  add(6, inH((r) => r.totaal), 'totaal', 'eur')
  for (let i = 0; i < 6; i++) {
    const base = BEZIT_COL_START + BEZIT_COL_STRIDE * i
    const n = BEZIT[i]
    add(base + 0, inH((r) => r.bezit[i].toenamePct), `${n} toename%`, 'pct')
    add(base + 1, inH((r) => r.bezit[i].toenameEur), `${n} toename€`, 'eur')
    add(base + 2, inH((r) => r.bezit[i].afnamePct), `${n} afname%`, 'pct')
    add(base + 3, inH((r) => r.bezit[i].afnameEur), `${n} afname€`, 'eur')
    add(base + 4, inH((r) => r.bezit[i].onttrekkingPct), `${n} onttr%`, 'pct')
    add(base + 5, inH((r) => r.bezit[i].onttrekkingEur), `${n} onttr€`, 'eur')
    add(base + 6, inH((r) => r.bezit[i].totaalEur), `${n} totaal€`, 'eur')
    add(base + 7, inH((r) => r.bezit[i].aantal), `${n} aantal`)
    add(base + 8, inH((r) => r.bezit[i].perStukEur), `${n} per stuk€`, 'eur')
  }
  for (let j = 0; j < 5; j++) {
    const base = SCHULD_COL_START + SCHULD_COL_STRIDE * j
    const n = SCHULD[j]
    add(base + 0, inH((r) => r.schuld[j].toenamePct), `${n} aflos%`, 'pct')
    add(base + 1, inH((r) => r.schuld[j].toenameEur), `${n} aflos€`, 'eur')
    add(base + 2, inH((r) => r.schuld[j].totaalEur), `${n} totaal€`, 'eur')
    add(base + 3, inH((r) => r.schuld[j].aantal), `${n} aantal`)
    add(base + 4, inH((r) => r.schuld[j].perStukEur), `${n} per stuk€`, 'eur')
  }
  add(CL_COL, inH((r) => r.leeftijd), 'leeftijd', 'age')
  add(CM_COL, inH((r) => r.maandInJaar), 'mnd in jaar')
  return cols
}
const TA_COLUMNS = buildTaColumns()

// ── Bez (53 kolommen) ────────────────────────────────────────────────────────
const bezWaardeCol = (slot: number): number => 3 + slot * 3
const bezRendementCol = (slot: number): number => 4 + slot * 3
const bezInlegCol = (slot: number): number => 5 + slot * 3
function buildBezColumns(): C<BezRow>[] {
  const cols: C<BezRow>[] = []
  const push = (index: number, get: (r: BezRow) => CellValue, label?: string, kind: ColKind = 'eur') =>
    cols.push({ letter: colLetters(index), index, get, label, kind })
  push(0, (r) => r.maand, 'maand', 'idx')
  push(1, (r) => (r.beyondHorizon ? '' : r.leeftijd), 'leeftijd', 'age')
  push(2, (r) => (r.beyondHorizon ? '' : r.maandInJaar), 'mnd in jaar', 'num')
  for (let slot = 0; slot < 10; slot++) {
    push(bezWaardeCol(slot), (r) => (r.beyondHorizon ? '' : r.slots[slot].waarde), `slot ${slot} waarde`, 'eur')
    push(bezRendementCol(slot), (r) => (r.beyondHorizon ? '' : r.slots[slot].rendement), `slot ${slot} rendement`, 'eur')
    push(bezInlegCol(slot), (r) => (r.beyondHorizon ? 0 : r.slots[slot].inleg), `slot ${slot} inleg`, 'eur')
  }
  push(33, (r) => (r.beyondHorizon ? '' : r.totaalBox3Spaar), 'tot. Box 3 spaar', 'eur')
  push(34, (r) => (r.beyondHorizon ? '' : r.totaalBox3Investering), 'tot. Box 3 beleggen', 'eur')
  push(35, (r) => (r.beyondHorizon ? '' : r.totaalGeenBox3), 'tot. geen Box 3', 'eur')
  push(36, (r) => (r.beyondHorizon ? '' : r.totaalRendement), 'tot. rendement', 'eur')
  push(37, (r) => (r.beyondHorizon ? '' : r.totaalInleg), 'tot. inleg', 'eur')
  push(38, (r) => (r.beyondHorizon ? '' : r.totaalSpaargeld), 'tot. spaargeld', 'eur')
  push(39, (r) => (r.beyondHorizon ? '' : r.totaalBeleggingen), 'tot. beleggingen', 'eur')
  push(40, (r) => (r.beyondHorizon ? '' : r.totaalPensioen), 'tot. pensioen', 'eur')
  push(41, (r) => (r.beyondHorizon ? '' : r.totaalVastgoed), 'tot. vastgoed', 'eur')
  push(42, (r) => (r.beyondHorizon ? '' : r.totaalOverig), 'tot. overig', 'eur')
  push(43, (r) => (r.beyondHorizon ? '' : r.totaalEigenHuis), 'tot. eigen huis', 'eur')
  push(47, (r) => (r.beyondHorizon ? '' : r.avLeeftijd), 'woningblok leeftijd', 'age')
  push(48, (r) => (r.beyondHorizon ? '' : r.awMaand), 'woningblok mnd', 'num')
  push(50, (r) => (r.beyondHorizon ? 0 : r.woning.verkocht), 'huis verkocht', 'flag')
  push(51, (r) => (r.beyondHorizon ? 0 : r.woning.verkoopopbrengst), 'verkoopopbrengst', 'eur')
  push(52, (r) => (r.beyondHorizon ? 0 : r.woning.huurPerMaand), 'huur/mnd', 'eur')
  push(53, (r) => (r.beyondHorizon ? 0 : r.woning.vervallenHypotheeklast), 'vervallen hyp.last', 'eur')
  push(54, (r) => (r.beyondHorizon ? 0 : r.woning.overwaardeVorig), 'overwaarde (m−1)', 'eur')
  push(55, (r) => (r.beyondHorizon ? 0 : r.woning.opeetCap), 'opeet-cap', 'eur')
  push(56, (r) => (r.beyondHorizon ? 0 : r.woning.opeetOpname), 'opeet-opname', 'eur')
  return cols
}
const BEZ_COLUMNS = buildBezColumns()

// ── S (42 kolommen A–AN + AR + AS) ───────────────────────────────────────────
const sSaldoCol = (slot: number): number => 3 + slot * 4
function buildSColumns(): C<SRow>[] {
  const cols: C<SRow>[] = [
    { letter: 'A', index: 0, get: (r) => r.maand, label: 'maand', kind: 'idx' },
    { letter: 'B', index: 1, get: (r) => r.leeftijd, label: 'leeftijd', kind: 'age' },
    { letter: 'C', index: 2, get: (r) => r.maandInJaar, label: 'mnd in jaar', kind: 'num' },
  ]
  for (let slot = 0; slot < 7; slot++) {
    const base = sSaldoCol(slot)
    const tag = slot === 6 ? 'tekort-lening' : `slot ${slot}`
    cols.push({ letter: colLetters(base), index: base, get: (r) => r.slots[slot].saldo, label: `${tag} saldo`, kind: 'eur' })
    cols.push({ letter: colLetters(base + 1), index: base + 1, get: (r) => r.slots[slot].aflossing, label: `${tag} aflossing`, kind: 'eur' })
    cols.push({ letter: colLetters(base + 2), index: base + 2, get: (r) => r.slots[slot].extra, label: `${tag} extra`, kind: 'eur' })
    cols.push({ letter: colLetters(base + 3), index: base + 3, get: (r) => r.slots[slot].rente, label: `${tag} rente`, kind: 'eur' })
  }
  cols.push({ letter: 'AF', index: 31, get: (r) => r.totaalBox3, label: 'tot. Box 3', kind: 'eur' })
  cols.push({ letter: 'AG', index: 32, get: (r) => r.totaalGeenBox3, label: 'tot. geen Box 3', kind: 'eur' })
  cols.push({ letter: 'AH', index: 33, get: (r) => r.totaalAflossing, label: 'tot. aflossing', kind: 'eur' })
  cols.push({ letter: 'AI', index: 34, get: (r) => r.totaalRente, label: 'tot. rente', kind: 'eur' })
  cols.push({ letter: 'AJ', index: 35, get: (r) => r.totaalWoning, label: 'tot. woning', kind: 'eur' })
  cols.push({ letter: 'AK', index: 36, get: (r) => r.totaalConsumptief, label: 'tot. consumptief', kind: 'eur' })
  cols.push({ letter: 'AL', index: 37, get: (r) => r.totaalStudie, label: 'tot. studie', kind: 'eur' })
  cols.push({ letter: 'AM', index: 38, get: (r) => r.totaalZakelijk, label: 'tot. zakelijk', kind: 'eur' })
  cols.push({ letter: 'AN', index: 39, get: (r) => r.totaalOverig, label: 'tot. overig', kind: 'eur' })
  cols.push({ letter: 'AR', index: 43, get: (r) => r.helperLeeftijd, label: 'helper leeftijd', kind: 'age' })
  cols.push({ letter: 'AS', index: 44, get: (r) => r.helperMaand, label: 'helper mnd', kind: 'num' })
  return cols
}
const S_COLUMNS = buildSColumns()

// ── Verdeling (218 kolommen A–HK, HA uitgesloten) ────────────────────────────
function verdelingSpacer(index: number): C<VerdelingRow> {
  return { letter: colLetters(index), index, get: () => null, kind: 'num' }
}
function verdelingCol(index: number, get: (r: VerdelingRow) => CellValue, label?: string, kind: ColKind = 'eur'): C<VerdelingRow> {
  return { letter: colLetters(index), index, get, label, kind }
}
function verdelingSubject(
  getSubj: (r: VerdelingRow) => WaterfallResult,
  nCats: number,
  tag: string,
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
): C<VerdelingRow>[] {
  const out: C<VerdelingRow>[] = []
  out.push(verdelingCol(layout.budget, (r) => getSubj(r).budget, `${tag} budget`))
  for (let i = 0; i < nCats; i++) out.push(verdelingCol(layout.capsStart + i, (r) => getSubj(r).caps[i], `${tag} cap ${i}`))
  const passWidth = 2 + nCats
  for (let p = 0; p < 6; p++) {
    const base = layout.passBase + p * passWidth
    out.push(verdelingCol(base, (r) => getSubj(r).passRest[p], `${tag} p${p} rest`))
    out.push(verdelingCol(base + 1, (r) => getSubj(r).passSumW[p], `${tag} p${p} ΣW`, 'num'))
    for (let i = 0; i < nCats; i++) {
      out.push(verdelingCol(base + 2 + i, (r) => getSubj(r).passAlloc[p][i], `${tag} p${p} alloc ${i}`))
    }
  }
  out.push(verdelingCol(layout.leftover, (r) => getSubj(r).leftover, `${tag} leftover`))
  out.push(verdelingCol(layout.reserveDenom, (r) => getSubj(r).reserveDenom, `${tag} reserve-denom`, 'num'))
  for (let i = 0; i < nCats; i++) out.push(verdelingCol(layout.reserveAllocStart + i, (r) => getSubj(r).reserveAlloc[i], `${tag} reserve ${i}`))
  for (let i = 0; i < nCats; i++) out.push(verdelingCol(layout.eindStart + i, (r) => getSubj(r).eind[i], `${tag} eind ${i}`))
  out.push(verdelingCol(layout.onbenut, (r) => getSubj(r).onbenut, `${tag} onbenut`))
  return out
}
function buildVerdelingColumns(): C<VerdelingRow>[] {
  const cols: C<VerdelingRow>[] = [
    verdelingCol(0, (r) => r.maand, 'maand', 'idx'),
    verdelingCol(1, (r) => (r.beyondHorizon ? '' : r.leeftijd), 'leeftijd', 'age'),
    verdelingCol(2, (r) => (r.beyondHorizon ? '' : r.maandInJaar), 'mnd in jaar', 'num'),
  ]
  cols.push(
    ...verdelingSubject((r) => r.afname, 6, 'afname', {
      budget: colIndex('D'), capsStart: colIndex('E'), passBase: colIndex('L'),
      leftover: colIndex('BH'), reserveDenom: colIndex('BI'), reserveAllocStart: colIndex('BJ'),
      eindStart: colIndex('BP'), onbenut: colIndex('BV'),
    }),
  )
  cols.push(verdelingSpacer(colIndex('K')))
  cols.push(verdelingSpacer(colIndex('BW')))
  cols.push(
    ...verdelingSubject((r) => r.onttrekking, 6, 'onttr', {
      budget: colIndex('BX'), capsStart: colIndex('BY'), passBase: colIndex('CE'),
      leftover: colIndex('EA'), reserveDenom: colIndex('EB'), reserveAllocStart: colIndex('EC'),
      eindStart: colIndex('EI'), onbenut: colIndex('EO'),
    }),
  )
  cols.push(verdelingSpacer(colIndex('EP')))
  cols.push(
    ...verdelingSubject((r) => r.aflossing, 5, 'aflos', {
      budget: colIndex('EQ'), capsStart: colIndex('ER'), passBase: colIndex('EW'),
      leftover: colIndex('GM'), reserveDenom: colIndex('GN'), reserveAllocStart: colIndex('GO'),
      eindStart: colIndex('GT'), onbenut: colIndex('GY'),
    }),
  )
  cols.push(verdelingSpacer(colIndex('GZ')))
  cols.push(verdelingSpacer(colIndex('HB')))
  for (let i = 0; i < 6; i++) cols.push(verdelingCol(colIndex('HC') + i, (r) => r.overflow[i], `overloop ${i}`))
  cols.push(verdelingSpacer(colIndex('HI')))
  cols.push(verdelingCol(colIndex('HJ'), (r) => (r.beyondHorizon ? '' : r.leeftijd), 'leeftijd', 'age'))
  cols.push(verdelingCol(colIndex('HK'), (r) => (r.beyondHorizon ? '' : r.maandInJaar), 'mnd in jaar', 'num'))
  return cols.sort((a, b) => a.index - b.index)
}
const VERDELING_COLUMNS = buildVerdelingColumns()

// ── Registry ─────────────────────────────────────────────────────────────────

interface TableSpec {
  readonly sheet: string
  readonly headerRows: number
  readonly columns: ReadonlyArray<KernelColumn>
  readonly select: (p: KernelProjection) => ReadonlyArray<unknown>
}

/** Widen een sterk-getypte kolomlijst naar de opaque `KernelColumn`-vorm. */
function widen<T>(cols: C<T>[]): KernelColumn[] {
  return cols as unknown as KernelColumn[]
}

const REGISTRY: Record<KernelTableId, TableSpec> = {
  cf: { sheet: 'CF', headerRows: 1, columns: widen(CF_COLUMNS), select: (p) => p.cf },
  bel: { sheet: 'Bel', headerRows: 1, columns: widen(BEL_COLUMNS), select: (p) => p.bel },
  ont: { sheet: 'Ont', headerRows: 1, columns: widen(ONT_COLUMNS), select: (p) => p.ont },
  af: { sheet: 'Af', headerRows: 1, columns: widen(AF_COLUMNS), select: (p) => p.af },
  'toename-afname': { sheet: 'Toename en afname', headerRows: 2, columns: widen(TA_COLUMNS), select: (p) => p.toenameAfname },
  verdeling: { sheet: 'Verdeling', headerRows: 3, columns: widen(VERDELING_COLUMNS), select: (p) => p.verdeling },
  bez: { sheet: 'Bez', headerRows: 3, columns: widen(BEZ_COLUMNS), select: (p) => p.bez },
  s: { sheet: 'S', headerRows: 3, columns: widen(S_COLUMNS), select: (p) => p.s },
  prognose: { sheet: 'Prognose', headerRows: 1, columns: widen(PROGNOSE_COLUMNS), select: (p) => p.prognose },
  werk: { sheet: 'Werk-strategie', headerRows: 1, columns: widen(WERK_COLUMNS), select: (p) => p.werkStrategie },
  pt: { sheet: 'PT', headerRows: 1, columns: widen(PT_COLUMNS), select: (p) => p.pt },
}

/** Alle registry-ingangen (voor de verificatie-loop). */
export function allTableSpecs(): ReadonlyArray<{ id: KernelTableId } & TableSpec> {
  return (Object.keys(REGISTRY) as KernelTableId[]).map((id) => ({ id, ...REGISTRY[id] }))
}

/** De volledige kolomlijst (Excel-letter + label + kind) van één tabel. */
export function tableColumnMeta(id: KernelTableId): ReadonlyArray<{ letter: string; label: string; kind: ColKind }> {
  return REGISTRY[id].columns.map((c) => ({ letter: c.letter, label: c.label ?? c.letter, kind: c.kind ?? 'num' }))
}

export interface SerializeOptions {
  /** Kolom-selectie: alle kolommen, of alleen de opgegeven Excel-letters. */
  readonly onlyLetters?: ReadonlyArray<string>
  /** Rij-selectie: jaar-sampling (elke 12e maand) of maand-bereik. */
  readonly modus: 'jaar' | 'maand'
  /** Bereik (inclusief) voor `modus:'maand'` of de begrenzing van de jaar-sampling. */
  readonly van?: number
  readonly tot?: number
}

/**
 * Serialiseer één tabel uit de projectie naar een plat grid, op afroep. Bij
 * `modus:'jaar'` wordt elke 12e maand (verjaardag) genomen; bij `modus:'maand'`
 * de rijen `van..tot` inclusief. `onlyLetters` beperkt de kolommen.
 */
export function serializeTable(
  id: KernelTableId,
  projection: KernelProjection,
  opts: SerializeOptions,
): SerializedGrid {
  const spec = REGISTRY[id]
  const rows = spec.select(projection)
  const total = rows.length
  const letterSet = opts.onlyLetters ? new Set(opts.onlyLetters) : null
  const columns = letterSet ? spec.columns.filter((c) => letterSet.has(c.letter)) : spec.columns

  const van = Math.max(0, opts.van ?? 0)
  const tot = Math.min(total - 1, opts.tot ?? total - 1)

  const indices: number[] = []
  if (opts.modus === 'jaar') {
    for (let m = van; m <= tot; m += 12) indices.push(m)
  } else {
    for (let m = van; m <= tot; m++) indices.push(m)
  }

  const outRows: CellValue[][] = indices.map((m) => {
    const row = rows[m]
    return columns.map((c) => c.get(row))
  })

  return {
    id,
    columns: columns.map((c) => ({ letter: c.letter, label: c.label ?? c.letter, kind: c.kind ?? 'num' })),
    rows: outRows,
    totalMonths: total,
    returnedRows: outRows.length,
  }
}
