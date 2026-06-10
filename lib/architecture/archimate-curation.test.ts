import { describe, expect, it } from 'vitest'
import { buildArchimateModel, getElementImpact, getRelationsFor } from './archimate-model'
import { ARCHI_FLOWS, getFlowHighlight, validateFlows } from './archimate-flows'
import { ARCHI_CONCERNS, concernCountByElement, getConcernsFor, validateConcerns } from './archimate-concerns'

const model = buildArchimateModel({
  version: '0.71.0',
  generatedDate: '2026-06-10',
  stats: { api: 376, components: 706, providers: 12, tables: 47, migrations: 88 },
})
const nodeIds = new Set(model.nodes.map((n) => n.id))

describe('edge-verrijking', () => {
  it('kernrelaties dragen payload + mechanisme + cadans', () => {
    const enriched = model.edges.filter((e) => e.payload)
    expect(enriched.length).toBeGreaterThan(15)
    for (const e of enriched) {
      expect(e.mechanism, `${e.id} mist mechanisme`).toBeTruthy()
      expect(e.cadence, `${e.id} mist cadans`).toBeTruthy()
    }
  })

  it('contractDomains verwijzen naar plausibele API-domeinen (kebab-case)', () => {
    for (const e of model.edges) {
      for (const d of e.contractDomains ?? []) {
        expect(d, `${e.id} contractDomain ${d}`).toMatch(/^[a-z][a-z0-9-]*$/)
      }
    }
  })

  it('getRelationsFor levert beide richtingen', () => {
    const rel = getRelationsFor(model, 'as-coach')
    expect(rel.some((r) => r.outgoing)).toBe(true)
    expect(rel.some((r) => !r.outgoing)).toBe(true)
  })

  it('getElementImpact is gericht en bevat het element zelf niet', () => {
    const impact = getElementImpact(model, 'as-vermogen')
    expect(impact.downstream).not.toContain('as-vermogen')
    expect(impact.upstream).not.toContain('as-vermogen')
  })
})

describe('informatiestromen', () => {
  it('zijn valide tegen het model', () => {
    expect(validateFlows(model)).toEqual([])
  })

  it('elke flow heeft minstens 2 stappen die naar bestaande elementen wijzen', () => {
    for (const f of ARCHI_FLOWS) {
      expect(f.steps.length).toBeGreaterThanOrEqual(2)
      for (const s of f.steps) expect(nodeIds.has(s.elementId)).toBe(true)
    }
  })

  it('getFlowHighlight markeert alle stap-elementen', () => {
    const flow = ARCHI_FLOWS[0]
    const { nodeIds: hi } = getFlowHighlight(model, flow)
    for (const s of flow.steps) expect(hi.has(s.elementId)).toBe(true)
  })

  it('de kernketen verbindt bank-import met FIRE', () => {
    const flow = ARCHI_FLOWS.find((f) => f.id === 'transactie-naar-vrijheid')!
    const ids = flow.steps.map((s) => s.elementId)
    expect(ids[0]).toBe('t-bankimport')
    expect(ids[ids.length - 1]).toBe('fn-toekomstplannen')
  })
})

describe('aandachtspunten', () => {
  it('zijn valide tegen het model', () => {
    expect(validateConcerns(model)).toEqual([])
  })

  it('getConcernsFor en de telling zijn consistent', () => {
    const counts = concernCountByElement()
    for (const [id, n] of counts) {
      expect(getConcernsFor(id).length).toBe(n)
      expect(nodeIds.has(id)).toBe(true)
    }
  })

  it('dekt de bekende risico-gebieden', () => {
    const ids = ARCHI_CONCERNS.map((c) => c.id)
    expect(ids).toContain('tz-month-boundaries')
    expect(ids).toContain('migration-drift')
    expect(ARCHI_CONCERNS.some((c) => c.severity === 'risk')).toBe(true)
  })
})
