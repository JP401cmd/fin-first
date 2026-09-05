/**
 * Horizon-kernel adapter — app-profiel/-instellingen → kern-P-parameterblokken.
 *
 * FASE 3, snede 1. Vertaalt het gebruikersprofiel + de strategie-configs naar de
 * P-blokken van `KernelInput` (persoon, inkomen/uitgaven, Box 3, eindstrategie,
 * woning, onttrekkingsprofiel, onzekerheid) + neutrale defaults voor de blokken die
 * de gebeurtenis-/partner-/werk-expanders in latere snedes vullen.
 *
 * Consumeert bestaande app-resolvers (geen tweede bron):
 *  - `resolveFireParams` (rendement/inflatie/Box 3-methode),
 *  - `resolveFireStrategyWithOverride` (eindstrategie),
 *  - `resolveWithdrawalStrategy` (onttrekkingsprofiel, V4),
 *  - `parseHousingStrategy` (woning, V8),
 *  - `computeRetirementExpenses` (uitgave na pensioen),
 *  - `lookupAowAge` (AOW-leeftijd),
 *  - `BOX3_PARAMS` (fiscale kern-constanten — CLAUDE.md-conventie).
 */

import { ageAtDate } from '@/lib/horizon-data'
import { BOX3_PARAMS, type TaxYear } from '@/lib/box3-data'
import { resolveFireParams } from '@/lib/fire-params'
import {
  resolveFirePlanWithOverride,
  type FireEndForm,
  type FirePlan,
} from '@/lib/fire-strategy'
import {
  resolveWithdrawalStrategy,
  parseWithdrawalProfileConfig,
  type WithdrawalStrategyType,
  type WithdrawalProfiel,
} from '@/lib/withdrawal-strategy'
import { parseHousingStrategy } from '@/lib/housing-strategy'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type {
  AutoGebeurtenisParams,
  Box3Params,
  Eindstrategie,
  EindstrategieParams,
  GebeurtenisRij,
  InkomenUitgavenParams,
  KernelStopAnker,
  OnttrekkingsprofielParams,
  Onttrekkingsprofiel,
  OnzekerheidParams,
  PartnerParams,
  PersoonParams,
  StrategieSelectors,
  WerkStrategieParams,
  WoningStrategie,
  WoningStrategieParams,
} from '../types'
import {
  APP_AOW_BASIS_PER_MAAND,
  DEFAULT_TAX_YEAR,
  EXCEL_FASE_CURVE,
  EXCEL_GUARDRAIL_DEFAULTS,
  EXCEL_HEFFINGVRIJ_INKOMEN_PP,
  EXCEL_ONZEKERHEID_DEFAULTS,
  EXCEL_TEKORT_LENING_RENTE,
  EXCEL_WONING_DEFAULTS,
} from './defaults'

/**
 * Profiel-velden die de adapter leest. Superset van de losse app-resolver-inputs;
 * alle velden optioneel behalve `date_of_birth` (zonder geboortedatum kan de kern
 * geen tijdas bouwen — de barrel gooit dan een duidelijke fout).
 */
export interface KernelAdapterProfile {
  date_of_birth: string | null
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  /** Jaarlijkse essentiële uitgaven (uit budgetten) — bron voor `essential_budgets`-methode. */
  yearly_essential_expenses?: number | null
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
  marginaal_tarief?: number | null
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
  /** ADR 0129 D1 — stop-anker (`solved`/`aow`/`now`/`age`); NULL → `solved`. */
  fire_stop_anchor?: string | null
  /** ADR 0129 D1 — zelfgekozen stopleeftijd (halve jaren); alleen bij anker `age`. */
  fire_stop_age?: number | string | null
  feature_preferences?: Record<string, unknown> | null
  withdrawal_strategy?: string | null
  guardrail_floor?: number | null
  guardrail_ceiling?: number | null
  guardrail_cut_step?: number | null
  guardrail_raise_step?: number | null
  /** V4 — onttrekkingsprofiel 3-fasen-curve (JSONB); NULL → Excel-defaults. */
  withdrawal_profile_config?: unknown
  /** V7 — tekort-lening-jaarrente (0..1); NULL → Excel-default P!B25 = 0,05. */
  deficit_loan_rate?: number | null
  housing_strategy_config?: unknown
  pot_rules?: unknown
  retirement_expense_method?: string | null
  retirement_custom_amount?: number | null
}

