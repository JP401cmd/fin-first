/**
 * Grens van de herstel-taak die meldingen van gebruikers naar de werkqueue
 * doorzet (`/api/cron/user-reports-notion-sync`).
 *
 * Een eigen, lichte module: de cron gebruikt de grens om te stoppen, het
 * beheerdashboard om te tellen hoeveel meldingen daardoor zijn blijven liggen.
 * Eén getal, twee lezers.
 */

/** Na 5 pogingen stoppen we: dan is het structureel (property-drift, token). */
export const USER_REPORT_SYNC_MAX_ATTEMPTS = 5

/** Standen waarin een melding nog niet in de werkqueue staat. */
export const USER_REPORT_NIET_GESYNCT = ['pending', 'error'] as const
