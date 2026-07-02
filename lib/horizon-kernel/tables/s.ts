/**
 * Horizon-kernel · tabel **S** (schulden per maand) — Excel-tab `S` (A1:AS1203).
 *
 * Pure per-maand-functie die de zeven schuld-slots berekent, exact zoals het
 * Excel-oracle (ADR 0032). Zeven fysieke slots (bens rij 17-23) staan elk in vier
 * kolommen — saldo / aflossing / extra aflossen / rente — op grid-index
 * `3+4·slot … 6+4·slot`, gevolgd door de totaal- en categorie-kolommen (AF-AN) en
 * de MAXIFS-hulpkolommen AR (leeftijd) / AS (maand-in-jaar).
 *
 * ## Slot-rollen
 * - **Regulier** (slot 1/2/4/5, 0-gebaseerd): annuïteit met vaste maandaflossing.
 *   - `saldo(m)   = MAX(0, saldo(m−1) − aflossing − extra)`; `saldo(0)=startwaarde`.
 *   - `aflossing  = MIN(saldo(m−1), planned/12)`, `planned = D>0 ? D€ : C%·B` (bens).
 *   - `extra      = IFERROR(Verdeling-categoriebedrag · saldo(m−1)/categorie-cap, 0)`
 *     (pot-share m−1; > 0 zodra de schuld-waterval extra aflossing routeert — bv.
 *     `schuld-prio` slot 2, m=53: 599,82. In de 18 fixtures zonder prio-aflossing 0).
 *   - `rente      = saldo(m−1) · rente%/12`.
 * - **Hypotheek** (slot 0): reguliere annuïteit **plus de AY-guard** — in de
 *   verkoopmaand (`Bez!AY(m)=1`) worden **saldo (D), aflossing (E) en extra (F)**
 *   op 0 gezet (geen dubbele aflossing; hypotheek-nulzetting via D), maar de
 *   **rente (G) is NIET geguard**: die loopt in de verkoopmaand nog over
 *   saldo(m−1) (empirisch: partner-aan m=54 → rente 759,06 op de pre-verkoopstand).
 * - **Opeethypotheek** (slot 3, alleen als `P!B57="Opeethypotheek"`): schuldgroei
 *   `saldo(m) = MIN(Bez!BD, (saldo(m−1)+Bez!BE)·(1+P!B66/12))` — maandopname + rente,
 *   gecapt op de leenruimte; aflossing/extra/rente-kolommen zijn 0. Buiten
 *   opeet-modus is slot 3 een gewone (lege) reguliere slot.
 * - **Tekort-lening** (slot 6): gevoed uit het Verdeling-restant `BV+EO`, groeit met
 *   rente `AE = saldo(m−1)·P!B25/12` en wordt afgelost met de prio-1-toewijzing
 *   `AC` uit de schuld-waterval: `saldo(m)=MAX(0, saldo(m−1)+AE+(BV+EO)−AC)` (structuur.md
 *   S-tab; AD extra = 0). `AC` (`dep.tekortAflossing`) wordt teacher-forced/engine-zijdig
 *   aangeleverd — het is gecapt op het **pre-existente** tekort (`MIN(ruwBudget, saldo(m−1)+AE)`,
 *   berekend in Verdeling, zie `verdeling/index.ts`). In 18 van de 19 fixtures is er geen
 *   tekort-slot en dus `AC=0`; alleen `schuld-prio` (m≥699) beproeft `AC>0`. Extra (AD)
 *   blijft 0. Voorbij de horizon **bevroren** (saldo blijft staan, AC/rente 0) — anders
 *   dan de reguliere slots die dan leeg ("") zijn.
 *
 * ## Horizon-guard (per kolom verschillend — empirisch geverifieerd)
 * - **saldo / rente**: `IF($B="","",…)` buitenste → "" voorbij de horizon.
 * - **aflossing**: `IF(AY=1,0, IF($B="","",…))` → AY buitenste (verkoopmaand 0),
 *   daarna "" voorbij de horizon.
 * - **extra**: `IF(AY=1,0, IFERROR(…,0))` → nooit "", altijd numeriek (0).
 * - **tekort**: bevriest numeriek voorbij de horizon (geen "").
 * - **totalen (AF-AN) en hulpkolommen (AR/AS)**: `IF($B="","",…)` → "".
 * - **maandindex (A)**: altijd numeriek (bewaakt rij-uitlijning).
 *
 * Teacher-forced parity: alle upstream-waarden (Bez!AY/BD/BE, Verdeling!BV/EO +
 * extra-aflossing-budget/cap) én de eigen saldi van maand m−1 komen via `SDep` uit
 * de fixture, zodat `computeS` geïsoleerd formule-getrouw bewezen wordt over alle
 * maanden × alle fixtures. Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { DebtCategorie, DebtPot, KernelInput, MonthIndex } from '../types'
import { isBeyondHorizon, leeftijdJaren, maandInJaar } from '../scaffold'

/** Aantal fysieke schuld-slots (bens rij 17-23). */
export const S_PHYSICAL_SLOTS = 7

