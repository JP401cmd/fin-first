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
 *    Met `KernelInput.reachedNowVereistBereikbaarDoel` (app-pad AAN, fixture-pad
 *    UIT → parity byte-identiek) is die quirk gescoopt op een doel dat er ook
 *    echt is: bij B36 < 0 of B38 < 0 valt de status op
 *    `unreachable_within_horizon` i.p.v. op een vals `reached_now` dat de
 *    horizon-parkeerstand maskeert (bevinding M6, gap-besluit V21).
 *  - B96 hint          = −B38/((B35−B7)·12) €/mnd.
 *  - B99 tekort        = MAXIFS(S!AB; S!AR ≤ B35) — piek van het
 *    tekort-lening-saldo t/m de eindleeftijd.
 *  - B100              = laatste solver-status (= B93 na een verse run).
 *
 * Pure module: geen fs/Supabase; de engine is de enige afhankelijkheid.
 */

import { runKernelProjection, type KernelProjection } from './engine'
import { clng, computeDoelblok, computeGap, prognoseJ } from './gap'
import { computeEs } from './tables/es'
import type { KernelInput } from './types'

// NB (calc-review): de bisectie- en horizon-toetsen op de gap zijn bewust STRIKT
// (geen ruis-clamp zoals bij B99): de gap verspringt per maand met honderden tot
// duizenden euro's (fixture-empirie), dus sub-cent-float-ruis kan alleen in het
// theoretische geval dat een maand-gap binnen ~½ cent van 0 landt een andere
// maand kiezen dan Excel. Een EPS-band zou de Excel-semantiek zélf veranderen;
// dit staartrisico is aanvaard en hier gedocumenteerd. Zelfde geldt voor
// wrappers/band.ts (identieke bisectie).

/**
 * P!B93/B100 — de vier solver-statussen (exacte Excel-teksten) plus
 * `stop_now_shortfall` (ADR 0127, buiten oracle-domein): bij eindstrategie 'Nu
 * stoppen' springt de tekort-lening aan vóór de eigen eindleeftijd. BEWUST geen
 * hergebruik van `pension_shortfall` — dat draagt AOW-kopij, terwijl dit tekort
 * ook vóór de AOW kan vallen.
 */
