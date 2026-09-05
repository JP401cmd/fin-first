/**
 * Horizon-kernel — FIRE-solver: letterlijke port van de VBA-macro `BepaalFIRE`
 * (Module1, zie `docs/horizon-oracle/vba.txt`) + het P-statusblok B35-B38 en
 * B93-B100 (formules in `docs/horizon-oracle/structuur.md`).
 *
 * Algoritme (VBA-getrouw, geen "slimmer" zoeken):
 *  0. `KernelInput.stopAnker` aanwezig (ADR 0129 D3, buiten oracle-domein): het
 *     stopmoment ligt vast — B16 = `resolveVastAnker(...)`, géén bisectie. Geen
 *     fixture draagt dit blok, dus de parity blijft byte-identiek.
 *  1. Eindstrategie "pensioen" (ES!C7) zónder anker-blok: kortsluiting — B16 =
 *     ES!C15 (AOW-/pensioenleeftijd), géén bisectie. Dit is het oracle-pad.
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
import { clng, computeDoelblok, computeGap, eindleeftijdVan, prognoseJ } from './gap'
import { computeEs, type EsRow } from './tables/es'
import type { KernelInput } from './types'

// NB (calc-review): de bisectie- en horizon-toetsen op de gap zijn bewust STRIKT
// (geen ruis-clamp zoals bij B99): de gap verspringt per maand met honderden tot
// duizenden euro's (fixture-empirie), dus sub-cent-float-ruis kan alleen in het
// theoretische geval dat een maand-gap binnen ~½ cent van 0 landt een andere
// maand kiezen dan Excel. Een EPS-band zou de Excel-semantiek zélf veranderen;
// dit staartrisico is aanvaard en hier gedocumenteerd. Zelfde geldt voor
// wrappers/band.ts (identieke bisectie).

/**
 * P!B93/B100 — de vier solver-statussen (exacte Excel-teksten) plus twee
 * anker-statussen buiten het oracle-domein:
 *
 *  - `anchor_shortfall` (ADR 0129 D3) — onder een VAST stopmoment reikt het plan
 *    niet tot zijn eindleeftijd: de tekort-lening springt aan (deplete), het doel op
 *    de eindleeftijd wordt niet gehaald (legacy/perpetual, `gap < 0`) of er is geen
 *    koopkracht om te behouden (perpetual, `doelbedrag < 0`). Onder een vast anker
 *    valt NOOIT `unreachable_within_horizon` — dat is bisectie-taal. Generiek over de
 *    drie vaste ankers; BEWUST geen hergebruik van `pension_shortfall`, want dat draagt
 *    AOW-kopij terwijl dit tekort ook vóór óf ná de AOW kan vallen.
 *  - `stop_now_shortfall` (ADR 0127) — dezelfde uitkomst onder het `nu`-anker.
 *    Blijft in F2 bestaan omdat de /toekomst-statusblokken deze naam nog lezen
 *    (F3b generaliseert ze naar `anchor_shortfall`, F4 verwijdert dit lid); hij
 *    wordt niet meer gezet voor de NIEUWE ankers (`aow`/`leeftijd`).
 */
export type SolverStatus =
  | 'reached_now'
  | 'reached_at'
  | 'unreachable_within_horizon'
  | 'pension_shortfall'
  | 'stop_now_shortfall'
  | 'anchor_shortfall'

/**
 * **De enige plek die een vast stopmoment naar een leeftijd omzet** (ADR 0129 D3).
 *
 * Vervangt de twee kortsluitingen die hier stonden ('Pensioenleeftijd' → AOW,
 * 'Nu stoppen' → startleeftijd): allebei hetzelfde patroon, allebei apart
 * geschreven, allebei met hun eigen status/eindleeftijd/MC-tak eromheen.
 *
 *  - `aow`      → `persoon.aowLeeftijd` (ES!C15). BEWUST ONgeklemd: precies zoals de
 *                 oude pensioen-kortsluiting. Ligt de AOW-leeftijd vóór de huidige
 *                 leeftijd (iemand die al mét pensioen is), dan geeft dat een
 *                 NEGATIEVE FIRE-maand — de engine draait die run als "vanaf maand 0
 *                 volledig in onttrekking" en `nettoLiquideBijFire` valt op `null`
 *                 (bridge-terugval op de eind-horizonstand). Vastgepind in
 *                 `anker.test.ts` ("negatieve FIRE-maand").
 *  - `nu`       → `startLeeftijd` (P!B7, hele jaren — NOOIT de fractionele leeftijd:
 *                 47,6 zou FIRE-maand 7 geven en is dan niet "nu").
 *  - `leeftijd` → geklemd op `[startLeeftijd, eindleeftijd − 1/12]` (besluit B7: een
 *                 stopleeftijd in het verleden gedraagt zich als "nu"; op of voorbij
 *                 de eindleeftijd bestaat er geen onttrekkingsfase meer om te toetsen,
 *                 dus de kernel schuift 'm één maand naar binnen — de app weigert die
 *                 invoer al aan de rand met een 400).
 *
 * `null` = geen vast anker ⇒ de aanroeper volgt het oude pad (oracle-kortsluiting bij
 * `interneCode === 'pensioen'`, anders bisectie).
 */
