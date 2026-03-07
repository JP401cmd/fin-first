// ── Will's Briefing System Prompt + Tool Definitions ────────
// Used by /api/briefing/compose to let Will compose the dashboard.

import { z } from 'zod'
import { tool } from 'ai'
import type { TemporalContext, PreviousBriefingSummary, BriefingLongTermMemory, PhaseTransitionInfo } from '@/lib/briefing/types'

// ── System Prompt Builder ───────────────────────────────────

export function buildBriefingSystemPrompt(
  temporal: TemporalContext,
  phase: string,
  level: number,
  directivesBlock?: string,
  previousBriefing?: PreviousBriefingSummary,
  longTermMemory?: BriefingLongTermMemory,
  userPreferences?: string,
  phaseTransition?: PhaseTransitionInfo,
): string {
  // Phase-specific card emphasis
  const phaseEmphasis = getPhaseEmphasis(phase)
  const temporalGuidance = getTemporalGuidance(temporal)
  const previousBlock = formatPreviousBriefing(previousBriefing)
  const longTermBlock = formatLongTermMemory(longTermMemory)
  const phaseTransitionBlock = formatPhaseTransition(phaseTransition)

  return `Je bent Will, de financiele redacteur van TriFinity.

== OPDRACHT ==
Stel een persoonlijke financiele briefing samen voor de gebruiker.
Gebruik UITSLUITEND de beschikbare tools om de pagina op te bouwen.
Elke tool-call wordt een visuele card op het scherm.

De volgorde van je tool-calls bepaalt de volgorde op de pagina.
Kies bewust: wat is nu het belangrijkst voor deze gebruiker?

== REGELS ==
- Gebruik 6 tot 10 tools per briefing
- Begin altijd met showInsight als editorial opening (welkom + kernobservatie)
- Gebruik showInsight meerdere keren voor verschillende inzichten verspreid door de pagina
- Elke insight is max 2 zinnen, concreet, met een getal, in vrijheidstijd waar mogelijk
- Gebruik GEEN vrije tekst buiten de tools
- Alle bedragen boven 100 euro moeten een vrijheidstijd-equivalent tonen
- module parameter is altijd "kern", "wil", "horizon", of "cross"
- BELANGRIJK: Vul ALTIJD de href parameter in bij cards die een href ondersteunen. Elke card moet klikbaar zijn naar de relevante pagina.

== NAVIGATIE HREFS ==
Gebruik deze routes als href waarden:
- Netto vermogen, assets → "/core/assets"
- Budgetten, uitgaven → "/core/budgets"
- Transacties, bankzaken → "/core/cash"
- Schulden → "/core/debts"
- Belasting, box 3 → "/core/belasting"
- De Kern overzicht → "/core"
- FIRE, vrijheid, projecties → "/horizon"
- Doelen, acties → "/will"
- Scenario's, simulaties → "/horizon"
- Identiteit, profiel → "/identity"

== LAYOUT CONSTRAINTS ==
- Nooit twee metric-cards direct naast elkaar (wissel af met andere types)
- Eindig met een action of insight card (call-to-action of slotobservatie)
- Milestone altijd in het midden van de briefing, nooit als eerste of laatste
- Wissel 1-kolom cards (metric, progressRing, countdown, goalProgress, budgetBar) af met 2-kolom cards

== TEMPOREEL BEWUSTZIJN ==
Vandaag: ${temporal.date}, dag ${temporal.dayOfMonth} van de maand, ${temporal.dayOfWeek}.
${temporalGuidance}
${temporal.seasonalNotes.length > 0 ? `\nActueel: ${temporal.seasonalNotes.join('; ')}` : ''}
${directivesBlock ? `\n${directivesBlock}\n` : ''}${previousBlock ? `\n${previousBlock}\n` : ''}${longTermBlock ? `\n${longTermBlock}\n` : ''}${userPreferences ? `\n${userPreferences}\n` : ''}${phaseTransitionBlock ? `\n${phaseTransitionBlock}\n` : ''}
== FASE-BEWUST ==
Gebruikersfase: ${phase} (sovereignty level ${level})
${phaseEmphasis}

== DOEL-COACHING ==
- Volg actieve doelen proactief op. Analyseer de DOELEN sectie in de data.
- Als een doel [ACHTERLOOPT]: stel een concrete actie voor via showAction met specifiek bedrag/mnd.
- Als een doel [BEREIKT] of bijna bereikt (>90%): vier het met showMilestone.
- Als een doel [OP SCHEMA]: benoem kort de positieve voortgang in een showInsight.
- Gebruik showGoalProgress voor het meest relevante actieve doel.

== TOON ==
- Nederlands, informeel (je/jij)
- Kort en bondig — geen muren tekst
- Empowerend: "dit kun je doen" niet "dit moet je doen"
- Concreet: altijd met een getal, nooit vaag advies
- Warm maar feitelijk — als een wijze financiele partner
- Geen emoji's`
}

