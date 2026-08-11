// lib/transactions/rule-target.ts
//
// De ZUSTERREGEL van het canonieke trio (`transfer-marking.ts`), als pure
// functie: wáár hoort een blijvende regel te landen, en wanneer mag hij helemaal
// niet ontstaan.
//
// ## De regel in één zin
//
// Een verschuivingsdoel ("Eigen rekening") hoort in `user_own_ibans` en NOOIT in
// `category_corrections` — en elke regel die als lowercase substring blijft
// matchen heeft een minimale lengte.
//
// ## Waarom dit gedeeld moet zijn
//
// `transfer-marking.ts` beschrijft wat er op de TRANSACTIE geschreven wordt;
// dit bestand wat er op de REGEL geschreven wordt. Die twee horen bij elkaar,
// want ze delen dezelfde oorzaak: `isRealAggRow` kijkt uitsluitend naar
// `transaction_type`. Een budgetcorrectie zet alleen `budget_id`, dus een
// "Eigen rekening"-regel in `category_corrections` levert imports op die wél op
// de archive-post landen en tóch gewoon meetellen in inkomsten, uitgaven,
// spaarquote en FIRE-datum. Alleen de eigen-rekeningherkenning (priority 0 in
// `categorizeTransaction`) zet dat veld.
//
// Die afweging stond op DRIE plekken met net andere invulling
// (`lib/category-rules.ts`, `components/app/transaction-form.tsx`,
// `app/api/transactions/bulk-budget/regel/route.ts`), en die drift kostte precies
// wat drift kost: de bulkroute legde de ondergrens alleen op de
// `user_own_ibans`-tak, waardoor een zoekterm van één teken als
// `category_corrections`-regel weggeschreven kon worden.
//
// ## Waarom de ondergrens óók voor budgetregels geldt
//
// Een `description`-correctie matcht als SUBSTRING (`description.includes(needle)`,
// `lib/parsers/categorize.ts`) op priority 1 — vóór frequentie-, AI- en
// keyword-herkenning. Een regel op `"bp"` stuurt daarmee élke toekomstige import
// met "bp" ergens in de omschrijving naar één budget, en verschuift zo stil de
// spaarquote en de FIRE-datum. Dezelfde schade als een te kort naampatroon op
// `user_own_ibans`, dus dezelfde ondergrens.
//
// Bewust puur en zonder server-only imports: dit bestand wordt door een
// `'use client'`-component gelezen.

import { MIN_OWN_ACCOUNT_NAME_LENGTH, normalizeIban } from '@/lib/own-accounts'

/**
 * Ondergrens voor élke blijvende matchwaarde, in beide tabellen.
 *
 * Deliberaat DEZELFDE constante als de eigen-rekeningherkenning: het is niet
 * twee toevallig gelijke getallen maar één norm ("een substring van minder dan
 * dit stuurt te veel"), en twee losse constanten zouden na de eerste bijstelling
 * uiteenlopen.
 */
export const MIN_RULE_MATCH_LENGTH = MIN_OWN_ACCOUNT_NAME_LENGTH

export type RuleMatchField = 'counterparty_name' | 'description'

export type RuleTarget =
  | {
      table: 'user_own_ibans'
      matchType: 'iban' | 'name'
      /** IBAN genormaliseerd (geen spaties, uppercase); naam lowercase getrimd. */
      matchValue: string
      label: string | null
    }
  | {
      table: 'category_corrections'
      matchField: RuleMatchField
      /** Getrimd, verder ongewijzigd — de match zelf is case-insensitief. */
      matchValue: string
    }

export type RuleRejectionReason = 'empty' | 'too_short' | 'unsupported_match_field'

export interface RuleRejection {
  reason: RuleRejectionReason
  /** Client-veilige uitleg; de routes gebruiken 'm rechtstreeks als 400-tekst. */
  message: string
}

export type RulePlan = { target: RuleTarget } | { rejected: RuleRejection }

export function isRejected(plan: RulePlan): plan is { rejected: RuleRejection } {
  return 'rejected' in plan
}

/**
 * Bepaal waar een blijvende regel landt — of dat hij niet mag ontstaan.
 *
 * Een afwijzing kost de gebruiker nooit zijn actie: de transactie(s) worden
 * gewoon geboekt, alleen het te grove AUTOMATISME valt weg. Dat onderscheid is
 * de reden dat dit een aparte beslissing is en geen validatie op de mutatie.
 */
export function planRuleTarget(input: {
  /** Boekt de gebruiker op de "Eigen rekening"-post? */
  targetsEigenRekening: boolean
  matchField: RuleMatchField
  matchValue: string
  /** Tegenpartij-IBAN, als die bekend is. Ruwe vorm; wordt hier genormaliseerd. */
  counterpartyIban?: string | null
  /** Leesbaar label voor een `user_own_ibans`-regel; valt terug op de matchwaarde. */
  label?: string | null
}): RulePlan {
  const trimmed = input.matchValue.trim()
  const iban = input.counterpartyIban?.trim() ? normalizeIban(input.counterpartyIban) : null

  if (input.targetsEigenRekening) {
    // Een IBAN matcht exact en heeft dus geen ondergrens nodig — hij kan per
    // definitie niet "te veel" vangen.
    if (iban) {
      return {
        target: {
          table: 'user_own_ibans',
          matchType: 'iban',
          matchValue: iban,
          label: input.label ?? (trimmed || null),
        },
      }
    }
    // De eigen-rekeningherkenning matcht op tegenpartij (naam of IBAN), niet op
    // omschrijving. Een regel op `description` zou stil niets doen — dan liever
    // een eerlijke weigering dan een regel die de gebruiker denkt te hebben.
    if (input.matchField !== 'counterparty_name') {
      return {
        rejected: {
          reason: 'unsupported_match_field',
          message: 'Een regel voor Eigen rekening werkt op de tegenpartij, niet op de omschrijving.',
        },
      }
    }
    const name = trimmed.toLowerCase()
    if (name === '') return { rejected: { reason: 'empty', message: EMPTY_MESSAGE } }
    if (name.length < MIN_RULE_MATCH_LENGTH) {
      return { rejected: { reason: 'too_short', message: tooShortMessage() } }
    }
    return {
      target: {
        table: 'user_own_ibans',
        matchType: 'name',
        matchValue: name,
        label: input.label ?? trimmed,
      },
    }
  }

  if (trimmed === '') return { rejected: { reason: 'empty', message: EMPTY_MESSAGE } }
  if (trimmed.length < MIN_RULE_MATCH_LENGTH) {
    return { rejected: { reason: 'too_short', message: tooShortMessage() } }
  }
  return {
    target: { table: 'category_corrections', matchField: input.matchField, matchValue: trimmed },
  }
}

const EMPTY_MESSAGE = 'Een regel heeft een waarde nodig om op te matchen.'

function tooShortMessage(): string {
  return `Een regel moet minstens ${MIN_RULE_MATCH_LENGTH} tekens hebben, anders herkent hij te veel.`
}
