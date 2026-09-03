/**
 * Horizon-strategie-regressiematrix — op de **horizon-kernel** (FASE 6, stap 5A — kernel-only).
 *
 * Draait de horizon-FIRE-projectie over álle strategie-combinaties op de complete
 * persona en valideert per combinatie de **vrijheidsleeftijd (FIRE)** en het
 * **doelbedrag** tegen een golden mét marges, plus structurele en relationele
 * invarianten.
 *
 * ## Eén motor: de horizon-kernel
 * Sinds de v2-grootboek-engine (`lib/horizon-engine`) fysiek is verwijderd is de
 * horizon-kernel (`lib/horizon-kernel`) de enige rekenmotor. De vroegere tweede arm
 * ("v2-vergelijk / drift-bewaking", `runSelectedProjection` + `EXPECTED_V2`) is met de
 * engine mee verdwenen; er is geen `builtInput`/`v2FlagArg`/`kernelEnabled`-schakelaar
 * meer en geen `isV2Expressible`-splitsing. De kernel-goldens (`EXPECTED`) blijven de
 * assertie-basis.
 *
 * ### Historie — waarom er ooit twee armen waren
 * In de flag-periode (FASE 6 stap 2) draaide de matrix nog een v2-vergelijkarm tegen de
 * oude productie-goldens om drift in de nog-live v2-tak zichtbaar te houden. Die arm is
 * met de v2-deletie (stap 5) vervallen; de v2-goldens en `runComboV2` bestaan niet meer.
 *
 * ## Vier groepen (16 combinaties), telkens op de standaard-baseline
 *   A — Huisvesting varieert   (× opmaken × vast)
 *   B — Eindstrategie varieert  (× woning meetellen × vast)
 *   C — Onttrekkingsprofiel     (vast / afnemend / oplopend / guardrails)
 *   D — Werk-strategie varieert (inkomenslijn-life-event op de baseline)
 *
 * ## Groep C — de onttrekkingsPROFIELEN (F4)
 * De oude v2-onttrekkings-enum kende vier keuzes (static/guardrails/vpw/bucket); de kernel
 * kent alleen nog de vier onttrekkingsPROFIELEN (`withdrawal_profile_config.profiel`, zie
 * `withdrawal-strategy.ts`): **vast / afnemend / oplopend / guardrails**. `afnemend`/
 * `oplopend` discrimineren alleen mét een expliciete fase-curve (`withdrawalCurve`) — de
 * kernel (`tables/ont.ts` `actieveFactor`) past voor beide profielen dezelfde fase-factor F
 * toe; de RICHTING (dalend vs. stijgend) zit uitsluitend in de curve-getallen.
 *
 * ## Kernel-context-assemblage
 * Per combinatie wordt een `ConvergentieRawContext` gebouwd uit de persona-fixture
 * (`buildCompleetKernelProfileBase` + `fx.assets/debts/lifeEvents`) met de combo-config
 * uitgedrukt als profielrij-kolommen — exact zoals `/toekomst` de kernel voedt.
 *
 * Consumenten: de vitest (`matrix.test.ts`, CI-regressie) én de beheerpagina
 * (`/beheer/horizon-strategie`, on-demand). Puur/synchroon: geen Supabase, geen netwerk.
 */

import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  DEFAULT_HOUSING_STRATEGY,
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import {
  WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig,
  type WithdrawalProfiel,
} from '@/lib/withdrawal-strategy'
import type { LifeEvent, WerkMetadata } from '@/lib/horizon-data'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { buildCompleetHorizonFixture, buildCompleetKernelProfileBase } from './persona-fixture'

// ── Marges ───────────────────────────────────────────────────
export const FIRE_AGE_MARGIN_YEARS = 0.5
export const DOELBEDRAG_REL_MARGIN = 0.02 // ±2%
export const LEGACY_TARGET_REL_MARGIN = 0.02
export const TARGET_DEPLETE_REL_MARGIN = 0.05
export const SWR_MIN = 0.005
export const SWR_MAX = 0.06

// ── Standaard-baseline ───────────────────────────────────────
const STD_HOUSING: HousingStrategyConfig = DEFAULT_HOUSING_STRATEGY // include_full
const STD_END: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
/**
 * Perpetual-baseline voor de groepen C (onttrekkingsprofiel) en D (werk-strategie).
 * Bewust NIET deplete: de kernel-deplete-FIRE is voor deze (vermogende) persona "reached
 * now" (B93-doel=0-quirk, `solver.ts`/`bridge.ts`), waardoor de onttrekkings- en werk-
 * varianten degeneratief samenvallen (8× dezelfde waarde). Op de perpetual-baseline valt
 * FIRE op een echte toekomst-datum (~45,8 jr) en werken de profiel-/werk-verschillen wél
 * door in de uitkomst. Groepen A en B blijven op deplete.
 */
const PERP_END: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
const STD_WITHDRAWAL: WithdrawalStrategyConfig = { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }
const LEGACY_AMOUNT = 100_000

// ── Combinatie-definities ────────────────────────────────────
export type GroupKey = 'housing' | 'end' | 'withdrawal' | 'werk'

/**
 * Werk-strategie-trajectorie voor een combinatie (de vorm; het netto inkomen en
 * de huidige leeftijd worden in `runComboKernel` uit de fixture gebonden). `null` =
 * geen werk-event (baseline-referentie).
 */
export type ComboWerk = Pick<
  WerkMetadata,
  'reeleGroeiPct' | 'groeiTotLeeftijd' | 'plafondNettoMaand' | 'faseStappen' | 'sprongen'
> | null

