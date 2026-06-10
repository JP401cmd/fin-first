import { describe, expect, it } from 'vitest'
import archData from '@/docs/architecture/architecture.json'
import { buildArchimateModel } from './archimate-model'
import { selectInsights } from './facts'

describe('selectInsights — defensief', () => {
  it('overleeft rommel en geeft veilige defaults', () => {
    const out = selectInsights({ apiByDomain: 'nonsense', tableAccess: 42, churn: null, adrs: undefined })
    expect(out.apiByDomain).toEqual({})
    expect(out.tableAccess).toBeNull()
    expect(out.churn).toBeNull()
    expect(out.adrs).toEqual([])
    expect(out.statsHistory).toEqual([])
  })

  it('comprimeert apiByDomain tot {url, methods}', () => {
    const out = selectInsights({
      apiByDomain: [
        { domain: 'ai', label: 'AI', count: 1, routes: [{ url: '/api/ai/x', methods: ['POST'], file: 'weg' }] },
      ],
    })
    expect(out.apiByDomain.ai.routes).toEqual([{ url: '/api/ai/x', methods: ['POST'] }])
    expect(out.apiByDomain.ai.label).toBe('AI')
  })

  it('leest tableAccess, churn, adrs en statsHistory wanneer aanwezig', () => {
    const out = selectInsights({
      tableAccess: {
        byDomain: { ai: [{ name: 'profiles', write: true }] },
        byTable: { profiles: [{ domain: 'ai', label: 'AI', write: true, routes: ['/api/ai/x'] }] },
        multiWriter: ['profiles'],
      },
      churn: { sinceDays: 90, areas: [{ path: 'lib/ai', commits: 5 }], hotFiles: [{ file: 'a.tsx', loc: 100, commits: 2 }] },
      adrs: [{ id: '0001', title: 'T', status: 'aanvaard', date: '2026-01-01', elements: ['t-supabase'], summary: 's', file: 'docs/adr/0001.md' }],
      statsHistory: [{ date: '2026-06-10', api: 1, components: 2, tables: 3, routesProduction: 4 }],
    })
    expect(out.tableAccess?.multiWriter).toEqual(['profiles'])
    expect(out.churn?.areas[0].commits).toBe(5)
    expect(out.adrs[0].elements).toEqual(['t-supabase'])
    expect(out.statsHistory[0].api).toBe(1)
  })
})

describe('gegenereerde architecture.json — guard', () => {
  const insights = selectInsights(archData)

  it('bevat datatoegang met multi-writer tabellen', () => {
    expect(insights.tableAccess).not.toBeNull()
    expect(Object.keys(insights.tableAccess!.byTable).length).toBeGreaterThan(10)
    expect(insights.tableAccess!.multiWriter).toContain('profiles')
  })

  it('bevat de geseede ADR’s met geldige element-verwijzingen', () => {
    const model = buildArchimateModel({
      version: '0', generatedDate: '2026-06-10',
      stats: { api: 1, components: 1, providers: 1, tables: 1, migrations: 1 },
    })
    const ids = new Set(model.nodes.map((n) => n.id))
    expect(insights.adrs.length).toBeGreaterThanOrEqual(5)
    for (const a of insights.adrs) {
      expect(a.elements.length).toBeGreaterThan(0)
      for (const el of a.elements) expect(ids.has(el), `ADR ${a.id} → onbekend element ${el}`).toBe(true)
    }
  })

  it('bevat churn met gebieden en hot files', () => {
    expect(insights.churn).not.toBeNull()
    expect(insights.churn!.areas.length).toBeGreaterThan(0)
    expect(insights.churn!.hotFiles.length).toBeGreaterThan(0)
  })

  it('bevat minstens één statsHistory-punt', () => {
    expect(insights.statsHistory.length).toBeGreaterThanOrEqual(1)
  })
})
