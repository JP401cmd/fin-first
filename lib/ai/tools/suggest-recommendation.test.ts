import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSuggestRecommendationTool } from './suggest-recommendation'

/**
 * Unit-tests voor suggestRecommendation — Fin's chat-tool die ÉÉN voorstel
 * persistent opslaat in de recommendations-tabel (status='pending') zodat
 * de chat-card vervolgens accepteren/uitstellen/afwijzen-knoppen kan
 * weergeven met een echt recommendation-id om naar te PATCHen.
 *
 * Mocken: SupabaseClient met een ketenbare insert→select→single API.
 */

type MockSingleResult = { data: unknown; error: unknown }
type MockChain = {
  insert: (row: unknown) => MockChain
  select: (cols: string) => MockChain
  single: () => Promise<MockSingleResult>
}

function makeSupabaseMock(singleResult: MockSingleResult, capture: { insert?: Record<string, unknown> }) {
  const chain: MockChain = {
    insert(row: unknown) {
      capture.insert = row as Record<string, unknown>
      return chain
    },
    select() {
      return chain
    },
    single() {
      return Promise.resolve(singleResult)
    },
  }
  return {
    from: vi.fn(() => chain),
  } as unknown as Parameters<typeof createSuggestRecommendationTool>[0]
}

const SAMPLE_INPUT = {
  title: 'Versnel hypotheekaflossing met 10%',
  description: 'Door €120/mnd extra af te lossen verschuif je je vrijheidsmoment met ruim een half jaar.',
  recommendation_type: 'debt_acceleration' as const,
  euro_impact_monthly: -120,
  euro_impact_yearly: -1440,
  freedom_days_per_year: 18,
  priority_score: 4 as const,
  suggested_actions: [
    {
      title: 'Pas automatische incasso aan met +€120/mnd',
      description: 'Wijzig in bank-app naar nieuwe maandbedrag',
      freedom_days_impact: 18,
      euro_impact_monthly: -120,
    },
  ],
}

const SAMPLE_DB_ROW = {
  id: 'rec-uuid-1',
  title: SAMPLE_INPUT.title,
  description: SAMPLE_INPUT.description,
  recommendation_type: SAMPLE_INPUT.recommendation_type,
  euro_impact_monthly: SAMPLE_INPUT.euro_impact_monthly,
  euro_impact_yearly: SAMPLE_INPUT.euro_impact_yearly,
  freedom_days_per_year: SAMPLE_INPUT.freedom_days_per_year,
  priority_score: SAMPLE_INPUT.priority_score,
  suggested_actions: SAMPLE_INPUT.suggested_actions,
  status: 'pending',
}

async function executeTool(
  tool: ReturnType<typeof createSuggestRecommendationTool>,
  input: typeof SAMPLE_INPUT,
) {
  // ai-sdk tool execute heeft een ToolCallOptions tweede argument; we
  // geven een minimaal stub met alleen de velden die de tool niet leest.
  return await tool.execute!(input, {
    toolCallId: 'test-call',
    messages: [],
  })
}