export interface ComboConfig {
  housing: HousingStrategyConfig
  end: FireStrategyConfig
  /** Onttrekkingsstrategie (static/guardrails) — voedt `withdrawal_strategy` in het profiel. */
  withdrawal: WithdrawalStrategyConfig
  /**
   * Kernel-onttrekkingsPROFIEL (groep C). Afwezig → de kernel valt via de enum-mapping
   * (`WITHDRAWAL_TO_PROFIEL`, static→'Vast') terug op 'vast'. Bij groep C expliciet gezet
   * zodat afnemend/oplopend (kernel-only) bereikbaar zijn.
   */
  withdrawalProfiel?: WithdrawalProfiel
  /**
   * Extra fase-curve-velden voor `withdrawal_profile_config` (naast `profiel`). NODIG voor
   * echte discriminatie tussen 'afnemend' en 'oplopend': de kernel (`tables/ont.ts`
   * `actieveFactor`) past voor BEIDE profielen dezelfde fase-factor F toe — de RICHTING
   * (dalend vs. stijgend) zit uitsluitend in de curve-getallen (gogo/slowgo/nogo-pct),
   * niet in de selector. Zonder curve vallen beide terug op dezelfde Excel-default
   * (100/85/70 = dalend) → identieke uitkomst. Sleutels = de JSONB-vorm die
   * `parseWithdrawalProfileConfig` leest (`gogo_pct`/`slowgo_pct`/`nogo_pct`/…).
   */
  withdrawalCurve?: Record<string, number>
  /** Werk-strategie-life-event dat bovenop de baseline wordt geïnjecteerd. */
  werk?: ComboWerk
  /**
   * Het STOP-ANKER van het plan (ADR 0129 D1) — de tweede as naast `end` (de
   * eind-vorm). Afwezig ⇒ kolom `fire_stop_anchor` blijft leeg ⇒ `solved` (of, voor
   * een legacy-rij, het anker dat nog in `fire_end_strategy` zit — de tegenspraak-
   * regel D2). Voedt de profielkolommen `fire_stop_anchor`/`fire_stop_age`.
   */
  stopAnchor?: { kind: 'aow' | 'now' } | { kind: 'age'; age: number }
}

export interface ComboDef {
  id: string
  label: string
  group: GroupKey
  config: ComboConfig
}

export const GROUP_LABELS: Record<GroupKey, string> = {
  housing: 'A — Huisvestingsstrategie (× opmaken × vast)',
  end: 'B — Eindstrategie (× woning meetellen × vast)',
  withdrawal: 'C — Onttrekkingsprofiel op eeuwigdurende baseline (vast / afnemend / oplopend / guardrails)',
  werk: 'D — Werk-strategie op eeuwigdurende baseline (× woning meetellen × vast)',
}

export const COMBOS: ComboDef[] = [
  // ── Groep A — huisvesting varieert ──
  { id: 'A-include_full', label: 'Woning volledig meetellen', group: 'housing', config: { housing: { mode: 'include_full' }, end: STD_END, withdrawal: STD_WITHDRAWAL } },
  { id: 'A-exclude', label: 'Woning uitsluiten van FIRE-pot', group: 'housing', config: { housing: { mode: 'exclude_from_fire' }, end: STD_END, withdrawal: STD_WITHDRAWAL } },
  { id: 'A-downsize', label: 'Woning verkopen op 67 (downsize)', group: 'housing', config: { housing: { ...DEFAULT_DOWNSIZE_CONFIG, trigger: 'fixed_age', triggerAge: 67 }, end: STD_END, withdrawal: STD_WITHDRAWAL } },
  { id: 'A-reverse', label: 'Opeethypotheek vanaf 67', group: 'housing', config: { housing: { ...DEFAULT_REVERSE_MORTGAGE_CONFIG, trigger: 'fixed_age', triggerAge: 67 }, end: STD_END, withdrawal: STD_WITHDRAWAL } },

  // ── Groep B — eindstrategie varieert ──
  { id: 'B-deplete', label: 'Opmaken (deplete)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'deplete', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },
  { id: 'B-legacy', label: `Nalaten €${LEGACY_AMOUNT.toLocaleString('nl-NL')} (legacy)`, group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'legacy', endAge: 90, legacyAmount: LEGACY_AMOUNT }, withdrawal: STD_WITHDRAWAL } },
  { id: 'B-perpetual', label: 'Eeuwigdurend (perpetual)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },
  // ADR 0129 D6/B2 — `endAge: 100` SPIEGELT MIGRATIE M1. Vóór dat besluit las de
  // kernel de eindleeftijd van een pensioen-plan uit het Excel-artefact 100 (de
  // selector 'Pensioenleeftijd' negeerde `fire_end_age`); sinds F2 stuurt de adapter
  // de EIND-VORM als selector plus een los stop-anker, dus de eindleeftijd komt uit
  // de kolom. M1 zet die kolom op 100 voor precies deze rijen, en deze combinatie
  // doet hetzelfde — zo blijven de rijen én `displayEndAge` van `B-pensioen`
  // byte-identiek aan vóór ADR 0129, en toetst de rij nog steeds wat ze toetste.
  { id: 'B-pensioen', label: 'Pensioen (opbouw tot AOW)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'pensioen', endAge: 100, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },
  // ADR 0127: FIRE op de startleeftijd (maand 0), doel €0 op de eigen eindleeftijd.
  { id: 'B-nu-stoppen', label: 'Nu stoppen (FIRE = vandaag)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'nu-stoppen', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },

  // ── ADR 0129 — de twee assen los: stop-anker × eind-vorm ──
  // Drie combinaties die vóór dit besluit ONUITDRUKBAAR waren omdat één enum beide
  // vragen droeg. Ze bewaken dat het anker de STOPLEEFTIJD stuurt en de eind-vorm de
  // EINDLEEFTIJD/het doelbedrag — precies de scheiding die D3 introduceert.
  { id: 'B-aow-legacy', label: `Stop op AOW + nalaten €${LEGACY_AMOUNT.toLocaleString('nl-NL')} op 90`, group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'legacy', endAge: 90, legacyAmount: LEGACY_AMOUNT }, withdrawal: STD_WITHDRAWAL, stopAnchor: { kind: 'aow' } } },
  { id: 'B-age-deplete', label: 'Stop op 58 + vermogen opeten tot 90', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'deplete', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL, stopAnchor: { kind: 'age', age: 58 } } },
  { id: 'B-age-perpetual', label: 'Stop op 58 + eeuwigdurend', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL, stopAnchor: { kind: 'age', age: 58 } } },

  // ── Groep C — onttrekkingsprofiel varieert (F4: profielen, niet de oude v2-enum) ──
  //    Op de PERPETUAL-baseline (PERP_END), niet deplete — zie PERP_END-doc.
  { id: 'C-vast', label: 'Vast onttrekkingsprofiel', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }, withdrawalProfiel: 'vast' } },
  // Afnemend = dalende curve (go-go 100% → no-go 70%, = Excel-default, expliciet gezet).
  { id: 'C-afnemend', label: 'Afnemend (go-go → no-go)', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }, withdrawalProfiel: 'afnemend', withdrawalCurve: { gogo_pct: 100, slowgo_pct: 85, nogo_pct: 70 } } },
  // Oplopend = stijgende curve (spiegel: go-go 70% → no-go 100%), zodat 'oplopend' echt
  // stijgt i.p.v. de dalende default te erven (anders identiek aan afnemend — zie ont.ts).
  { id: 'C-oplopend', label: 'Oplopend (uitgaven stijgen)', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }, withdrawalProfiel: 'oplopend', withdrawalCurve: { gogo_pct: 70, slowgo_pct: 85, nogo_pct: 100 } } },
  { id: 'C-guardrails', label: 'Guardrails (Guyton-Klinger)', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' }, withdrawalProfiel: 'guardrails' } },

  // ── Groep D — werk-strategie varieert (inkomenslijn-life-event op de baseline) ──
  //    Op de PERPETUAL-baseline (PERP_END), niet deplete — zie PERP_END-doc.
  { id: 'D-geen', label: 'Geen werk-strategie (referentie)', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: null } },
  { id: 'D-groei', label: 'Salarisgroei 4%/jr reëel', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0.04, faseStappen: [], sprongen: [] } } },
  { id: 'D-deeltijd', label: 'Minder werken: 60% vanaf 44', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0, faseStappen: [{ fromAge: 44, pct: 60 }], sprongen: [] } } },
  { id: 'D-combi', label: 'Groei 3% + plafond + grote promotie', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0.03, plafondNettoMaand: 12000, faseStappen: [], sprongen: [{ atAge: 43, deltaNettoMaand: 2500 }] } } },
]

