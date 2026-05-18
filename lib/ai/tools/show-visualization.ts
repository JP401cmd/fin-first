import { z } from 'zod'
import { tool } from 'ai'

/**
 * Tool that allows the AI to produce structured visual cards in the chat:
 * - comparison: side-by-side comparison of two or more options
 * - metric_table: tabular display of key metrics
 * - bar_chart: simple horizontal bar chart for comparing values
 *
 * The AI provides the structured data; rendering happens client-side
 * using dedicated card components.
 */

const ComparisonItemSchema = z.object({
  label: z.string().describe('Kort label (bijv. "Scenario A", "Huidige situatie")'),
  value: z.string().describe('Primaire waarde (bijv. "€ 450.000", "62 jaar")'),
  detail: z.string().optional().describe('Optionele extra uitleg'),
  accent: z.enum(['positive', 'negative', 'neutral']).optional().describe('Kleuraccent'),
})

const MetricRowSchema = z.object({
  label: z.string().describe('Metriek-naam (bijv. "Spaarquote", "FIRE-leeftijd")'),
  value: z.string().describe('Waarde als leesbare string'),
  delta: z.string().optional().describe('Verschil (bijv. "+5%", "−3 jaar")'),
  accent: z.enum(['positive', 'negative', 'neutral']).optional().describe('Kleuraccent voor de delta'),
})

const BarItemSchema = z.object({
  label: z.string().describe('Label van de balk'),
  value: z.number().describe('Numerieke waarde'),
  formatted: z.string().describe('Geformatteerde weergave (bijv. "€ 1.200/mnd")'),
  accent: z.enum(['positive', 'negative', 'neutral']).optional().describe('Kleuraccent'),
})

export const showVisualizationTool = tool({
  description:
    'Toon een visuele kaart in de chat voor vergelijkingen, statistieken of grafieken. ' +
    'Gebruik dit wanneer een visueel overzicht de gebruiker helpt om data sneller te begrijpen ' +
    'dan een tekst-uitleg. Voorbeelden: vergelijk twee scenario\'s, toon kerngetallen, ' +
    'of visualiseer budgetverhoudingen. Gebruik altijd Nederlandse labels.',
  inputSchema: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('comparison'),
      title: z.string().describe('Titel van de vergelijking'),
      items: z.array(ComparisonItemSchema).min(2).max(4).describe('De opties om te vergelijken'),
      conclusion: z.string().optional().describe('Korte conclusie of aanbeveling'),
    }),
    z.object({
      kind: z.literal('metric_table'),
      title: z.string().describe('Titel van de tabel'),
      rows: z.array(MetricRowSchema).min(1).max(8).describe('De metrieken'),
      footer: z.string().optional().describe('Optionele voetnoot'),
    }),
    z.object({
      kind: z.literal('bar_chart'),
      title: z.string().describe('Titel van de grafiek'),
      items: z.array(BarItemSchema).min(2).max(6).describe('De balken'),
      unit: z.string().optional().describe('Eenheid (bijv. "€/mnd", "dagen")'),
    }),
  ]),
  execute: async (args) => {
    // Pass through — the structured data is rendered client-side
    return args
  },
})

/* ── Output types for the client ─────────────────────────────────── */

export type ComparisonItem = z.infer<typeof ComparisonItemSchema>
export type MetricRow = z.infer<typeof MetricRowSchema>
export type BarItem = z.infer<typeof BarItemSchema>

export type VisualizationOutput =
  | { kind: 'comparison'; title: string; items: ComparisonItem[]; conclusion?: string }
  | { kind: 'metric_table'; title: string; rows: MetricRow[]; footer?: string }
  | { kind: 'bar_chart'; title: string; items: BarItem[]; unit?: string }
