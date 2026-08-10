/**
 * REGEL-OVERLAP tussen grenzenpotten — puur, geen Supabase, geen React.
 *
 * ── WAT DIT WEL IS ──────────────────────────────────────────────────────────
 * Een OBSERVATIE op REGELNIVEAU: "de regel die je nu intikt kan dezelfde
 * uitgaven zien als deze bestaande pot(ten)". Meer niet.
 *
 * ── WAT DIT BEWUST NIET IS (ADR 0089 / D38) ─────────────────────────────────
 *  - Geen BEDRAG. Er wordt niets bij elkaar opgeteld en er komt geen tweede som
 *    naast de canonieke `SpendLimitReport` te staan. Zodra hier een euro in zou
 *    komen, bestaat er een tweede waarheid over dezelfde uitgave.
 *  - Geen PRIORITEIT, geen rangschikking op "erg". De uitkomst houdt de volgorde
 *    van de meegegeven lijst aan; er is geen sortering die suggereert dat de ene
 *    overlap zwaarder weegt dan de andere. Potten sluiten elkaar niet uit — een
 *    transactie mag in twee potten meetellen, dat is geen fout maar een keuze.
 *  - Geen TRANSACTIEDATA. De detectie kijkt uitsluitend naar de regels
 *    (sleutels/budgetten), nooit naar rijen. Daarom is ze goedkoop,
 *    deterministisch en volledig te unit-testen.
 *
 * ── WAAROM PER DIMENSIE EN NIET KRUISELINGS ─────────────────────────────────
 * Een tegenpartij-dimensie en een budget-dimensie kunnen in de praktijk dezelfde
 * transactie zien, maar dát is alleen vast te stellen uit transactiedata (welke
 * boeking hangt aan welk budget). Een uitspraak daarover zou een gok zijn, en een
 * gokkende waarschuwing is erger dan geen waarschuwing. Overlap wordt daarom
 * uitsluitend binnen dezelfde dimensie vastgesteld, waar ze exact afleidbaar is.
 *
 * ── DE EN-DIMENSIE MAAKT DE OBSERVATIE RUIMER, NIET SCHERPER ────────────────
 * Sinds een regel "budget X ÉN tegenpartij Y" kan zijn, is een gedeelde dimensie
 * niet meer hetzelfde als een gedeelde transactie: een pot op budget X ziet
 * strikt méér dan een pot op X-én-Y. De observatie blijft daarom bewust op
 * "KAN dezelfde uitgaven zien" staan en wordt niet verfijnd tot "ziet ze zeker".
 * Een preciezere claim zou transactiedata vergen — precies wat hier niet hoort.
 */

import { spendLimitCounterpartyKey } from './counterparty-key'
import type { SpendLimitRuleType } from './engine'

/**
 * Minimale lengte van een genormaliseerde tegenpartij-sleutel voordat er
 * zinnig over te matchen valt.
 *
 * ÉÉN HOME voor deze drempel: de preview-route gebruikt 'm voor haar expliciete
 * "te kort om te matchen"-uitkomst (AC-B3-03) en de overlap-detectie hieronder
 * als guard. De reden is dezelfde in beide gevallen: één teken matcht als
 * normalised-CONTAINS zo ongeveer alles, dus zowel de trefferlijst als de
 * overlap-observatie zou ruis zijn in plaats van informatie. Het spiegelt de
 * `min(2)` op elk label in `SpendLimitInputSchema` — de pot die de gebruiker
 * straks opslaat kent dezelfde ondergrens.
 */
export const SPEND_LIMIT_MIN_MATCH_KEY_LENGTH = 2

/** De regel die de gebruiker aan het samenstellen is (nog niet opgeslagen). */
export interface SpendLimitOverlapCandidate {
  /** Wortels; de subboom wordt hier opgerold als `includeChildBudgets` aan staat. */
  budgetIds: readonly string[]
  includeChildBudgets: boolean
  /** Rauwe labels óf genormaliseerde sleutels — er wordt hier altijd genormaliseerd. */
  counterpartyKeys: readonly (string | null | undefined)[]
  /** Id bij het BEWERKEN van een bestaande pot; die pot overlapt nooit met zichzelf. */
  id?: string | null
}

