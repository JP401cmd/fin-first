// lib/horizon/outcome-guard.ts
//
// ÉÉN bron voor de vraag: "mag dit horizon-getal als feit op het scherm?"
//
// AANLEIDING (bevinding M6, 24-08-2026): met een leeg/onvolledig profiel toonde
// de app "VRIJHEIDSLEEFTIJD 100,0 jaar" en "DOELBEDRAG €−11.328.971 benodigd"
// als gewoon resultaat — zonder enige melding. Twee rekenkant-oorzaken zijn bij
// de bron gerepareerd (`solver.ts` doel<0-scoping en de gemarkeerde eind-horizon-
// terugval in `bridge.ts#requiredFireIsEndOfHorizonFallback`), maar de weergave
// mag daar niet op vertrouwen: een rekenkern die ooit weer een onmogelijke waarde
// teruggeeft, hoort dat niet als hard cijfer te kunnen doorschuiven.
//
// Deze module is die TWEEDE verdedigingslinie. Hij rekent niets uit en corrigeert
// niets — hij beoordeelt alleen een reeds berekende uitkomst en levert de tekst
// die in plaats van het getal komt. Gebruik hem overal waar een vrijheidsleeftijd
// of een FIRE-doelbedrag als kaal getal in beeld komt.
//
// Grens bewust NIET hier hardgecodeerd: `HORIZON_PLAFOND_LEEFTIJD` staat in
// `lib/constants.ts` (CLAUDE.md — geen losse financiële/weergave-getallen in code).

import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'
import { credibleMonthlyBasis, FREEDOM_MONTHS_PER_YEAR } from '@/lib/format'

/** Waaróm een uitkomst niet als getal getoond mag worden. */
export type HorizonOutcomeIssue =
  /** Leeftijd op/voorbij het kernel-horizonplafond = de parkeerstand, geen antwoord. */
  | 'buiten-horizon'
  /** Doelbedrag ≤ 0: een niet-positief "benodigd vermogen" bestaat niet. */
  | 'onmogelijk-bedrag'
  /** Bedrag komt uit de eind-horizon-terugval — andere grootheid dan "benodigd". */
  | 'geen-fire-moment'
  /** Er is geen (geloofwaardige) uitgave-ná-pensioen om op te rekenen. */
  | 'geen-uitgavenbasis'
  /** Het doelbedrag naast het moment is zelf niet te noemen — dan het moment ook niet. */
  | 'geen-vrijheidsmoment'
  /** Waarde ontbreekt of is niet-eindig (NaN/Infinity). */
  | 'geen-gegevens'

export interface HorizonOutcomeGuard {
  /** `true` = het getal mag gewoon getoond worden. */
  readonly ok: boolean
  /** `null` zodra `ok`. */
  readonly issue: HorizonOutcomeIssue | null
  /** Korte tekst die in de plaats van het getal komt. `null` zodra `ok`. */
  readonly label: string | null
  /** Eén zin die zegt wát er ontbreekt/mist. `null` zodra `ok`. */
  readonly hint: string | null
}

const OK: HorizonOutcomeGuard = { ok: true, issue: null, label: null, hint: null }

/** De vaste kop van de gegevensmelding — één formulering, app-breed. */
export const HORIZON_MISSENDE_GEGEVENS_LABEL = 'We missen gegevens'

/**
 * De uitleg-zin per probleem. Geëxporteerd zodat een oppervlak dat de melding
 * toont zónder een concreet getal in de hand te hebben (bv. de /overzicht-strip,
 * die alleen de `dataIssue`-vlag krijgt) dezelfde tekst gebruikt — één bron.
 */
export const HORIZON_MISSENDE_GEGEVENS_HINTS: Record<HorizonOutcomeIssue, string> = {
  'buiten-horizon':
    'We kunnen je vrijheidsmoment nog niet berekenen. Vul je geboortedatum, inkomen en bestedingen aan.',
  'onmogelijk-bedrag':
    'We kunnen je doelbedrag nog niet berekenen. Vul je inkomen, bestedingen en vermogen aan.',
  'geen-fire-moment':
    'Zonder een haalbaar vrijheidsmoment is er geen doelbedrag om naartoe te werken. Vul je inkomen en bestedingen aan.',
  'geen-uitgavenbasis':
    'We weten nog niet wat jouw leven straks per jaar kost. Vul je bestedingen aan of kies een methode.',
  'geen-vrijheidsmoment':
    'We kunnen je vrijheidsmoment nog niet berekenen. Vul je inkomen, bestedingen en vermogen aan.',
  'geen-gegevens':
    'We hebben nog te weinig gegevens om dit te berekenen. Vul je profiel aan.',
}

function issue(kind: HorizonOutcomeIssue): HorizonOutcomeGuard {
  return {
    ok: false,
    issue: kind,
    label: HORIZON_MISSENDE_GEGEVENS_LABEL,
    hint: HORIZON_MISSENDE_GEGEVENS_HINTS[kind],
  }
}

