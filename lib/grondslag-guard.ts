// lib/grondslag-guard.ts
//
// ÉÉN bron voor de vraag: "mag dit oordeel over inkomen/uitgaven op het scherm?"
//
// AANLEIDING (UR3-01, 5 sep 2026): wie in de onboarding "Later invullen" koos,
// kreeg "8 van 100 — Kritiek", "Spaarquote 0 %", "€ 0 uit je profiel" en een
// briefing-tip op die nul. De app deed een uitspraak over iemands situatie die
// niet waar was: ze wist het simpelweg niet. Dat is het verschil tussen een
// meting en een gat, en de app presenteerde het gat als meting.
//
// De REKENKANT is bij de bron gerepareerd (`resolveAmountWithBasis` levert
// `'unknown'` als grondslag, ADR 0131). Deze module is de WEERGAVE-kant, de
// zuster van `lib/horizon/outcome-guard.ts` (ADR 0109): hij rekent niets uit en
// corrigeert niets — hij beoordeelt een reeds bepaalde grondslag en levert de
// ene zin + de ene knop die in plaats van het cijfer komen. Gebruik hem overal
// waar een score, quote of advies op inkomen/uitgaven rust.

import { isUnknownBasis, type ResolvedBasis } from '@/lib/budget-basis'
import { HORIZON_MISSENDE_GEGEVENS_LABEL } from '@/lib/horizon/outcome-guard'

/** Wat er ontbreekt — bepaalt de zin en de knop. */
export type OntbrekendeGrondslag = 'inkomen' | 'uitgaven' | 'inkomen-en-uitgaven'

/**
 * De vaste KOP boven een onthouden oordeel — bewust dezelfde als de horizon-
 * melding (ADR 0109), zodat /overzicht en /toekomst niet elk hun eigen
 * "we missen iets" formuleren.
 */
export const GRONDSLAG_ONBEKEND_KOP = HORIZON_MISSENDE_GEGEVENS_LABEL

/**
 * Welke kant ontbreekt, of `null` als beide bekend zijn. Een ontbrekend argument
 * (oude snapshot-inputs, mocks, spread-callers) telt als BEKEND: onbekendheid is
 * een positieve uitspraak van de resolver, geen afwezigheid van een veld.
 */
export function ontbrekendeGrondslag(
  incomeBasis: ResolvedBasis | null | undefined,
  expensesBasis: ResolvedBasis | null | undefined,
): OntbrekendeGrondslag | null {
  const inkomen = isUnknownBasis(incomeBasis)
  const uitgaven = isUnknownBasis(expensesBasis)
  if (inkomen && uitgaven) return 'inkomen-en-uitgaven'
  if (inkomen) return 'inkomen'
  if (uitgaven) return 'uitgaven'
  return null
}

/** De vaste korte aanduiding die in plaats van een cijfer komt — één woordkeuze, app-breed. */
export const GRONDSLAG_ONBEKEND_LABEL = 'Nog niet bekend'

/** Eén zin per geval: wát ontbreekt, en dat we daarom niets beweren. */
export const GRONDSLAG_ONBEKEND_HINT: Record<OntbrekendeGrondslag, string> = {
  inkomen: 'We kennen je inkomen nog niet, dus we geven nog geen oordeel.',
  uitgaven: 'We kennen je uitgaven nog niet, dus we geven nog geen oordeel.',
  'inkomen-en-uitgaven':
    'We kennen je inkomen en uitgaven nog niet, dus we geven nog geen oordeel.',
}

/**
 * De ene knop. Landt op het instellingenblok van /overzicht/budget: daar
 * schrijft "Eigen bedrag" bron én bedrag in één PUT (`income_source: 'manual'`),
 * zodat het bedrag daarna als geverifieerde invoer geldt — ook wanneer het 0 is.
 */
export const GRONDSLAG_AANVULLEN_HREF = '/overzicht/budget'

export const GRONDSLAG_AANVULLEN_LABEL: Record<OntbrekendeGrondslag, string> = {
  inkomen: 'Vul je inkomen in',
  uitgaven: 'Vul je uitgaven in',
  'inkomen-en-uitgaven': 'Vul je inkomen en uitgaven in',
}

export interface GrondslagGuard {
  /** `true` = het oordeel mag gewoon getoond worden. */
  readonly ok: boolean
  /** `null` zodra `ok`. */
  readonly ontbreekt: OntbrekendeGrondslag | null
  /** Eén zin die zegt wát er ontbreekt. `null` zodra `ok`. */
  readonly hint: string | null
  /** De ene knop. `null` zodra `ok`. */
  readonly actie: { href: string; label: string } | null
}

const OK: GrondslagGuard = { ok: true, ontbreekt: null, hint: null, actie: null }

/**
 * Beoordeelt of een oordeel op inkomen/uitgaven getoond mag worden en levert
 * anders de zin en de knop. Pure functie; identieke invoer geeft identieke
 * uitvoer op elk oppervlak — dat is precies het punt.
 */
export function grondslagGuard(
  incomeBasis: ResolvedBasis | null | undefined,
  expensesBasis: ResolvedBasis | null | undefined,
): GrondslagGuard {
  const ontbreekt = ontbrekendeGrondslag(incomeBasis, expensesBasis)
  if (!ontbreekt) return OK
  return {
    ok: false,
    ontbreekt,
    hint: GRONDSLAG_ONBEKEND_HINT[ontbreekt],
    actie: { href: GRONDSLAG_AANVULLEN_HREF, label: GRONDSLAG_AANVULLEN_LABEL[ontbreekt] },
  }
}