// ── Verwachtingen (golden) ───────────────────────────────────
export interface ComboExpectation {
  /** Verwachte vrijheidsleeftijd (fractioneel); null = onbereikbaar verwacht. */
  fireAgeFractional: number | null
  /** Verwacht doelbedrag (requiredFirePortfolio) in euro's. */
  doelbedrag: number
}

/**
 * **Kernel-goldens.** Gegenereerd uit de horizon-kernel op de complete persona.
 * Regenereer bewust na een gewenste rekenmotor-wijziging.
 *
 * ## Kern-eigenschappen die de waarden verklaren (ADR 0032)
 *  (a) **Nominaal/maandbasis met één-maand-lag.**
 *  (b) **`requiredFirePortfolio` = Prognose!J@FIRE** (nominaal benodigd liquide op de
 *      FIRE-maand).
 *  (c) **Liquide-grondslag (dominant op deze persona).** De kernel telt ÁLLE categorieën
 *      behalve 'Eigen huis' als FIRE-eligible liquide (Prognose!J = I − (L − M);
 *      `adapter/prio-overgang.ts` vlagt aan de BEZIT-kant enkel 'Eigen huis' (→ L) en aan
 *      de SCHULD-kant enkel 'Woning' (→ M), en beide alléén bij woning-uitsluiten —
 *      `nietLiquide = !woningMeerekenen`, regels 182 resp. 197). Die schuld-kant is niet
 *      cosmetisch: hij bepaalt WELKE hypotheken weer bij het besteedbare vermogen worden
 *      opgeteld, en was precies de bron van de beleggingshypotheek-fix hieronder.
 *      Het verhuurde appartement (Vastgoed), het BV-belang (Overig), pensioen,
 *      kapitaalverzekering en vordering tellen dus VOL mee in de FIRE-pot. Combineer dat met
 *      de rijke persona (~€1,18 mln netto vermogen, €48k pensioenuitgaven → ~4% aanvangs-
 *      onttrekking) én 7% nominaal rendement, dan is de opmaak-strategie (deplete) op de
 *      startleeftijd al haalbaar. **Gevolg:** de deplete-FIRE valt ≈ nú (42 jr + 1 mnd; de
 *      B93-doel=0-quirk maakt deplete triviaal "reached_now" — zie
 *      `bridge.ts#isKernelReachedNowDisplay`). Geen mapping-fout; de kernel-liquide-
 *      categorisatie op een vermogende persona.
 *  (d) **AOW/pensioen endogeen**: de kernel rekent de AOW-hoogte zelf en annuïtiseert het
 *      pensioen-event. De AOW-BASIS komt sinds ADR 0064 (gap V20) als invoer binnen —
 *      op dit app-pad de canonieke SVB-constante `NL_AOW_MONTHLY_SAMENWONEND`, niet meer
 *      de Excel-oracle-basis €993/mnd; start = canonieke AOW-leeftijd 67. Dat verlaagde de
 *      goldens (herijkt 2026-07-29): doelbedrag −2 à −3%, vrijheidsleeftijd 0,1–0,4 jr
 *      eerder — meer AOW-inkomen ⇒ minder benodigde portefeuille.
 *  (e) **Spaargrondslag** = netto jaarinkomen − geschatte jaaruitgaven ((7600−4100)×12 =
 *      42.000).
 *
 * ## Opeethypotheek-fix (A-reverse) — waarom de goldens NIET bewogen
 * Bij de fix "de adapter boekt de opeethypotheek-schuld op slot 3" (voorheen kwam de
 * maandopname wél als kasstroom binnen maar ontstond er nooit een schuld) was de
 * verwachting dat `A-reverse` zou verschuiven: de schuld drukt het vermogen, dus FIRE
 * later en/of doelbedrag hoger. Empirisch bewogen beide goldens **niet één cent**, en dat
 * is correct: op deze deplete-baseline valt FIRE op 42,08 jr (B93-doel=0-quirk, oorzaak c)
 * terwijl de opeet-opname pas op leeftijd 67 begint. Beide golden-metrieken worden op de
 * FIRE-MAAND gemeten (vrijheidsleeftijd; doelbedrag = Prognose!J@FIRE) en zijn dus
 * structureel blind voor alles ~25 jaar later. De fix bijt wél hard ná FIRE — op de
 * persona groeit de opeetschuld van €23k (67 jr) naar €1,12 mln (90 jr) en loopt het
 * netto vermogen op 90 jr €363k lager dan vóór de fix (€1,57 mln vs. €1,93 mln bij
 * 'woning meetellen', waar de reeksen vóór de fix samenvielen).
 * **Gevolg voor deze matrix:** de goldens alléén dekken de opeet-mechaniek niet. Daarom
 * draagt `ComboActual` sinds die fix `opeetSchuldEind` + een invariant per combinatie
 * ("Opeethypotheek boekt een schuld" resp. "geen opeetschuld buiten de opeet-strategie").
 * Beweegt er ooit tóch een golden bij een reverse-combinatie, dan is dat een echte
 * FIRE-moment-verschuiving — herijk 'm dan bewust. **Tenzij de J-GRONDSLAG zelf
 * wijzigt**: dan verschuift het doelbedrag zonder dat het FIRE-moment beweegt (het
 * doelbedrag ís Prognose!J@FIRE). Precies dat gebeurde bij de beleggingshypotheek-fix
 * — zie de sectie hieronder.
 *
 * ## Groep C/D op de PERPETUAL-baseline (scope-besluit)
 * Op de deplete-baseline vallen groep C (onttrekkingsprofiel) en D (werk-strategie)
 * degeneratief samen (8× 42,083 / €1.102.575): de kernel-deplete-FIRE is voor deze
 * vermogende persona "reached now" (B93-doel=0-quirk, oorzaak c). Daarom draaien C en D op
 * de **perpetual-baseline** (`PERP_END`), waar FIRE een echte toekomst-datum (~45,8 jr) is:
 *   - Groep C discrimineert: oplopend 42,08 < afnemend 43,17 < vast 45,58 < guardrails 47,50.
 *   - Groep D discrimineert: combi 44,92 < groei 45,42 < geen 45,58 < deeltijd 46,42.
 *
 * ## Beleggingshypotheek-fix (groep A, herijkt 2026-08-05) — waarom A-exclude/
 * A-downsize/A-reverse WÉL bewogen
 * `adapter/potten.ts` mapte élke `mortgage` op schuldcategorie 'Woning', óók de
 * **beleggingshypotheek van €110.000 op het verhuurde appartement** die deze persona
 * draagt (`lib/test-personas.ts`, aflossingsvrij, 3,6%). Bij een niet-meetellen-
 * woonstrategie vlagt `adapter/prio-overgang.ts` categorie 'Woning' als niet-liquide,
 * waardoor `Prognose!J = I − (L − M)` die €110k weer BIJTELDE bij het besteedbare
 * vermogen — terwijl het appartement zelf (categorie 'Vastgoed') gewoon liquide in J
 * bleef staan. De besteedbare pot werd zo €110k overschat. `isNietEigenWoningHypotheek`
 * haalt een hypotheek die expliciet aan een bekend, actief, niet-`eigen_huis`-bezit
 * gekoppeld is uit 'Woning' (ongelinkt blijft bewust 'Woning' — zie die helper).
 *
 * **Richting van de verschuiving (allemaal verklaard, geen drift):**
 *   - `A-reverse`: doelbedrag −€110.000 exact (950.670 → 840.670), FIRE
 *     ONgewijzigd op 42,083. De opeet-baseline is "reached now" (B93-doel=0-quirk,
 *     oorzaak c), dus J wordt op de eerste maand gemeten — vóór enige amortisatie —
 *     en de correctie is exact het startsaldo van de beleggingshypotheek.
 *   - `A-exclude`: FIRE 42,833 → 43,083 (+3 mnd), doelbedrag 1.020.880 → 934.697
 *     (−€86.183, −8,4%).
 *   - `A-downsize`: FIRE 42,417 → 42,667 (+3 mnd), doelbedrag 981.649 → 895.119
 *     (−€86.530, −8,8%).
 *     Bij deze twee is J op élke maand €110k lager, dus de bisectie heeft ~3 maanden
 *     langer nodig → **FIRE later**. Het gerapporteerde doelbedrag is `Prognose!J@FIRE`
 *     (dezelfde grondslag), dus dat daalt met €110k MINUS de J-aangroei over die drie
 *     extra maanden (rendement + inleg ≈ €24k) → netto ≈ −€86k. De hypotheek zelf is
 *     aflossingsvrij en amortiseert niet via de geplande aflossing (extra aflossing uit
 *     de surplus-waterval kán nu wél — zie de bijwerking hieronder).
 *   - `A-include_full` en groep B/C/D staan op 'Meerekenen' (niets is niet-liquide,
 *     J ≡ I) resp. gebruiken die baseline → **byte-identiek ongewijzigd**, zoals verwacht.
 *
 * **Gewenste bijwerking (niet onderdrukt):** de pand-hypotheek zit bij niet-meetellen
 * niet langer in de niet-liquide schuldcategorie, dus de schuldCap in de Verdeling-
 * waterval blokkeert extra aflossing er niet meer op.
 *
 * ## Echte-annuiteit-fix (gap V22, herijkt 2026-08-28) — waarom ALLE bewegende goldens daalden
 * De kernel bevroor de aflossingscomponent van vandaag en paste die constant toe over de
 * hele horizon (`tables/s.ts#regularSlot`). Met `KernelInput.echteAnnuiteitAflossing` (app-pad
 * AAN) herrekent `plannedMonthlyAt` de rente/aflossing-split per maand, zodat een annuïteit
 * op de werkelijke einddatum €0 raakt. Op deze persona betreft dat de hypotheek van
 * €300.000 @3,1% met maandlast €1.280: bevroren aflossingsdeel €505 ⇒ ~594 maanden;
 * echte annuïteit ⇒ ~360 maanden.
 *
 * **Geen lek — gemeten, niet aangenomen.** Per schuld-slot is de saldo-reeks met vlag AAN
 * vs. UIT vergeleken over alle 1200 maanden. Alleen de vier `annuiteit`-schulden bewegen
 * (hypotheek max Δ€117.695; autolening €255; persoonlijke lening €321; DUO €30). Elke
 * `lineair`- en `aflossingsvrij`-schuld heeft **max Δ = €0,00 exact** — inclusief de
 * €110.000 beleggingshypotheek die de A-groep-goldens draagt (zie de sectie hierboven) en
 * de tekort-lening. Aflossingsvrij lost dus niet ineens af.
 *
 * **Drie regimes, alle drie consistent met één mechanisme** (`doelbedrag` = Prognose!J@FIRE):
 *   - **FIRE-maand vast op ~m1** (`A-include_full`, `A-reverse`, `B-deplete`, `B-legacy`,
 *     `C-oplopend` — de "reached now"-combinaties): er is nog geen amortisatie geweest, dus
 *     **niets beweegt**. Zelfde blindheid als bij de opeethypotheek-fix hierboven.
 *   - **FIRE-maand vast op de pensioenleeftijd** (`B-pensioen`, solver kortsluit op 67, geen
 *     bisectie): J wordt op een VÁSTE maand gemeten, dus het doelbedrag **stijgt** met exact
 *     de schuldverlaging op die maand: +€78.081 (+1,35%). Dit is de zuiverste meting van het
 *     effect — en de enige combinatie die omhóóg gaat.
 *   - **FIRE-maand vrij** (alle overige): J ligt op élke maand hoger, dus de bisectie vindt
 *     FIRE 2–9 maanden **eerder**; het gerapporteerde doelbedrag is J op die éérdere maand
 *     en daalt daarom (−1,8% t/m −7,3%). Met de FIRE-maand gepind op één waarde zijn bezit,
 *     schuld én netto vermogen met de vlag AAN op elke gemeten maand gelijk of beter
 *     (m=360: netto €6,64 mln → €6,76 mln; schuld €230k → €113k). De richting is dus
 *     eenduidig; alleen de meet-maand verschuift.
 *
 * **Pre-existente kalenderdrift (NIET van deze fix — apart gemeten).** Een schone worktree op
 * HEAD (4bbc65c0c) levert exact dezelfde waarden als deze tree met de vlag geforceerd UIT,
 * en béide wijken al van de vorige goldens af: −0,083 à −0,167 jr en −0,5 à −1,6%. Dat
 * bleef binnen de marges (±0,5 jr / ±2%) en viel dus niet op. Oorzaak: de persona pint de
 * leeftijd (`COMPLEET_PINNED_AGE`) maar de life-events dragen VÁSTE `target_date`-strings
 * (AOW '2050-01-08' e.d.), zodat de afstand tot AOW met elke verstreken kalendermaand krimpt
 * — ~1 maand FIRE-verschuiving per maand reële tijd. Deze herijking zet die klok op nul
 * zonder de oorzaak weg te nemen: zonder fixture-fix loopt hij over ~6 maanden opnieuw tegen
 * de ±0,5 jr-marge. Los van gap V22; hoort op een eigen kaart.
 *
 * **Tolerantie-keuze (bewust, per grootheid).** Vrijheidsleeftijd: **absoluut** ±0,5 jr —
 * een half jaar is de betekenisvolle eenheid voor een pensioendatum, ongeacht of die op 42
 * of op 67 ligt. Doelbedrag: **relatief** ±2% — de bedragen lopen van €0,84 mln tot €5,85
 * mln, waar een vaste euro-marge bovenaan veel te strak en onderaan veel te ruim zou zijn.
 *
 * GENERATED:GOLDEN:START
 */