/** Afgeleide tijdas-waarden (gedeeld door `startLeeftijd` en het persoon-blok). */
export interface PersoonTijdas {
  /** P!B7 — startleeftijd in hele jaren (maand 0). */
  readonly startLeeftijd: number
  readonly persoon: PersoonParams
}

/**
 * Persoon + tijdas. `startLeeftijd` = hele-jaren-leeftijd op de peildatum (`ageAtDate`);
 * `geboortejaar` uit de geboortedatum; `startjaar = geboortejaar + startLeeftijd`
 * (deterministisch en intern consistent: startjaar − geboortejaar = startLeeftijd).
 * AOW-leeftijd via de canonieke `lookupAowAge`-tabel (fallback 67).
 *
 * F6 — reproduceerbare runs: de peildatum `asOf` is expliciet injecteerbaar (default
 * `new Date()` = nu aan de rand). Zo pint één `asOf` de hele kernel-run: al het
 * downstream-gedrag (events, potten, liquidaties, onzekerheid) leidt deterministisch af
 * uit `startLeeftijd`. `asOf` weglaten = byte-identiek aan het oude impliciete `new Date()`.
 */
export function buildPersoonTijdas(
  dateOfBirth: string,
  aowRows: readonly AowLeeftijdRow[],
  asOf: Date = new Date(),
): PersoonTijdas {
  const startLeeftijd = ageAtDate(dateOfBirth, asOf)
  const geboortejaar = new Date(dateOfBirth).getFullYear()
  const startjaar = geboortejaar + startLeeftijd
  const aow = lookupAowAge([...aowRows], dateOfBirth)
  return {
    startLeeftijd,
    persoon: { geboortejaar, startjaar, aowLeeftijd: aow.fractional },
  }
}

/**
 * Roadmap M — leid de nice-fractie (0..1) af uit de budgetten: het deel van de
 * POST-FIRE uitgave (de term die Ont!D flexet) dat bóven de must-euro's uitkomt.
 * `(uitgaveNaPensioen − must)/uitgaveNaPensioen`, geclampt. Bij methode
 * `essential_budgets` is de uitgave al must-only (`uitgave == must`) → nice = 0 →
 * niets te flexen (de regel is dan informatief). We ijken bewust op
 * `uitgaveNaPensioenPerJaar` (de exact gesplitste term), niet op de huidige totale
 * leefuitgaven, zodat must/nice op dezelfde grondslag zit als waar de kernel op rekent.
 */
function deriveNiceFractie(uitgaveNaPensioenPerJaar: number, yearlyMust: number): number {
  if (!(uitgaveNaPensioenPerJaar > 0)) return 0
  const nice = (uitgaveNaPensioenPerJaar - Math.max(0, yearlyMust)) / uitgaveNaPensioenPerJaar
  return Math.min(1, Math.max(0, nice))
}

/** Clamp een optionele fractie naar [0,1]; `null`/ongeldig → `undefined` (val terug op afgeleid). */
function clampFractieOrUndefined(raw: number | null): number | undefined {
  if (raw == null || !Number.isFinite(raw)) return undefined
  return Math.min(1, Math.max(0, raw))
}

/**
 * Inkomen & uitgaven. `nettoJaaruitgaven` = huidige leefuitgaven; `uitgaveNaPensioen`
 * via de canonieke `computeRetirementExpenses` (methode + custom-bedrag), met de
 * huidige uitgaven als schatting-fallback.
 *
 * Roadmap M — flex-spending (must/nice): wanneer de gebruiker de flex-regel activeert
 * (`withdrawal_profile_config.flex_nice_only`) draagt dit blok de nice-fractie +
 * optionele grotere cut-step mee. Nice-fractie: expliciete override wint, anders
 * afgeleid uit de budgetten (`is_essential` → `yearly_essential_expenses`). Zonder de
 * vlag zijn de flex-velden weggelaten → `InkomenUitgavenParams` byte-identiek aan vóór
 * roadmap M (parity intact).
 */
