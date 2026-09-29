// lib/ai/model-keuze.ts
//
// Welk Anthropic-model en welke effort een AI-feature krijgt.
//
// Tot 29 sep 2026 kende de app één globaal model (`ai_model_anthropic`) voor
// élke feature: de chat met Fin en de nachtelijke nieuws-cron betaalden
// hetzelfde tarief. Nu kan elke feature een eigen sleutel dragen:
//
//   ai_model_anthropic:<feature>    bv. ai_model_anthropic:nieuws_ingest
//   ai_effort_anthropic:<feature>   bv. ai_effort_anthropic:chat
//
// Ontbreekt de feature-sleutel, dan geldt de globale (`ai_model_anthropic` /
// `ai_effort_anthropic`), en daarna de code-default. Een feature-override is
// dus altijd een bewuste uitzondering op de globale keuze, nooit een vereiste.
//
// Bewust alleen voor de Anthropic-provider: OpenAI/Mistral/Ollama houden hun
// ene globale sleutel — daar is geen per-feature-behoefte.

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929'

export const EFFORT_NIVEAUS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORT_NIVEAUS)[number]

/**
 * Standaard-effort op modellen die `effort` kennen. Sonnet 5 denkt zonder
 * instelling adaptief mee op `high` — voor chat, briefing en nieuws is dat
 * outputkosten zonder aantoonbare winst. `low` denkt nog steeds waar nodig.
 */
export const DEFAULT_EFFORT: Effort = 'low'

/**
 * Alleen vaste feature-namen (`chat`, `nieuws_ingest`) krijgen een eigen
 * sleutel. De INSERT-policy op app_settings laat een gebruiker sleutels
 * schrijven die zijn eigen uid bevatten; een feature-string met een uid erin
 * (`rapport:<uid>`) zou hem zo zelf een duur model of effort `max` laten
 * kiezen. Een uid bevat cijfers en streepjes en valt hier dus altijd buiten.
 */
function heeftEigenSleutel(feature: string | undefined): feature is string {
  return !!feature && /^[a-z_]+$/.test(feature)
}

export function modelSleutel(feature: string): string {
  return `ai_model_anthropic:${feature}`
}

export function effortSleutel(feature: string): string {
  return `ai_effort_anthropic:${feature}`
}

/** De app_settings-sleutels die `getModel` voor deze feature extra moet lezen. */
export function featureSleutels(feature: string | undefined): string[] {
  if (!heeftEigenSleutel(feature)) return ['ai_effort_anthropic']
  return ['ai_effort_anthropic', modelSleutel(feature), effortSleutel(feature)]
}

function gevuld(waarde: string | undefined): string | undefined {
  const w = waarde?.trim()
  return w ? w : undefined
}

export function kiesAnthropicModel(settings: Record<string, string>, feature: string | undefined): string {
  return (
    (heeftEigenSleutel(feature) ? gevuld(settings[modelSleutel(feature)]) : undefined) ??
    gevuld(settings.ai_model_anthropic) ??
    DEFAULT_ANTHROPIC_MODEL
  )
}

/**
 * Modellen die de `effort`-parameter accepteren. Sonnet 4.5 en Haiku 4.5
 * geven er een 400 op — daar sturen we hem dus nooit mee. Opus 4.5 kent
 * alleen low/medium/high en valt er bewust buiten.
 */
const EFFORT_FAMILIES: { re: RegExp; niveaus: readonly Effort[] }[] = [
  // `xhigh` kwam met Opus 4.7; de 4.6-familie kent hem niet (400).
  { re: /^claude-(sonnet-4-6|opus-4-6)/, niveaus: ['low', 'medium', 'high', 'max'] },
  { re: /^claude-(sonnet-5|opus-4-[78]|opus-5|fable-5)/, niveaus: EFFORT_NIVEAUS },
]

function effortNiveaus(modelId: string): readonly Effort[] | null {
  const id = modelId.trim().toLowerCase()
  return EFFORT_FAMILIES.find((f) => f.re.test(id))?.niveaus ?? null
}

export function ondersteuntEffort(modelId: string): boolean {
  return effortNiveaus(modelId) !== null
}

/**
 * De effort voor deze call, of `null` wanneer het model geen effort kent.
 * Een onbekende waarde in app_settings — of een niveau dat dít model niet
 * kent — valt stil terug op de volgende laag: een tikfout mag de AI niet laten
 * stuklopen op een 400.
 */
export function kiesEffort(
  settings: Record<string, string>,
  feature: string | undefined,
  modelId: string,
): Effort | null {
  const niveaus = effortNiveaus(modelId)
  if (!niveaus) return null
  const isEffort = (w: string | undefined): w is Effort => (niveaus as readonly string[]).includes(w ?? '')
  const perFeature = heeftEigenSleutel(feature) ? gevuld(settings[effortSleutel(feature)]) : undefined
  if (isEffort(perFeature)) return perFeature
  const globaal = gevuld(settings.ai_effort_anthropic)
  if (isEffort(globaal)) return globaal
  return DEFAULT_EFFORT
}