export const EXPECTED: Record<string, ComboExpectation> = {
  'A-include_full': { fireAgeFractional: 42.083, doelbedrag: 1102623 },
  'A-exclude': { fireAgeFractional: 42.667, doelbedrag: 895562 },
  'A-downsize': { fireAgeFractional: 42.417, doelbedrag: 871910 },
  'A-reverse': { fireAgeFractional: 42.083, doelbedrag: 840718 },
  'B-deplete': { fireAgeFractional: 42.083, doelbedrag: 1102623 },
  'B-legacy': { fireAgeFractional: 42.083, doelbedrag: 1102623 },
  'B-perpetual': { fireAgeFractional: 45.083, doelbedrag: 1469348 },
  'B-pensioen': { fireAgeFractional: 67.0, doelbedrag: 5846016 },
  // 'nu-stoppen' (ADR 0127): fireAge = de hele startleeftijd (42, FIRE-maand 0), en het
  // "doelbedrag" is per constructie J(0) — de liquide stand na maand 0 op de compleet-
  // persona, géén benodigd vermogen (D4; de bridge markeert requiredFireIsStartPortfolio).
  // Gouden rij gegenereerd 2026-09-02 uit de kernel (eerste run: €1.096.980).
  'B-nu-stoppen': { fireAgeFractional: 42.0, doelbedrag: 1096980 },
  // ADR 0129 — de twee assen los (gegenereerd 2026-09-03 uit de kernel).
  //  * `B-aow-legacy`: het ANKER zet de stopleeftijd op de AOW (67) → identiek
  //    fireAge/doelbedrag als `B-pensioen` (beide meten J op maand (67−42)·12), terwijl
  //    de EIND-VORM een nalatenschapsdoel van €258.707 op de 90e oplevert waar
  //    `B-pensioen` €0 heeft. Dat verschil ÍS het besluit: vóór ADR 0129 was deze
  //    combinatie niet uit te drukken.
  //  * `B-age-*`: het anker kort de solver op 58 (geen bisectie), dus beide rijen delen
  //    fireAge 58 en J@58 = €3.529.646; alleen het eind-doel verschilt (deplete €0 vs.
  //    perpetual het geïndexeerde J@58 op leeftijd 100).
  'B-aow-legacy': { fireAgeFractional: 67.0, doelbedrag: 5846016 },
  'B-age-deplete': { fireAgeFractional: 58.0, doelbedrag: 3529646 },
  'B-age-perpetual': { fireAgeFractional: 58.0, doelbedrag: 3529646 },
  // Groep C/D op de PERPETUAL-baseline (PERP_END) — hier discrimineren de profielen/
  // werk-varianten wél (op deplete vielen ze samen op 42,083).
  'C-vast': { fireAgeFractional: 45.083, doelbedrag: 1469348 },
  'C-afnemend': { fireAgeFractional: 42.25, doelbedrag: 1121995 },
  'C-oplopend': { fireAgeFractional: 42.083, doelbedrag: 1103825 },
  'C-guardrails': { fireAgeFractional: 47.083, doelbedrag: 1737147 },
  'D-geen': { fireAgeFractional: 45.083, doelbedrag: 1469348 },
  'D-groei': { fireAgeFractional: 44.917, doelbedrag: 1458972 },
  'D-deeltijd': { fireAgeFractional: 45.583, doelbedrag: 1472661 },
  'D-combi': { fireAgeFractional: 44.5, doelbedrag: 1449707 },
}
// GENERATED:GOLDEN:END