export function buildInkomenUitgaven(profile: KernelAdapterProfile): InkomenUitgavenParams {
  const nettoJaarinkomen = Number(profile.net_monthly_income ?? 0) * 12
  const nettoJaaruitgaven = Number(profile.estimated_monthly_expenses ?? 0) * 12
  const yearlyEssential = Number(profile.yearly_essential_expenses ?? nettoJaaruitgaven)
  const uitgaveNaPensioenPerJaar = computeRetirementExpenses(
    profile.retirement_expense_method as RetirementExpenseMethod | null | undefined,
    yearlyEssential,
    nettoJaarinkomen,
    profile.retirement_custom_amount ?? null,
    nettoJaaruitgaven,
  )
  const base: InkomenUitgavenParams = { nettoJaarinkomen, nettoJaaruitgaven, uitgaveNaPensioenPerJaar }

  // Roadmap M — flex-spending-config (JSONB `withdrawal_profile_config`). Weggelaten/UIT
  // → base ongewijzigd (inert; byte-identiek aan vóór roadmap M).
  const flex = parseWithdrawalProfileConfig(profile)
  if (!flex?.flexNiceOnly) return base

  const override = clampFractieOrUndefined(flex.flexNiceFractie)
  const flexNiceFractiePerJaar =
    override ?? deriveNiceFractie(uitgaveNaPensioenPerJaar, yearlyEssential)
  const flexNiceCutStep = clampFractieOrUndefined(flex.flexCutStep)
  return {
    ...base,
    flexNiceOnly: true,
    flexNiceFractiePerJaar,
    ...(flexNiceCutStep != null ? { flexNiceCutStep } : {}),
  }
}

/**
 * Box 3-parameters. Fiscale constanten (tarief/forfaits/vrijstellingen) uit de
 * canonieke `BOX3_PARAMS[jaar]`; methode uit `resolveFireParams`. `personen`
 * (P!B19 `=1+PT!B2`) is standaard **1** (alleenstaand); de huishouden-laag (V3,
 * snede 3) geeft **2** door zodra er een fiscaal partner is. De kern verdubbelt dan
 * zelf het heffingvrije vermogen en de schuldendrempel (`bel.ts`: `×personen`), dus
 * die worden hier NIET voor-verdubbeld — alleen `heffingvrijInkomenTotaal` (P!B92 =
 * P!B91 × personen, werkelijk-tak) wordt hier geschaald omdat de kern die al als
 * totaal verwacht. `personen = 1` (default) → byte-identiek aan snede 1/2.
 */
export function buildBox3(profile: KernelAdapterProfile, taxYear: TaxYear, personen = 1): Box3Params {
  const p = BOX3_PARAMS[taxYear]
  return {
    method: resolveFireParams(profile).box3Method,
    tarief: p.tarief,
    forfaitSpaar: p.forfaitSpaargeld,
    forfaitOverig: p.forfaitBeleggingen,
    forfaitSchuld: p.forfaitSchulden,
    heffingvrijVermogenPP: p.heffingsvrijSingle,
    personen,
    schuldendrempelPP: p.schuldendrempelSingle,
    heffingvrijInkomenTotaal: EXCEL_HEFFINGVRIJ_INKOMEN_PP * personen,
  }
}

/**
 * Strategie-selectors (P!B28/29/30). De kern-engine consumeert deze NIET — hij leest
 * de reeds-geresolveerde prio's uit `input.ts` (die de adapter direct via
 * `prio-overgang` levert). We zetten alle drie op 'Eigen indeling', het eerlijke
 * label voor "prio's rechtstreeks aangeleverd".
 */
export function buildStrategieSelectors(): StrategieSelectors {
  return { toename: 'Eigen indeling', afname: 'Eigen indeling', onttrekking: 'Eigen indeling' }
}

/** De drie EIND-VORMEN → de Excel-selector P!B48 (ADR 0129: de twee ankers zitten
 *  niet meer in deze map — die reizen als `KernelInput.stopAnker`). */
const END_FORM_TO_SELECTOR: Record<FireEndForm, Eindstrategie> = {
  deplete: 'Vermogen opeten',
  legacy: 'Nalatenschap',
  perpetual: 'Eeuwigdurend',
}

/**
 * Het PLAN (stop-anker × eind-vorm) van dit profiel — één home voor beide assen
 * (ADR 0129 D2/D3), zodat `buildEindstrategie` en `buildStopAnker` per definitie
 * dezelfde lezing van de profielrij hebben.
 *
 * Het schaduwpad `feature_preferences.fire_strategy_override` (dat 'pensioen' parkeert
 * zolang de DB-CHECK die waarde niet toestaat) wordt EERST opgelost en dan pas door
 * `parseFirePlan` gelezen: anders zou een geparkeerd pensioen-plan zijn anker
 * verliezen en als gewone deplete-run doorgerekend worden.
 */
