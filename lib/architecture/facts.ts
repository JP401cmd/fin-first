// ── Getypeerde toegang tot docs/architecture/architecture.json ───────────────
// De gegenereerde snapshot is groot en los getypeerd. selectInsights() leest er
// defensief de subset uit die de plaat nodig heeft en geeft een stabiel,
// klein object terug dat de server-page aan de client doorgeeft. Zo is de
// client losgekoppeld van de exacte JSON-vorm en blijft de RSC-payload klein.

export interface ApiRouteFact {
  url: string
  methods: string[]
}

export interface ApiDomainFacts {
  label: string
  count: number
  routes: ApiRouteFact[]
}

/** Eén tabel die door een API-domein wordt geraakt (Wave 2 — scanTableAccess) */
export interface TableTouch {
  name: string
  write: boolean
}

/** Welke domeinen een tabel raken (Wave 2) */
export interface TableWriter {
  domain: string
  label: string
  write: boolean
  routes: string[]
}

export interface TableAccessFacts {
  /** Per API-domein de tabellen die het leest/schrijft */
  byDomain: Record<string, TableTouch[]>
  /** Per tabel welke domeinen die raken */
  byTable: Record<string, TableWriter[]>
  /** Tabellen die door meer dan één domein worden geschréven (koppelrisico) */
  multiWriter: string[]
}

/** Churn per gebied + hot files (Wave 3 — scanChurn) */
export interface ChurnArea {
  path: string
  commits: number
}

export interface ChurnHotFile {
  file: string
  loc: number
  commits: number
}

export interface ChurnFacts {
  sinceDays: number
  areas: ChurnArea[]
  hotFiles: ChurnHotFile[]
}

/** Architecture Decision Record (Wave 3 — scanAdrs) */
export interface AdrFact {
  id: string
  title: string
  status: string
  date: string
  /** Element-id's waarop dit besluit slaat (frontmatter `elements:`) */
  elements: string[]
  summary: string
  file: string
}

/** Eén tabel binnen een domein-groep (uit tablesByDomain) */
export interface DomainTable {
  name: string
}
export interface TableDomainGroup {
  domain: string
  tables: DomainTable[]
}

/** Foreign-key-relatie tussen twee tabellen */
export interface TableRelation {
  from: string
  to: string
  column: string
}
/** Eigenaarschap + RLS per tabel */
export interface TableMeta {
  user: boolean
  household: boolean
  rls: boolean
}
export interface TableRelations {
  relations: TableRelation[]
  meta: Record<string, TableMeta>
}

/** Dagelijkse meetwaarden voor de trend-sparkline (Wave 3) */
export interface StatsHistoryEntry {
  date: string
  api: number
  components: number
  tables: number
  routesProduction: number
}

