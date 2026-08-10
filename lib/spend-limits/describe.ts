/**
 * De REGEL IN GEWONE TAAL — puur, geen React, geen Supabase.
 *
 * ── WAAROM DIT ÉÉN EIGENAAR HEEFT ──────────────────────────────────────────
 * "Waar geldt deze grens voor?" wordt op vier plekken beantwoord: de kaart in de
 * sectie, de prestatieweergave, de widget-tooltip en de meldingentekst. Zolang
 * een pot precies één budget óf één tegenpartij was, paste dat antwoord in één
 * regel code en stond het gewoon drie keer los. Met meerdere regels, meerdere
 * waarden per dimensie én een EN-combinatie erbij is het een echte formulering
 * geworden — en drie losse formuleringen zouden gegarandeerd uiteenlopen zodra
 * er een geval bijkomt.
 *
 * ── DE TAAL VOLGT DE LOGICA, LETTERLIJK ────────────────────────────────────
 * Binnen een dimensie is de logica OF, dus staat er "of" tussen de waarden:
 * "Uitgaven in Boodschappen of Horeca". Tussen de dimensies is de logica EN, en
 * dat wordt het voorzetsel "bij": "Uitgaven in Boodschappen bij Gorillas of
 * Getir" — beide voorwaarden gelden. Er staat bewust nergens "en/of": dat leest
 * als een keuze die de gebruiker nog moet maken, terwijl het model die keuze niet
 * kent.
 *
 * Er wordt hier geen enkel bedrag genoemd of berekend. Dit is uitleg over de
 * regel; het getal komt uit `SpendLimitReport` en heeft zijn eigen eigenaar.
 */

import type { SpendLimitConfig, SpendLimitRuleConfig } from './types'

/** Wat er staat als een budget-verwijzing nergens meer naartoe wijst. */
const MISSING_BUDGET = 'een budget dat niet meer beschikbaar is'

/**
 * Nederlandse opsomming met een gekozen laatste voegwoord.
 *
 * `of` bij een OF-lijst (de dimensie-logica), niet "en": "Boodschappen en
 * Horeca" zou suggereren dat een transactie aan beide moet hangen, en dat kan
 * per definitie niet — een transactie heeft één budget.
 */
function joinWith(parts: readonly string[], conjunction: 'of' | 'en'): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`
}

/** De namen van de budgetten in deze regel, met de nette tekst voor een weg budget. */
export function ruleBudgetNames(rule: SpendLimitRuleConfig): string[] {
  return rule.budgets.map((b) => b.name ?? MISSING_BUDGET)
}

/** De labels van de tegenpartijen in deze regel; de sleutel is de terugval. */
export function ruleCounterpartyLabels(rule: SpendLimitRuleConfig): string[] {
  return rule.counterparties.map((c) => c.label || c.key)
}

/**
 * Eén regel in één zin.
 *
 * Een regel zonder enige dimensie kan via de API niet ontstaan (zowel het
 * zod-schema als de CHECK `spend_limit_rules_not_empty` sluiten het uit), maar
 * deze functie krijgt ook formulierstaat te zien die nog half ingevuld is. Die
 * krijgt daarom een eerlijke, niet-alarmerende tekst in plaats van een lege zin.
 */
export function describeRule(rule: SpendLimitRuleConfig): string {
  const budgets = ruleBudgetNames(rule)
  const counterparties = ruleCounterpartyLabels(rule)

  if (budgets.length === 0 && counterparties.length === 0) {
    return 'Nog geen budget of tegenpartij gekozen'
  }

  // De subbudget-toevoeging hoort bij de BUDGET-dimensie en staat er dus alleen
  // als die dimensie gevuld is — en alleen als hij daadwerkelijk aan staat.
  const subbudgets = budgets.length > 0 && rule.includeChildBudgets ? ' (inclusief subbudgetten)' : ''

  if (counterparties.length === 0) {
    return `Uitgaven in ${joinWith(budgets, 'of')}${subbudgets}`
  }
  if (budgets.length === 0) {
    return `Uitgaven bij ${joinWith(counterparties, 'of')}`
  }
  return `Uitgaven in ${joinWith(budgets, 'of')}${subbudgets} bij ${joinWith(counterparties, 'of')}`
}

/** Eén zin per regel, in de volgorde waarin de gebruiker ze heeft gezet. */
export function describeRules(config: SpendLimitConfig): string[] {
  return config.rules.map(describeRule)
}

/**
 * De regels van een pot in één regel tekst, voor plekken waar maar één zin past
 * (de kaart, een tooltip).
 *
 * Bij meer dan één regel wordt de eerste getoond met een telling erachter, niet
 * alle regels achter elkaar geplakt: drie regels achter elkaar is geen zin meer
 * en zou de kaart laten uitlopen. Wie het volledige beeld wil, opent de
 * prestatieweergave — daar staat elke regel apart.
 */
export function describeLimitShort(config: SpendLimitConfig): string {
  if (config.rules.length === 0) return 'Nog geen regel ingesteld'
  const first = describeRule(config.rules[0])
  if (config.rules.length === 1) return first
  const rest = config.rules.length - 1
  return `${first} · en nog ${rest} regel${rest === 1 ? '' : 's'}`
}

/**
 * De budget-verwijzingen die aandacht vragen, over alle regels heen.
 *
 * TWEE gebeurtenissen, twee lijsten (AC-B1-02) — ze samenvatten tot één "niet
 * meer beschikbaar" zou het archiveren van een budget als dataverlies laten
 * klinken terwijl er niets kwijt is:
 *
 *  - `missingCount` ⇒ het budget bestaat niet meer. Die verwijzing kan
 *    structureel niets meer tellen; daar moet de gebruiker iets aan doen.
 *  - `archivedNames` ⇒ het budget bestaat nog, maar wordt niet meer gebruikt.
 *    Historie en reeks kloppen; er komt alleen waarschijnlijk niets nieuws bij.
 *
 * Namen worden ontdubbeld: hetzelfde budget in twee regels is één boodschap.
 */
export function budgetAttention(config: SpendLimitConfig): {
  missingCount: number
  archivedNames: string[]
} {
  let missingCount = 0
  const archived = new Set<string>()
  for (const rule of config.rules) {
    for (const b of rule.budgets) {
      if (b.name === null) missingCount += 1
      else if (b.archived) archived.add(b.name)
    }
  }
  return { missingCount, archivedNames: [...archived].sort() }
}
