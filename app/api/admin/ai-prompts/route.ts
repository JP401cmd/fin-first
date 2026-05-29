import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { BASE_SYSTEM_PROMPT } from '@/lib/ai/dna/base'
import { WIL_PROMPT, WHATIF_PROMPT, VASTE_KOSTEN_ANALYSE_PROMPT } from '@/lib/ai/dna/wil'
import { KERN_PROMPT } from '@/lib/ai/dna/kern'
import { HORIZON_PROMPT } from '@/lib/ai/dna/horizon'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from '@/lib/ai/dna/recommendations'
import { buildBriefingSystemPrompt } from '@/lib/ai/dna/briefing'
import { getDefaultFullPrompt } from '@/lib/ai/dna'
import { DEFAULT_EXTRACTION_PROMPT } from '@/lib/ai/extraction-system-prompt'

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Build briefing prompt with representative defaults
  const now = new Date()
  const dayOfMonth = now.getDate()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const briefingContent = buildBriefingSystemPrompt(
    {
      date: now.toISOString().slice(0, 10),
      dayOfMonth,
      dayOfWeek: 'maandag',
      dayOfWeekEn: 'Monday',
      month: now.getMonth() + 1,
      monthName: 'maart',
      year: now.getFullYear(),
      timeOfDay: 'ochtend',
      greeting: 'Goedemorgen',
      seasonalNotes: [],
      daysUntilMonthEnd: lastDay - dayOfMonth,
      daysUntilSalary: ((25 - dayOfMonth + lastDay) % lastDay) || lastDay,
    },
    'stability',
    2,
  )

  // Combined preview: base + wil (what the chat API actually sends)
  const combinedWil = getDefaultFullPrompt('wil')

  const prompts = [
    {
      id: 'base',
      label: 'Basis (gedeeld)',
      description: 'Gedeeld fundament voor alle AI-modules: filosofie, rekenregels, toon en formatting.',
      content: BASE_SYSTEM_PROMPT,
      source: 'lib/ai/dna/base.ts',
      domain: null,
      dynamic: false,
      charCount: BASE_SYSTEM_PROMPT.length,
    },
    {
      id: 'wil',
      label: 'Will (chat)',
      description: 'Will\'s persoonlijkheid en instructies voor de chatinterface. Wordt gecombineerd met het basisprompt.',
      content: WIL_PROMPT,
      source: 'lib/ai/dna/wil.ts',
      domain: 'wil',
      dynamic: false,
      charCount: WIL_PROMPT.length,
    },
    {
      id: 'whatif',
      label: 'Will Droomscenario',
      description: 'Standalone prompt voor de Wat-Als droomgids modus. Vervangt het normale Will-prompt volledig.',
      content: WHATIF_PROMPT,
      source: 'lib/ai/dna/wil.ts',
      domain: 'wil',
      dynamic: false,
      charCount: WHATIF_PROMPT.length,
    },
    {
      id: 'vaste-kosten-analyse',
      label: 'Will Vaste Kosten Analyse',
      description: 'Prompt voor Will\'s AI-classificatie van terugkerende betalingen als abonnement, vaste kosten of overslaan.',
      content: VASTE_KOSTEN_ANALYSE_PROMPT,
      source: 'lib/ai/dna/wil.ts',
      domain: 'wil',
      dynamic: false,
      charCount: VASTE_KOSTEN_ANALYSE_PROMPT.length,
    },
    {
      id: 'kern',
      label: 'Overzicht',
      description: 'Domeinprompt voor Overzicht: feitelijk, spiegelend, focus op huidige financiële situatie.',
      content: KERN_PROMPT,
      source: 'lib/ai/dna/kern.ts',
      domain: 'kern',
      dynamic: false,
      charCount: KERN_PROMPT.length,
    },
    {
      id: 'horizon',
      label: 'Toekomst',
      description: 'Domeinprompt voor Toekomst: toekomstgericht, scenario\'s en projecties.',
      content: HORIZON_PROMPT,
      source: 'lib/ai/dna/horizon.ts',
      domain: 'horizon',
      dynamic: false,
      charCount: HORIZON_PROMPT.length,
    },
    {
      id: 'recommendations',
      label: 'Aanbevelingen',
      description: 'Instructies voor het genereren van Golden Nuggets: gepersonaliseerde optimalisatievoorstellen.',
      content: RECOMMENDATIONS_SYSTEM_PROMPT,
      source: 'lib/ai/dna/recommendations.ts',
      domain: 'wil',
      dynamic: false,
      charCount: RECOMMENDATIONS_SYSTEM_PROMPT.length,
    },
    {
      id: 'briefing',
      label: 'Briefing',
      description: 'Dynamisch prompt voor de DAIshboard briefing-compositie. Bevat temporele context en fase-instructies.',
      content: briefingContent,
      source: 'lib/ai/dna/briefing.ts',
      domain: null,
      dynamic: true,
      charCount: briefingContent.length,
    },
    {
      id: 'extraction',
      label: 'Extractie',
      description: 'Systeem prompt voor het extraheren van gestructureerde financiële data uit vrije tekst.',
      content: DEFAULT_EXTRACTION_PROMPT,
      source: 'lib/ai/extraction-system-prompt.ts',
      domain: 'nieuws',
      dynamic: false,
      charCount: DEFAULT_EXTRACTION_PROMPT.length,
    },
  ]

  return NextResponse.json({ prompts, combinedWil })
}