/** Format previous briefing summary for prompt context */
function formatPreviousBriefing(prev?: PreviousBriefingSummary): string {
  if (!prev) return ''

  const lines: string[] = ['== VORIGE BRIEFING ==']

  // When was the last briefing
  const composedDate = new Date(prev.composedAt)
  const now = new Date()
  const diffMs = now.getTime() - composedDate.getTime()
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 24) {
    lines.push(`Vorige briefing: ${diffHours} uur geleden`)
  } else {
    lines.push(`Vorige briefing: ${diffDays} dag${diffDays > 1 ? 'en' : ''} geleden`)
  }

  // Card types used previously
  const typeCounts: Record<string, number> = {}
  for (const t of prev.cardTypes) {
    typeCounts[t] = (typeCounts[t] || 0) + 1
  }
  const typesSummary = Object.entries(typeCounts)
    .map(([t, c]) => `${t}(${c})`)
    .join(', ')
  lines.push(`Gebruikte cards: ${typesSummary}`)

  // Key metrics from previous briefing
  const metricEntries = Object.entries(prev.keyMetrics)
  if (metricEntries.length > 0) {
    lines.push('Eerder getoonde metrics:')
    for (const [label, value] of metricEntries.slice(0, 8)) {
      lines.push(`  - ${label}: ${value}`)
    }
  }

  lines.push('Instructie: Refereer aan vorige observaties als er relevante veranderingen zijn. Varieer card types t.o.v. de vorige briefing.')

  return lines.join('\n')
}

