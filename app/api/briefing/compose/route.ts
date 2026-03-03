import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { getModel } from '@/lib/ai/config'
import { buildBriefingSystemPrompt, briefingTools } from '@/lib/ai/dna/briefing'
import type {
  BriefingCardSpec,
  BriefingComposeRequest,
  BriefingComposeResponse,
} from '@/lib/briefing/types'

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
    default:
      return null
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as BriefingComposeRequest
    const { dataSummary, temporal, phase, level } = body

    if (!dataSummary || !temporal) {
      return NextResponse.json({ error: 'Missing dataSummary or temporal' }, { status: 400 })
    }

    const model = await getModel(supabase)
    const systemPrompt = buildBriefingSystemPrompt(temporal, phase, level)

    // Call AI with 15s timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: dataSummary,
        tools: briefingTools,
        toolChoice: 'required',
        maxOutputTokens: 2000,
        abortSignal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Extract tool calls in order → card specs
      const cards: BriefingCardSpec[] = []
      for (const tc of result.toolCalls) {
        const card = toolCallToCardSpec(tc.toolName, tc.input as Record<string, unknown>)
        if (card) cards.push(card)
      }

      // If AI returned no cards, signal client to use fallback
      if (cards.length === 0) {
        return NextResponse.json({
          cards: [],
          composedAt: new Date().toISOString(),
          source: 'fallback',
        } satisfies BriefingComposeResponse)
      }

      return NextResponse.json({
        cards,
        composedAt: new Date().toISOString(),
        source: 'ai',
      } satisfies BriefingComposeResponse)

    } catch (aiError) {
      clearTimeout(timeoutId)
      console.error('[briefing/compose] AI error, using fallback:', aiError)

      return NextResponse.json({
        cards: [],
        composedAt: new Date().toISOString(),
        source: 'fallback',
      } satisfies BriefingComposeResponse)
    }
  } catch (error) {
    console.error('[briefing/compose] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