/**
 * Schuld-categorieën die een extra-aflossing-kolom in de Verdeling-waterval hebben
 * (GT:GX / ER:EV), in vaste kolomvolgorde. De categorie **Tekort** heeft géén
 * eigen waterval-kolom (die wordt via BV+EO gevoed) en staat hier bewust niet in.
 */
export const S_EXTRA_CATEGORIEEN: readonly DebtCategorie[] = [
  'Woning',
  'Consumptief',
  'Studie',
  'Zakelijk',
  'Overig',
]

/** Eén celwaarde in de S-tabel: getal of leeg ("") voorbij de horizon. */
export type SCell = number | ''

/** Eén schuld-slot (vier kolommen: saldo / aflossing / extra aflossen / rente). */
export interface SSlot {
  readonly saldo: SCell
  readonly aflossing: SCell
  readonly extra: SCell
  readonly rente: SCell
}

/**
 * Upstream-waarden die S op maand m consumeert (teacher-forced uit de fixture).
 * `saldoVorige` bevat de eigen S-saldi van maand m−1 per fysieke slot (lege/lege
 * cellen → 0; voor de tekort-slot altijd het numerieke bevroren saldo).
 */
export interface SDep {
  /** S-saldo(m−1) per fysieke slot (0..6); coerced ""/leeg → 0. Op m=0 ongebruikt. */
  readonly saldoVorige: readonly number[]
  /** Bez!AY(m) — verkocht-vlag (0/1) voor de hypotheek-slot-guard. */
  readonly verkocht: number
  /** Bez!BD(m) — opeet-leenruimte-cap. */
  readonly opeetCap: number
  /** Bez!BE(m) — opeet-maandopname. */
  readonly opeetOpname: number
  /** Verdeling!BV(m) + Verdeling!EO(m) — tekort-voeding (onbenut afname + onttrekking). */
  readonly tekortBudget: number
  /**
   * S!AC(m) — tekort-aflossing (prio-1-toewijzing uit de schuld-waterval). Wordt
   * in Verdeling berekend (`MIN(ruwBudget, saldo(m−1)+AE)`, zie `verdeling/index.ts`)
   * en hier geconsumeerd; 0 als er geen tekort-slot/aflossing is. Op m=0 en voorbij
   * de horizon ongebruikt (de tekort-slot leegt/bevriest dan onafhankelijk).
   */
  readonly tekortAflossing: number
  /** Verdeling GT:GX — extra-aflossing-budget per categorie (volgorde `S_EXTRA_CATEGORIEEN`). */
  readonly extraAflossingBudget: readonly number[]
  /** Verdeling ER:EV — schuld-categorie-cap m−1 per categorie (zelfde volgorde). */
  readonly categorieCap: readonly number[]
}

/** Volledige S-rij (alle vergeleken kolommen). Kolomletters tussen haakjes. */
export interface SRow {
  readonly maand: number // A
  readonly leeftijd: SCell // B
  readonly maandInJaar: SCell // C
  readonly slots: readonly SSlot[] // D..AE (7×4)
  readonly totaalBox3: SCell // AF
  readonly totaalGeenBox3: SCell // AG
  readonly totaalAflossing: SCell // AH
  readonly totaalRente: SCell // AI
  readonly totaalWoning: SCell // AJ
  readonly totaalConsumptief: SCell // AK
  readonly totaalStudie: SCell // AL
  readonly totaalZakelijk: SCell // AM
  readonly totaalOverig: SCell // AN
  readonly helperLeeftijd: SCell // AR
  readonly helperMaand: SCell // AS
}

/** Zoek de pot voor een fysieke slot-index (lege slots → `null`). */
function potBySlot(potten: readonly DebtPot[], slot: number): DebtPot | null {
  for (const p of potten) if (p.slot === slot) return p
  return null
}

