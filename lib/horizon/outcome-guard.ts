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

/** Waaróm een uitkomst niet als getal getoond mag worden. */
export type HorizonOutcomeIssue =
  /** Leeftijd op/voorbij het kernel-horizonplafond = de parkeerstand, geen antwoord. */
  | 'buiten-horizon'
  /** Doelbedrag ≤ 0: een niet-positief "benodigd vermogen" bestaat niet. */
  | 'onmogelijk-bedrag'
  /** Bedrag komt uit de eind-horizon-terugval — andere grootheid dan "benodigd". */
  | 'geen-fire-moment'
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
