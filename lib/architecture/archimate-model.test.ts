import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG } from '@/lib/module-registry'
import { buildArchimateModel, type ArchFacts } from './archimate-model'

const FACTS: ArchFacts = {
  version: '0.71.0',
  generatedDate: '2026-06-10',
  stats: { api: 376, components: 706, providers: 12, tables: 47, migrations: 88 },
}

const model = buildArchimateModel(FACTS)
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))

describe('archimate-model — consistentie', () => {
  it('heeft unieke node- en edge-ids', () => {
    const nodeIds = model.nodes.map((n) => n.id)
    expect(new Set(nodeIds).size).toBe(nodeIds.length)
    const edgeIds = model.edges.map((e) => e.id)
    expect(new Set(edgeIds).size).toBe(edgeIds.length)
  })

  it('elke edge verwijst naar bestaande nodes', () => {
    for (const e of model.edges) {
      expect(nodeById.has(e.from), `edge ${e.id}: from '${e.from}' bestaat niet`).toBe(true)
      expect(nodeById.has(e.to), `edge ${e.id}: to '${e.to}' bestaat niet`).toBe(true)
    }
  })

  it('alle nodes vallen binnen de viewBox', () => {
    for (const n of model.nodes) {
      expect(n.x, `node ${n.id} x`).toBeGreaterThanOrEqual(0)
      expect(n.y, `node ${n.id} y`).toBeGreaterThanOrEqual(0)
      expect(n.x + n.w, `node ${n.id} rechterrand`).toBeLessThanOrEqual(model.width)
      expect(n.y + n.h, `node ${n.id} onderrand`).toBeLessThanOrEqual(model.height)
    }
  })

  it('elementen botsen niet: los van elkaar of volledig in een container', () => {
    const isContainer = (n: { kind: string }) => n.kind === 'group' || n.kind === 'appcomp'
    const containers = model.nodes.filter(isContainer)
    const rest = model.nodes.filter((n) => !isContainer(n))
    type Box = { x: number; y: number; w: number; h: number }
    const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const contains = (c: Box, n: Box) => n.x >= c.x && n.y >= c.y && n.x + n.w <= c.x + c.w && n.y + n.h <= c.y + c.h
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        expect(intersects(rest[i], rest[j]), `${rest[i].id} overlapt ${rest[j].id}`).toBe(false)
      }
    }
    for (const c of containers) {
      for (const n of rest) {
        if (intersects(c, n)) {
          expect(contains(c, n), `${n.id} steekt half uit container ${c.id}`).toBe(true)
        }
      }
    }
  })

  it('elke node doet mee: heeft een relatie of ligt in een container', () => {
    const connected = new Set(model.edges.flatMap((e) => [e.from, e.to]))
    const containers = model.nodes.filter((n) => n.kind === 'group' || n.kind === 'appcomp')
    const inContainer = (x: { x: number; y: number; w: number; h: number }) =>
      containers.some((c) => x.x >= c.x && x.y >= c.y && x.x + x.w <= c.x + c.w && x.y + x.h <= c.y + c.h)
    for (const n of model.nodes) {
      if (n.kind === 'group') continue
      expect(
        connected.has(n.id) || inContainer(n),
        `node ${n.id} hangt los: geen edge en niet in een container`,
      ).toBe(true)
    }
  })
})

