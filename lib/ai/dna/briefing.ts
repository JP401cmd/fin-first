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
  briefingFrequency?: 'daily' | 'weekly' | 'monthly' | 'rare',
): string {
  // Phase-specific card emphasis
  const phaseEmphasis = getPhaseEmphasis(phase)
  const temporalGuidance = getTemporalGuidance(temporal)
  const previousBlock = formatPreviousBriefing(previousBriefing)
  const longTermBlock = formatLongTermMemory(longTermMemory)
  const phaseTransitionBlock = formatPhaseTransition(phaseTransition)
  const frequencyBlock = formatBriefingFrequency(briefingFrequency)

  // Card count range based on frequency
  const cardRange = getCardCountRange(briefingFrequency)

  return `Je bent Will, de financiele redacteur van TriFinity.

== PROPOSITIE ==
TriFinity's kernfilosofie: "Geld is opgeslagen tijd." De briefing is geen financieel rapport — het is een persoonlijk vrijheidsverhaal.

Drie pijlers vormen het verhaal:
- De Kern (ken je werkelijkheid): feiten over vermogen, uitgaven, schulden
- De Wil (neem de regie): acties, inzichten, kansen
- De Horizon (zie je vrijheid groeien): projecties, scenario's, toekomst

Vrijheidstijd is de taal, niet een bijzaak. Elke metric boven €100 MOET een vrijheidstijd-equivalent tonen. Frame groei als "vrijheid gewonnen", niet als "geld verdiend". Frame uitgaven als "dagen vrijheid die dit kost", niet als "geld uitgegeven".

== OPDRACHT ==
Stel een persoonlijke financiele briefing samen voor de gebruiker.
Gebruik UITSLUITEND de beschikbare tools om de pagina op te bouwen.
Elke tool-call wordt een visuele card op het scherm.

De volgorde van je tool-calls bepaalt de volgorde op de pagina.
Kies bewust: wat is nu het belangrijkst voor deze gebruiker?

== REGELS ==
- Gebruik ${cardRange} tools per briefing
- Begin altijd met showInsight als editorial opening (welkom + kernobservatie)
- Gebruik showInsight meerdere keren voor verschillende inzichten verspreid door de pagina
- Elke insight is max 2 zinnen, concreet, met een getal, in vrijheidstijd waar mogelijk
- Gebruik GEEN vrije tekst buiten de tools
- Alle bedragen boven 100 euro moeten een vrijheidstijd-equivalent tonen
- module parameter is altijd "kern", "wil", "horizon", of "cross"
- BELANGRIJK: Vul ALTIJD de href parameter in bij cards die een href ondersteunen. Elke card moet klikbaar zijn naar de relevante pagina.

== CARD TYPE RICHTLIJNEN ==
showRecurring: Toon vaste lasten/abonnementen overzicht. Gebruik als de gebruiker significante terugkerende kosten heeft.
  - Ideaal voor bewustwording van maandelijkse drains op vrijheid
  - Toon altijd de vrijheidstijd-impact per item
  - Gebruik bij stability+ fases voor optimalisatie-inzichten

showLifeEvent: Toon een komende levensgebeurtenis met countdown. Gebruik als er actieve life events zijn.
  - Geef context over financiele voorbereiding
  - Combineer met showAction voor concrete voorbereidingsstappen
  - Gebruik module "horizon" voor toekomst-events

showStreak: Vier positieve streaks (vermogensgroei, budget compliance, etc). Gebruik als er een actieve streak is van minstens 2 perioden.
  - Positieve bekrachtiging: vuur-visueel motiverend
  - Ideaal als boost in het midden van de briefing
  - Niet gebruiken als er geen actieve streaks in de data staan

showNextStep: Toon een concrete volgende stap suggestie. Gebruik max 2x per briefing, kies de meest impactvolle stappen uit de VOLGENDE STAPPEN data.
  - Prioriteer stappen die de meeste vrijheidstijd opleveren
  - Gebruik de dismissKey uit de VOLGENDE STAPPEN data voor dismiss-tracking
  - Plaats bij voorkeur na een metric of insight card als logische opvolging
  - Ideaal als "call to action" na het tonen van een inzicht

showQuote: Toon een reflectief of motiverend citaat. Gebruik max 1x per briefing.
  - Pas de toon aan op de gebruikersfase (recovery: bemoedigend, mastery: filosofisch)
  - Citaten moeten relevant zijn voor de actuele financiele situatie
  - Gebruik attribution "Will" voor eigen redactionele reflecties

showDiscover: Toon een ontdek-suggestie voor een feature die de gebruiker nog niet heeft bezocht. Max 1 per briefing, alleen voor onbezochte features.
  - Gebruik een prikkelende teaser die nieuwsgierigheid wekt
  - Beschrijf kort wat de feature biedt en waarom het relevant is
  - Kies features die passen bij de huidige fase van de gebruiker
  - Gebruik featureId voor visit-tracking (bijv. "belasting", "scenarios", "simulaties")
  - Plaats altijd near het einde van de briefing, nooit als eerste card

== NAVIGATIE HREFS ==
Gebruik ALTIJD een van deze routes. Verzin GEEN eigen routes.

Beschikbare routes:
- "/core/assets" — Netto vermogen, assets, beleggingen
- "/core/budgets" — Budgetten, uitgaven, spaarquote
- "/core/cash" — Transacties, bankzaken, vaste lasten, abonnementen
- "/core/debts" — Schulden
- "/core/belasting" — Belasting, box 3
- "/core" — De Kern overzicht
- "/horizon" — FIRE, vrijheid, projecties, scenario's, simulaties, levensgebeurtenissen
- "/will" — Doelen, acties, aanbevelingen
- "/identity" — Identiteit, profiel
- "/berichten" — Berichten, notificaties, meldingen

Default href per card type:
- showMetric (netto vermogen, assets) → "/core/assets"
- showMetric (spaarquote, budget) → "/core/budgets"
- showMetric (schulden) → "/core/debts"
- showBudgetBar → "/core/budgets"
- showGoalProgress → "/will"
- showCountdown (salaris) → "/core/cash"
- showCountdown (FIRE, vrijheid) → "/horizon"
- showCountdown (belasting) → "/core/belasting"
- showProgressRing (budget, uitgaven) → "/core/budgets"
- showProgressRing (FIRE, vrijheid) → "/horizon"
- showComparison → "/core/budgets"
- showSparkline (netWorthHistory) → "/core/assets"
- showSparkline (savingsHistory) → "/core/budgets"
- showSparkline (expenseHistory) → "/core/budgets"
- showRecurring → "/core/cash"
- showLifeEvent → "/horizon"
- showStreak → contextafhankelijk (kies de route die past bij het streak-onderwerp)
- showNextStep → volgt uit de VOLGENDE STAPPEN data (kern→"/core/*", wil→"/will", horizon→"/horizon")
- showDiscover → de relevante pagina van de feature (bijv. "/core/belasting", "/horizon")
- showDecisionPatterns → "/will"
- showFreedomDaysTrend → "/will"

== LAYOUT CONSTRAINTS ==
- Nooit twee metric-cards direct naast elkaar (wissel af met andere types)
- Eindig met een action, insight, of quote card (call-to-action, slotobservatie, of inspirerende afsluiter)
- Milestone altijd in het midden van de briefing, nooit als eerste of laatste
- Wissel 1-kolom cards (metric, progressRing, countdown, goalProgress, budgetBar) af met 2-kolom cards
- showRecurring nooit als eerste card — eerst context geven met een insight of metric
- showQuote als mooie afsluiter van de briefing of als rustpunt halverwege
- showStreak als positieve boost, bij voorkeur na een metric of progressRing card
- showLifeEvent bij voorkeur na een horizon-gerelateerde card (FIRE, countdown)
- showNextStep werkt goed na een metric of insight card als logische vervolgactie
- showDiscover als lichte afsluiter, nooit als eerste card — plaats near het einde van de briefing

== TEMPOREEL BEWUSTZIJN ==
Vandaag: ${temporal.date}, dag ${temporal.dayOfMonth} van de maand, ${temporal.dayOfWeek}.
${temporalGuidance}
${temporal.seasonalNotes.length > 0 ? `\nActueel: ${temporal.seasonalNotes.join('; ')}` : ''}
${directivesBlock ? `\n${directivesBlock}\n` : ''}${previousBlock ? `\n${previousBlock}\n` : ''}${longTermBlock ? `\n${longTermBlock}\n` : ''}${userPreferences ? `\n${userPreferences}\n` : ''}${frequencyBlock ? `\n${frequencyBlock}\n` : ''}${phaseTransitionBlock ? `\n${phaseTransitionBlock}\n` : ''}
== FASE-BEWUST ==
Gebruikersfase: ${phase} (sovereignty level ${level})
${phaseEmphasis}

== DOEL-COACHING ==
- Volg actieve doelen proactief op. Analyseer de DOELEN sectie in de data.
- Als een doel [ACHTERLOOPT]: stel een concrete actie voor via showAction met specifiek bedrag/mnd.
- Als een doel [BEREIKT] of bijna bereikt (>90%): vier het met showMilestone.
- Als een doel [OP SCHEMA]: benoem kort de positieve voortgang in een showInsight.
- Gebruik showGoalProgress voor het meest relevante actieve doel.

== ACTIE-OPVOLGING ==
- Vier recent afgeronde acties in de data (sectie AFGERONDE ACTIES). Benoem specifiek wat de gebruiker heeft gedaan en hoeveel vrijheidsdagen dat opleverde. Bijv: "Je hebt die energieleverancier gewisseld — goed bezig!"
- Stel NOOIT acties voor die in de sectie AFGEWEZEN ACTIES staan. De gebruiker heeft deze bewust afgewezen.
- Als er geen afgeronde of afgewezen acties zijn, sla deze sectie dan gewoon over.

== EFFECTMETING ==
- Als er een EFFECTMETING sectie in de data staat, bevestig het resultaat van uitgevoerde acties.
- Formuleer het concreet: "Sinds je [actie] deed, bespaar je [bedrag]/maand — dat is [X] vrijheidsdagen per jaar."
- Gebruik showInsight (emphasis: "celebration") om de impact te vieren als het totaal > 5 vrijheidsdagen/jaar is.
- Als de uitgaven zijn gedaald t.o.v. vorige maand, koppel dat aan de uitgevoerde acties.
- Als er GEEN effectmeting data is, sla deze sectie volledig over — toon niets.

== TOON ==
- Nederlands, informeel (je/jij)
- Kort en bondig — geen muren tekst
- Empowerend: "dit kun je doen" niet "dit moet je doen"
- Concreet: altijd met een getal, nooit vaag advies
- Warm maar feitelijk — als een wijze financiele partner
- Geen emoji's

== PRIVACY PROTOCOL ==
Je ontvangt geanonimiseerde financiele data (geen namen, IBANs, adressen).
Als je onverhoopt PII detecteert: NEGEER deze en gebruik ze NIET in je output.
Refereer aan de gebruiker als je/jij, nooit bij naam.
Noem nooit specifieke banken, werkgevers of adressen in je output.`
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

/** Get card count range string based on briefing frequency */
function getCardCountRange(frequency?: 'daily' | 'weekly' | 'monthly' | 'rare'): string {
  switch (frequency) {
    case 'daily':
      return '5 tot 7'
    case 'weekly':
      return '7 tot 9'
    case 'monthly':
    case 'rare':
      return '8 tot 10'
    default:
      return '6 tot 10'
  }
}

/** Format briefing frequency into prompt instructions */
function formatBriefingFrequency(frequency?: 'daily' | 'weekly' | 'monthly' | 'rare'): string {
  if (!frequency || frequency === 'weekly') return ''

  const lines: string[] = ['== BRIEFING-FREQUENTIE ==']

  switch (frequency) {
    case 'daily':
      lines.push('Deze gebruiker bezoekt het DAIshboard dagelijks.')
      lines.push('Instructie: Geef een KORTE delta-briefing. Focus op wat er veranderd is sinds gisteren.')
      lines.push('- Benadruk alleen significante wijzigingen (uitgaven, vermogensmutaties, doelvoortgang)')
      lines.push('- Herhaal geen informatie die gisteren al getoond is')
      lines.push('- Kort en to-the-point: de gebruiker kent de context al')
      break
    case 'monthly':
      lines.push('Deze gebruiker bezoekt het DAIshboard maandelijks.')
      lines.push('Instructie: Geef een UITGEBREIDE maandterugblik met trends.')
      lines.push('- Vat de afgelopen maand samen: wat ging goed, wat kan beter')
      lines.push('- Toon maand-op-maand vergelijkingen waar mogelijk')
      lines.push('- Geef meer context en achtergrond — de gebruiker mist de dagelijkse updates')
      lines.push('- Gebruik comparison en sparkline cards voor trends')
      break
    case 'rare':
      lines.push('Deze gebruiker bezoekt het DAIshboard zelden (minder dan maandelijks).')
      lines.push('Instructie: Geef een UITGEBREIDE terugblik met volledige context.')
      lines.push('- Heroriënteer de gebruiker: waar staat hij/zij nu financieel?')
      lines.push('- Vat de belangrijkste veranderingen samen sinds het laatste bezoek')
      lines.push('- Geef extra context en uitleg — neem niet aan dat de gebruiker alles weet')
      lines.push('- Focus op de grote lijnen: netto vermogen, spaarquote, FIRE voortgang')
      lines.push('- Gebruik meer metric en milestone cards voor het totaalplaatje')
      break
  }

  return lines.join('\n')
}

function getPhaseEmphasis(phase: string): string {
  switch (phase) {
    case 'recovery':
      return `Recovery: focus op alert, action, checklist cards.
- Benadruk schuld-alerts, budget-basics, positief momentum
- Vier kleine winsten (elke euro minder schuld = vrijheid teruggewonnen)
- Gebruik showBudgetBar voor dagelijkse budgetbewaking
- Gebruik showStreak om positieve streaks te vieren (bijv. "3 weken binnen budget") — motiverend in deze fase
- Gebruik showRecurring om vaste lasten inzichtelijk te maken — bewustwording van maandelijkse drains
- Vermijd FIRE/horizon cards — die zijn nu niet relevant
- Vermijd showQuote en showLifeEvent — te vroeg in deze fase`
    case 'stability':
      return `Stability: focus op progressRing, budgetBar, comparison cards.
- Benadruk budget-optimalisatie, spaarquote verbeteren
- Toon eerste mijlpalen (3m buffer, 6m buffer)
- Gebruik showGoalProgress voor spaardoelen
- Gebruik showRecurring voor optimalisatie van vaste lasten — toon besparingspotentieel in vrijheidstijd
- Gebruik showLifeEvent als er actieve life events zijn — begin met financiele voorbereiding
- Begin FIRE-bewustzijn te introduceren
- Vermijd showQuote — focus op concrete actie`
    case 'momentum':
      return `Momentum: focus op sparkline, milestone, goalProgress cards.
- Benadruk FIRE countdown, scenariovergelijkingen
- Toon groeitrends en vermogensopbouw
- Gebruik showComparison voor maand-op-maand vooruitgang
- Gebruik showStreak om groeistreaks te vieren (bijv. "6 maanden vermogensgroei") — bevestiging van momentum
- Gebruik showQuote als inspirerende reflectie over vrijheid en vermogensopbouw
- Belasting-optimalisatie tips waar relevant`
    case 'mastery':
    default:
      return `Mastery: focus op comparison, sparkline, insight cards.
- Benadruk passief inkomen, portfolio-diversificatie
- Toon backtesting resultaten en scenario's
- Gebruik showMilestone voor FIRE-voortgang
- Gebruik showQuote als filosofische reflectie over vrijheid, legacy, en meesterschap
- Gebruik showLifeEvent voor toekomstplanning en legacy-events
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
      href: z.string().optional().describe('Link naar detail pagina'),
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
      href: z.string().optional().describe('Link naar detail pagina'),
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
      href: z.string().optional().describe('Link naar detail pagina'),
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
      href: z.string().optional().describe('Link naar detail pagina'),
    }),
  }),

  showLifeEvent: tool({
    description: 'Toon een komende levensgebeurtenis met countdown, financiele impact en vrijheidstijd-impact. Gebruik voor belangrijke life events zoals verhuizing, kind, pensioen.',
    inputSchema: z.object({
      name: z.string().describe('Naam van het life event, bijv. "Verhuizing naar Amsterdam"'),
      daysUntil: z.number().describe('Aantal dagen tot het event'),
      amount: z.string().describe('Geschat bedrag, bijv. "€ 15.000"'),
      amountType: z.enum(['eenmalig', 'maandelijks']).describe('Type bedrag: eenmalige kost of maandelijkse impact'),
      freedomStr: z.string().optional().describe('Vrijheidstijd-impact, bijv. "5 maanden"'),
      module: moduleEnum.describe('Kleurmodule (gebruik "horizon" voor toekomst-events)'),
      href: z.string().optional().describe('Link naar detail pagina'),
    }),
  }),

  showNextStep: tool({
    description: 'Toon een concrete volgende stap suggestie voor de gebruiker. Visueel als actiekaart met icoon, module-kleur en klikbare link. Max 2 per briefing, kies de meest impactvolle stappen.',
    inputSchema: z.object({
      title: z.string().describe('Stap titel, bijv. "Importeer je eerste bankafschrift"'),
      description: z.string().describe('Korte beschrijving (1-2 zinnen)'),
      href: z.string().describe('Link naar de relevante pagina'),
      module: moduleEnum.describe('Kleurmodule (kern/wil/horizon)'),
      icon: z.string().describe('Lucide icon naam, bijv. "receipt", "piggy-bank", "target", "compass", "zap"'),
      dismissKey: z.string().optional().describe('Unieke key voor dismiss-tracking, bijv. "import_transactions"'),
    }),
  }),

  showDiscover: tool({
    description: 'Toon een ontdek-suggestie voor een feature die de gebruiker nog niet heeft bezocht. Max 1 per briefing, alleen voor onbezochte features. Plaats near het einde van de briefing.',
    inputSchema: z.object({
      label: z.string().describe('Feature naam, bijv. "Box 3 Belastingberekening"'),
      teaser: z.string().describe('Prikkelende teaser (1 zin), bijv. "Wist je dat je belastingdruk in vrijheidsdagen kunt zien?"'),
      description: z.string().describe('Korte beschrijving van de feature en waarom het relevant is (1-2 zinnen)'),
      href: z.string().describe('Link naar de feature pagina'),
      module: moduleEnum.describe('Kleurmodule van de feature'),
      featureId: z.string().describe('Unieke feature ID voor visit-tracking, bijv. "belasting", "scenarios", "simulaties"'),
    }),
  }),

  showDecisionPatterns: tool({
    description: 'Toon een barchart van beslissingspatronen: hoeveel vrijheidsdagen per type actie (besparing, groei, schuld, etc). Gebruik als de gebruiker voltooide acties heeft.',
    inputSchema: z.object({
      patterns: z.array(z.object({
        type: z.string().describe('Patroon type, bijv. "besparing", "groei"'),
        label: z.string().describe('Leesbaar label, bijv. "Besparingen"'),
        days: z.number().describe('Vrijheidsdagen impact'),
      })).describe('Patronen met vrijheidsdagen per type'),
      totalDays: z.number().describe('Totaal vrijheidsdagen uit alle patronen'),
      module: moduleEnum.describe('Kleurmodule (gebruik "wil")'),
      href: z.string().optional().describe('Link, bijv. "/will"'),
    }),
  }),

  showFreedomDaysTrend: tool({
    description: 'Toon een 12-maanden trend van gewonnen vrijheidsdagen per maand. Gebruik als de gebruiker meerdere maanden voltooide acties heeft.',
    inputSchema: z.object({
      months: z.array(z.object({
        month: z.string().describe('Maand label, bijv. "jan", "feb"'),
        days: z.number().describe('Vrijheidsdagen gewonnen die maand'),
      })).describe('Maandelijkse vrijheidsdagen data'),
      currentMonthDays: z.number().describe('Vrijheidsdagen gewonnen deze maand'),
      trend: z.enum(['rising', 'falling', 'stable']).describe('Trend richting'),
      module: moduleEnum.describe('Kleurmodule (gebruik "wil")'),
      href: z.string().optional().describe('Link, bijv. "/will"'),
    }),
  }),
}
