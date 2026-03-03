// ── Will's Briefing System Prompt + Tool Definitions ────────
// Used by /api/briefing/compose to let Will compose the dashboard.

import { z } from 'zod'
import { tool } from 'ai'
import type { TemporalContext } from '@/lib/briefing/types'

// ── System Prompt Builder ───────────────────────────────────

export function buildBriefingSystemPrompt(
  temporal: TemporalContext,
  phase: string,
  level: number,
): string {
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

== TEMPOREEL BEWUSTZIJN ==
Vandaag: ${temporal.date}, dag ${temporal.dayOfMonth} van de maand, ${temporal.dayOfWeek}.
- Dag 1-5: maand-terugblik, nieuw budget-overzicht
- Dag 6-22: focus op acties, voortgang, groei
- Dag 23-31: budget-druk, salaris countdown, maandafsluiting
- Maart-April: belastingaangifte prominent
- December: jaaroverzicht, feestdagen-budget
- Januari: goede voornemens, jaarplanning
${temporal.seasonalNotes.length > 0 ? `\nActueel: ${temporal.seasonalNotes.join('; ')}` : ''}

== FASE-BEWUST ==
Gebruikersfase: ${phase} (sovereignty level ${level})
- Recovery (-2 tot 0): schuld-alerts, budget-basics, positief momentum, kleine winsten vieren
- Stability (1-2): budget-optimalisatie, spaarquote verbeteren, eerste mijlpalen
- Momentum (3-4): FIRE countdown, scenariovergelijkingen, belasting-optimalisatie, groei
- Mastery (5-6): passief inkomen, portfolio, withdrawal strategie, legacy planning

== TOON ==
- Nederlands, informeel (je/jij)
- Kort en bondig — geen muren tekst
- Empowerend: "dit kun je doen" niet "dit moet je doen"
- Concreet: altijd met een getal, nooit vaag advies
- Warm maar feitelijk — als een wijze financiele partner
- Geen emoji's`
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
    description: 'Toon een mini trendlijn van vermogenshistorie.',
    inputSchema: z.object({
      label: z.string().describe('Label, bijv. "Vermogensverloop"'),
      value: z.string().describe('Huidige waarde'),
      dataKey: z.literal('netWorthHistory').describe('Altijd "netWorthHistory"'),
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
    }),
  }),

  showInsight: tool({
    description: 'Toon een redactioneel inzicht. Gebruik meerdere keren per briefing voor observaties verspreid door de pagina.',
    inputSchema: z.object({
      text: z.string().describe('Inzicht tekst (max 2 zinnen, concreet, met getal)'),
      emphasis: z.enum(['greeting', 'observation', 'celebration', 'tip']).optional().describe('Type nadruk'),
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
}
