/**
 * /overzicht/schulden/[type] — re-export van legacy /core/debts/[type].
 *
 * Hergebruikt de bestaande server-page voor debt-categorieën zodat
 * /overzicht/schulden/{mortgage,personal_loan,student_loan,...} werken
 * onder de canonieke /overzicht-tak zonder code-duplicatie.
 */
export { default } from '../../../core/debts/[type]/page'