function resolveFirePlan(profile: KernelAdapterProfile): FirePlan {
  // Eén home (lib/fire-strategy.ts): de loaders geven hetzelfde plan naast hun
  // bundel door, dus adapter en bundel kunnen niet van elkaar wegdrijven.
  return resolveFirePlanWithOverride(profile)
}

/**
 * Eindstrategie (P!B48-B54) — vanaf ADR 0129 uitsluitend de EIND-VORM.
 *
 * Vóór dit besluit droeg de selector ook het stopmoment ('Pensioenleeftijd' /
 * 'Nu stoppen'); dat reist nu als `KernelInput.stopAnker` (zie `buildStopAnker`),
 * zodat anker en eind-vorm vrij combineren — bv. "stop op je AOW én laat €100k na op
 * je 90e", een combinatie die in de oude enum niet uit te drukken was.
 *
 * GEVOLG voor bestaande pensioen-rijen: de eindleeftijd komt niet langer uit het
 * Excel-artefact 100 maar uit de eigen `fire_end_age` (D6/D9). Migratie M1 zet die
 * kolom op 100 voor precies die rijen, zodat de kernel identiek blijft rekenen —
 * F2 hoort dus niet live te gaan vóór M1 gedraaid is.
 *
 * `nietLiquideMeetellen = 'Nee'` (geen app-veld — open punt); de app kent geen aparte
 * eind-leeftijden per eind-vorm, dus B51/B52 delen `endAge` en B53 = `legacyAmount`.
 */
export function buildEindstrategie(profile: KernelAdapterProfile): EindstrategieParams {
  const plan = resolveFirePlan(profile)
  return {
    selector: END_FORM_TO_SELECTOR[plan.endForm],
    eindleeftijdOpeten: plan.endAge,
    eindleeftijdNalatenschap: plan.endAge,
    nalatenschapBedrag: plan.legacyAmount,
    nietLiquideMeetellen: 'Nee',
  }
}

/**
 * Het STOP-ANKER (ADR 0129 D3) — `undefined` onder `solved`, zodat de kernel dan
 * letterlijk het oude bisectie-pad volgt. De enige plek waar het app-plan een vast
 * stopmoment de kernel in stuurt; `solver.ts#resolveVastAnker` zet het aan de andere
 * kant om naar een leeftijd (de AOW-leeftijd komt daar uit `persoon.aowLeeftijd` en
 * niet uit een hardcoded 67).
 */
export function buildStopAnker(profile: KernelAdapterProfile): KernelStopAnker | undefined {
  const { anchor } = resolveFirePlan(profile)
  switch (anchor.kind) {
    case 'solved':
      return undefined
    case 'aow':
      return { soort: 'aow' }
    case 'now':
      return { soort: 'nu' }
    case 'age':
      return { soort: 'leeftijd', leeftijd: anchor.age }
  }
}

const HOUSING_MODE_TO_SELECTOR: Record<string, WoningStrategie> = {
  include_full: 'Meerekenen',
  exclude_from_fire: 'Uitsluiten',
  downsize: 'Verkopen',
  reverse_mortgage: 'Opeethypotheek',
}

/**
 * Woning-strategie (P!B57-B67). Uit `parseHousingStrategy`. Velden zonder app-
 * tegenhanger (verkoopleeftijd-fallback, huur %/WOZ, opeet-parameters) vallen terug
 * op de Excel-defaults (V8). De app-`depletionThresholdYears` (JAREN) → drempel in
 * MAANDEN (× 12); de app-`triggerAge` is bij "wanneer nodig" de fallback-leeftijd.
 */
