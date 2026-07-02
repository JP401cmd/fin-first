/**
 * Horizon-kernel — FIRE-solver: letterlijke port van de VBA-macro `BepaalFIRE`
 * (Module1, zie `docs/horizon-oracle/vba.txt`) + het P-statusblok B35-B38 en
 * B93-B100 (formules in `docs/horizon-oracle/structuur.md`).
 *
 * Algoritme (VBA-getrouw, geen "slimmer" zoeken):
 *  1. Eindstrategie "pensioen" (ES!C7): kortsluiting — B16 = ES!C15
 *     (AOW-/pensioenleeftijd), géén bisectie.
 *  2. Anders: hiM = CLng((100 − leeftijd)·12); evalueer de gap op de horizon.
 *     Gap < 0 → NIET haalbaar: B16 blijft op de horizon geparkeerd
 *     (`unreachable_within_horizon`, met €/mnd-hint).
 *  3. Anders maand-bisectie: zoek de kleinste maand hiM met gap ≥ 0
 *     (invariant: gap(hiM) ≥ 0; loM start op 0 en wordt nooit geëvalueerd —
 *     net als in de VBA, wat de `reached_now`-uitkomsten via de statusformule
 *     laat lopen, niet via de bisectie).
 *
 * Statusblok (per kandidaat volledig herrekend, zoals Excel dat per
 * `Application.Calculate` doet):
 *  - B35 eindleeftijd  = IFS per eindstrategie (deplete→B51, legacy→B52,
 *    perpetual/pensioen→100).
 *  - B36 doelbedrag    = legacy: B53·(1+B14)^(B35−B7);
 *                        perpetual: Prognose!J@FIRE·(1+B14)^(B35−B16); anders 0.
 *  - B37 modelwaarde   = INDEX(legacy ∧ B54="Ja" ? Prognose!I : Prognose!J,
 *                        (B35−B7)·12+1) — INDEX trunceert de rij-index.
 *  - B38 gap           = B37 − B36 (B98 = B38).
 *  - B93 status        = IF(AND(pensioen, B99>0), pension_shortfall,
 *                        IF(Prognose!J(0) ≥ B36, reached_now,
 *                        IF(B38 < 0, unreachable_within_horizon, reached_at)))
 *    — inclusief de bewuste doel=0-quirk (B36=0 → J(0) ≥ 0 → reached_now).
 *  - B96 hint          = −B38/((B35−B7)·12) €/mnd.
 *  - B99 tekort        = MAXIFS(S!AB; S!AR ≤ B35) — piek van het
 *    tekort-lening-saldo t/m de eindleeftijd.
 *  - B100              = laatste solver-status (= B93 na een verse run).
 *
 * Pure module: geen fs/Supabase; de engine is de enige afhankelijkheid.
 */

import { runKernelProjection, type KernelProjection } from './engine'
import { clng, computeDoelblok, prognoseJ } from './gap'
import { computeEs } from './tables/es'
import type { KernelInput } from './types'

// NB (calc-review): de bisectie- en horizon-toetsen op de gap zijn bewust STRIKT
// (geen ruis-clamp zoals bij B99): de gap verspringt per maand met honderden tot
// duizenden euro's (fixture-empirie), dus sub-cent-float-ruis kan alleen in het
// theoretische geval dat een maand-gap binnen ~½ cent van 0 landt een andere
// maand kiezen dan Excel. Een EPS-band zou de Excel-semantiek zélf veranderen;
// dit staartrisico is aanvaard en hier gedocumenteerd. Zelfde geldt voor
// wrappers/band.ts (identieke bisectie).

/** P!B93/B100 — de vier solver-statussen (exacte Excel-teksten). */
export type SolverStatus =
  | 'reached_now'
  | 'reached_at'
  | 'unreachable_within_horizon'
  | 'pension_shortfall'

export interface SolveFireResult {
  /** P!B16 — gevonden FIRE-leeftijd (bij unreachable: geparkeerd op de horizon). */
  readonly fireAge: number
  /** P!B35 — eindleeftijd van de gekozen eindstrategie. */
  readonly eindleeftijd: number
  /** P!B36 — doelbedrag op de eindleeftijd (nominaal). */
  readonly doelbedrag: number
  /** P!B37 — modelwaarde (Prognose I of J) op de eindleeftijd. */
  readonly modelwaarde: number
  /** P!B38 = P!B98 — gap (modelwaarde − doelbedrag). */
  readonly gap: number
  /** P!B93 = P!B100 — status. */
  readonly status: SolverStatus
  /** P!B96 — €/mnd-extra-sparen-hint (−gap / maanden tot eindleeftijd). */
  readonly maandHint: number
  /** P!B99 — piek tekort-lening-saldo t/m de eindleeftijd. */
  readonly tekortLeningTotEindleeftijd: number
  /** Aantal engine-runs (bisectie-stappen + eind-run) — voor rapportage. */
  readonly engineRuns: number
  /** De projectie van de eindstand (basis voor wrappers/beheer). */
  readonly projection: KernelProjection
}

/** Het statusblok van één doorgerekende stand (P!B35-B38 + B93/B96/B99). */
interface StatusBlok {
  readonly eindleeftijd: number
  readonly doelbedrag: number
  readonly modelwaarde: number
  readonly gap: number
  readonly status: SolverStatus
  readonly maandHint: number
  readonly tekortLening: number
}