export type SolverStatus =
  | 'reached_now'
  | 'reached_at'
  | 'unreachable_within_horizon'
  | 'pension_shortfall'
  | 'stop_now_shortfall'

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
    // NB — het venster hier is `leeftijd ≤ eindleeftijd` (INCLUSIEF de eindleeftijd),
    // byte-exacte Excel-oracle-port (MAXIFS S!AR "<="&B35) voor pension_shortfall. De
    // app-weergave-detector `detectDeficitLoanFromRows` (lib/horizon/deficit-loan-display.ts)
    // hanteert bewust een ANDER venster — `age ≤ endAge − 1` (staart op de eindleeftijd =
    // modelmarge, besluit 4 juli 2026). Verwacht ze dus niet identiek.
    for (const rij of proj.s) {
      const leeftijd = rij.helperLeeftijd
      if (typeof leeftijd !== 'number' || leeftijd > eindleeftijd) continue
      const saldo = rij.slots[tekortSlot]?.saldo
      if (typeof saldo === 'number' && saldo > tekortLening) tekortLening = saldo
    }
  }
  if (tekortLening <= TEKORT_RUIS_DREMPEL) tekortLening = 0

  // ── P!B93 — status (exacte geneste IF-volgorde, incl. doel=0-quirk) ────────
  // M6-VANGRAIL (gap-besluit V21, buiten oracle-domein). Met
  // `input.reachedNowVereistBereikbaarDoel` mag `reached_now` alleen nog vallen
  // op een doel dat er ook echt is:
  //   a) `doelbedrag < 0` — een negatief doelvermogen is geen FIRE-doel maar het
  //      teken van een structureel tekort; `J(0) ≥ B36` slaagt daar bijna altijd.
  //   b) `gap < 0` — dan is er GEEN toereikende maand gevonden en staat de
  //      FIRE-leeftijd op de horizon-parkeerstand. Bij B36 = 0 (deplete/pensioen/
  //      legacy-0) is `J(0) ≥ 0` triviaal waar en MASKEERT reached_now precies die
  //      parkeerstand — dat is hoe "Vrijheidsleeftijd 100,0" als hard feit op het
  //      scherm kwam (bridge: fireReachable = status !== unreachable).
  // De `gap < 0`-tak bestond al als vierde IF; de vangrail zet hem alleen vóór de
  // reached_now-tak, zodat die hem niet meer kan overrulen. Vlag weggelaten
  // (parity-/fixture-pad) → exact het Excel v5-gedrag, byte-identiek.
  // NB: de scalar-router paste deze correctie al toe in zijn eigen status-mapping
  // ("een reached_now met gap < 0 is de verhulde parkeerstand"); de kernel-tak
  // deed dat niet. Nu delen beide paden dezelfde lezing.
  const schijnbereik =
    input.reachedNowVereistBereikbaarDoel === true && (doelbedrag < 0 || gap < 0)
  const jMaand0 = prognoseJ(proj, 0) ?? 0
  let status: SolverStatus
  if (code === 'pensioen' && tekortLening > 0) {
    status = 'pension_shortfall'
  } else if (code === 'nu' && tekortLening > 0) {
    // ADR 0127 D2 — stop-nu: het geld reikt niet tot de eigen eindleeftijd. Bij doel
    // €0 mét `tekortAflossingUitLiquide` kan `gap < 0` niet zonder tekort-lening > 0,
    // dus de M6-schijnbereik-tak hieronder wordt voor 'nu' nooit bereikt (vastgepind
    // in nu-stoppen.test.ts): de status is óf dit, óf `reached_now`.
    status = 'stop_now_shortfall'
  } else if (schijnbereik) {
    status = 'unreachable_within_horizon'
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

  // F7: bisectie-INTERNE probes mogen de post-loop Ont-herberekening overslaan (hun
  // projectie wordt weggegooid; de gap/status-toetsen lezen alleen prognose/s). De
  // horizon-check-run + de finale run laten 'm STAAN (die projectie kan geretourneerd
  // worden) → default `skipOntPostRecompute = false`.
  const run = (fireAge: number, skipOntPostRecompute = false): KernelProjection => {
    engineRuns += 1
    return runKernelProjection(input, { fireAge, skipOntPostRecompute })
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

  // ── Nu stoppen (ADR 0127 D1): FIRE = startleeftijd P!B7 (hele jaren, maand 0), ──
  //    geen bisectie — precies het pensioen-patroon, maar op vandaag. NOOIT de
  //    fractionele leeftijd: 47,6 zou FIRE-maand 7 geven en is dan niet "nu". Zo erft
  //    élke solveFire-consument (convergentie-, household-, whatif-, scalar-router,
  //    Monte-Carlo, marktcheck, kernel-report, gouden matrix) het anker zonder eigen
  //    tak. Het guardrails-anker regelt de engine zelf op FIRE-maand 0 (T0-stand).
  if (es.interneCode === 'nu') {
    const fireAge = leeftijd
    return afronden(fireAge, run(fireAge))
  }

  // ── Horizon-check: gap < 0 op leeftijd 100 → parkeerstand ───────────────────
  const loStart = 0
  const hiStart = clng((100 - leeftijd) * 12)
  let hi = hiStart
  let lo = loStart

  // Horizon-check-run: NIET skippen (deze projectie wordt geretourneerd bij gap<0).
  // F5: alleen de gap nodig → `computeGap` i.p.v. het volle `computeStatusBlok`
  // (byte-identiek: beide leiden B38 uit computeDoelblok(input, es, proj, fireAge)).
  let proj = run(leeftijd + hi / 12)
  if (computeGap(input, es, proj, leeftijd + hi / 12) < 0) {
    return afronden(leeftijd + hi / 12, proj)
  }

  // ── Maand-bisectie op de gap (VBA: `\` = integer-deling, floor) ─────────────
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    // F7: interne probe — projectie wordt weggegooid, dus sla de Ont-post-recompute
    // over. F5: alleen de gap-sign telt → computeGap.
    proj = run(leeftijd + mid / 12, true)
    if (computeGap(input, es, proj, leeftijd + mid / 12) >= 0) {
      hi = mid
    } else {
      lo = mid
    }
  }

  const fireAge = leeftijd + hi / 12
  return afronden(fireAge, run(fireAge))
}

/**
 * Evalueer het volledige FIRE-statusblok bij een GEFORCEERDE FIRE-leeftijd — één
 * `runKernelProjection`, GÉÉN bisectie. Voor de secundaire wat-als-lijnen die een
 * vast FIRE-moment forceren i.p.v. te solven (bv. de AOW-stop-sim op /toekomst:
 * FIRE = AOW-leeftijd met een deplete-eindstrategie; de "stop nu"-runway met
 * `fireAge = input.startLeeftijd`, ADR 0126). Hergebruikt hetzelfde (module-private)
 * `computeStatusBlok` als `solveFire`, dus het statusblok is identiek aan de stand
 * die de solver op diezelfde leeftijd zou opleveren — alleen de bisectie-stappen
 * vervallen (`engineRuns` = 1). Bij FIRE-maand 0 regelt de ENGINE het guardrails-
 * anker zelf (zie `runKernelProjection`); deze functie heeft daar geen knop voor.
 */
export function evaluateFireAt(input: KernelInput, fireAge: number): SolveFireResult {
  const proj = runKernelProjection(input, { fireAge })
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
    engineRuns: 1,
    projection: proj,
  }
}