export function resolveVastAnker(input: KernelInput, es: EsRow): number | null {
  const anker = input.stopAnker
  if (anker === undefined) return null
  if (anker.soort === 'aow') return es.pensioenleeftijd
  if (anker.soort === 'nu') return input.startLeeftijd
  const ondergrens = input.startLeeftijd
  const bovengrens = eindleeftijdVan(es) - 1 / 12
  if (!Number.isFinite(anker.leeftijd)) return ondergrens
  return Math.min(Math.max(anker.leeftijd, ondergrens), Math.max(ondergrens, bovengrens))
}

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
  /**
   * Het VASTE stopmoment van déze run (leeftijd, fractioneel), of `null` wanneer de
   * bisectie het stopmoment zocht — incl. de horizon-parkeerstand, want dat is geen
   * gekozen moment. Gezet door de anker-kortsluiting (`resolveVastAnker`), de
   * oracle-pensioen-kortsluiting (FIRE = AOW) én `evaluateFireAt` (geforceerd = vast).
   *
   * Voedt `ankerMaand` in de bridge (ADR 0129 D5, contract-ronde K3): de dekking
   * meet vanaf het stopmoment van de RUN. Voor de plan-run is dat het plan-anker; voor
   * een geforceerde run (de stop-nu-runway op /overzicht, de scenariokaarten) de
   * geforceerde maand — níet het plan-anker, anders geeft een runway van 20 jaar bij
   * een aow-gebruiker van 47 0% dekking ("uitputting vóór het stopmoment").
   * Buiten oracle-domein (het Excel kent geen geforceerde runs); additief veld.
   */
  readonly vastStopLeeftijd: number | null
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
  // ADR 0129 D3 (contract-ronde K1) — VAST ANKER: elke "nee" is een TEKORT, nooit
  // `unreachable_within_horizon`. Die status is bisectie-taal ("geen maand gevonden
  // waarop het doel haalbaar is") en heeft geen betekenis voor een plan waarvan het
  // stopmoment vastligt: daar is de vraag niet wánneer, maar óf het geld tot de
  // eindleeftijd reikt. Drie tekort-signalen, elk voor een andere eind-vorm:
  //  - `tekortLening > 0`  — deplete: het liquide vermogen is vóór de eindleeftijd op
  //                          (bij doel €0 mét `tekortAflossingUitLiquide` impliceert
  //                          `gap < 0` altijd dit signaal, dus deplete is ongewijzigd);
  //  - `gap < 0`           — legacy/perpetual: het doel op de eindleeftijd wordt niet
  //                          gehaald terwijl J wél ≥ 0 kan blijven (géén tekort-lening,
  //                          wel een tekort op het nalatenschaps-/koopkrachtdoel);
  //  - `doelbedrag < 0`    — perpetual met J@stop < 0: er is geen koopkracht om te
  //                          behouden, dus ook een `gap ≥ 0` is hier geen dekking.
  // Gemeten vóór deze regel: `aow × legacy` (€50M) en `age 58 × perpetual` (×0,05)
  // vielen via de schijnbereik-tak op `unreachable` → bridge `fireReachable = false`
  // → hero zonder stopleeftijd, "FIRE niet haalbaar"-kopij en lege scenariokaarten.
  const vastAnkerTekort = tekortLening > 0 || gap < 0 || doelbedrag < 0
  let status: SolverStatus
  if (code === 'pensioen' && tekortLening > 0) {
    status = 'pension_shortfall'
  } else if (input.stopAnker !== undefined && vastAnkerTekort) {
    // F2-COMPAT-STAART (F4 verwijdert deze regel): het `nu`-anker houdt zijn ADR
    // 0127-naam, omdat de statusblokken op /toekomst nog letterlijk op
    // `stop_now_shortfall` matchen. Zou het nu-anker meteen `anchor_shortfall`
    // gaan heten, dan viel dát blok stil weg zonder dat er iets voor in de plaats komt.
    status = input.stopAnker.soort === 'nu' ? 'stop_now_shortfall' : 'anchor_shortfall'
  } else if (code === 'nu' && tekortLening > 0) {
    // Legacy-staart (ADR 0127): de eindstrategie-selector 'Nu stoppen' zónder
    // `stopAnker`-blok. De app-adapter stuurt die selector sinds F2 niet meer
    // (het anker reist als blok); F4 verwijdert de selector én deze tak.
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
    vastStopLeeftijd: number | null,
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
      vastStopLeeftijd,
      projection: proj,
    }
  }

  // ── VAST STOPMOMENT: FIRE = het anker, geen bisectie (ADR 0129 D3) ──────────
  //    Eén resolutie voor alle drie de vaste ankers (AOW · nu · zelfgekozen
  //    leeftijd), i.p.v. een kortsluiting per anker. Zo erft élke solveFire-consument
  //    (convergentie-, household-, whatif-, scalar-router, Monte-Carlo, marktcheck,
  //    kernel-report, gouden matrix) het anker zonder eigen tak. Bij FIRE-maand 0
  //    regelt de engine het guardrails-anker zelf (T0-stand).
  const vastAnker = resolveVastAnker(input, es)
  if (vastAnker !== null) {
    return afronden(vastAnker, run(vastAnker), vastAnker)
  }

  // ── Pensioenleeftijd zónder anker-blok: het ORACLE-pad, ongewijzigd ─────────
  //    De Excel-macro kortsluit B16 op ES!C15. Dit pad draagt de 736 fixtures; de
  //    app stuurt sinds F2 `stopAnker: {soort:'aow'}` en komt hier niet meer langs.
  //    Het stopmoment ligt hier óók vast (FIRE = AOW) → `vastStopLeeftijd` gezet;
  //    dat veld zit niet in de parity-vergelijking (statusblok/tabellen ongewijzigd).
  if (es.interneCode === 'pensioen') {
    const fireAge = es.pensioenleeftijd
    return afronden(fireAge, run(fireAge), fireAge)
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
    // Parkeerstand: geen gekozen stopmoment → `vastStopLeeftijd` null.
    return afronden(leeftijd + hi / 12, proj, null)
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
  return afronden(fireAge, run(fireAge), null)
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
    // Geforceerd = vast: de dekking van deze run meet vanaf `fireAge` (K3).
    vastStopLeeftijd: fireAge,
    projection: proj,
  }
}
