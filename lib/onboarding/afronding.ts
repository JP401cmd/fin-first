/**
 * onboarding/afronding — de twee stappen ná het wegschrijven van de onboarding
 * (budget inrichten, bank koppelen).
 *
 * WAAROM ZE NA DE OPSLAG KOMEN. `POST /api/onboarding/save-own-data` wist bij
 * elke (her)opslag alle budgetten en cash-bezittingen van de gebruiker. Een
 * budget of bankkoppeling van vóór die opslag zou dus verdwijnen. Op het moment
 * dat deze stappen draaien staat `onboarding_completed` daarom al op `true`.
 *
 * WAAROM EEN MARKERING. Twee plekken sturen een voltooide gebruiker nu weg:
 * de bank-callback (naar het in-app succesvenster) en de onboarding-pagina zelf
 * (naar /dashboard). Zolang deze markering open staat keren beide terug naar de
 * onboarding — ook na de bank-omweg in hetzelfde tabblad of na het sluiten van
 * de app halverwege.
 *
 * WAAR. Onder één sleutel in `profiles.module_guide_state`, naast de
 * rondleiding-vlag (zelfde kolom, zelfde merge-discipline — zie
 * `withRondleidingPending`). Na afronding blijft de sleutel staan met
 * `stap: 'klaar'` en de uitkomst per stap, zodat zichtbaar blijft wat iemand
 * koos (en waarom een bankkoppeling werd overgeslagen).
 *
 * VERLOOPT. Een open markering telt maar {@link AFRONDING_GELDIG_MS}. Wie de
 * stappen laat liggen, komt daarna gewoon in de app; de welkomstgids neemt het
 * budget en de rekening dan over.
 */

export const ONBOARDING_AFRONDING_KEY = 'onboarding:afronding'

export const AFRONDING_GELDIG_MS = 24 * 60 * 60 * 1000

export type AfrondingOpenStap = 'budget' | 'bank'

export const BANK_SKIP_REDENEN = ['rondkijken', 'bank_ontbreekt', 'liever_niet'] as const
export type BankSkipReden = (typeof BANK_SKIP_REDENEN)[number]

export type BudgetUitkomst = 'opgeslagen' | 'overgeslagen'
export type BankUitkomst = 'gekoppeld' | { overgeslagen: BankSkipReden }

export interface AfrondingState {
  stap: AfrondingOpenStap | 'klaar'
  sinds: string
  budget?: BudgetUitkomst
  bank?: BankUitkomst
}

function asMap(current: unknown): Record<string, unknown> {
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {}
}

function readState(moduleGuideState: unknown): AfrondingState | null {
  const raw = asMap(moduleGuideState)[ONBOARDING_AFRONDING_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  if (s.stap !== 'budget' && s.stap !== 'bank' && s.stap !== 'klaar') return null
  if (typeof s.sinds !== 'string') return null
  return s as unknown as AfrondingState
}

/**
 * De open afrondingsstap, of `null` als er niets (meer) open staat: geen of
 * corrupte markering, al afgerond, of verlopen. Fail-safe richting `null` —
 * een gebruiker die onterecht in de app landt is een gemis, eentje die
 * onterecht naar de onboarding wordt teruggestuurd is een defect.
 */
export function readOpenAfronding(
  moduleGuideState: unknown,
  now: Date = new Date(),
): AfrondingOpenStap | null {
  const state = readState(moduleGuideState)
  if (!state || state.stap === 'klaar') return null
  const sinds = Date.parse(state.sinds)
  if (Number.isNaN(sinds) || now.getTime() - sinds > AFRONDING_GELDIG_MS) return null
  return state.stap
}

/** Opent de markering op de budgetstap, zonder andere sleutels aan te raken. */
export function withAfrondingOpen(
  current: unknown,
  now: Date = new Date(),
): Record<string, unknown> {
  const state: AfrondingState = { stap: 'budget', sinds: now.toISOString() }
  return { ...asMap(current), [ONBOARDING_AFRONDING_KEY]: state }
}

export type AfrondingVoortgang =
  | { stap: 'bank'; budget: BudgetUitkomst }
  | { stap: 'klaar'; bank: BankUitkomst }

/**
 * Zet de markering een stap verder. `sinds` blijft staan: de geldigheid telt
 * vanaf de onboarding-opslag, niet vanaf de laatste klik.
 */
export function withAfrondingVoortgang(
  current: unknown,
  voortgang: AfrondingVoortgang,
  now: Date = new Date(),
): Record<string, unknown> {
  const map = asMap(current)
  const vorige = readState(map)
  const next: AfrondingState = {
    ...(vorige ?? {}),
    sinds: vorige?.sinds ?? now.toISOString(),
    ...voortgang,
  }
  return { ...map, [ONBOARDING_AFRONDING_KEY]: next }
}