export interface ArchInsights {
  apiByDomain: Record<string, ApiDomainFacts>
  tableAccess: TableAccessFacts | null
  tablesByDomain: TableDomainGroup[]
  tableRelations: TableRelations | null
  churn: ChurnFacts | null
  adrs: AdrFact[]
  statsHistory: StatsHistoryEntry[]
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Leest defensief de `claudeTeam`-sleutel uit de gegenereerde snapshot. Geeft
 * altijd een geldig (eventueel leeg) `ClaudeTeamFacts`-object terug, zodat
 * `buildDevelopmentModel` nooit op een ontbrekende/oude snapshot stukloopt.
 * Vorm volgt `scripts/architecture/generate.mjs` → architecture.json.claudeTeam.
 */
export function selectClaudeTeam(raw: unknown): {
  agents: Array<{ id: string; name: string; description: string; model?: string; color?: string }>
  skills: Array<{
    id: string
    name: string
    description: string
    steps: Array<{ index: number; title: string; agents: string[] }>
  }>
} {
  const root = asRecord(raw)
  const team = asRecord(root.claudeTeam)

  const agents = asArray(team.agents).map((a) => {
    const aa = asRecord(a)
    const model = asString(aa.model)
    const color = asString(aa.color)
    return {
      id: asString(aa.id),
      name: asString(aa.name) || asString(aa.id),
      description: asString(aa.description),
      ...(model ? { model } : {}),
      ...(color ? { color } : {}),
    }
  }).filter((a) => a.id)

  const skills = asArray(team.skills).map((s) => {
    const ss = asRecord(s)
    return {
      id: asString(ss.id),
      name: asString(ss.name) || asString(ss.id),
      description: asString(ss.description),
      steps: asArray(ss.steps).map((st) => {
        const stt = asRecord(st)
        return {
          index: asNumber(stt.index),
          title: asString(stt.title),
          agents: asArray(stt.agents).map(asString).filter(Boolean),
        }
      }),
    }
  }).filter((s) => s.id)

  return { agents, skills }
}

export function selectInsights(raw: unknown): ArchInsights {
  const root = asRecord(raw)

  // apiByDomain: array → map, routes gecomprimeerd tot {url, methods}
  const apiByDomain: Record<string, ApiDomainFacts> = {}
  for (const entry of asArray(root.apiByDomain)) {
    const e = asRecord(entry)
    const domain = asString(e.domain)
    if (!domain) continue
    apiByDomain[domain] = {
      label: asString(e.label) || domain,
      count: asNumber(e.count),
      routes: asArray(e.routes).map((r) => {
        const rr = asRecord(r)
        return { url: asString(rr.url), methods: asArray(rr.methods).map(asString) }
      }),
    }
  }

  // tableAccess (Wave 2)
  let tableAccess: TableAccessFacts | null = null
  if (root.tableAccess && typeof root.tableAccess === 'object') {
    const ta = asRecord(root.tableAccess)
    const byDomain: Record<string, TableTouch[]> = {}
    for (const [domain, touches] of Object.entries(asRecord(ta.byDomain))) {
      byDomain[domain] = asArray(touches).map((t) => {
        const tt = asRecord(t)
        return { name: asString(tt.name), write: Boolean(tt.write) }
      })
    }
    const byTable: Record<string, TableWriter[]> = {}
    for (const [table, writers] of Object.entries(asRecord(ta.byTable))) {
      byTable[table] = asArray(writers).map((w) => {
        const ww = asRecord(w)
        return {
          domain: asString(ww.domain),
          label: asString(ww.label) || asString(ww.domain),
          write: Boolean(ww.write),
          routes: asArray(ww.routes).map(asString),
        }
      })
    }
    tableAccess = { byDomain, byTable, multiWriter: asArray(ta.multiWriter).map(asString) }
  }

  // tablesByDomain (datamodel-groepen)
  const tablesByDomain: TableDomainGroup[] = asArray(root.tablesByDomain).map((g) => {
    const gg = asRecord(g)
    return {
      domain: asString(gg.domain),
      tables: asArray(gg.tables).map((t) => ({ name: asString(asRecord(t).name) })).filter((t) => t.name),
    }
  })

  // tableRelations (FK's + eigenaarschap + RLS)
  let tableRelations: TableRelations | null = null
  if (root.tableRelations && typeof root.tableRelations === 'object') {
    const tr = asRecord(root.tableRelations)
    const relations: TableRelation[] = asArray(tr.relations).map((r) => {
      const rr = asRecord(r)
      return { from: asString(rr.from), to: asString(rr.to), column: asString(rr.column) }
    }).filter((r) => r.from && r.to)
    const meta: Record<string, TableMeta> = {}
    for (const [name, m] of Object.entries(asRecord(tr.meta))) {
      const mm = asRecord(m)
      meta[name] = { user: Boolean(mm.user), household: Boolean(mm.household), rls: Boolean(mm.rls) }
    }
    tableRelations = { relations, meta }
  }

  // churn (Wave 3)
  let churn: ChurnFacts | null = null
  if (root.churn && typeof root.churn === 'object') {
    const c = asRecord(root.churn)
    churn = {
      sinceDays: asNumber(c.sinceDays),
      areas: asArray(c.areas).map((a) => {
        const aa = asRecord(a)
        return { path: asString(aa.path), commits: asNumber(aa.commits) }
      }),
      hotFiles: asArray(c.hotFiles).map((h) => {
        const hh = asRecord(h)
        return { file: asString(hh.file), loc: asNumber(hh.loc), commits: asNumber(hh.commits) }
      }),
    }
  }

  // adrs (Wave 3)
  const adrs: AdrFact[] = asArray(root.adrs).map((a) => {
    const aa = asRecord(a)
    return {
      id: asString(aa.id),
      title: asString(aa.title),
      status: asString(aa.status),
      date: asString(aa.date),
      elements: asArray(aa.elements).map(asString),
      summary: asString(aa.summary),
      file: asString(aa.file),
    }
  })

  // statsHistory (Wave 3)
  const statsHistory: StatsHistoryEntry[] = asArray(root.statsHistory).map((s) => {
    const ss = asRecord(s)
    return {
      date: asString(ss.date),
      api: asNumber(ss.api),
      components: asNumber(ss.components),
      tables: asNumber(ss.tables),
      routesProduction: asNumber(ss.routesProduction),
    }
  })

  return { apiByDomain, tableAccess, tablesByDomain, tableRelations, churn, adrs, statsHistory }
}