export function buildWoning(housingConfigRaw: unknown): WoningStrategieParams {
  const cfg = parseHousingStrategy(housingConfigRaw)

  // Defaults (Meerekenen/Uitsluiten dragen geen verkoop-/opeet-parameters).
  const base: WoningStrategieParams = {
    selector: HOUSING_MODE_TO_SELECTOR[cfg.mode] ?? 'Meerekenen',
    trigger: 'Vaste leeftijd',
    verkoopleeftijd: EXCEL_WONING_DEFAULTS.verkoopleeftijd,
    drempelMaandenUitgave: EXCEL_WONING_DEFAULTS.drempelMaandenUitgave,
    verkoopprijsPctWoz: EXCEL_WONING_DEFAULTS.verkoopprijsPctWoz,
    verkoopkostenPct: EXCEL_WONING_DEFAULTS.verkoopkostenPct,
    huurNaVerkoopPctWozPerJaar: EXCEL_WONING_DEFAULTS.huurNaVerkoopPctWozPerJaar,
    opeetStartleeftijdOpname: EXCEL_WONING_DEFAULTS.opeetStartleeftijdOpname,
    opeetMaxLeningPctOverwaarde: EXCEL_WONING_DEFAULTS.opeetMaxLeningPctOverwaarde,
    opeetRentePerJaar: EXCEL_WONING_DEFAULTS.opeetRentePerJaar,
    opeetMaandopname: null,
  }

  if (cfg.mode === 'downsize') {
    // V8/bugfix: bij "wanneer nodig" (on_depletion) is de verkoopleeftijd de UITERSTE
    // fallback voor het geval het liquide vermogen nooit onder de drempel zakt. Die
    // hoort NIET op de app-`triggerAge` te vallen — dat forceerde `bez.ts` (AY:
    // `age >= verkoopleeftijd`) tot een harde verkoop op de trigger-leeftijd, ongeacht
    // FIRE, waardoor de woning veel te vroeg werd verkocht. `fallbackAge` (indien gezet)
    // wint; anders de Excel-default (75). Bij een vaste leeftijd (fixed_age) blijft
    // `triggerAge` de verkoopleeftijd.
    const verkoopleeftijd =
      cfg.trigger === 'on_depletion'
        ? cfg.fallbackAge ?? EXCEL_WONING_DEFAULTS.verkoopleeftijd
        : cfg.triggerAge
    return {
      ...base,
      trigger: cfg.trigger === 'on_depletion' ? 'Wanneer nodig' : 'Vaste leeftijd',
      verkoopleeftijd,
      drempelMaandenUitgave: Math.round(cfg.depletionThresholdYears * 12),
      verkoopprijsPctWoz: cfg.salePricePct,
      verkoopkostenPct: cfg.salesCostsPct,
    }
  }

  if (cfg.mode === 'reverse_mortgage') {
    // V8: idem voor de opeet-startleeftijd bij "wanneer nodig".
    const opeetStart =
      cfg.trigger === 'on_depletion' ? cfg.fallbackAge ?? cfg.triggerAge : cfg.triggerAge
    return {
      ...base,
      trigger: cfg.trigger === 'on_depletion' ? 'Wanneer nodig' : 'Vaste leeftijd',
      opeetStartleeftijdOpname: opeetStart,
      opeetMaxLeningPctOverwaarde: cfg.maxLoanPct,
      opeetRentePerJaar: cfg.interestRate,
      opeetMaandopname: cfg.monthlyPayout,
    }
  }

  return base
}

const WITHDRAWAL_TO_PROFIEL: Record<WithdrawalStrategyType, Onttrekkingsprofiel> = {
  static: 'Vast',
  guardrails: 'Guardrails',
}

/**
 * V4/F4 — expliciet profiel (`withdrawal_profile_config.profiel`) → kern-selector.
 * Wint van de enum-mapping zodra de gebruiker een profiel heeft gekozen (de enum
 * kent 'Afnemend'/'Oplopend' niet, dus zonder dit veld zou go-go/slow-go/no-go
 * onbereikbaar zijn).
 */
const PROFIEL_TO_KERNEL: Record<WithdrawalProfiel, Onttrekkingsprofiel> = {
  vast: 'Vast',
  afnemend: 'Afnemend',
  oplopend: 'Oplopend',
  guardrails: 'Guardrails',
}

/**
 * Onttrekkingsprofiel (P!B69-B81). V4-mapping: `withdrawal_strategy` → profiel
 * (static→Vast, guardrails→Guardrails, vpw/bucket→Vast). De 3-fasen-curve is Excel-
 * default tot de eigen JSONB-kolom er is (F4). Guardrail-parameters: floor/ceiling
 * (P!B77/B78) uit de app-config; de portfolio-drempel-ratio's (P!B79/B80) hergebruiken
 * dezelfde floor/ceiling (zoals de app-`applyGuardrails` doet); stap (P!B81) uit de
 * app-cut-step. Wanneer de app-config ze niet zet, vallen ratio's/stap terug op de
 * Excel-defaults.
 */
