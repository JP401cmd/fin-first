/**
 * Horizon-kernel adapter — Excel-model-defaults (v5).
 *
 * FASE 3, snede 1. Deze constanten zijn de **gebruikers-instelbare** velden die het
 * Excel-model (`Core calc v5.xlsm`) wél kent maar die (nog) GEEN eigen kolom in de
 * TriFinity-app hebben. Ze worden bewust hier gecentraliseerd — met de Excel-cel per
 * waarde — zodat de mapping één plek heeft en de latere UI-snedes (F4/V4/V5/V7)
 * precies weten wat ze moeten vervangen door een echt profiel-veld.
 *
 * BELANGRIJK (CLAUDE.md-conventie): de fiscale kern-constanten (Box 3-tarief,
 * forfaits, heffingvrij vermogen, schuldendrempel) staan NIET hier maar worden uit
 * de canonieke bron `lib/box3-data.ts` (`BOX3_PARAMS`) geconsumeerd. Dit bestand
 * bevat alléén de Excel-model-parameters zónder app-home. Elke waarde is een
 * TIJDELIJKE default tot het bijbehorende app-veld bestaat (zie open punten in het
 * rapport).
 */

import type { TaxYear } from '@/lib/box3-data'

/**
 * Box 3-belastingjaar waarvan de forfaits/vrijstellingen uit `BOX3_PARAMS` worden
 * gelezen. Default = het meest recente jaar dat de app kent.
 */
export const DEFAULT_TAX_YEAR: TaxYear = 2026

/**
 * P!B25 — rente tekort-lening (V7). De tekort-lening bestaat altijd (startsaldo 0);
 * tot het instelbare rente-veld in de FIRE-instellingen er is (V7-besluit), gebruikt
 * de adapter de Excel-default. Excel-cel P!B25 = 0,05.
 */
export const EXCEL_TEKORT_LENING_RENTE = 0.05

/**
 * P!B91 — heffingvrij inkomen per persoon per jaar (werkelijk-Box 3-tak). Alléén
 * relevant wanneer `box3Method === 'werkelijk'`; de kern schaalt dit × personen tot
 * P!B92. Er is geen app-veld → Excel-default P!B91 = 1800.
 */
export const EXCEL_HEFFINGVRIJ_INKOMEN_PP = 1800

/**
 * PT!B9 — partner-AOW per persoon per maand (samenwonend-tarief), snede 3 (V3).
 * Bewust gespiegeld op de **kern-B21 samenwonend-basis** (`tables/auto-gebeurtenissen.ts`,
 * `AOW_SAMENWONEND_PER_MAAND` — privé, niet geëxporteerd; de kern mag niet gewijzigd),
 * zodat de partner-AOW binnen dezelfde huishouden-run consistent is met de hoofd-persoon-
 * AOW (die óók de 993-tak volgt zodra `leefsituatie = 'Samenwonend'`). NB: dit is de
 * Excel-oracle-waarde (993), NIET de app-constante `NL_AOW_MONTHLY_SAMENWONEND` (1072) —
 * de kern rekent op zijn eigen basis en die is hier leidend voor de consistentie.
 * Excel-cel PT!B9 (afgeleid van de B21-samenwonend-tak).
 */
export const EXCEL_AOW_SAMENWONEND_PP_PER_MAAND = 993

/**
 * Onttrekkingsprofiel — 3-fasen-curve (go-go / slow-go / no-go), P!B71-B75 (F4).
 * De app heeft (nog) geen eigen kolom voor deze curve; tot de nieuwe JSONB-kolom er
 * is (V4-besluit) gebruikt de adapter de Excel-defaults.
 */
export const EXCEL_FASE_CURVE = {
  /** P!B71 — fase 1 t/m leeftijd (go-go). */
  fase1TotLeeftijd: 75,
  /** P!B72 — factor 1 (%). */
  factor1Pct: 100,
  /** P!B73 — fase 2 t/m leeftijd (slow-go). */
  fase2TotLeeftijd: 85,
  /** P!B74 — factor 2 (%). */
  factor2Pct: 85,
  /** P!B75 — factor 3 (%) daarna (no-go). */
  factor3Pct: 70,
} as const

/**
 * Guardrails-drempels P!B79-B81 waarvoor de app geen apart veld heeft. De app-
 * `WithdrawalStrategyConfig` kent alleen floor/ceiling (→ P!B77/B78) en één stap;
 * de portfolio-drempel-ratio's (onder/boven) vallen terug op de Excel-defaults, die
 * numeriek samenvallen met floor/ceiling.
 */
export const EXCEL_GUARDRAIL_DEFAULTS = {
  /** P!B79 — onderdrempel-ratio. */
  onderdrempelRatio: 0.8,
  /** P!B80 — bovendrempel-ratio. */
  bovendrempelRatio: 1.2,
  /** P!B81 — stap (aanpassing per keer). */
  stap: 0.1,
} as const

/**
 * Woning-strategie-defaults die de app-`HousingStrategyConfig` niet kent (V8).
 */
export const EXCEL_WONING_DEFAULTS = {
  /** P!B59 — verkoopleeftijd (vaste leeftijd / fallback bij "wanneer nodig"). */
  verkoopleeftijd: 75,
  /** P!B60 — drempel in maanden-uitgave ("wanneer nodig"). */
  drempelMaandenUitgave: 24,
  /** P!B61 — verkoopprijs als % van WOZ. */
  verkoopprijsPctWoz: 1,
  /** P!B62 — verkoopkosten %. */
  verkoopkostenPct: 0.04,
  /** P!B63 — huur na verkoop (% van WOZ per jaar). De app kent een €-maandlast
   *  (`newMonthlyHousingCost`), geen %/WOZ; tot de conversie er is gebruikt de
   *  adapter de Excel-default. */
  huurNaVerkoopPctWozPerJaar: 0.04,
  /** P!B64 — startleeftijd opname (opeethypotheek). */
  opeetStartleeftijdOpname: 67,
  /** P!B65 — max lening als % van de overwaarde. */
  opeetMaxLeningPctOverwaarde: 0.5,
  /** P!B66 — rente opeethypotheek per jaar. */
  opeetRentePerJaar: 0.055,
} as const

/**
 * Onzekerheids-defaults (scenarioband + MC + Hist). Voor snede 1 staat de
 * onzekerheidslaag "inert": scenario "Verwacht" (shift 0), MC/Hist uit. De MC-/band-
 * wrappers gebruiken deze pas als ze expliciet worden aangeroepen; `solveFire` niet.
 */
export const EXCEL_ONZEKERHEID_DEFAULTS = {
  /** MC!B1 — aantal runs. */
  mcAantalRuns: 200,
  /** MC!B3 — sigma (jaarvolatiliteit gedeelde marktschok). */
  mcSigma: 0.15,
} as const
