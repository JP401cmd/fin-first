import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'
import { getModel } from '@/lib/ai/config'
import { buildBriefingSystemPrompt, briefingTools } from '@/lib/ai/dna/briefing'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { maskPIIInObject } from '@/lib/ai/pii-output-filter'
import { NextResponse } from 'next/server'
import { checkTierGate } from '@/lib/require-tier'
import type {
  BriefingCardSpec,
  BriefingComposeRequest,
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
    case 'showRecurring':
      return { type: 'recurring', ...input } as BriefingCardSpec
    case 'showLifeEvent':
      return { type: 'lifeEvent', ...input } as BriefingCardSpec
    case 'showNextStep':
      return { type: 'nextStep', ...input } as BriefingCardSpec
    case 'showDiscover':
      return { type: 'discover', ...input } as BriefingCardSpec
    case 'showDecisionPatterns':
      return { type: 'decisionPatterns', ...input } as BriefingCardSpec
    case 'showFreedomDaysTrend':
      return { type: 'freedomDaysTrend', ...input } as BriefingCardSpec
    default:
      return null
  }
}

// ── Background composition tracker ───────────────────────────────────

interface CompositionState {
  cards: BriefingCardSpec[]
  complete: boolean
  composedAt: string
  startedAt: number
  completedAt: number
}

const activeCompositions = new Map<string, CompositionState>()
const compositionErrors = new Map<string, string>()    // userId → error message
const COMPOSITION_TIMEOUT_MS = 120_000                 // 2 min — auto-cleanup
const RESULT_TTL_MS = 5 * 60 * 1000                   // 5 min — completed results cleanup

export function clearBriefingState(userId: string) {
  activeCompositions.delete(userId)
  compositionErrors.delete(userId)
}

function cleanupStaleCompositions() {
  const now = Date.now()
  for (const [userId, state] of activeCompositions) {
    if (!state.complete && now - state.startedAt > COMPOSITION_TIMEOUT_MS) {
      activeCompositions.delete(userId)
    }
    if (state.complete && now - state.completedAt > RESULT_TTL_MS) {
      activeCompositions.delete(userId)
    }
  }
}

// ── GET handler — poll for composition status/results ────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return NextResponse.json({ error: tierGate.error }, { status: 403 })
  }

  cleanupStaleCompositions()

  if (compositionErrors.has(user.id)) {
    const message = compositionErrors.get(user.id)!
    compositionErrors.delete(user.id)
    return NextResponse.json({ type: 'error', message })
  }

  if (activeCompositions.has(user.id)) {
    const state = activeCompositions.get(user.id)!
    if (state.complete) {
      return NextResponse.json({ type: 'done', cards: state.cards, composedAt: state.composedAt })
    }
    return NextResponse.json({ status: 'composing', cards: state.cards })
  }

  return NextResponse.json({ status: 'idle' })
}

// ── POST handler — start background composition ─────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tierGate = await checkTierGate(supabase, user.id, 'ai')
    if (tierGate) {
      return NextResponse.json({ error: tierGate.error }, { status: 403 })
    }

    // If composition is already running, return status immediately
    if (activeCompositions.has(user.id)) {
      return NextResponse.json({ status: 'composing' })
    }

    const body = await request.json() as BriefingComposeRequest & { userPreferences?: string; briefingFrequency?: 'daily' | 'weekly' | 'monthly' | 'rare' }
    const { dataSummary, temporal, phase, level, previousBriefing, longTermMemory, userPreferences, phaseTransition, briefingFrequency } = body

    if (!dataSummary || !temporal) {
      return NextResponse.json({ error: 'Missing dataSummary or temporal' }, { status: 400 })
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
      return NextResponse.json(
        { error: 'De AI-assistent is tijdelijk niet beschikbaar vanwege een beveiligingscontrole. Probeer het later opnieuw.' },
        { status: 503 },
      )
    }

    // Clear any previous state for this user
    activeCompositions.delete(user.id)
    compositionErrors.delete(user.id)

    // ── Fire-and-forget background composition ───────────────────

    const state: CompositionState = {
      cards: [],
      complete: false,
      composedAt: '',
      startedAt: Date.now(),
      completedAt: 0,
    }
    activeCompositions.set(user.id, state)

    const generation = (async () => {
      try {
        const result = streamText({
          model,
          system: systemPrompt,
          prompt: sanitizedDataSummary,
          tools: briefingTools,
          toolChoice: 'required',
          maxOutputTokens: 2000,
        })

        for await (const part of result.fullStream) {
          if (part.type === 'tool-call') {
            const input = 'args' in part ? part.args : 'input' in part ? part.input : null
            const card = input ? toolCallToCardSpec(part.toolName, input as Record<string, unknown>) : null
            if (card) {
              const filtered = maskPIIInObject(card)
              const [hrefValidated] = validateCardHrefs([filtered])
              state.cards.push(hrefValidated)
            }
          }
        }

        // Final layout validation on the complete set (reorders/optimizes row filling)
        state.cards = validateBriefingLayout(state.cards)
        state.complete = true
        state.composedAt = new Date().toISOString()
        state.completedAt = Date.now()
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'AI compositie mislukt'
        console.error('[briefing/compose] Background composition failed:', err)
        compositionErrors.set(user.id, errMsg)
        activeCompositions.delete(user.id)
      }
    })()

    // Prevent unhandled rejection warning (errors captured in compositionErrors)
    generation.catch(() => {})

    return NextResponse.json({ status: 'composing' })
  } catch (error) {
    console.error('[briefing/compose] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
