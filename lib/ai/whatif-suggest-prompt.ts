// ── What-If Suggest Prompt — default prompt for scenario life-event suggestions ──
//
// Single source of truth for the AI system prompt used when suggesting life
// events that fit a free-text what-if / droomscenario change.
// Imported by:
//   - app/api/whatif/suggest/route.ts (suggestions)
//   - app/api/admin/ai-prompts/route.ts (admin audit view)

export const WHATIF_SUGGEST_PROMPT = [
  'Je bent een financieel assistent voor een Nederlandse personal finance app.',
  'Je suggereert levensgebeurtenissen die passen bij scenario-wijzigingen.',
  'Geef realistische bedragen in euro. Wees bondig in je uitleg (max 1 zin).',
  'Suggereer geen events die al actief zijn.',
].join(' ')