describe('suggestRecommendation', () => {
  let capture: { insert?: Record<string, unknown> }

  beforeEach(() => {
    capture = {}
  })

  it('inserts pending recommendation with the provided fields', async () => {
    const supabase = makeSupabaseMock({ data: SAMPLE_DB_ROW, error: null }, capture)
    const tool = createSuggestRecommendationTool(supabase, 'user-123')

    await executeTool(tool, SAMPLE_INPUT)

    expect(capture.insert).toMatchObject({
      user_id: 'user-123',
      title: SAMPLE_INPUT.title,
      description: SAMPLE_INPUT.description,
      recommendation_type: 'debt_acceleration',
      euro_impact_monthly: -120,
      euro_impact_yearly: -1440,
      freedom_days_per_year: 18,
      priority_score: 4,
      status: 'pending',
      suggested_actions: SAMPLE_INPUT.suggested_actions,
    })
    // created_at + updated_at zijn ISO-strings die we niet vastpinnen
    expect(typeof capture.insert!.created_at).toBe('string')
    expect(typeof capture.insert!.updated_at).toBe('string')
  })

  it('returns the recommendation row shape for the chat card', async () => {
    const supabase = makeSupabaseMock({ data: SAMPLE_DB_ROW, error: null }, capture)
    const tool = createSuggestRecommendationTool(supabase, 'user-123')

    const result = await executeTool(tool, SAMPLE_INPUT)

    expect(result).toEqual({
      id: 'rec-uuid-1',
      title: SAMPLE_INPUT.title,
      description: SAMPLE_INPUT.description,
      recommendation_type: 'debt_acceleration',
      euro_impact_monthly: -120,
      euro_impact_yearly: -1440,
      freedom_days_per_year: 18,
      priority_score: 4,
      suggested_actions: SAMPLE_INPUT.suggested_actions,
    })
  })

  it('defaults priority_score to 3 when omitted', async () => {
    const supabase = makeSupabaseMock(
      { data: { ...SAMPLE_DB_ROW, priority_score: 3 }, error: null },
      capture,
    )
    const tool = createSuggestRecommendationTool(supabase, 'user-123')

    const { priority_score, ...rest } = SAMPLE_INPUT
    void priority_score
    await executeTool(tool, rest as typeof SAMPLE_INPUT)

    expect(capture.insert!.priority_score).toBe(3)
  })

  it('returns an error payload when insert fails', async () => {
    const supabase = makeSupabaseMock(
      { data: null, error: { message: 'rls violation' } },
      capture,
    )
    const tool = createSuggestRecommendationTool(supabase, 'user-123')

    const result = await executeTool(tool, SAMPLE_INPUT)

    expect(result).toEqual({
      error: true,
      message: 'Voorstel kon niet worden opgeslagen.',
    })
  })

  it('coerces optional money fields to null when omitted', async () => {
    const supabase = makeSupabaseMock({ data: SAMPLE_DB_ROW, error: null }, capture)
    const tool = createSuggestRecommendationTool(supabase, 'user-123')

    const input = { ...SAMPLE_INPUT }
    delete (input as Partial<typeof SAMPLE_INPUT>).euro_impact_monthly
    delete (input as Partial<typeof SAMPLE_INPUT>).euro_impact_yearly

    await executeTool(tool, input)

    expect(capture.insert!.euro_impact_monthly).toBeNull()
    expect(capture.insert!.euro_impact_yearly).toBeNull()
  })
})

/**
 * Wft-grendel op het tool-schema (kaart UR3-03, bevinding #3): "Beleg
 * € 50.000 via je Meesman-portefeuille" glipte door de tipkaart-tool heen
 * omdat title/description volledig vrije tekst waren. `tool.inputSchema` is
 * de identity-wrapped zod-schema (ai-sdk's `tool()` retourneert 'm ongewijzigd
 * — geverifieerd tegen @ai-sdk/provider-utils), dus we toetsen 'm hier direct
 * met safeParse, zonder de execute-laag/Supabase-mock nodig te hebben.
 */
describe('suggestRecommendation — Wft-grendel op tip-tekst', () => {
  const supabase = makeSupabaseMock({ data: SAMPLE_DB_ROW, error: null }, {})
  const tool = createSuggestRecommendationTool(supabase, 'user-123')

  function parse(overrides: Partial<typeof SAMPLE_INPUT>) {
    return (tool.inputSchema as { safeParse: (v: unknown) => { success: boolean } }).safeParse({
      ...SAMPLE_INPUT,
      ...overrides,
    })
  }

  it('accepteert de normale, beschrijvende voorbeeld-tip', () => {
    expect(parse({}).success).toBe(true)
  })

  it('weigert een productnaam in de titel', () => {
    const result = parse({ title: 'Beleg via je Meesman-portefeuille' })
    expect(result.success).toBe(false)
  })

  it('weigert een bedrag als opdracht in de description (de live bevinding)', () => {
    const result = parse({ description: 'Beleg € 50.000 via je Meesman-portefeuille voor meer rendement.' })
    expect(result.success).toBe(false)
  })

  it('weigert dezelfde formulering in een suggested_action', () => {
    const result = parse({
      suggested_actions: [
        {
          title: 'Stort €12.000 in een lijfrente',
          description: 'Via DeGiro',
          freedom_days_impact: 10,
          euro_impact_monthly: -1000,
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