export function buildOnttrekkingsprofiel(profile: KernelAdapterProfile): OnttrekkingsprofielParams {
  const cfg = resolveWithdrawalStrategy(profile)
  // V4: de 3-fasen-curve komt uit `withdrawal_profile_config` als die er is; elk
  // ontbrekend/ongeldig veld valt PER VELD terug op de Excel-default (EXCEL_FASE_CURVE,
  // single source). `curve === null` (kolom NULL) → alles Excel → byte-identiek aan snede 1/2.
  const curve = parseWithdrawalProfileConfig(profile)
  return {
    // Voorrang: expliciet gekozen profiel > enum-mapping (byte-identiek wanneer
    // `curve.profiel` niet gezet is → `null`).
    profiel: curve?.profiel ? PROFIEL_TO_KERNEL[curve.profiel] : WITHDRAWAL_TO_PROFIEL[cfg.strategy],
    fase1TotLeeftijd: curve?.gogoTotLeeftijd ?? EXCEL_FASE_CURVE.fase1TotLeeftijd,
    factor1Pct: curve?.gogoPct ?? EXCEL_FASE_CURVE.factor1Pct,
    fase2TotLeeftijd: curve?.slowgoTotLeeftijd ?? EXCEL_FASE_CURVE.fase2TotLeeftijd,
    factor2Pct: curve?.slowgoPct ?? EXCEL_FASE_CURVE.factor2Pct,
    factor3Pct: curve?.nogoPct ?? EXCEL_FASE_CURVE.factor3Pct,
    guardrailFloor: cfg.guardrailFloor,
    guardrailCeiling: cfg.guardrailCeiling,
    guardrailOnderdrempelRatio: cfg.guardrailFloor || EXCEL_GUARDRAIL_DEFAULTS.onderdrempelRatio,
    guardrailBovendrempelRatio: cfg.guardrailCeiling || EXCEL_GUARDRAIL_DEFAULTS.bovendrempelRatio,
    guardrailStap: cfg.guardrailCutStep || EXCEL_GUARDRAIL_DEFAULTS.stap,
  }
}

/**
 * Tekort-lening-jaarrente (V7, P!B25). Uit `deficit_loan_rate` wanneer aanwezig én
 * geldig (finite, 0..1 — dezelfde band als de DB-CHECK); anders de Excel-default
 * (`EXCEL_TEKORT_LENING_RENTE` = 0,05). NULL/ontbrekend → default → byte-identiek aan
 * snede 1/2. Geconsumeerd door zowel `buildSchuldPotten` (rente op de tekort-lening-pot)
 * als het `tekortLeningRente`-blok van de `KernelInput`.
 */
export function resolveDeficitLoanRate(profile: KernelAdapterProfile): number {
  const raw = profile.deficit_loan_rate
  if (raw == null) return EXCEL_TEKORT_LENING_RENTE
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : EXCEL_TEKORT_LENING_RENTE
}

/**
 * Onzekerheidslaag (scenarioband + MC + Hist). Voor snede 1 inert: scenario
 * "Verwacht" (shift 0), shift alleen op investeringspotten (Excel P!B44 = 1),
 * MC/Hist uit. `solveFire` gebruikt dit blok niet; alleen de band-/MC-wrappers.
 *
 * `marktVolatiliteit` (ADR 0117) is de jaargelaagde `fire_assumptions.volatility`,
 * al geresolveerd door `lib/fire-assumptions.ts#resolveFireAssumptions` — dezelfde
 * caller-queryt/resolver-consumeert-scheiding als `lookupAowAge`. Weggelaten of
 * ongeldig → `EXCEL_ONZEKERHEID_DEFAULTS.mcSigma` (= `DEFAULT_VOLATILITY`), dus
 * byte-identiek aan vóór ADR 0117. Sigma moet strikt positief zijn: 0 zou de hele
 * Monte-Carlo-band tot één lijn platdrukken zonder dat iemand dat als "uit" heeft
 * bedoeld, en negatief bestaat niet als volatiliteit.
 */
