/**
 * Elke tool die Fin meekrijgt moet een input_schema hebben dat Anthropic accepteert.
 *
 * WAAROM DEZE SUITE BESTAAT (kaart 2026-09-02-WF-WILL-02-bug1): de Fin-chat viel op
 * 2 sep 2026 volledig uit — élke vraag op alle drie domeinen gaf `ai_stream_failed`,
 * ook een triviale vraag zónder tool-gebruik. Dat is precies het handtekeningsymptoom
 * van een ongeldig tool-schema: `app/api/ai/chat/route.ts` is de enige call-site met
 * `streamText` + `tools`, en Anthropic declareert de `input_schema`'s van ÁLLE tools
 * bij elke aanroep. Eén kapot schema breekt daarmee de hele chat, niet alleen de tool.
 *
 * De faalklasse staat sinds een eerder incident in onze eigen code beschreven
 * (`show-visualization.ts`): een `z.discriminatedUnion` serialiseert naar `anyOf`
 * zónder top-level `type`, waarop Anthropic antwoordt met
 * `tools.N.custom.input_schema.type: Field required`. Die kennis zat tot nu toe
 * alleen in een comment — een volgende tool (of een SDK-/zod-bump) kon 'm stil
 * opnieuw introduceren en de chat opnieuw platleggen.
 *
 * Deze suite draait volledig offline: geen provider, geen sleutel, geen netwerk. Ze
 * bewijst niet dát de chat werkt, maar wel dat de tool-declaratie de vorm heeft die
 * de provider eist — de enige helft van dat bewijs die je in vitest kunt vastleggen.
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatContext } from '@/lib/ai/dna'
import { getTools } from './index'

/** Een client die nooit wordt aangeroepen: de schema's worden niet uitgevoerd. */
const supabase = {} as SupabaseClient

/** Alle samenstellingen die `getTools` kan opleveren — elk gaat 1-op-1 naar de provider. */
const VARIANTEN: { naam: string; context?: ChatContext; userId?: string | null }[] = [
  { naam: 'hoofdchat, anoniem', userId: null },
  { naam: 'hoofdchat, ingelogd', userId: 'user-1' },
  { naam: 'gebeurtenis-pane', context: 'gebeurtenis', userId: 'user-1' },
]

describe('tool-input_schema — vorm die Anthropic accepteert', () => {
  it.each(VARIANTEN)('$naam: elk schema serialiseert naar een top-level object', ({ context, userId }) => {
    const tools = getTools('wil', supabase, context, userId)
    const namen = Object.keys(tools)
    expect(namen.length).toBeGreaterThan(0)

    for (const naam of namen) {
      const schema = (tools[naam] as { inputSchema?: unknown }).inputSchema
      expect(schema, `tool ${naam} heeft geen inputSchema`).toBeDefined()

      const json = z.toJSONSchema(schema as z.ZodType, { io: 'input' }) as Record<string, unknown>
      // DE eis uit de foutmelding: `input_schema.type: Field required`.
      expect(json.type, `tool ${naam}: input_schema.type ontbreekt of is geen "object"`).toBe('object')
      // Een top-level union serialiseert naar anyOf/oneOf — exact het patroon dat de
      // chat eerder brak. Vlak het schema af en valideer de variant in execute().
      expect(json.anyOf, `tool ${naam}: top-level anyOf (union) — vlak het schema af`).toBeUndefined()
      expect(json.oneOf, `tool ${naam}: top-level oneOf (union) — vlak het schema af`).toBeUndefined()
      expect(json.properties, `tool ${naam}: input_schema zonder properties`).toBeTypeOf('object')
    }
  })

  it('de gebeurtenis-pane meldt suggestRecommendation NIET aan, de hoofdchat wél', () => {
    // Borgt dat de variantenlijst hierboven de echte samenstellingen dekt: zou getTools
    // ze gelijktrekken, dan toetst de schema-grendel stil minder tools dan er live gaan.
    expect(Object.keys(getTools('wil', supabase, 'gebeurtenis', 'user-1'))).not.toContain('suggestRecommendation')
    expect(Object.keys(getTools('wil', supabase, undefined, 'user-1'))).toContain('suggestRecommendation')
  })
})