describe('archimate-model — sync met de applicatie', () => {
  it('elke module uit MODULE_CATALOG staat als functie op de plaat', () => {
    for (const m of MODULE_CATALOG) {
      const fn = nodeById.get(`fn-${m.id}`)
      expect(fn, `module '${m.id}' ontbreekt op de plaat`).toBeDefined()
      expect(fn!.kind).toBe('appfunc')
      expect(fn!.title).toBe(m.label)
    }
  })

  it('elke module-functie realiseert minstens één bestaande applicatieservice', () => {
    for (const m of MODULE_CATALOG) {
      const real = model.edges.filter(
        (e) => e.from === `fn-${m.id}` && e.type === 'realization' && nodeById.get(e.to)?.kind === 'appsvc',
      )
      expect(real.length, `module '${m.id}' realiseert geen service`).toBeGreaterThan(0)
    }
  })

  it('module in ontwikkeling draagt een badge', () => {
    for (const m of MODULE_CATALOG) {
      const fn = nodeById.get(`fn-${m.id}`)!
      if (m.inDevelopment) expect(fn.badge, `module '${m.id}' mist de in-ontwikkeling-badge`).toBeTruthy()
      else expect(fn.badge).toBeUndefined()
    }
  })

  it('elke applicatieservice bedient een bedrijfsproces en elk proces wordt bediend', () => {
    const services = model.nodes.filter((n) => n.kind === 'appsvc')
    for (const s of services) {
      const serves = model.edges.some(
        (e) => e.from === s.id && e.type === 'serving' && nodeById.get(e.to)?.kind === 'bizproc',
      )
      expect(serves, `service '${s.id}' bedient geen proces`).toBe(true)
    }
    const processes = model.nodes.filter((n) => n.kind === 'bizproc' && n.id.startsWith('sp-'))
    for (const p of processes) {
      const served = model.edges.some((e) => e.to === p.id && e.type === 'serving')
      expect(served, `proces '${p.id}' wordt door geen service bediend`).toBe(true)
    }
  })

  it('externe partijen koppelen per paar aan de technologielaag (niet als groep)', () => {
    const externals = model.nodes.filter((n) => n.kind === 'ext')
    expect(externals.length).toBeGreaterThan(0)
    for (const ext of externals) {
      const pair = model.edges.filter(
        (e) => e.from === ext.id && e.type === 'serving' && nodeById.get(e.to)?.kind === 'tech',
      )
      expect(pair.length, `externe partij '${ext.id}' heeft geen technologie-koppeling`).toBeGreaterThan(0)
    }
    expect(model.edges.some((e) => e.from === 'ext-group')).toBe(false)
  })
})

describe('archimate-model — feiten uit architecture.json', () => {
  it('tellingen worden geïnterpoleerd, niet hardcoded', () => {
    const app = nodeById.get('app-comp')!
    expect(app.note).toContain('376 API-routes')
    expect(app.note).toContain('706 componenten')
    const supabase = nodeById.get('t-supabase')!
    expect(supabase.lead).toContain('47 tabellen')
    expect(supabase.lead).toContain('88 migraties')
    const data = nodeById.get('data-cont')!
    expect(data.note).toContain('47 tabellen')
  })

  it('andere tellingen geven een ander plaatje (geen verstopte constante)', () => {
    const other = buildArchimateModel({ ...FACTS, stats: { ...FACTS.stats, api: 999 } })
    const app = other.nodes.find((n) => n.id === 'app-comp')!
    expect(app.note).toContain('999 API-routes')
  })
})

describe('archimate-model — inhoudelijke bewakers', () => {
  it('soevereiniteit is motivatie, geen gating (module-registry verving de gating)', () => {
    const s = nodeById.get('m-soeverein')!
    expect(s.lead.toLowerCase()).toContain('motivatie')
    expect(s.lead.toLowerCase()).not.toContain('featuregate')
    expect(s.lead.toLowerCase()).toContain('module-activatie')
  })

  it('belasting en huishouden zijn als domein aanwezig', () => {
    expect(nodeById.get('sp-belasting')).toBeDefined()
    expect(nodeById.get('as-belasting')).toBeDefined()
    expect(nodeById.get('as-huishouden')).toBeDefined()
    expect(nodeById.get('do-huishouden')).toBeDefined()
    expect(nodeById.get('b-partner')).toBeDefined()
  })
})

describe('archimate-model — ArchiMate-notatie', () => {
  it('procesdecompositie loopt via aggregatie (holle ruit), niet compositie', () => {
    const decomposition = model.edges.filter((e) => e.from === 'b-main' && e.to.startsWith('sp-'))
    expect(decomposition.length).toBeGreaterThan(0)
    for (const e of decomposition) expect(e.type, `${e.id} hoort aggregatie te zijn`).toBe('aggregation')
    // geen enkele compositie meer op de plaat (was semantisch wankel)
    expect(model.edges.some((e) => e.type === 'composition')).toBe(false)
  })

  it('actoren voeren het proces uit via assignment (bol-uiteinde)', () => {
    for (const actor of ['b-actor', 'b-partner']) {
      const a = model.edges.find((e) => e.from === actor && e.to === 'b-main')
      expect(a?.type, `${actor} → b-main hoort assignment te zijn`).toBe('assignment')
    }
  })

  it('de applicatie leest én schrijft de data via een bidirectionele access-relatie', () => {
    const access = model.edges.find((e) => e.type === 'access' && e.from === 'app-comp' && e.to === 'data-cont')
    expect(access).toBeDefined()
    expect(access?.readWrite, 'access naar data moet read-write (open pijl beide kanten) zijn').toBe(true)
  })
})
