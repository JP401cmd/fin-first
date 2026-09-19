/**
 * "Je cijfers rusten op wat je zelf invulde" — de uitnodiging om de grondslag op
 * budgetten te laten rusten (W-009, deel 2).
 *
 * WAAROM DIT BERICHT BESTAAT. De onboarding zet `income_source`/`expenses_source` op
 * `'manual'` zodra iemand zelf bedragen typt (app/api/onboarding/save-own-data). En
 * `'manual'` wint over álles: `resolveAmountWithBasis` geeft dan altijd het profielbedrag
 * terug (lib/effective-financials.ts). Wie later budgetten aanmaakt, ziet die dus nooit
 * terug in zijn spaarquote, gezondheidsgetal of vrijheidsdatum — zonder dat iets dat zegt.
 * `'auto'` en `'estimate'` hebben dit probleem NIET: daar verdringt de budget- of
 * transactiebasis het profielbedrag vanzelf. Een uitnodiging aan die groep zou iets
 * beschrijven dat al gebeurd is, en dat is de harde voorwaarde hieronder.
 *
 * TOON (Wft, merkstem). Beschrijvend, geen oordeel: we zeggen waar de cijfers nu op
 * rusten en wat er te kiezen valt. Nooit "aanbevolen" of "beter" — het gaat over de
 * herkomst van getallen, niet over een productkeuze.
 *
 * Pure beslislogica; gewired in `app/api/notifications/route.ts` (sectie 4d), met een
 * `app_settings`-marker (`grondslag_budget_last_sent_<uid>`) zodat de uitnodiging
 * hooguit één keer per kalenderjaar terugkomt voor wie bewust handmatig blijft.
 */

export interface GrondslagBudgetInput {
  /** `profiles.income_source` zoals opgeslagen (`auto` | `budget` | `transaction` | `manual` | `estimate`). */
  incomeSource: string | null | undefined
  /** `profiles.expenses_source`, idem. */
  expensesSource: string | null | undefined
  /** Heeft de gebruiker minstens één niet-gearchiveerd inkomsten-budget? */
  heeftInkomstenBudgetten: boolean
  /** Heeft de gebruiker minstens één niet-gearchiveerd uitgaven-budget? */
  heeftUitgavenBudgetten: boolean
  /** ISO-string van de laatste verzonden uitnodiging (of null/undefined). */
  lastSentAt: string | null | undefined
  /** Huidige tijd — injecteerbaar voor tests. Default: `new Date()`. */
  now?: Date
}

/** Welke kant(en) nu op eigen invoer staan terwijl er budgetten liggen. */
export type GrondslagKant = 'inkomen' | 'uitgaven' | 'beide'

export interface GrondslagBudgetUitkomst {
  kant: GrondslagKant
  title: string
  description: string
}

const KANT_ZIN: Record<GrondslagKant, string> = {
  inkomen: 'Je inkomen rust nu op een bedrag dat je zelf invulde',
  uitgaven: 'Je uitgaven rusten nu op een bedrag dat je zelf invulde',
  beide: 'Je inkomen en uitgaven rusten nu op bedragen die je zelf invulde',
}

/**
 * Bepaalt of de uitnodiging vandaag getoond mag worden, en over welke kant hij gaat.
 * `null` = niet tonen.
 *
 * Voorwaarden (alle moeten gelden):
 *  1. minstens één kant staat op `'manual'`;
 *  2. voor diezelfde kant bestaan er budgetten om op te rusten;
 *  3. er is in het lopende kalenderjaar nog geen uitnodiging verstuurd.
 */
export function beslisGrondslagBudget(input: GrondslagBudgetInput): GrondslagBudgetUitkomst | null {
  const inkomenHandmatig = input.incomeSource === 'manual' && input.heeftInkomstenBudgetten
  const uitgavenHandmatig = input.expensesSource === 'manual' && input.heeftUitgavenBudgetten
  if (!inkomenHandmatig && !uitgavenHandmatig) return null

  if (!magOpnieuw(input.lastSentAt, input.now ?? new Date())) return null

  const kant: GrondslagKant =
    inkomenHandmatig && uitgavenHandmatig ? 'beide' : inkomenHandmatig ? 'inkomen' : 'uitgaven'

  return {
    kant,
    title: 'Je spaarquote kan op je budgetten rusten',
    description:
      `${KANT_ZIN[kant]}. Je budgetten tellen daardoor niet mee voor je spaarquote en je ` +
      'vrijheidsdatum. Je kunt per kant kiezen waar het getal vandaan komt.',
  }
}

/** Hooguit één uitnodiging per kalenderjaar — zelfde ritme als de WOZ-/pensioenreminder. */
function magOpnieuw(lastSentAt: string | null | undefined, now: Date): boolean {
  if (!lastSentAt) return true
  const lastSent = new Date(lastSentAt)
  if (Number.isNaN(lastSent.getTime())) return true
  return lastSent.getUTCFullYear() < now.getUTCFullYear()
}

/**
 * Vaste velden van de melding. `title`/`description` komen uit `beslisGrondslagBudget`
 * (die hangen van de kant af); de caller bepaalt `id`, `createdAt` en `read`.
 */
export const GRONDSLAG_BUDGET_TEMPLATE = {
  type: 'grondslag' as const,
  priority: 4,
  icon: 'Scale',
  color: 'amber',
  actionUrl: '/overzicht/budget/transacties',
}
