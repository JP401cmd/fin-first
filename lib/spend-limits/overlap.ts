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
 *    (sleutel/budget), nooit naar rijen. Daarom is ze goedkoop, deterministisch
 *    en volledig te unit-testen.
 *
 * ── WAAROM PER REGELSOORT EN NIET KRUISELINGS ───────────────────────────────
 * Een tegenpartij-regel en een budget-regel kunnen in de praktijk dezelfde
 * transactie zien, maar dát is alleen vast te stellen uit transactiedata (welke
 * boeking hangt aan welk budget). Een uitspraak daarover zou een gok zijn, en
 * een gokkende waarschuwing is erger dan geen waarschuwing. Overlap wordt
 * daarom uitsluitend binnen dezelfde regelsoort vastgesteld, waar ze exact
 * afleidbaar is.
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
 * `min(2)` op het label in `SpendLimitInputSchema` — de pot die de gebruiker
 * straks opslaat kent dezelfde ondergrens.
 */
export const SPEND_LIMIT_MIN_MATCH_KEY_LENGTH = 2

/** De regel die de gebruiker aan het samenstellen is (nog niet opgeslagen). */
export type SpendLimitOverlapCandidate =
  | {
      ruleType: 'counterparty'
      /** Rauw label óf genormaliseerde sleutel — er wordt hier altijd genormaliseerd. */
      counterpartyKey: string | null | undefined
      /** Id bij het BEWERKEN van een bestaande pot; die pot overlapt nooit met zichzelf. */
      id?: string | null
    }
  | {
      ruleType: 'budget'
      budgetId: string
      includeChildBudgets: boolean
      id?: string | null
    }

/** Een bestaande pot, teruggebracht tot wat voor de vergelijking nodig is. */
export interface SpendLimitOverlapSubject {
  id: string
  name: string
  ruleType: SpendLimitRuleType
  /** Gepauzeerde potten tellen nu niets, maar bestaan nog — de aanroeper mag het zeggen. */
  isActive: boolean
  counterpartyKey?: string | null
  budgetId?: string | null
  includeChildBudgets?: boolean | null
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
 * Het budget zelf plus — als de regel kinderen meetelt — al zijn afstammelingen.
 *
 * Transitief (kleinkinderen tellen mee) en met een bezocht-set tegen een
 * cyclische `parent_id`-keten. Dit is de pure tweelingbroer van `collectBudgetIds`
 * in lib/spend-limits/loader.ts; die is module-privé en de loader is server-only,
 * dus hier staat dezelfde boomwandeling zonder Supabase-afhankelijkheid. Wijzig
 * je de ene, kijk dan naar de andere — het is dezelfde regel.
 */
function collectBudgetSubtree(
  rootId: string,
  includeChildren: boolean,
  childrenByParent: ReadonlyMap<string, string[]>,
): Set<string> {
  const ids = new Set<string>([rootId])
  if (!includeChildren) return ids
  const queue: string[] = [rootId]
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
 * transactie te lezen.
 *
 * BUDGET: elke regel dekt een verzameling budget-ids (het gekozen budget plus,
 * bij `includeChildBudgets`, zijn hele subboom). Overlap = die twee verzamelingen
 * snijden. Dat is preciezer dan "voorouder of afstammeling" op zichzelf: een
 * bestaande pot op een hoofdbudget ZONDER kinderen ziet de boekingen van een
 * subbudget niet, en zou anders een overlap melden die er niet is — precies de
 * valse waarschuwing die het vertrouwen in de preview zou ondermijnen.
 *
 * @param childrenByParent budget-id → directe kind-ids. Leeg meegeven is
 *        toegestaan (dan blijft alleen exact-hetzelfde-budget over).
 */
export function findOverlappingLimits(
  candidate: SpendLimitOverlapCandidate,
  existingLimits: readonly SpendLimitOverlapSubject[],
  childrenByParent: ReadonlyMap<string, string[]> = new Map(),
): SpendLimitOverlap[] {
  const hits: SpendLimitOverlap[] = []

  if (candidate.ruleType === 'counterparty') {
    const key = spendLimitCounterpartyKey(candidate.counterpartyKey)
    if (key.length < SPEND_LIMIT_MIN_MATCH_KEY_LENGTH) return hits

    for (const other of existingLimits) {
      if (other.id === candidate.id) continue
      if (other.ruleType !== 'counterparty') continue
      const otherKey = spendLimitCounterpartyKey(other.counterpartyKey)
      if (otherKey.length === 0) continue
      if (!key.includes(otherKey) && !otherKey.includes(key)) continue
      hits.push({
        id: other.id,
        name: other.name,
        ruleType: other.ruleType,
        isActive: other.isActive,
        reason: 'counterparty_key_substring',
      })
    }
    return hits
  }

  const candidateIds = collectBudgetSubtree(
    candidate.budgetId,
    candidate.includeChildBudgets,
    childrenByParent,
  )

  for (const other of existingLimits) {
    if (other.id === candidate.id) continue
    if (other.ruleType !== 'budget') continue
    if (!other.budgetId) continue

    const otherIds = collectBudgetSubtree(
      other.budgetId,
      other.includeChildBudgets === true,
      childrenByParent,
    )
    if (!firstIntersection(candidateIds, otherIds)) continue

    // Volgorde van de takken is betekenisvol: "hetzelfde budget" wint van een
    // boomrelatie, anders zou een pot op hetzelfde budget met kinderen aan als
    // 'afstammeling' worden uitgelegd.
    const reason: SpendLimitOverlapReason =
      other.budgetId === candidate.budgetId
        ? 'same_budget'
        : otherIds.has(candidate.budgetId)
          ? 'budget_ancestor'
          : 'budget_descendant'

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
