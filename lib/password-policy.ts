/**
 * Gedeelde wachtwoord-policy — één bron voor de copy en constanten die de drie
 * auth-flows (signup / reset-password / account-wachtwoord) delen.
 *
 * Reden voor centralisatie: de deep-dive vond de "minimaal 6 tekens"-regel op
 * meerdere plekken gedupliceerd, en de nieuwe leaked-password-melding zou zonder
 * bundeling driemaal hardcoded worden. Eén bron houdt de coach-stem consistent
 * en voorkomt drift.
 *
 * De copy is bewust vrijheids-neutraal en in de nuchtere coach-stem: wat is er
 * aan de hand + wat kun je eraan doen. Geen uitroeptekens, geen dreigtaal.
 */

/**
 * Minimale wachtwoordlengte. Bewust NIET verhoogd (ADR 0057 / scope): dit is de
 * bestaande regel, hier alleen gecentraliseerd zodat de flows dezelfde grens
 * delen. Verhogen is een aparte productbeslissing.
 */
export const MIN_PASSWORD_LENGTH = 6

/**
 * NL-melding wanneer een gekozen wachtwoord in een bekend datalek voorkomt
 * (HaveIBeenPwned, ADR 0057). Eén bron voor signup, reset-password en het
 * account-wachtwoord-formulier — nooit los hardcoden in een component.
 */
export const LEAKED_PASSWORD_MESSAGE =
  'Dit wachtwoord staat in bekende datalekken. Kies een uniek wachtwoord dat je nergens anders gebruikt.'
