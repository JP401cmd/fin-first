import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'
import { getModel } from '@/lib/ai/config'
import { buildBriefingSystemPrompt, briefingTools } from '@/lib/ai/dna/briefing'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import type {
  BriefingCardSpec,
  BriefingComposeRequest,
  BriefingSSEEvent,
} from '@/lib/briefing/types'
import { validateBriefingLayout } from '@/lib/briefing/validate-layout'
import { validateCardHrefs } from '@/lib/briefing/validate-hrefs'
import {
  getActiveDirectives,
  formatDirectivesForPrompt,
  formatFunctionalDirectivesForPrompt,
} from '@/lib/briefing/directives'
import type { BriefingDirective, FunctionalDirective } from '@/lib/briefing/directives'

// Map tool names to card types
function toolCallToCardSpec(toolName: string, input: Record<string, unknown>): BriefingCardSpec | null {
  switch (toolName) {
    case 'showMetric':
      return { type: 'metric', ...input } as BriefingCardSpec
    case 'showAction':
      return { type: 'action', ...input } as BriefingCardSpec
    case 'showAlert':
      return { type: 'alert', ...input } as BriefingCardSpec
    case 'showProgressRing':
      return { type: 'progressRing', ...input } as BriefingCardSpec
    case 'showSparkline':
      return { type: 'sparkline', ...input } as BriefingCardSpec
    case 'showMilestone':
      return { type: 'milestone', ...input } as BriefingCardSpec
    case 'showInsight':
      return { type: 'insight', ...input } as BriefingCardSpec
    case 'showChecklist':
      return { type: 'checklist', ...input } as BriefingCardSpec
    case 'showComparison':
      return { type: 'comparison', ...input } as BriefingCardSpec
    case 'showCountdown':
      return { type: 'countdown', ...input } as BriefingCardSpec
    case 'showGoalProgress':
      return { type: 'goalProgress', ...input } as BriefingCardSpec
    case 'showBudgetBar':
      return { type: 'budgetBar', ...input } as BriefingCardSpec
    case 'showQuote':
      return { type: 'quote', ...input } as BriefingCardSpec
    case 'showStreak':
      return { type: 'streak', ...input } as BriefingCardSpec
    case 'showRecurring':
      return { type: 'recurring', ...input } as BriefingCardSpec
    case 'showLifeEvent':
      return { type: 'lifeEvent', ...input } as BriefingCardSpec
    case 'showNextStep':
      return { type: 'nextStep', ...input } as BriefingCardSpec
    case 'showDiscover':
      return { type: 'discover', ...input } as BriefingCardSpec
    default:
      return null
  }
}

