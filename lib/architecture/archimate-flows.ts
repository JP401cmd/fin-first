// ── Informatiestromen (gecureerde waardeketens) ──────────────────────────────
// Eén statische lagenplaat vertelt geen stromen. Deze flows leggen de paden
// bloot die de app écht verklaren: elke stap wijst naar een element op de plaat
// plus het concrete artefact (bestand/route/tabel/functie). Houd ze bij wanneer
// een keten verandert.

import type { ArchimateModel } from './archimate-model'

export interface ArchiFlowStep {
  /** Element op de plaat waar deze stap speelt (moet bestaan in het model) */
  elementId: string
  label: string
  /** Concreet artefact: bestand, route, tabel of functie */
  artifact?: string
  detail?: string
}

export interface ArchiFlow {
  id: string
  title: string
  lead: string
  steps: ArchiFlowStep[]
}

export const ARCHI_FLOWS: ArchiFlow[] = [
  {
    id: 'transactie-naar-vrijheid',
    title: 'Transactie → vrijheid',
    lead: 'De kernketen van de app: een bankboeking wordt uiteindelijk een FIRE-datum. Hier zie je waarom “spaarquote × inkomen” de prognose drijft.',
    steps: [
      { elementId: 't-bankimport', label: 'Bank-bestand inlezen', artifact: 'lib/parsers/*', detail: 'Coherente dedup via import_hash + bank_seq.' },
      { elementId: 'do-transactie', label: 'Transactie vastgelegd', artifact: 'transactions', detail: 'Eigen-rekening-transfers krijgen een zichtbare budgetpost.' },
      { elementId: 'as-budget', label: 'Budget-match + spaarquote', artifact: 'lib/savings-source.ts', detail: 'Cashflow-spaarquote = (inkomen − uitgaven) / inkomen.' },
      { elementId: 'as-planning', label: 'Spaarquote × inkomen → projectie', artifact: 'runHorizonLedger', detail: 'Geïndexeerd in de grootboek-engine v2, met aflossing-dubbeltel-guard.' },
      { elementId: 'fn-toekomstplannen', label: 'FIRE-datum', artifact: 'computeFireRange', detail: 'Het eindresultaat: jaren vrijheid.' },
    ],
  },
  {
    id: 'ai-context',
    title: 'AI-contextketen',
    lead: 'Hoe Will weet waar hij het over heeft. Negen context-builders worden compositioneel samengevoegd tot één prompt-context.',
    steps: [
      { elementId: 'data-cont', label: 'Bronnen uit Postgres', artifact: 'Promise.all([...buildXContext])', detail: '9 builders, RLS-gefilterd.' },
      { elementId: 'as-coach', label: 'buildContext() stelt samen', artifact: 'lib/ai/context/builder.ts', detail: 'Een nieuw domein plugt in met één extra buildXContext.' },
      { elementId: 't-aigateway', label: 'Will / briefing redigeren', artifact: 'Vercel AI SDK', detail: 'streamText (chat) + generateObject (briefing-redactie met nummer-guard).' },
      { elementId: 'sp-inzicht', label: 'Aanbevelingen & acties', artifact: '/api/ai/actions', detail: 'Aandachtspunten-bus voegt punten als actie toe.' },
    ],
  },
  {
    id: 'huishouden',
    title: 'Huishouden-keten',
    lead: 'Hoe twee partners dezelfde financiën zien zonder elkaars rijen direct te lezen — eigendom en RLS doen het werk.',
    steps: [
      { elementId: 'do-huishouden', label: 'Koppeling + eigendom', artifact: 'households + write-trigger', detail: 'Elke rij krijgt een eigenaar bij schrijven.' },
      { elementId: 'as-huishouden', label: 'RLS-veilige RPC’s', artifact: '/api/household/*', detail: 'Cross-user lezen alleen via RPC, nooit directe selects.' },
      { elementId: 'sp-vermogen', label: 'Perspectief op de domeinen', detail: 'Eigen / huishouden / partner over bezittingen, schulden, cashflow, belasting en FIRE.' },
    ],
  },
  {
    id: 'snapshot-trend',
    title: 'Snapshot → trend',
    lead: 'Hoe historische foto’s van je vermogen trends, backtests en dashboard-widgets voeden.',
    steps: [
      { elementId: 'do-meta', label: 'Nachtelijke snapshot', artifact: 'net_worth_snapshots', detail: 'Automatische vermogens-foto per dag.' },
      { elementId: 'as-rapport', label: 'Trends & backtest', artifact: 'runBacktest', detail: 'Slaagkans + named paths uit horizon-data.' },
      { elementId: 'fn-inzicht_acties', label: 'Widgets & trends', detail: 'Trend-inkomen/uitgaven/sparen op het dashboard.' },
    ],
  },
]

export interface FlowHighlight {
  nodeIds: Set<string>
  edgeIds: Set<string>
}

/**
 * De elementen + relaties die bij een flow horen. Tussen twee opeenvolgende
 * stappen lichten we de relatie op als die bestaat (ongeacht richting); zo niet,
 * dan blijven enkel de elementen geaccentueerd.
 */
export function getFlowHighlight(model: ArchimateModel, flow: ArchiFlow): FlowHighlight {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  for (const s of flow.steps) nodeIds.add(s.elementId)
  for (let i = 0; i < flow.steps.length - 1; i++) {
    const a = flow.steps[i].elementId
    const b = flow.steps[i + 1].elementId
    const edge = model.edges.find(
      (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
    )
    if (edge) edgeIds.add(edge.id)
  }
  return { nodeIds, edgeIds }
}

/** Valideert dat elke flow-stap naar een bestaand element wijst. */
export function validateFlows(model: ArchimateModel): string[] {
  const ids = new Set(model.nodes.map((n) => n.id))
  const errors: string[] = []
  const seen = new Set<string>()
  for (const f of ARCHI_FLOWS) {
    if (seen.has(f.id)) errors.push(`dubbele flow-id: ${f.id}`)
    seen.add(f.id)
    if (f.steps.length < 2) errors.push(`flow ${f.id} heeft minder dan 2 stappen`)
    for (const s of f.steps) if (!ids.has(s.elementId)) errors.push(`flow ${f.id} verwijst naar onbekend element ${s.elementId}`)
  }
  return errors
}