/** Format long-term briefing memory for prompt context */
function formatLongTermMemory(mem?: BriefingLongTermMemory): string {
  if (!mem) return ''

  const lines: string[] = ['== LANGETERMIJN GEHEUGEN ==']

  lines.push(`Aantal briefings tot nu toe: ${mem.briefingCount}`)

  // When was the last briefing
  const lastDate = new Date(mem.lastBriefingDate)
  const now = new Date()
  const diffDays = Math.round((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) {
    lines.push('Laatste briefing: vandaag')
  } else if (diffDays === 1) {
    lines.push('Laatste briefing: gisteren')
  } else {
    lines.push(`Laatste briefing: ${diffDays} dagen geleden`)
  }

  // Financial snapshot from last briefing
  lines.push(`Laatst bekende netto vermogen: ${mem.lastNetWorth.toLocaleString('nl-NL')} EUR`)
  lines.push(`Laatst bekende spaarquote: ${mem.lastSavingsRate}%`)
  lines.push(`Laatst bekende vrijheidspercentage: ${mem.lastFreedomPct}%`)

  // Previous advice given
  if (mem.adviceHistory.length > 0) {
    lines.push('Eerder gegeven adviezen/inzichten:')
    for (const advice of mem.adviceHistory) {
      lines.push(`  - "${advice}"`)
    }
    lines.push('Instructie: Vermijd herhaling van deze inzichten tenzij er relevante updates zijn. Bouw voort op eerdere adviezen.')
  }

  return lines.join('\n')
}

/** Phase descriptions for transition celebrations */
const PHASE_DESCRIPTIONS: Record<string, { dutch: string; unlocks: string }> = {
  recovery: {
    dutch: 'Herstel',
    unlocks: 'Basis budgettering, schuldoverzicht, en je eerste stappen naar financiele stabiliteit.',
  },
  stability: {
    dutch: 'Stabiliteit',
    unlocks: 'Box 3 belasting, FIRE berekeningen, levensgebeurtenissen, noodfonds tracking, en geavanceerde budgetanalyse.',
  },
  momentum: {
    dutch: 'Momentum',
    unlocks: 'Asset allocatie, Monte Carlo simulaties, scenarioanalyse, backtesting, en passief inkomen tracking.',
  },
  mastery: {
    dutch: 'Meesterschap',
    unlocks: 'Withdrawal strategieen, legacy planning, en volledige controle over je financiele toekomst.',
  },
}

/** Format a phase transition into a prominent AI instruction block */
function formatPhaseTransition(transition?: PhaseTransitionInfo): string {
  if (!transition) return ''

  const prev = PHASE_DESCRIPTIONS[transition.previousPhase]
  const curr = PHASE_DESCRIPTIONS[transition.currentPhase]
  const prevName = prev?.dutch ?? transition.previousPhase
  const currName = curr?.dutch ?? transition.currentPhase
  const unlocks = curr?.unlocks ?? ''

  const lines: string[] = [
    '== FASE-TRANSITIE (BELANGRIJK!) ==',
    `De gebruiker is zojuist van de ${prevName}-fase naar de ${currName}-fase gegaan. Dit is een grote mijlpaal!`,
    '',
    'INSTRUCTIE: Begin je briefing met een feestelijke showInsight (emphasis: "celebration") die deze fase-transitie viert.',
    `- Benoem de overgang van ${prevName} naar ${currName}`,
    `- Leg uit wat de nieuwe ${currName}-fase betekent voor de gebruiker`,
  ]

  if (unlocks) {
    lines.push(`- Nieuw ontgrendeld in ${currName}: ${unlocks}`)
  }

  lines.push('- Maak het persoonlijk en warm — dit is een moment om trots op te zijn')
  lines.push('- Dit moet de EERSTE card zijn, nog voor andere metrics of inzichten')

  return lines.join('\n')
}

function getPhaseEmphasis(phase: string): string {
  switch (phase) {
    case 'recovery':
      return `Recovery: focus op alert, action, checklist cards.
- Benadruk schuld-alerts, budget-basics, positief momentum
- Vier kleine winsten (elke euro minder schuld = vrijheid teruggewonnen)
- Gebruik showBudgetBar voor dagelijkse budgetbewaking
- Vermijd FIRE/horizon cards — die zijn nu niet relevant`
    case 'stability':
      return `Stability: focus op progressRing, budgetBar, comparison cards.
- Benadruk budget-optimalisatie, spaarquote verbeteren
- Toon eerste mijlpalen (3m buffer, 6m buffer)
- Gebruik showGoalProgress voor spaardoelen
- Begin FIRE-bewustzijn te introduceren`
    case 'momentum':
      return `Momentum: focus op sparkline, milestone, goalProgress cards.
- Benadruk FIRE countdown, scenariovergelijkingen
- Toon groeitrends en vermogensopbouw
- Gebruik showComparison voor maand-op-maand vooruitgang
- Belasting-optimalisatie tips waar relevant`
    case 'mastery':
    default:
      return `Mastery: focus op comparison, sparkline, insight cards.
- Benadruk passief inkomen, portfolio-diversificatie
- Toon backtesting resultaten en scenario's
- Gebruik showMilestone voor FIRE-voortgang
- Withdrawal strategie en legacy planning`
  }
}

function getTemporalGuidance(temporal: TemporalContext): string {
  const lines: string[] = []

  if (temporal.dayOfMonth <= 5) {
    lines.push('- Begin van de maand: start met een comparison-card (vorige vs huidige maand)')
    lines.push('- Maand-terugblik, nieuw budget-overzicht')
  } else if (temporal.dayOfMonth <= 22) {
    lines.push('- Midden van de maand: focus op acties, voortgang, groei')
    lines.push('- Toon budgetvoortgang en doelstatus')
  } else {
    lines.push('- Einde van de maand: budget-druk prominent, salaris countdown')
    lines.push('- Gebruik showBudgetBar en showCountdown voor salaris')
  }

  if (temporal.month >= 3 && temporal.month <= 4) {
    lines.push('- Belastingseizoen: belastingaangifte deadline en box3 inzicht prominent')
  }
  if (temporal.month === 12) {
    lines.push('- December: jaaroverzicht-stijl, feestdagen-budget alert')
  }
  if (temporal.month === 1) {
    lines.push('- Januari: goede voornemens, jaarplanning, schone lei')
  }

  return lines.join('\n')
}

// ── Tool Definitions ────────────────────────────────────────

const moduleEnum = z.enum(['kern', 'wil', 'horizon', 'cross'])

export const briefingTools = {
  showMetric: tool({
    description: 'Toon een KPI metric card met waarde, optioneel vrijheidstijd en trend.',
    inputSchema: z.object({
      label: z.string().describe('Metriek naam, bijv. "Netto vermogen"'),
      value: z.string().describe('Geformatteerde waarde, bijv. "€ 108.400"'),
      freedomStr: z.string().optional().describe('Vrijheidstijd equivalent, bijv. "3j 7m"'),
      delta: z.string().optional().describe('Verandering, bijv. "+€ 2.100"'),
      deltaLabel: z.string().optional().describe('Label voor delta, bijv. "deze maand"'),
      module: moduleEnum.describe('Kleurmodule'),
      href: z.string().optional().describe('Link naar detail pagina'),
    }),
  }),

  showAction: tool({
    description: 'Toon een call-to-action card met icoon, titel en link.',
    inputSchema: z.object({
      icon: z.string().describe('Lucide icon naam, bijv. "zap", "target", "piggy-bank"'),
      kicker: z.string().describe('Kleine label boven de titel'),
      title: z.string().describe('Actie titel'),
      description: z.string().describe('Korte beschrijving (1-2 zinnen)'),
      href: z.string().describe('Link naar actie pagina'),
      module: moduleEnum.optional().describe('Kleurmodule'),
    }),
  }),

  showAlert: tool({
    description: 'Toon een waarschuwing card.',
    inputSchema: z.object({
      severity: z.enum(['warning', 'urgent']).describe('Ernst niveau'),
      title: z.string().describe('Waarschuwing titel'),
      message: z.string().describe('Waarschuwing bericht'),
      actionLabel: z.string().optional().describe('Knop label'),
      href: z.string().optional().describe('Link'),
    }),
  }),

  showProgressRing: tool({
    description: 'Toon een donut/ring chart voor voortgang (bijv. budget besteed, spaarquote).',
    inputSchema: z.object({
      label: z.string().describe('Label, bijv. "Budget uitgaven"'),
      value: z.string().describe('Geformatteerde waarde, bijv. "€ 1.200"'),
      percentage: z.number().describe('Percentage 0-100'),
      total: z.string().optional().describe('Totaal, bijv. "van € 2.000"'),
      module: moduleEnum.describe('Kleurmodule'),
      href: z.string().optional().describe('Link'),
    }),
  }),

  showSparkline: tool({
    description: 'Toon een mini trendlijn. Kies dataKey: netWorthHistory (vermogen), savingsHistory (spaarquote %), expenseHistory (maandelijkse uitgaven).',
    inputSchema: z.object({
      label: z.string().describe('Label, bijv. "Vermogensverloop", "Spaarquote trend", "Uitgavenverloop"'),
      value: z.string().describe('Huidige waarde'),
      dataKey: z.enum(['netWorthHistory', 'savingsHistory', 'expenseHistory']).describe('Dataset: netWorthHistory, savingsHistory, of expenseHistory'),
      module: moduleEnum.describe('Kleurmodule'),
    }),
  }),

  showMilestone: tool({
    description: 'Toon een vrijheidsmijlpaal met progress bar (full width).',
    inputSchema: z.object({
      target: z.string().describe('Doel, bijv. "€ 500.000"'),
      current: z.string().describe('Huidig, bijv. "€ 108.400"'),
      percentage: z.number().describe('Voortgang 0-100'),
      label: z.string().describe('Mijlpaal naam, bijv. "FIRE Doel"'),
      freedomStr: z.string().optional().describe('Vrijheidstijd equivalent'),
      module: moduleEnum.optional().describe('Kleurmodule (default: horizon)'),
    }),
  }),

  showInsight: tool({
    description: 'Toon een redactioneel inzicht. Gebruik meerdere keren per briefing voor observaties verspreid door de pagina.',
    inputSchema: z.object({
      text: z.string().describe('Inzicht tekst (max 2 zinnen, concreet, met getal)'),
      emphasis: z.enum(['greeting', 'observation', 'celebration', 'tip']).optional().describe('Type nadruk'),
      module: moduleEnum.optional().describe('Kleurmodule (default: wil)'),
    }),
  }),

  showChecklist: tool({
    description: 'Toon een checklist met volgende stappen.',
    inputSchema: z.object({
      title: z.string().describe('Checklist titel'),
      items: z.array(z.object({
        label: z.string().describe('Stap beschrijving'),
        href: z.string().optional().describe('Link'),
        done: z.boolean().describe('Is de stap voltooid'),
      })).describe('Lijst van stappen'),
    }),
  }),

  showComparison: tool({
    description: 'Toon een vergelijking tussen twee waarden (bijv. vorige maand vs deze maand).',
    inputSchema: z.object({
      label: z.string().describe('Vergelijking label'),
      leftLabel: z.string().describe('Linker label'),
      leftValue: z.string().describe('Linker waarde'),
      rightLabel: z.string().describe('Rechter label'),
      rightValue: z.string().describe('Rechter waarde'),
      delta: z.string().describe('Verschil, bijv. "+€ 500"'),
      freedomDays: z.number().optional().describe('Impact in vrijheidsdagen'),
    }),
  }),

  showCountdown: tool({
    description: 'Toon een aftelling naar een event (bijv. salaris, FIRE, belastingdeadline).',
    inputSchema: z.object({
      label: z.string().describe('Event label'),
      days: z.number().describe('Aantal dagen tot event'),
      sublabel: z.string().optional().describe('Extra context'),
      module: moduleEnum.describe('Kleurmodule'),
      href: z.string().optional().describe('Link'),
    }),
  }),

  showGoalProgress: tool({
    description: 'Toon doelvoortgang met mini-balk, deadline en on-track indicator.',
    inputSchema: z.object({
      name: z.string().describe('Doelnaam, bijv. "Noodfonds"'),
      percentage: z.number().describe('Voortgang 0-100'),
      current: z.string().describe('Huidig bedrag, bijv. "€ 3.200"'),
      target: z.string().describe('Doelbedrag, bijv. "€ 5.000"'),
      targetDate: z.string().optional().describe('Deadline, bijv. "dec 2026"'),
      onTrack: z.boolean().describe('Is het doel op schema?'),
      module: moduleEnum.describe('Kleurmodule (gebruik "wil")'),
      href: z.string().optional().describe('Link naar doel'),
    }),
  }),

  showBudgetBar: tool({
    description: 'Toon een horizontale bar voor een specifiek budget met status.',
    inputSchema: z.object({
      name: z.string().describe('Budgetnaam, bijv. "Boodschappen"'),
      spent: z.string().describe('Besteed bedrag, bijv. "€ 342"'),
      limit: z.string().describe('Budgetlimiet, bijv. "€ 500"'),
      percentage: z.number().describe('Percentage besteed 0-100+'),
      remainingDays: z.number().optional().describe('Resterende dagen in de maand'),
      status: z.enum(['healthy', 'warning', 'over']).describe('Budget status: healthy (<75%), warning (75-100%), over (>100%)'),
      href: z.string().optional().describe('Link naar budget detail'),
    }),
  }),

  showQuote: tool({
    description: 'Toon een motiverend of reflectief citaat passend bij de financiele situatie. Gebruik voor inspirerende of filosofische reflecties over vrijheid en geld.',
    inputSchema: z.object({
      text: z.string().describe('Het citaat zelf (max 2-3 zinnen, motiverend of reflectief)'),
      attribution: z.string().optional().describe('Bron van het citaat, bijv. "Will" of "Stoicijnse wijsheid"'),
      module: moduleEnum.describe('Kleurmodule (gebruik "wil" voor redactionele citaten)'),
    }),
  }),

  showStreak: tool({
    description: 'Vier een positieve streak (bijv. 4 maanden vermogensgroei, 12 dagen binnen budget). Vuur-visueel.',
    inputSchema: z.object({
      label: z.string().describe('Streak naam, bijv. "Vermogensgroei"'),
      count: z.number().describe('Aantal perioden, bijv. 4'),
      unit: z.enum(['dagen', 'weken', 'maanden']).describe('Tijdseenheid'),
      description: z.string().describe('Korte beschrijving, bijv. "Al 4 maanden op rij stijgt je vermogen"'),
      module: moduleEnum.describe('Kleurmodule'),
    }),
  }),

  showRecurring: tool({
    description: 'Toon een overzicht van de top terugkerende kosten (vaste lasten/abonnementen) met maandelijks bedrag en vrijheidstijd-impact per item.',
    inputSchema: z.object({
      title: z.string().describe('Titel, bijv. "Terugkerende kosten"'),
      items: z.array(z.object({
        name: z.string().describe('Naam van de terugkerende kost, bijv. "Netflix"'),
        amount: z.string().describe('Maandelijks bedrag, bijv. "€ 15,99"'),
        freedomStr: z.string().optional().describe('Vrijheidstijd-impact, bijv. "0,5 dag"'),
      })).describe('Top 3-5 terugkerende kosten'),
      totalAmount: z.string().describe('Totaal maandelijks bedrag, bijv. "€ 1.250"'),
      totalFreedomStr: z.string().optional().describe('Totale vrijheidstijd-impact, bijv. "12,5 dagen"'),
    }),
  }),
}