function encodeSSE(event: BriefingSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json() as BriefingComposeRequest & { userPreferences?: string; briefingFrequency?: 'daily' | 'weekly' | 'monthly' | 'rare' }
    const { dataSummary, temporal, phase, level, previousBriefing, longTermMemory, userPreferences, phaseTransition, briefingFrequency } = body

    if (!dataSummary || !temporal) {
      return new Response(JSON.stringify({ error: 'Missing dataSummary or temporal' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Load editorial directives + briefing preferences from app_settings
    let directivesBlock = ''
    let serverUserPreferences = userPreferences ?? ''
    try {
      const { data: settingsRows } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['briefing_directives', 'briefing_functional_directives', `briefing_preferences_${user.id}`])

      const settingsMap = Object.fromEntries(
        (settingsRows ?? []).map((r) => [r.key, r.value]),
      )

      // Temporal directives
      const blocks: string[] = []
      if (settingsMap.briefing_directives) {
        const all: BriefingDirective[] = JSON.parse(settingsMap.briefing_directives)
        const active = getActiveDirectives(all, temporal.month, temporal.dayOfMonth)
        const block = formatDirectivesForPrompt(active)
        if (block) blocks.push(block)
      }

      // Functional directives
      if (settingsMap.briefing_functional_directives) {
        const all: FunctionalDirective[] = JSON.parse(settingsMap.briefing_functional_directives)
        const block = formatFunctionalDirectivesForPrompt(all, dataSummary)
        if (block) blocks.push(block)
      }

      directivesBlock = blocks.join('\n\n')

      // Read user-specific briefing preferences (next steps / discover toggles)
      const briefingPrefsKey = `briefing_preferences_${user.id}`
      if (settingsMap[briefingPrefsKey]) {
        try {
          const prefs = JSON.parse(settingsMap[briefingPrefsKey]) as { showNextSteps?: boolean; showDiscover?: boolean }
          const prefLines: string[] = []
          const showNextSteps = prefs.showNextSteps !== false // default true
          const showDiscover = prefs.showDiscover !== false   // default true
          prefLines.push(`Volgende stappen: ${showNextSteps ? 'AAN' : 'UIT'}`)
          prefLines.push(`Ontdek-suggesties: ${showDiscover ? 'AAN' : 'UIT'}`)
          if (!showNextSteps) {
            prefLines.push('Gebruik NIET de showNextStep tool. De gebruiker heeft volgende stappen uitgeschakeld.')
          }
          if (!showDiscover) {
            prefLines.push('Gebruik NIET de showDiscover tool. De gebruiker heeft ontdek-suggesties uitgeschakeld.')
          }
          const serverPrefBlock = `== BRIEFING VOORKEUREN ==\n${prefLines.join('\n')}`
          // Merge: server-side prefs take precedence, append client prefs if present
          serverUserPreferences = serverUserPreferences
            ? `${serverPrefBlock}\n\n${serverUserPreferences}`
            : serverPrefBlock
        } catch { /* invalid JSON — skip */ }
      }
    } catch {
      // Silent fallback — hardcoded temporal logic still works
    }

    const model = await getModel(supabase)
    const systemPrompt = buildBriefingSystemPrompt(temporal, phase, level, directivesBlock, previousBriefing, longTermMemory, serverUserPreferences || undefined, phaseTransition, briefingFrequency)

    /* Sanitize PII from data summary before sending to AI provider */
    /* FAIL-SAFE: if sanitization fails, block the AI call entirely —
       never send unsanitized data to an external AI provider. */
    let sanitizedDataSummary = dataSummary
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, date_of_birth')
        .eq('id', user.id)
        .single()

      const sanitizeOpts: SanitizeOptions = {}
      if (profile) {
        const names = [profile.full_name].filter(Boolean) as string[]
        if (names.length > 0) sanitizeOpts.names = names
        if (profile.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth
      }

      sanitizedDataSummary = sanitizeForAI(dataSummary, sanitizeOpts)
    } catch (err) {
      console.error('[briefing/compose] Sanitization failed — AI call blocked (fail-safe):', err)
      return new Response(JSON.stringify({ error: 'De AI-assistent is tijdelijk niet beschikbaar vanwege een beveiligingscontrole. Probeer het later opnieuw.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Create a ReadableStream that emits SSE events as tool calls complete
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = streamText({
            model,
            system: systemPrompt,
            prompt: sanitizedDataSummary,
            tools: briefingTools,
            toolChoice: 'required',
            maxOutputTokens: 2000,
            abortSignal: request.signal,
          })

          // Collect all cards from the AI stream
          const collectedCards: BriefingCardSpec[] = []
          for await (const part of result.fullStream) {
            if (part.type === 'tool-call') {
              const input = 'args' in part ? part.args : 'input' in part ? part.input : null
              const card = input ? toolCallToCardSpec(part.toolName, input as Record<string, unknown>) : null
              if (card) {
                collectedCards.push(card)
              }
            }
          }

          // Validate hrefs (correct hallucinated routes) then layout
          const hrefValidatedCards = validateCardHrefs(collectedCards)
          const validatedCards = validateBriefingLayout(hrefValidatedCards)

          // Emit all validated cards in order
          for (const card of validatedCards) {
            const event: BriefingSSEEvent = { type: 'card', spec: card }
            controller.enqueue(encoder.encode(encodeSSE(event)))
          }

          // Stream complete — send done event
          const doneEvent: BriefingSSEEvent = {
            type: 'done',
            composedAt: new Date().toISOString(),
          }
          controller.enqueue(encoder.encode(encodeSSE(doneEvent)))
          controller.close()
        } catch (err) {
          // Stream an error event so the frontend can show retry
          const message = err instanceof Error ? err.message : 'AI compositie mislukt'
          console.error('[briefing/compose] Streaming error:', err)
          const errorEvent: BriefingSSEEvent = { type: 'error', message }
          try {
            controller.enqueue(encoder.encode(encodeSSE(errorEvent)))
          } catch { /* controller may be closed */ }
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[briefing/compose] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
