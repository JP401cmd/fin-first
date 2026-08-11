/**
 * Unit-tests voor de criterium→query-laag van transactie-bulkbewerken.
 *
 * Het zwaartepunt ligt op de ESCAPING (S4). Een `.or()`-expressie over twee
 * kolommen gebruikt `,` `.` `(` `)` als scheidingstekens en `%` `_` `*` als
 * LIKE-wildcards; een onbehandelde zoekterm kan dus de expressie openbreken of
 * álles matchen. Die verzameling gaat vervolgens onherroepelijk een
 * `bulk-delete` in — dit is een blast-radius-control, geen cosmetica.
 */
import { describe, it, expect } from 'vitest'
import {
  escapeSearchTerm,
  escapeLikePattern,
  buildSearchTextFilter,
  applyTransactionSearchCriteria,
  type TransactionFilterBuilder,
} from './search-query'
import { SEARCH_TERM_MAX_LENGTH } from './bulk-contract'

type Op = [string, ...unknown[]]

/** Fake-builder die alleen registreert wélke filters zijn aangebracht. */
function makeBuilder(): { builder: TransactionFilterBuilder; ops: Op[] } {
  const ops: Op[] = []
  const builder: TransactionFilterBuilder = {
    eq: (c, v) => (ops.push(['eq', c, v]), builder),
    in: (c, v) => (ops.push(['in', c, v]), builder),
    is: (c, v) => (ops.push(['is', c, v]), builder),
    or: (f) => (ops.push(['or', f]), builder),
    gt: (c, v) => (ops.push(['gt', c, v]), builder),
    lt: (c, v) => (ops.push(['lt', c, v]), builder),
    gte: (c, v) => (ops.push(['gte', c, v]), builder),
    lte: (c, v) => (ops.push(['lte', c, v]), builder),
  }
  return { builder, ops }
}

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

/**
 * `escapeLikePattern` beschermt een `.ilike(kolom, tekst)` waarin de tekst
 * LETTERLIJK moet matchen: het vervangen van een regelwaarde, de retroactieve
 * update op een tegenpartij.
 *
 * De scherpste casus is de regel-delete: `.delete().ilike('match_value', '%')`
 * wist ÁLLE `category_corrections` van een gebruiker, met "Regel opgeslagen" als
 * terugkoppeling. Dat is geen theoretisch geval — `%` is één toetsaanslag in een
 * zoekveld waarvan de waarde het regelaanbod voedt.
 */
describe('escapeLikePattern', () => {
  it('maakt van een joker een letterlijk teken', () => {
    expect(escapeLikePattern('%')).toBe('\\%')
    expect(escapeLikePattern('_')).toBe('\\_')
    expect(escapeLikePattern('50% korting')).toBe('50\\% korting')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
  })

  it('escapet de backslash zelf, anders is de escape zelf de achterdeur', () => {
    expect(escapeLikePattern('a\\%b')).toBe('a\\\\\\%b')
  })

  it('degradeert `*` tot één-teken-joker (PostgREST vertaalt `*` altijd naar `%`)', () => {
    // Escapen helpt hier niet: PostgREST vervangt `*` onvoorwaardelijk, ook
    // achter een backslash. Eén teken speling is de kleinste rest.
    expect(escapeLikePattern('a*b')).toBe('a_b')
  })

  it('laat gewone tekst met rust', () => {
    expect(escapeLikePattern('Albert Heijn')).toBe('Albert Heijn')
    expect(escapeLikePattern("O'Neill & Zn.")).toBe("O'Neill & Zn.")
  })
})

describe('escapeSearchTerm', () => {
  it('laat een gewone term ongemoeid', () => {
    expect(escapeSearchTerm('  Albert Heijn ')).toBe('Albert Heijn')
  })

  it('ontmantelt de LIKE-wildcards tot een enkel-teken-joker', () => {
    // Zonder deze behandeling zou een getypte `%` élke transactie matchen — en
    // dat is precies de te-brede-selectie waar ADR 0104 tegen beschermt.
    expect(escapeSearchTerm('%')).toBe('_')
    expect(escapeSearchTerm('50% korting')).toBe('50_ korting')
    expect(escapeSearchTerm('a*b_c%d')).toBe('a_b_c_d')
  })

  it('verwijdert de tekens die de PostgREST-quoting kunnen sluiten', () => {
    expect(escapeSearchTerm('a"b\\c')).toBe('abc')
  })

  it('geeft null bij leeg of alleen witruimte — een lege zoekterm is geen fout (F5)', () => {
    expect(escapeSearchTerm('')).toBeNull()
    expect(escapeSearchTerm('   ')).toBeNull()
    expect(escapeSearchTerm(undefined)).toBeNull()
    expect(escapeSearchTerm('""')).toBeNull()
  })

  it('begrenst de lengte op SEARCH_TERM_MAX_LENGTH', () => {
    const long = 'x'.repeat(SEARCH_TERM_MAX_LENGTH + 50)
    expect(escapeSearchTerm(long)).toHaveLength(SEARCH_TERM_MAX_LENGTH)
  })
})

