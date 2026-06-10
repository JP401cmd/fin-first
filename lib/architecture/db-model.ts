// ── Datamodel-view (ERD) ─────────────────────────────────────────────────────
// Bouwt een deterministische entity-relationship-layout uit de gescande feiten
// (tablesByDomain + tableRelations). Domeinen worden kolommen, tabellen stapelen
// daarbinnen, foreign keys worden edges. Géén curatie nodig — alles komt uit de
// migraties via de generator; deze functie legt het alleen ruimtelijk neer.

import type { ArchInsights, TableMeta } from './facts'

export interface DbTable {
  name: string
  domain: string
  x: number
  y: number
  w: number
  h: number
  user: boolean
  household: boolean
  rls: boolean
}

export interface DbColumn {
  domain: string
  x: number
  y: number
  w: number
}

export interface DbEdge {
  id: string
  from: string
  to: string
  column: string
}

export interface DatabaseModel {
  width: number
  height: number
  columns: DbColumn[]
  tables: DbTable[]
  edges: DbEdge[]
}

// Domein-accentkleuren (cyclisch). Warm, papier-vriendelijk.
export const DB_DOMAIN_COLORS = [
  '#b45309', '#0f766e', '#7c3aed', '#b91c1c', '#0369a1',
  '#a16207', '#15803d', '#9333ea', '#be123c', '#1d4ed8',
]

export function domainColor(index: number): string {
  return DB_DOMAIN_COLORS[index % DB_DOMAIN_COLORS.length]
}

const PAD = 16
const COL_W = 172
const COL_GAP = 30
const HEADER_H = 30
const BOX_H = 30
const BOX_GAP = 8

export function buildDatabaseModel(facts: ArchInsights): DatabaseModel {
  const groups = facts.tablesByDomain
  const meta = facts.tableRelations?.meta ?? {}
  const relations = facts.tableRelations?.relations ?? []

  const tables: DbTable[] = []
  const columns: DbColumn[] = []
  let maxRows = 0

  groups.forEach((group, ci) => {
    const x = PAD + ci * (COL_W + COL_GAP)
    columns.push({ domain: group.domain, x, y: PAD, w: COL_W })
    group.tables.forEach((t, ri) => {
      const m: TableMeta = meta[t.name] ?? { user: false, household: false, rls: false }
      tables.push({
        name: t.name,
        domain: group.domain,
        x,
        y: PAD + HEADER_H + ri * (BOX_H + BOX_GAP),
        w: COL_W,
        h: BOX_H,
        user: m.user,
        household: m.household,
        rls: m.rls,
      })
    })
    maxRows = Math.max(maxRows, group.tables.length)
  })

  const tableNames = new Set(tables.map((t) => t.name))
  const edges: DbEdge[] = []
  const seen = new Set<string>()
  for (const r of relations) {
    if (!tableNames.has(r.from) || !tableNames.has(r.to)) continue
    const id = `${r.from}--${r.to}-${r.column}`
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ id, from: r.from, to: r.to, column: r.column })
  }

  const width = PAD + groups.length * (COL_W + COL_GAP)
  const height = PAD + HEADER_H + maxRows * (BOX_H + BOX_GAP) + PAD
  return { width, height, columns, tables, edges }
}

export interface DbRelationsFor {
  /** FK's die dit element naar andere tabellen legt */
  out: { table: string; column: string }[]
  /** Tabellen die naar dit element verwijzen */
  in: { table: string; column: string }[]
}

export function getDbRelationsFor(model: DatabaseModel, table: string): DbRelationsFor {
  const out: DbRelationsFor['out'] = []
  const inn: DbRelationsFor['in'] = []
  for (const e of model.edges) {
    if (e.from === table) out.push({ table: e.to, column: e.column })
    if (e.to === table) inn.push({ table: e.from, column: e.column })
  }
  return { out, in: inn }
}

/** Alle tabellen die via een FK direct verbonden zijn met `table`. */
export function getDbNeighbours(model: DatabaseModel, table: string): Set<string> {
  const set = new Set<string>()
  for (const e of model.edges) {
    if (e.from === table) set.add(e.to)
    if (e.to === table) set.add(e.from)
  }
  return set
}