// ── Uitkomsten ───────────────────────────────────────────────
export interface ComboActual {
  fireAgeFractional: number | null
  fireReachable: boolean
  requiredFirePortfolio: number
  firePortfolioAtFire: number
  targetEndPortfolio: number
  implicitWithdrawalRate: number
  strategy: string
  /**
   * Eindsaldo van de opeethypotheek-schuld (`debtBalances['opeethypotheek']`) op de
   * laatste projectierij; 0 buiten de opeet-strategie.
   *
   * WAAROM DIT VELD BESTAAT: de twee golden-metrieken (vrijheidsleeftijd + doelbedrag)
   * worden gemeten op de FIRE-MAAND, en die ligt op deze persona ~25 jaar vóór de
   * opeet-startleeftijd (67). Ze zijn daardoor structureel BLIND voor alles wat de
   * opeethypotheek ná FIRE doet — de bug waarbij de opeetschuld helemaal niet werd
   * geboekt (adapter vulde slot 3 nooit) liet de goldens exact ongemoeid. Dit veld geeft
   * de reverse-combinatie een eigen, discriminerende invariant.
   */
  opeetSchuldEind: number
}

export interface Check {
  name: string
  pass: boolean
  detail: string
}

export interface ComboResult {
  id: string
  label: string
  group: GroupKey
  config: ComboConfig
  /** Golden-verwachting (kernel). */
  expected: ComboExpectation | null
  /** Kernel-uitkomst. */
  actual: ComboActual
  checks: Check[]
  status: 'pass' | 'fail'
}