/**
 * Mag deze vrijheids-/pensioenleeftijd als getal getoond worden?
 *
 * `null`/`undefined` telt bewust NIET als probleem: "geen leeftijd" is een geldig
 * antwoord (niet haalbaar binnen de horizon) met een eigen weergave. Deze guard
 * gaat over een leeftijd die er wél is maar niet kán kloppen.
 */
export function guardFreedomAge(age: number | null | undefined): HorizonOutcomeGuard {
  if (age == null) return OK
  if (!Number.isFinite(age)) return issue('geen-gegevens')
  if (age >= HORIZON_PLAFOND_LEEFTIJD) return issue('buiten-horizon')
  return OK
}

/**
 * Mag dit FIRE-doelbedrag als getal getoond worden?
 *
 * `isEndOfHorizonFallback` = `SimResult.requiredFireIsEndOfHorizonFallback`: dan
 * is het bedrag de geprojecteerde EINDSTAND op de horizon, niet "benodigd bij
 * FIRE" — een andere grootheid, die we niet als doelbedrag presenteren.
 */
export function guardFireTarget(
  amount: number | null | undefined,
  opts: { isEndOfHorizonFallback?: boolean } = {},
): HorizonOutcomeGuard {
  if (amount == null || !Number.isFinite(amount)) return issue('geen-gegevens')
  if (amount <= 0) return issue('onmogelijk-bedrag')
  if (opts.isEndOfHorizonFallback === true) return issue('geen-fire-moment')
  return OK
}

/**
 * Mag de vrijheidsleeftijd-tegel een MOMENT noemen?
 *
 * Twee helften van één kernantwoord (bevinding UR2-05): het moment en het
 * doelbedrag. De M6-vangrail zat alleen op het bedrag, dus op een leeg profiel
 * stond "We missen gegevens" pal naast een vrijheidsleeftijd van 83 — dezelfde
 * ontbrekende brondata, twee beloftes. Is het doel niet te noemen, dan is het
 * moment ernaartoe evenmin een antwoord.
 *
 * `ageIsInvalid` = `resolveHeroFireAge` gaf status 'ongeldig' (de
 * horizon-parkeerstand). Die status zet `age` bewust op `null`, dus dat is niet
 * uit het getal zelf af te leiden — vandaar een vlag en niet nóg een leeftijd.
 */
export function guardFreedomMoment(
  opts: {
    ageIsInvalid?: boolean
    fireTarget?: HorizonOutcomeGuard
  } = {},
): HorizonOutcomeGuard {
  if (opts.ageIsInvalid === true) return issue('buiten-horizon')
  if (opts.fireTarget != null && !opts.fireTarget.ok) return issue('geen-vrijheidsmoment')
  return OK
}

/**
 * Mag deze JAARLIJKSE uitgave-ná-pensioen als bedrag getoond worden?
 *
 * AANLEIDING (bevinding UR2-05, 31-08-2026): op een leeg account toonde
 * /toekomst de "Doelbedrag"-KPI eerlijk als "We missen gegevens", terwijl de
 * buur-KPI "Na pensioen" pal ernaast een exact jaarbedrag met hetzelfde
 * typografische gewicht neerzette. Dat bedrag was geen meting maar de
 * terugval-keten van `computeRetirementExpenses` (essentiële budgetten →
 * profielschatting → 0): precies dezelfde ontbrekende brondata, twee
 * verschillende behandelingen op één rij.
 *
 * Dit is dus dezelfde vraag als hierboven, één laag dieper: de uitgave ná
 * pensioen ís de grondslag waaruit het FIRE-doelbedrag volgt (doel =
 * jaaruitgave / SWR). Kan die niet met eigen gegevens onderbouwd worden, dan is
 * er geen persoonlijk antwoord — op geen van de tegels.
 *
 * De ondergrens is NIET `> 0` maar de gedeelde geloofwaardigheidsvloer uit
 * `lib/format.ts` (`credibleMonthlyBasis`, UR2-03): een jaarbedrag van een paar
 * tientjes is geen bestedingspatroon maar een artefact van één losse
 * transactie, en levert een even ongeloofwaardig doelbedrag op. Eén vloer,
 * één plek — niet hier opnieuw uitgevonden.
 */
export function guardRetirementExpense(
  yearlyRetirementExpenses: number | null | undefined,
): HorizonOutcomeGuard {
  if (yearlyRetirementExpenses == null || !Number.isFinite(yearlyRetirementExpenses)) {
    return issue('geen-uitgavenbasis')
  }
  const monthly = yearlyRetirementExpenses / FREEDOM_MONTHS_PER_YEAR
  if (credibleMonthlyBasis(monthly) <= 0) return issue('geen-uitgavenbasis')
  return OK
}