/** Eén regel van een bestaande pot, teruggebracht tot wat de vergelijking nodig heeft. */
export interface SpendLimitOverlapRule {
  budgetIds?: readonly string[] | null
  includeChildBudgets?: boolean | null
  counterpartyKeys?: readonly (string | null | undefined)[] | null
}

/** Een bestaande pot, teruggebracht tot wat voor de vergelijking nodig is. */
export interface SpendLimitOverlapSubject {
  id: string
  name: string
  ruleType: SpendLimitRuleType
  /** Gepauzeerde potten tellen nu niets, maar bestaan nog — de aanroeper mag het zeggen. */
  isActive: boolean
  rules: readonly SpendLimitOverlapRule[]
}

/**
 * Waaróm twee regels elkaar raken. Uitlegbaarheid zonder bedrag: de UI kan hier
 * een zin van maken ("hetzelfde budget", "een subbudget hiervan") in plaats van
 * een kale naam te tonen. Bewust geen ernst-gradatie.
 */
export type SpendLimitOverlapReason =
  /** De sleutels bevatten elkaar, dus elke naam die de één matcht matcht de ander ook. */
  | 'counterparty_key_substring'
  /** Exact hetzelfde budget. */
  | 'same_budget'
  /** De bestaande pot zit hoger in de boom en trekt het kandidaat-budget mee. */
  | 'budget_ancestor'
  /** De bestaande pot zit lager in de boom en wordt door de kandidaat meegetrokken. */
  | 'budget_descendant'

export interface SpendLimitOverlap {
  id: string
  name: string
  ruleType: SpendLimitRuleType
  isActive: boolean
  reason: SpendLimitOverlapReason
}

/**
 * De gekozen budgetten plus — als de regel kinderen meetelt — al hun
 * afstammelingen.
 *
 * Transitief (kleinkinderen tellen mee) en met een bezocht-set tegen een
 * cyclische `parent_id`-keten. Dit is de pure tweelingbroer van `collectBudgetIds`
 * in lib/spend-limits/loader.ts; die is server-only (Supabase-afhankelijk), dus
 * hier staat dezelfde boomwandeling zonder die afhankelijkheid. Wijzig je de ene,
 * kijk dan naar de andere — het is dezelfde regel.
 */
function collectBudgetSubtree(
  roots: readonly string[],
  includeChildren: boolean,
  childrenByParent: ReadonlyMap<string, string[]>,
): Set<string> {
  const ids = new Set<string>(roots)
  if (!includeChildren) return ids
  const queue: string[] = [...roots]
  while (queue.length > 0) {
    const parent = queue.shift() as string
    for (const child of childrenByParent.get(parent) ?? []) {
      if (ids.has(child)) continue
      ids.add(child)
      queue.push(child)
    }
  }
  return ids
}

/** De sleutels van een regel, genormaliseerd en ontdaan van te korte ruis. */
function usableKeys(raw: readonly (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = []
  for (const k of raw ?? []) {
    const key = spendLimitCounterpartyKey(k)
    if (key.length >= SPEND_LIMIT_MIN_MATCH_KEY_LENGTH) out.push(key)
  }
  return out
}

function firstIntersection(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const id of small) if (large.has(id)) return true
  return false
}