function computeStatusBlok(
  input: KernelInput,
  proj: KernelProjection,
  fireAge: number,
): StatusBlok {
  const es = computeEs(input)
  const code = es.interneCode
  const start = input.startLeeftijd

  // ── P!B35–B38 — gedeelde doelblok-kern (één bron, zie gap.ts) ───────────────
  const { eindleeftijd, doelbedrag, modelwaarde, gap } = computeDoelblok(
    input,
    es,
    proj,
    fireAge,
  )

  // ── P!B99 — MAXIFS(S!AB; S!AR ≤ B35): piek tekort-lening t/m eindleeftijd ──
  // Excel rekent de tekort-kolom op exacte nullen; de kernel-floats dragen
  // sub-cent-ruis (parity garandeert ≤ €0,01). De B93-conditie `B99 > 0` is
  // messcherp, dus alles onder een halve cent geldt als 0 — anders zou
  // float-ruis een vals `pension_shortfall` geven (eind-pensioen-fixture).
  const TEKORT_RUIS_DREMPEL = 0.005
  let tekortLening = 0
  // De tekort-lening wordt via de getypte rol gelokaliseerd (snede 2b), niet via de
  // positie-aanname slot 6. Voor de fixtures staat de rol op slot 6 (input-from-
  // fixture) → byte-identiek; 18/19 fixtures hebben geen tekort-pot → rol ontbreekt
  // → tekortLening blijft 0 (gelijk aan het oude lezen van de lege slot 6).
  const tekortSlot = input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot
  if (tekortSlot !== undefined) {
    for (const rij of proj.s) {
      const leeftijd = rij.helperLeeftijd
      if (typeof leeftijd !== 'number' || leeftijd > eindleeftijd) continue
      const saldo = rij.slots[tekortSlot]?.saldo
      if (typeof saldo === 'number' && saldo > tekortLening) tekortLening = saldo
    }
  }
  if (tekortLening <= TEKORT_RUIS_DREMPEL) tekortLening = 0

  // ── P!B93 — status (exacte geneste IF-volgorde, incl. doel=0-quirk) ────────
  const jMaand0 = prognoseJ(proj, 0) ?? 0
  let status: SolverStatus
  if (code === 'pensioen' && tekortLening > 0) {
    status = 'pension_shortfall'
  } else if (jMaand0 >= doelbedrag) {
    status = 'reached_now'
  } else if (gap < 0) {
    status = 'unreachable_within_horizon'
  } else {
    status = 'reached_at'
  }

  // ── P!B96 — €/mnd-extra-sparen-hint ────────────────────────────────────────
  // Guard (calc-review): eindleeftijd == startleeftijd zou ±Inf/NaN geven; de
  // hint is informatief, dus 0 bij een lege maand-noemer.
  const maandenTotEind = (eindleeftijd - start) * 12
  const maandHint = maandenTotEind > 0 ? -gap / maandenTotEind : 0

  return { eindleeftijd, doelbedrag, modelwaarde, gap, status, maandHint, tekortLening }
}

/**
 * `BepaalFIRE` — vindt de FIRE-leeftijd exact zoals de Excel-macro en levert
 * het volledige statusblok van de eindstand.
 */
export function solveFire(input: KernelInput): SolveFireResult {
  const leeftijd = input.startLeeftijd
  const es = computeEs(input)
  let engineRuns = 0

  const run = (fireAge: number): KernelProjection => {
    engineRuns += 1
    return runKernelProjection(input, { fireAge })
  }

  const afronden = (
    fireAge: number,
    proj: KernelProjection,
  ): SolveFireResult => {
    const blok = computeStatusBlok(input, proj, fireAge)
    return {
      fireAge,
      eindleeftijd: blok.eindleeftijd,
      doelbedrag: blok.doelbedrag,
      modelwaarde: blok.modelwaarde,
      gap: blok.gap,
      status: blok.status,
      maandHint: blok.maandHint,
      tekortLeningTotEindleeftijd: blok.tekortLening,
      engineRuns,
      projection: proj,
    }
  }

  // ── Pensioenleeftijd: FIRE = AOW-leeftijd, geen bisectie ────────────────────
  if (es.interneCode === 'pensioen') {
    const fireAge = es.pensioenleeftijd
    return afronden(fireAge, run(fireAge))
  }

  // ── Horizon-check: gap < 0 op leeftijd 100 → parkeerstand ───────────────────
  const loStart = 0
  const hiStart = clng((100 - leeftijd) * 12)
  let hi = hiStart
  let lo = loStart

  let proj = run(leeftijd + hi / 12)
  if (computeStatusBlok(input, proj, leeftijd + hi / 12).gap < 0) {
    return afronden(leeftijd + hi / 12, proj)
  }

  // ── Maand-bisectie op de gap (VBA: `\` = integer-deling, floor) ─────────────
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    proj = run(leeftijd + mid / 12)
    if (computeStatusBlok(input, proj, leeftijd + mid / 12).gap >= 0) {
      hi = mid
    } else {
      lo = mid
    }
  }

  const fireAge = leeftijd + hi / 12
  return afronden(fireAge, run(fireAge))
}