export interface GroupResult {
  key: GroupKey
  label: string
  combos: ComboResult[]
}

export interface MatrixResult {
  groups: GroupResult[]
  summary: { total: number; passed: number; failed: number }
  currentAge: number
}

/**
 * Bouw het Werk-strategie-life-event voor een combinatie (of geen, bij `null`).
 * Het netto inkomen en de huidige leeftijd worden uit de fixture gebonden zodat
 * de delta's op de juiste schaal staan en deterministisch blijven.
 */
function werkEventFor(werk: ComboWerk, fx: ReturnType<typeof buildCompleetHorizonFixture>): LifeEvent[] {
  if (!werk) return []
  const metadata: WerkMetadata = {
    huidigNettoMaand: fx.financialInput.monthlyIncome,
    reeleGroeiPct: werk.reeleGroeiPct ?? 0,
    groeiTotLeeftijd: werk.groeiTotLeeftijd,
    plafondNettoMaand: werk.plafondNettoMaand,
    faseStappen: werk.faseStappen ?? [],
    sprongen: werk.sprongen ?? [],
    source: 'werk-strategy',
    schemaVersie: 1,
  }
  return [
    {
      id: 'werk-regression',
      name: 'Werk & inkomen',
      event_type: 'werk',
      target_age: fx.currentAge,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'Briefcase',
      is_active: true,
      sort_order: 0,
      is_indexed: true,
      metadata: metadata as unknown as Record<string, unknown>,
    },
  ]
}

/** Vertaal een `UnifiedProjectionResult`-achtige naar het `ComboActual`-contract. */
function toActual(r: {
  rows: readonly UnifiedProjectionRow[]
  fireAgeFractional: number | null
  fireReachable: boolean
  requiredFirePortfolio: number
  firePortfolioAtFire: number
  targetEndPortfolio: number
  implicitWithdrawalRate: number
  strategy: string
}): ComboActual {
  // Consume-only: de bridge levert de opeetschuld als eigen `debtBalances`-sleutel
  // (synthetische pot, géén app-`Debt`-id) — hier alleen uitlezen, niet herleiden.
  const laatste = r.rows[r.rows.length - 1]
  return {
    fireAgeFractional: r.fireAgeFractional,
    fireReachable: r.fireReachable,
    requiredFirePortfolio: r.requiredFirePortfolio,
    firePortfolioAtFire: r.firePortfolioAtFire,
    targetEndPortfolio: r.targetEndPortfolio,
    implicitWithdrawalRate: r.implicitWithdrawalRate,
    strategy: r.strategy,
    opeetSchuldEind: laatste?.debtBalances['opeethypotheek']?.endBalance ?? 0,
  }
}

// ── Run één combinatie via de horizon-kernel ─────────────────
export function runComboKernel(combo: ComboDef, pinnedAge?: number): ComboActual {
  const fx = buildCompleetHorizonFixture(pinnedAge)

  // Combo-config → profielrij-kolommen (spiegelt de /toekomst-context-assemblage).
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(fx.currentAge),
    fire_end_strategy: combo.config.end.strategy,
    fire_end_age: combo.config.end.endAge,
    fire_legacy_amount: combo.config.end.legacyAmount,
    // ADR 0129 D1 — de tweede as. Afwezig ⇒ kolom leeg ⇒ `solved` (of het legacy-anker
    // uit `fire_end_strategy`, tegenspraak-regel D2).
    fire_stop_anchor: combo.config.stopAnchor?.kind ?? null,
    fire_stop_age:
      combo.config.stopAnchor?.kind === 'age' ? combo.config.stopAnchor.age : null,
    withdrawal_strategy: combo.config.withdrawal.strategy,
    housing_strategy_config: combo.config.housing,
    withdrawal_profile_config: combo.config.withdrawalProfiel
      ? { profiel: combo.config.withdrawalProfiel, ...combo.config.withdrawalCurve }
      : undefined,
  }

  const rawContext: ConvergentieRawContext = {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: [...fx.lifeEvents, ...werkEventFor(combo.config.werk ?? null, fx)],
    aowRows: [], // afwezig → adapter-default (deterministische AOW-leeftijd 67)
    // Reële jaaruitgaven (koopkracht-nu) voor de bridge-`implicitWithdrawalRate`. De
    // FIRE-behoefte zelf leidt de kernel af uit `yearly_essential_expenses` op het profiel.
    yearlyExpenses: fx.financialInput.yearlyMustExpenses,
  }

  const outcome = computeConvergentieProjection({ rawContext })
  if (!outcome.ok) {
    throw new Error(`computeConvergentieProjection faalde voor combinatie ${combo.id}: ${outcome.reason}`)
  }
  return toActual(outcome.result)
}

