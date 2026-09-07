/**
 * Eén woordenset voor het beslissen op een tip van Fin.
 *
 * AANLEIDING (UR3-17, #19 uit het beginner-onderzoek van 5 sep 2026): dezelfde
 * `recommendation` met dezelfde drie uitkomsten (`accept` / `postpone` /
 * `reject`) droeg twee verschillende woordenparen. De TipsLijst op
 * /overzicht/tips zei "Doe nu / Later / Negeren" — precies wat de pagina-deck,
 * de page-info en de briefing beloven — terwijl de tipkaart in de Fin-chat
 * "Accepteer / Uitstel / Wijs af" zei. Fin's eigen prompt-DNA beschreef
 * bovendien die tweede set, dus verwees hij gebruikers naar knoppen die op de
 * tips-pagina niet bestaan.
 *
 * Vandaar deze module: de knoptekst hoort bij de BESLISSING, niet bij het
 * scherm waar hij toevallig staat. Wie een derde oppervlak bouwt waar op een
 * tip beslist wordt, consumeert deze constanten in plaats van nieuwe woorden
 * te kiezen.
 *
 * NIET voor `actions` (de actiekaarten onder de tips): die hebben een eigen
 * levenscyclus (open / uitgesteld / afgewezen / afgerond) en een eigen
 * vocabulaire.
 */

/** De drie uitkomsten die een gebruiker op een tip kan kiezen. */
export type TipDecisionKind = 'accept' | 'postpone' | 'reject'

/** Knoptekst per beslissing — de canonieke woorden. */
export const TIP_DECISION_LABELS: Record<TipDecisionKind, string> = {
  accept: 'Doe nu',
  postpone: 'Later',
  reject: 'Negeren',
}

/** Voltooide vorm, voor de bevestiging nadat de keuze is gemaakt. */
export const TIP_DECISION_DONE_LABELS: Record<TipDecisionKind, string> = {
  accept: 'Geaccepteerd',
  postpone: 'Uitgesteld',
  reject: 'Genegeerd',
}