/** Geplande maandaflossing: `(D€ > 0 ? D€ : C%·startwaarde) / 12` (bens). */
function plannedMonthly(pot: DebtPot | null): number {
  if (pot === null) return 0
  const jaar = pot.aflossingEur > 0 ? pot.aflossingEur : pot.aflossingPct * pot.startwaarde
  return jaar / 12
}

/**
 * Extra aflossen (S!F-familie): categorie-bedrag × pot-share(m−1), met pot-share =
 * saldo(m−1) / categorie-cap. `IFERROR(…,0)` vangt de cap=0-deling. Het categorie-bedrag
 * is > 0 zodra de schuld-waterval extra aflossing routeert (bv. `schuld-prio`); in de 18
 * fixtures zonder prio-aflossing blijft het 0 en valt deze split terug op 0.
 */
function extraSplit(pot: DebtPot | null, saldoPrev: number, dep: SDep): number {
  if (pot === null) return 0
  const catIdx = S_EXTRA_CATEGORIEEN.indexOf(pot.categorie)
  if (catIdx < 0) return 0 // 'Tekort' of onbekend: geen waterval-kolom
  const budget = dep.extraAflossingBudget[catIdx] ?? 0
  const cap = dep.categorieCap[catIdx] ?? 0
  return cap !== 0 ? (budget * saldoPrev) / cap : 0
}

/** Reguliere slot (incl. hypotheek met AY-guard, lege slots, opeet buiten opeet-modus). */
function regularSlot(
  pot: DebtPot | null,
  saldoPrev: number,
  m: MonthIndex,
  beyond: boolean,
  ayGuard: boolean,
  dep: SDep,
): SSlot {
  const ay = ayGuard ? dep.verkocht : 0
  const rentePct = pot ? pot.rente : 0

  // extra (F): AY buitenste, geen "" — altijd numeriek.
  const extra = ay === 1 ? 0 : extraSplit(pot, saldoPrev, dep)

  // aflossing (E): AY buitenste (verkoopmaand 0), dan "" voorbij horizon, dan m=0 → 0.
  const aflossingNum = m === 0 ? 0 : Math.min(saldoPrev, plannedMonthly(pot))
  const aflossing: SCell = ay === 1 ? 0 : beyond ? '' : aflossingNum

  // saldo (D): "" buitenste, dan AY (0), dan m=0 → startwaarde, anders MAX(0, …).
  const startwaarde = pot ? pot.startwaarde : 0
  const saldo: SCell = beyond
    ? ''
    : ay === 1
      ? 0
      : m === 0
        ? startwaarde
        : Math.max(0, saldoPrev - aflossingNum - extra)

  // rente (G): "" buitenste, dan m=0 → 0; GEEN AY-guard (loopt in verkoopmaand door).
  const rente: SCell = beyond ? '' : m === 0 ? 0 : saldoPrev * rentePct

  // `rente` is per maand: saldo(m−1)·rente%/12. `rentePct` is het jaarpercentage.
  return { saldo, aflossing, extra, rente: rente === '' ? '' : rente / 12 }
}

/** Opeethypotheek-slot (alleen actief als `P!B57="Opeethypotheek"`). */
function opeetSlot(
  saldoPrev: number,
  m: MonthIndex,
  beyond: boolean,
  startwaarde: number,
  dep: SDep,
  opeetRentePerJaar: number,
): SSlot {
  // saldo (P): "" voorbij horizon; m=0 → startwaarde; anders opname+rente gecapt op leenruimte.
  const saldo: SCell = beyond
    ? ''
    : m === 0
      ? startwaarde
      : Math.min(dep.opeetCap, (saldoPrev + dep.opeetOpname) * (1 + opeetRentePerJaar / 12))
  // aflossing (Q) / rente (S): 0 in opeet-modus ("" voorbij horizon); extra (R): altijd 0.
  return { saldo, aflossing: beyond ? '' : 0, extra: 0, rente: beyond ? '' : 0 }
}

/** Tekort-lening-slot: gevoed uit BV+EO, afgelost met AC, groeit met rente; voorbij horizon bevroren. */
function tekortSlot(
  saldoPrev: number,
  m: MonthIndex,
  beyond: boolean,
  startwaarde: number,
  tekortBudget: number,
  tekortRentePerJaar: number,
  tekortAflossing: number,
): SSlot {
  if (m === 0) return { saldo: startwaarde, aflossing: 0, extra: 0, rente: 0 }
  if (beyond) return { saldo: saldoPrev, aflossing: 0, extra: 0, rente: 0 } // bevroren (AC/rente 0)
  const rente = (saldoPrev * tekortRentePerJaar) / 12 // AE — rente-bijschrijving in het saldo
  // AB = MAX(0, AB(m−1) + AE + (BV+EO) − AC − AD); AC = tekortAflossing (Verdeling), AD (extra) = 0.
  const saldo = Math.max(0, saldoPrev + rente + tekortBudget - tekortAflossing)
  return { saldo, aflossing: tekortAflossing, extra: 0, rente }
}