export function buildOnzekerheid(startjaar: number, marktVolatiliteit?: number): OnzekerheidParams {
  const sigma =
    typeof marktVolatiliteit === 'number' &&
    Number.isFinite(marktVolatiliteit) &&
    marktVolatiliteit > 0
      ? marktVolatiliteit
      : EXCEL_ONZEKERHEID_DEFAULTS.mcSigma
  return {
    scenario: 'Verwacht',
    shift: 0,
    shiftAlleenInvestering: true,
    mc: {
      aantalRuns: EXCEL_ONZEKERHEID_DEFAULTS.mcAantalRuns,
      sigma,
      actief: false,
    },
    hist: {
      startjaar,
      actief: false,
      // Hist!B4:B99 = 96 lege jaarcellen (backtest blijft app-zijdig, V11).
      rendementReeks: Array.from({ length: 96 }, () => null),
    },
  }
}

// ── Neutrale blokken voor de nog-niet-gebouwde expanders (snede 2/3) ─────────────
//
// De gebeurtenis-/partner-/werk-expanders (AOW-opbouw, pensioen-annuïtisering,
// kinderen-NIBUD, erfenis, werk-strategie, partner-stromen) worden in latere snedes
// uit app-data afgeleid. Tot dan levert de adapter neutrale, inerte defaults zodat de
// kern draait zonder fantoom-stromen te injecteren. OPEN PUNT (snede 2/3).

/** Geen handmatige gebeurtenissen (snede 2). */
export const NEUTRAL_GEBEURTENISSEN: readonly GebeurtenisRij[] = []

/**
 * Inerte auto-gebeurtenissen: geen AOW-opbouw (aowOpbouwjaren 0), geen kinderen, geen
 * erfenis, geen pensioen-multipot. BEWUST 0 AOW-opbouwjaren: de AOW-/pensioen-expander
 * (afgeleid uit het echte profiel/UPO) is snede 2/3 — tot dan injecteert de adapter
 * geen (ongemapte) AOW-stroom.
 *
 * WÉL gezet: `aowBasisPerMaand` — het app-pad rekent de kern-B21 op de canonieke SVB-
 * bedragen uit `lib/constants.ts` i.p.v. de Excel-oracle-basis 1452/993 (gap-besluit
 * V20 / ADR 0064). Dit is de enige injectieplek voor het app-pad: `buildAutoGebeurtenissen`
 * (adapter/events.ts) spreidt deze constante altijd als basis, ook zonder AOW-event.
 * Het parity-/fixture-pad (`input-from-fixture`) laat het veld weg → oracle-fallback.
 */
export const NEUTRAL_AUTO_GEBEURTENISSEN: AutoGebeurtenisParams = {
  leefsituatie: 'Alleenstaand',
  aowOpbouwjaren: 0,
  aantalKinderen: 0,
  kindGeboorteLeeftijden: [0, 0, 0],
  nibudBasisPerMaand: 0,
  kinderopvangNettoPerMaand: 0,
  kinderbijslagPerMaand: 0,
  babyuitzetEenmalig: 0,
  erfenisBruto: 0,
  erfenisRelatie: 'Kind',
  erfenisLeeftijd: 0,
  pensioenPotten: [],
  aowBasisPerMaand: APP_AOW_BASIS_PER_MAAND,
}

/** Geen partner (household/partner V3 = snede 3). Inerte waarden. */
export const NEUTRAL_PARTNER: PartnerParams = {
  aanwezig: false,
  geboortejaar: 1970,
  nettoJaarinkomen: 0,
  aowLeeftijd: 67,
  pensioenBrutoPerJaar: 0,
  pensioenStartleeftijd: 67,
  pensioenGeindexeerd: false,
  aowBedragPpPerJaar: 0,
}

/** Werk-strategie uit (reeleGroei 0 = effectief uit; geen sprongen/deeltijd). Snede 2. */
export const NEUTRAL_WERK_STRATEGIE: WerkStrategieParams = {
  basisNettoPerMaand: 0,
  reeleGroei: 0,
  groeiTotLeeftijd: null,
  plafondNettoPerMaand: 0,
  sprongen: [],
  deeltijd: [],
}

/** Default belastingjaar-herexport voor de barrel. */
export { DEFAULT_TAX_YEAR }