/**
 * Welke bestaande potten kunnen dezelfde uitgaven zien als deze kandidaat-regel?
 *
 * TEGENPARTIJ: de match is een normalised-CONTAINS op `counterparty_name` (zie
 * lib/spend-limits/counterparty-key.ts). Bevat sleutel A sleutel B als deeltekst,
 * dan matcht élke naam die B matcht per definitie ook A — de overlap is dus
 * wederzijdse deeltekst, in beide richtingen, en exact afleidbaar zonder één
 * transactie te lezen. Met meerdere sleutels per regel is het een OF-lijst: één
 * paar dat elkaar bevat volstaat.
 *
 * BUDGET: elke regel dekt een verzameling budget-ids (de gekozen budgetten plus,
 * bij `includeChildBudgets`, hun hele subboom). Overlap = die twee verzamelingen
 * snijden. Dat is preciezer dan "voorouder of afstammeling" op zichzelf: een
 * bestaande pot op een hoofdbudget ZONDER kinderen ziet de boekingen van een
 * subbudget niet, en zou anders een overlap melden die er niet is — precies de
 * valse waarschuwing die het vertrouwen in de preview zou ondermijnen.
 *
 * PER POT HOOGSTENS ÉÉN TREFFER. Een pot met vier regels die de kandidaat alle
 * vier raken, is nog steeds één pot om over te vertellen; vier keer dezelfde naam
 * in de zin zou als een fout lezen. De EERSTE reden wint, en de takken hieronder
 * staan in de volgorde die het meest specifiek uitlegt.
 *
 * @param childrenByParent budget-id → directe kind-ids. Leeg meegeven is
 *        toegestaan (dan blijft alleen exact-hetzelfde-budget over).
 */
export function findOverlappingLimits(
  candidate: SpendLimitOverlapCandidate,
  existingLimits: readonly SpendLimitOverlapSubject[],
  childrenByParent: ReadonlyMap<string, string[]> = new Map(),
): SpendLimitOverlap[] {
  const candidateKeys = usableKeys(candidate.counterpartyKeys)
  const candidateBudgetRoots = [...new Set(candidate.budgetIds)]
  const candidateBudgetIds = collectBudgetSubtree(
    candidateBudgetRoots,
    candidate.includeChildBudgets,
    childrenByParent,
  )

  const hits: SpendLimitOverlap[] = []

  for (const other of existingLimits) {
    if (other.id === candidate.id) continue

    const reason = firstOverlapReason(
      { keys: candidateKeys, budgetIds: candidateBudgetIds, budgetRoots: candidateBudgetRoots },
      other.rules,
      childrenByParent,
    )
    if (!reason) continue

    hits.push({
      id: other.id,
      name: other.name,
      ruleType: other.ruleType,
      isActive: other.isActive,
      reason,
    })
  }

  return hits
}

/** De eerste reden waarom een van de regels van deze pot de kandidaat raakt. */
function firstOverlapReason(
  candidate: { keys: string[]; budgetIds: Set<string>; budgetRoots: string[] },
  rules: readonly SpendLimitOverlapRule[],
  childrenByParent: ReadonlyMap<string, string[]>,
): SpendLimitOverlapReason | null {
  for (const rule of rules) {
    if (candidate.keys.length > 0) {
      for (const otherKey of usableKeys(rule.counterpartyKeys)) {
        for (const key of candidate.keys) {
          if (key.includes(otherKey) || otherKey.includes(key)) {
            return 'counterparty_key_substring'
          }
        }
      }
    }

    if (candidate.budgetIds.size === 0) continue
    const otherRoots = [...new Set(rule.budgetIds ?? [])]
    if (otherRoots.length === 0) continue

    const otherIds = collectBudgetSubtree(
      otherRoots,
      rule.includeChildBudgets === true,
      childrenByParent,
    )
    if (!firstIntersection(candidate.budgetIds, otherIds)) continue

    // Volgorde van de takken is betekenisvol: "hetzelfde budget" wint van een
    // boomrelatie, anders zou een pot op hetzelfde budget met kinderen aan als
    // 'afstammeling' worden uitgelegd.
    if (otherRoots.some((id) => candidate.budgetRoots.includes(id))) return 'same_budget'
    if (candidate.budgetRoots.some((id) => otherIds.has(id))) return 'budget_ancestor'
    return 'budget_descendant'
  }

  return null
}
