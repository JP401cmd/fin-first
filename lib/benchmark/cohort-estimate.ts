/**
 * "Schat het voor me" — de cohort-schatting van inkomen en uitgaven (UR3-05).
 *
 * ── Waarom deze module bestaat ──────────────────────────────────────────────
 * Wie in de onboarding "Later invullen" koos, verliet de app zónder dagtarief —
 * en daarmee zonder één enkel vrijheidsgetal, nergens. De kernbelofte ("geld is
 * opgeslagen tijd") hing aan één overslaanbare stap. De uitweg is niet dwang
 * maar een gok die zich als gok bekendmaakt: de app vult een plausibel bedrag
 * in en zegt erbij dat zíj het geraden heeft (ADR 0131 — `'estimate'` is een
 * placeholder, geen keuze; echte data verdringt 'm vanzelf).
 *
 * ── Grondslag: leeftijd, en niets anders (eigenaarbesluit O1, 5 sep 2026) ───
 * De onboarding vraagt het huishoudtype niet uit (`identity.household_type`
 * staat vast op 'solo' sinds jun 2026; huishouden loopt via /mijn/profiel), dus
 * de enige as die op dat moment bekend is, is de leeftijd — die staat twee
 * schermen eerder. `getCohortReference(band, null)` levert daarom bewust het
 * GESTANDAARDISEERDE (equivalentiefactor 1,0 = één persoon) CBS-inkomen; een
 * huishoudfactor erop zou huishoudinkomen zijn en dus een andere grootheid.
 *
 * ── Eén afleiding, twee consumenten (consume, don't recompute) ──────────────
 * `computeReferencePeer` leidde "maandinkomen + maanduitgaven uit een
 * cohort-referentie" al af voor de peer-vergelijking. Die afleiding staat nu
 * hier (`cohortMonthlyFromReference`) en wordt door beide geconsumeerd — anders
 * zou de peer op /check een ander bedrag "typisch" noemen dan de knop in de
 * onboarding invult, terwijl het per constructie hetzelfde cohort is.
 *
 * De AFRONDING is de enige plek waar de twee uiteenlopen, en bewust: de peer
 * rekent op de exacte afleiding (hij gaat door de FIRE-motor en de
 * gezondheidsscore), de onboarding vult een veld dat een mens leest en dus op
 * €25 afgerond hoort te zijn. `estimateCohortIncomeExpenses` rondt af,
 * `cohortMonthlyFromReference` niet.
 *
 * PUUR: geen I/O, geen Supabase — draait in de browser tijdens de onboarding.
 */

import { ageToBand, type AgeBandKey } from './cohort'
import { getCohortReference, type CohortReference } from './nl-reference'

/**
 * Afrondingsstap van een getoonde schatting. €25 is fijn genoeg om plausibel te
 * blijven (€3.075, niet €3.000) en grof genoeg om zichtbaar te maken dat het
 * een schatting is en geen meting — een bedrag als "€ 3.074,83" zou precisie
 * suggereren die er niet is.
 */
const ESTIMATE_ROUNDING_STEP = 25

/** Rond af op de schattingsstap; niet-eindige of negatieve invoer → 0. */
function roundToStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value / ESTIMATE_ROUNDING_STEP) * ESTIMATE_ROUNDING_STEP
}

/** De maandbedragen die uit één cohort-referentie volgen (EXACT, niet afgerond). */
export interface CohortMonthlyDerivation {
  /** Netto besteedbaar inkomen per maand (`incomeMedian / 12`). */
  monthlyIncome: number
  /** Wat er volgens de referentie-spaarquote per maand overblijft. */
  monthlySavings: number
  /** Inkomen minus sparen — de uitgaven waarop het dagtarief rust. */
  monthlyExpenses: number
}

/**
 * DE afleiding van maandinkomen/-uitgaven uit een cohort-referentie.
 * Gedeeld door de onboarding-schatting en `computeReferencePeer`.
 */
export function cohortMonthlyFromReference(ref: CohortReference): CohortMonthlyDerivation {
  const monthlyIncome = ref.incomeMedian / 12
  const monthlySavings = monthlyIncome * (ref.savingsRatePct / 100)
  return {
    monthlyIncome,
    monthlySavings,
    monthlyExpenses: Math.max(0, monthlyIncome - monthlySavings),
  }
}

/** De schatting zoals de onboarding 'm invult en benoemt. */
export interface CohortEstimate {
  /** Afgerond netto maandinkomen. */
  monthlyIncome: number
  /** Afgeronde maanduitgaven bij de referentie-spaarquote. */
  monthlyExpenses: number
  /** Referentie-spaarquote (%) van de band — voedt de uitgaven-schatting. */
  savingsRatePct: number
  ageBand: AgeBandKey
  /** Leesbare band ("25–35 jaar") voor de regel onder het veld. */
  ageBandLabel: string
}

/**
 * De cohort-schatting bij een leeftijd, of `null` wanneer de leeftijd onbruikbaar
 * is (geen geboortedatum ingevuld, of een onmogelijke waarde). `null` is de
 * bewuste rem: liever geen knop dan een verzonnen bedrag.
 */
export function estimateCohortIncomeExpenses(age: number | null | undefined): CohortEstimate | null {
  if (age == null || !Number.isFinite(age) || age < 0 || age > 120) return null

  const band = ageToBand(age)
  const ref = getCohortReference(band.key, null)
  const derived = cohortMonthlyFromReference(ref)

  const monthlyIncome = roundToStep(derived.monthlyIncome)
  if (!(monthlyIncome > 0)) return null

  return {
    monthlyIncome,
    monthlyExpenses: roundToStep(derived.monthlyExpenses),
    savingsRatePct: ref.savingsRatePct,
    ageBand: band.key,
    ageBandLabel: band.label,
  }
}

/**
 * Uitgaven-schatting bij een REEDS BEKEND maandinkomen — het bedrag dat de
 * gebruiker net zelf typte, of dat hij van de inkomen-knop overnam.
 *
 * Waarom niet gewoon `estimate.monthlyExpenses`: typt iemand €5.000 waar zijn
 * cohort €3.075 zegt, dan zijn cohort-uitgaven van €2.800 geen schatting meer
 * maar een tegenspraak. De spaarquote van de band is het stabiele deel van de
 * referentie; het inkomen is dat wat de gebruiker beter weet.
 */
export function cohortExpensesFromIncome(monthlyIncome: number, savingsRatePct: number): number {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return 0
  const rate = Number.isFinite(savingsRatePct) ? Math.min(100, Math.max(0, savingsRatePct)) : 0
  return roundToStep(monthlyIncome * (1 - rate / 100))
}