// ── Checks ───────────────────────────────────────────────────
function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString('nl-NL')}`
}
function relDiff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1
  return Math.abs(actual - expected) / Math.abs(expected)
}

/** Golden-toets (vrijheidsleeftijd ±0,5 jr + doelbedrag ±2%). */
function goldenChecks(actual: ComboActual, expected: ComboExpectation | null): Check[] {
  const checks: Check[] = []

  if (!expected) {
    checks.push({ name: 'golden vrijheidsleeftijd', pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    checks.push({ name: 'golden doelbedrag', pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    return checks
  }

  const ea = expected.fireAgeFractional
  const aa = actual.fireAgeFractional
  if (ea === null || aa === null) {
    const pass = ea === aa
    checks.push({
      name: 'golden vrijheidsleeftijd',
      pass,
      detail: pass ? `beide ${aa === null ? 'onbereikbaar' : aa}` : `verwacht ${ea ?? 'onbereikbaar'}, werkelijk ${aa ?? 'onbereikbaar'}`,
    })
  } else {
    const delta = Math.abs(aa - ea)
    const pass = delta <= FIRE_AGE_MARGIN_YEARS
    checks.push({
      name: 'golden vrijheidsleeftijd',
      pass,
      detail: `verwacht ${ea.toFixed(2)}, werkelijk ${aa.toFixed(2)} (Δ ${delta.toFixed(2)} ≤ ${FIRE_AGE_MARGIN_YEARS})`,
    })
  }

  const rd = relDiff(actual.requiredFirePortfolio, expected.doelbedrag)
  const passDoel = rd <= DOELBEDRAG_REL_MARGIN
  checks.push({
    name: 'golden doelbedrag',
    pass: passDoel,
    detail: `verwacht ${fmtEur(expected.doelbedrag)}, werkelijk ${fmtEur(actual.requiredFirePortfolio)} (Δ ${(rd * 100).toFixed(2)}% ≤ ${(DOELBEDRAG_REL_MARGIN * 100).toFixed(0)}%)`,
  })

  return checks
}

function invariantChecks(combo: ComboDef, actual: ComboActual, currentAge: number): Check[] {
  const checks: Check[] = []
  const endAge = combo.config.end.endAge
  const strat = combo.config.end.strategy

  // FIRE bereikbaar (persona is op bereikbaarheid ontworpen)
  checks.push({
    name: 'FIRE bereikbaar',
    pass: actual.fireReachable === true && actual.fireAgeFractional !== null,
    detail: actual.fireReachable ? `vrijheidsleeftijd ${actual.fireAgeFractional?.toFixed(2)}` : 'niet bereikbaar binnen horizon',
  })

  // fireReachable consistent met fireAge
  checks.push({
    name: 'fireReachable ↔ fireAge consistent',
    pass: actual.fireReachable === (actual.fireAgeFractional !== null),
    detail: `reachable=${actual.fireReachable}, fireAge=${actual.fireAgeFractional ?? 'null'}`,
  })

  // FIRE-leeftijd binnen [currentAge, endAge]
  if (actual.fireAgeFractional !== null) {
    const inRange = actual.fireAgeFractional >= currentAge - 1e-6 && actual.fireAgeFractional <= endAge + 1e-6
    checks.push({
      name: 'Vrijheidsleeftijd binnen horizon',
      pass: inRange,
      detail: `${currentAge} ≤ ${actual.fireAgeFractional.toFixed(2)} ≤ ${endAge}`,
    })
  }

  // Doelbedrag > 0 en eindig
  checks.push({
    name: 'Doelbedrag positief en eindig',
    pass: Number.isFinite(actual.requiredFirePortfolio) && actual.requiredFirePortfolio > 0,
    detail: fmtEur(actual.requiredFirePortfolio),
  })

  // Opeethypotheek: de opname MOET een schuld boeken. De twee golden-metrieken meten op
  // de FIRE-maand (~25 jr vóór de opeet-startleeftijd) en zijn daarvoor blind — deze
  // invariant is de enige die de opeet-mechaniek zelf raakt. Zonder de schuldpot op
  // slot 3 (adapter) blijft S!P structureel 0 terwijl de opname wél als kasstroom
  // binnenkomt: gratis geld, en deze check wordt rood.
  if (combo.config.housing.mode === 'reverse_mortgage') {
    checks.push({
      name: 'Opeethypotheek boekt een schuld (S!P > 0 aan het eind)',
      pass: Number.isFinite(actual.opeetSchuldEind) && actual.opeetSchuldEind > 0,
      detail: `eindsaldo opeethypotheek ${fmtEur(actual.opeetSchuldEind)}`,
    })
  } else {
    checks.push({
      name: 'Geen opeetschuld buiten de opeet-strategie',
      pass: actual.opeetSchuldEind === 0,
      detail: `eindsaldo opeethypotheek ${fmtEur(actual.opeetSchuldEind)}`,
    })
  }

  // Impliciete SWR binnen redelijke bandbreedte. Pensioen is bewust uitgezonderd:
  // die mode verankert FIRE op de AOW-leeftijd en rapporteert een afwijkende
  // requiredFirePortfolio, waardoor de impliciete ratio buiten de normale SWR-band
  // valt — geen drift-signaal.
  // 'nu-stoppen' (ADR 0127 D4) idem: requiredFirePortfolio is J(0), geen doel — de
  // impliciete ratio zegt hier niets over drift.
  if (strat !== 'pensioen' && strat !== 'nu-stoppen') {
    checks.push({
      name: 'Impliciete SWR plausibel',
      pass: actual.implicitWithdrawalRate > SWR_MIN && actual.implicitWithdrawalRate < SWR_MAX,
      detail: `${(actual.implicitWithdrawalRate * 100).toFixed(2)}% ∈ (${(SWR_MIN * 100).toFixed(1)}%, ${(SWR_MAX * 100).toFixed(0)}%)`,
    })
  }

  // targetEndPortfolio past bij eindstrategie.
  // KERNEL-SEMANTIEK: targetEndPortfolio = `solve.doelbedrag` (P!B36, het EIND-doel op
  // de eindleeftijd) — bij deplete per constructie 0 (B93-doel=0-quirk, zie
  // bridge.ts#isKernelReachedNowDisplay-docs), bij perpetual de bewaarde pot, bij legacy
  // het nominaal-op-eindleeftijd nagelaten bedrag.
  if (strat === 'deplete' || strat === 'pensioen' || strat === 'nu-stoppen') {
    // Kernel: B36 = 0 bij deplete én nu-stoppen (ADR 0127 D2) → exact €0 (geen
    // VPW-restvermogen). Marge ruim (5%) gehouden voor de pensioen-tak (B36 ≠ 0 mogelijk).
    const ratio = actual.requiredFirePortfolio > 0 ? Math.abs(actual.targetEndPortfolio) / actual.requiredFirePortfolio : Math.abs(actual.targetEndPortfolio)
    checks.push({
      name: `Eind-doelvermogen ≈ €0 (${strat})`,
      pass: ratio <= TARGET_DEPLETE_REL_MARGIN,
      detail: `${fmtEur(actual.targetEndPortfolio)} (${(ratio * 100).toFixed(2)}% van doelbedrag)`,
    })
  } else if (strat === 'perpetual') {
    // Perpetual behoudt koopkracht eeuwigdurend → eind-doelvermogen is juist GROOT
    // (de bewaarde pot), niet €0. Invariant: positief en eindig.
    checks.push({
      name: 'Eind-doelvermogen behouden (perpetual)',
      pass: Number.isFinite(actual.targetEndPortfolio) && actual.targetEndPortfolio > 0,
      detail: fmtEur(actual.targetEndPortfolio),
    })
  } else if (strat === 'legacy') {
    const fx = buildCompleetHorizonFixture()
    const years = endAge - currentAge
    const indexedLegacy = combo.config.end.legacyAmount * Math.pow(1 + fx.inflation, years)
    const rd = relDiff(actual.targetEndPortfolio, indexedLegacy)
    checks.push({
      name: 'Eind-doelvermogen ≈ geïndexeerd legacy-bedrag',
      pass: rd <= LEGACY_TARGET_REL_MARGIN,
      detail: `verwacht ${fmtEur(indexedLegacy)}, werkelijk ${fmtEur(actual.targetEndPortfolio)} (Δ ${(rd * 100).toFixed(2)}%)`,
    })
  }

  return checks
}

function relationalChecks(byId: Map<string, ComboActual>): Map<string, Check[]> {
  const out = new Map<string, Check[]>()
  const add = (id: string, check: Check) => {
    const arr = out.get(id) ?? []
    arr.push(check)
    out.set(id, arr)
  }

  // NB: bewust GÉÉN "exclude ⇒ later FIRE dan include_full"-invariant. De motor
  // levert empirisch een (iets) lager doelbedrag én vroegere vrijheidsleeftijd
  // voor exclude (huis-equity uit de pot ⇒ kleinere te overbruggen som). Dat is
  // legitiem motorgedrag; de golden-waarden leggen het exact vast.

  // Doelbedrag-ordening per eindstrategie is wél robuust: meer kapitaal nodig om
  // na te laten (legacy) of eeuwig te behouden (perpetual) dan om op te maken.
  const dep = byId.get('B-deplete')
  const leg = byId.get('B-legacy')
  const per = byId.get('B-perpetual')
  if (dep && leg) {
    const pass = leg.requiredFirePortfolio >= dep.requiredFirePortfolio - 1e-6
    add('B-legacy', {
      name: 'Doelbedrag legacy ≥ deplete',
      pass,
      detail: `${fmtEur(leg.requiredFirePortfolio)} ≥ ${fmtEur(dep.requiredFirePortfolio)}`,
    })
  }
  if (dep && per) {
    const pass = per.requiredFirePortfolio >= dep.requiredFirePortfolio - 1e-6
    add('B-perpetual', {
      name: 'Doelbedrag perpetual ≥ deplete',
      pass,
      detail: `${fmtEur(per.requiredFirePortfolio)} ≥ ${fmtEur(dep.requiredFirePortfolio)}`,
    })
  }

  // ── Werk-strategie — semantische ordening t.o.v. de referentie (geen werk) ──
  const geen = byId.get('D-geen')
  const groei = byId.get('D-groei')
  const deeltijd = byId.get('D-deeltijd')
  const fa = (a?: ComboActual) => a?.fireAgeFractional ?? null
  // De referentie zonder werk-event MOET gelijk zijn aan de PERPETUAL-baseline die groep
  // C/D delen: C-vast (include_full × perpetual × vast, géén werk). D-geen heeft geen
  // expliciet profiel (enum static → 'Vast'), wat de kernel op exact hetzelfde 'Vast'-
  // profiel + Excel-fasecurve mapt als C-vast → identieke invoer, dus identieke uitkomst.
  const perpRef = byId.get('C-vast')
  if (geen && perpRef) {
    add('D-geen', {
      name: 'Referentie = perpetual-baseline C-vast (geen werk-event is inert)',
      pass: fa(geen) === fa(perpRef) && Math.abs(geen.requiredFirePortfolio - perpRef.requiredFirePortfolio) < 1,
      detail: `vrijheidsleeftijd ${fa(geen) ?? '—'} vs ${fa(perpRef) ?? '—'}`,
    })
  }
  // Salarisgroei (volledig gespaard) ⇒ eerder of gelijk vrij dan zonder werk.
  if (groei && geen && fa(groei) !== null && fa(geen) !== null) {
    add('D-groei', {
      name: 'Salarisgroei ⇒ eerder (of gelijk) vrij',
      pass: fa(groei)! <= fa(geen)! + 1e-6,
      detail: `groei ${fa(groei)} ≤ referentie ${fa(geen)}`,
    })
  }
  // Minder werken ⇒ later of gelijk vrij dan zonder werk.
  if (deeltijd && geen && fa(deeltijd) !== null && fa(geen) !== null) {
    add('D-deeltijd', {
      name: 'Minder werken ⇒ later (of gelijk) vrij',
      pass: fa(deeltijd)! >= fa(geen)! - 1e-6,
      detail: `deeltijd ${fa(deeltijd)} ≥ referentie ${fa(geen)}`,
    })
  }

  return out
}

// ── Hoofd-runner ─────────────────────────────────────────────
export function runHorizonStrategyMatrix(pinnedAge?: number): MatrixResult {
  const fx = buildCompleetHorizonFixture(pinnedAge)
  const currentAge = fx.currentAge

  const actuals = new Map<string, ComboActual>()
  for (const combo of COMBOS) {
    actuals.set(combo.id, runComboKernel(combo, pinnedAge))
  }

  const relational = relationalChecks(actuals)

  const groupsMap = new Map<GroupKey, ComboResult[]>()
  let passed = 0
  let failed = 0

  for (const combo of COMBOS) {
    const actual = actuals.get(combo.id)!
    const expected = EXPECTED[combo.id] ?? null

    const checks: Check[] = [
      ...goldenChecks(actual, expected),
      ...invariantChecks(combo, actual, currentAge),
      ...(relational.get(combo.id) ?? []),
    ]

    const status: 'pass' | 'fail' = checks.every((c) => c.pass) ? 'pass' : 'fail'
    if (status === 'pass') passed++
    else failed++

    const arr = groupsMap.get(combo.group) ?? []
    arr.push({
      id: combo.id,
      label: combo.label,
      group: combo.group,
      config: combo.config,
      expected,
      actual,
      checks,
      status,
    })
    groupsMap.set(combo.group, arr)
  }

  const groups: GroupResult[] = (['housing', 'end', 'withdrawal', 'werk'] as GroupKey[]).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    combos: groupsMap.get(key) ?? [],
  }))

  return { groups, summary: { total: COMBOS.length, passed, failed }, currentAge }
}