describe('buildSearchTextFilter', () => {
  it('bouwt één or-expressie over beide kolommen, met de waarde gequote', () => {
    expect(buildSearchTextFilter('Jumbo')).toBe(
      'description.ilike."%Jumbo%",counterparty_name.ilike."%Jumbo%"',
    )
  })

  it('houdt komma’s en haakjes binnen de quotes — de expressie blijft twee takken', () => {
    const filter = buildSearchTextFilter('AH, Zwolle (centrum)')!
    // Precies twee `ilike`-takken: een injectiepoging zou er een derde opleveren.
    expect(filter.match(/ilike/g)).toHaveLength(2)
    expect(filter).toBe(
      'description.ilike."%AH, Zwolle (centrum)%",counterparty_name.ilike."%AH, Zwolle (centrum)%"',
    )
  })

  it('kan geen extra tak toevoegen via een afgesloten quote', () => {
    // De poging: de quote sluiten en er een match-alles-tak naast hangen. De
    // `"` sneuvelt, de `%` wordt `_`, en de hele poging blijft één waarde binnen
    // de quotes van de twee bestaande takken.
    const filter = buildSearchTextFilter('x",description.ilike."%')!
    expect(filter).toBe(
      'description.ilike."%x,description.ilike._%",counterparty_name.ilike."%x,description.ilike._%"',
    )
    // Precies twee quote-paren: die van ONZE twee takken. Elke extra quote zou
    // betekenen dat de invoer er zelf één heeft weten toe te voegen.
    expect(filter.match(/"/g)).toHaveLength(4)
  })

  it('is null zonder tekstfilter', () => {
    expect(buildSearchTextFilter('  ')).toBeNull()
  })
})

describe('applyTransactionSearchCriteria', () => {
  it('zet ALTIJD .eq(user_id) — RLS is hier bewust breder dan wat we mogen muteren', () => {
    const { builder, ops } = makeBuilder()
    applyTransactionSearchCriteria(builder, {}, 'user-1')
    expect(ops).toEqual([['eq', 'user_id', 'user-1']])
  })

  it('brengt de vrije tekst als or-expressie aan', () => {
    const { builder, ops } = makeBuilder()
    applyTransactionSearchCriteria(builder, { q: 'Notaris' }, 'user-1')
    expect(ops).toContainEqual([
      'or',
      'description.ilike."%Notaris%",counterparty_name.ilike."%Notaris%"',
    ])
  })

  it('zeeft niet-UUID-waarden uit de rekening- en budgetfilters', () => {
    const { builder, ops } = makeBuilder()
    applyTransactionSearchCriteria(
      builder,
      { accountIds: [UUID_A, 'niet-een-uuid)'], budgetIds: [UUID_B, 'x,y'] },
      'user-1',
    )
    expect(ops).toContainEqual(['in', 'account_id', [UUID_A]])
    expect(ops).toContainEqual(['in', 'budget_id', [UUID_B]])
  })

  it('vertaalt "zonder budget" naar .is(null), en gemengd naar één or', () => {
    const alleen = makeBuilder()
    applyTransactionSearchCriteria(alleen.builder, { budgetIds: [null] }, 'u')
    expect(alleen.ops).toContainEqual(['is', 'budget_id', null])

    const gemengd = makeBuilder()
    applyTransactionSearchCriteria(gemengd.builder, { budgetIds: [null, UUID_A] }, 'u')
    expect(gemengd.ops).toContainEqual(['or', `budget_id.is.null,budget_id.in.(${UUID_A})`])
  })

  it('vertaalt richting naar het teken van het bedrag', () => {
    const uit = makeBuilder()
    applyTransactionSearchCriteria(uit.builder, { direction: 'expense' }, 'u')
    expect(uit.ops).toContainEqual(['lt', 'amount', 0])

    const inkomst = makeBuilder()
    applyTransactionSearchCriteria(inkomst.builder, { direction: 'income' }, 'u')
    expect(inkomst.ops).toContainEqual(['gt', 'amount', 0])
  })

  it('past het bedragfilter ABSOLUUT toe — een band voor het maximum, een or voor het minimum', () => {
    const { builder, ops } = makeBuilder()
    applyTransactionSearchCriteria(builder, { amountMin: 25, amountMax: 100 }, 'u')
    expect(ops).toContainEqual(['gte', 'amount', -100])
    expect(ops).toContainEqual(['lte', 'amount', 100])
    expect(ops).toContainEqual(['or', 'amount.gte.25.00,amount.lte.-25.00'])
  })

  it('slaat een nul-ondergrens over (dat filter zou alles matchen)', () => {
    const { builder, ops } = makeBuilder()
    applyTransactionSearchCriteria(builder, { amountMin: 0 }, 'u')
    expect(ops.filter(([op]) => op === 'or')).toHaveLength(0)
  })

  it('negeert een datum die niet ISO is', () => {
    const { builder, ops } = makeBuilder()
    applyTransactionSearchCriteria(builder, { dateFrom: '2026-01-01', dateTo: '01-02-2026' }, 'u')
    expect(ops).toContainEqual(['gte', 'date', '2026-01-01'])
    expect(ops.some(([op, col]) => op === 'lte' && col === 'date')).toBe(false)
  })
})