/** Numerieke celwaarde voor een totaal-som (leeg/"" telt als 0). */
function n(v: SCell): number {
  return typeof v === 'number' ? v : 0
}

/**
 * Bereken de S-rij voor maand m uit de statische parameters en de upstream DepView.
 * Voorbij de horizon (leeftijd > 100) leegt Excel de meeste reken-kolommen ("");
 * de tekort-slot bevriest numeriek, de extra-kolommen blijven 0.
 */
export function computeS(input: KernelInput, dep: SDep, m: MonthIndex): SRow {
  const beyond = isBeyondHorizon(input, m)
  const B: SCell = beyond ? '' : leeftijdJaren(input, m)
  const C: SCell = beyond ? '' : maandInJaar(m)

  const opeetMode = input.woning.selector === 'Opeethypotheek'

  const slots: SSlot[] = []
  for (let i = 0; i < S_PHYSICAL_SLOTS; i++) {
    const pot = potBySlot(input.schuldPotten, i)
    const saldoPrev = dep.saldoVorige[i] ?? 0
    if (pot?.rol === 'tekortLening') {
      slots.push(
        tekortSlot(
          saldoPrev,
          m,
          beyond,
          pot.startwaarde,
          dep.tekortBudget,
          input.tekortLeningRente,
          dep.tekortAflossing,
        ),
      )
    } else if (pot?.rol === 'opeethypotheek' && opeetMode) {
      slots.push(opeetSlot(saldoPrev, m, beyond, pot.startwaarde, dep, input.woning.opeetRentePerJaar))
    } else {
      // Reguliere slot; de hypotheek (slot 0) draagt de AY-guard.
      slots.push(regularSlot(pot, saldoPrev, m, beyond, pot?.rol === 'hypotheek', dep))
    }
  }

  // ── Totalen (AF-AN) + hulpkolommen (AR/AS): "" voorbij de horizon ────────────
  let AF: SCell = '',
    AG: SCell = '',
    AH: SCell = '',
    AI: SCell = '',
    AJ: SCell = '',
    AK: SCell = '',
    AL: SCell = '',
    AM: SCell = '',
    AN: SCell = ''
  if (!beyond) {
    let box3 = 0,
      geen = 0,
      afl = 0,
      rente = 0,
      won = 0,
      con = 0,
      stu = 0,
      zak = 0,
      ov = 0
    for (let i = 0; i < S_PHYSICAL_SLOTS; i++) {
      const pot = potBySlot(input.schuldPotten, i)
      const s = slots[i]
      const saldo = n(s.saldo)
      afl += n(s.aflossing) // AH: alleen geplande aflossing (extra telt niet mee)
      rente += n(s.rente)
      if (pot === null) continue // lege slot: geen box3-type/categorie
      if (pot.box3Type === 'Box 3 schuld') box3 += saldo
      else geen += saldo
      switch (pot.categorie) {
        case 'Woning':
          won += saldo
          break
        case 'Consumptief':
          con += saldo
          break
        case 'Studie':
          stu += saldo
          break
        case 'Zakelijk':
          zak += saldo
          break
        case 'Overig':
          ov += saldo
          break
        // 'Tekort' → telt in AF (Box 3 schuld) maar niet in de categorie-totalen AJ:AN.
      }
    }
    AF = box3
    AG = geen
    AH = afl
    AI = rente
    AJ = won
    AK = con
    AL = stu
    AM = zak
    AN = ov
  }

  return {
    maand: m,
    leeftijd: B,
    maandInJaar: C,
    slots,
    totaalBox3: AF,
    totaalGeenBox3: AG,
    totaalAflossing: AH,
    totaalRente: AI,
    totaalWoning: AJ,
    totaalConsumptief: AK,
    totaalStudie: AL,
    totaalZakelijk: AM,
    totaalOverig: AN,
    helperLeeftijd: B, // AR = leeftijd (MAXIFS-criteriumkolom)
    helperMaand: C, // AS = maand-in-jaar
  }
}
