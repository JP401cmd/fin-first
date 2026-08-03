// ── Uitvoerschema voor wat-als levensgebeurtenis-suggesties ─────────────────
//
// Stond eerder inline in app/api/whatif/suggest/route.ts. Verhuisd naar de
// gedeelde schema-map omdat er nu TWEE consumenten zijn:
//   1. de cloud-route, die 'm als `generateObject`-schema gebruikt (het model
//      kan er daar niet naast produceren);
//   2. het lokale (on-device) pad, waar geen constrained decoding bestaat en het
//      schema dienstdoet als TWEEDE GRENS: de deterministisch opgeloste
//      suggesties gaan er client-side alsnog met `safeParse` doorheen, zodat een
//      vormfout nooit de UI bereikt.

import { z } from 'zod'

export const SuggestedEventSchema = z.object({
  event_type: z.string(),
  name: z.string(),
  target_age: z.number().nullable(),
  one_time_cost: z.number(),
  monthly_cost_change: z.number(),
  monthly_income_change: z.number(),
  duration_months: z.number(),
  explanation: z.string(),
})

export const SuggestionsResponseSchema = z.object({
  suggestions: z.array(SuggestedEventSchema).min(1).max(3),
})

export type SuggestedEventOutput = z.infer<typeof SuggestedEventSchema>
