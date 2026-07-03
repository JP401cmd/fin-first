import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { buildArchimateModel } from '@/lib/architecture/archimate-model'
import type { ArchInsights } from '@/lib/architecture/facts'
import { ArchitectuurClient, type ArchDiff } from './architectuur-client'

const model = buildArchimateModel({
  version: '0.71.0',
  generatedDate: '2026-06-10',
  stats: { api: 376, components: 706, providers: 12, tables: 47, migrations: 88 },
})

const insights: ArchInsights = {
  apiByDomain: {
    ai: { label: 'AI & Coach', count: 2, routes: [{ url: '/api/ai/recommendations', methods: ['POST'] }, { url: '/api/ai/chat', methods: ['POST'] }] },
    briefing: { label: 'Briefing', count: 1, routes: [{ url: '/api/briefing', methods: ['GET'] }] },
  },
  tableAccess: null,
  tablesByDomain: [],
  tableRelations: null,
  churn: null,
  adrs: [],
  statsHistory: [],
}

const diff: ArchDiff = {
  baseline: false,
  previousDate: '2026-06-09',
  hasChanges: true,
  sections: [{ label: 'Schermen', added: ['/beheer/architectuur'], removed: [] }],
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function renderClient(over: Partial<ArchInsights> = {}) {
  window.history.replaceState(null, '', '/beheer/architectuur')
  return render(
    <ArchitectuurClient model={model} insights={{ ...insights, ...over }} diff={diff} generatedDate="2026-06-10" />,
  )
}

describe('ArchitectuurClient — plaat & selectie', () => {
  it('rendert elk element als toetsenbord-bereikbare knop (aria-pressed)', () => {
    const { container } = renderClient()
    const nodeButtons = container.querySelectorAll('g[role="button"][aria-pressed]')
    expect(nodeButtons.length).toBe(model.nodes.length)
    nodeButtons.forEach((b) => expect(b).toHaveAttribute('tabindex', '0'))
  })

  it('rendert relaties als klikbare hit-paden zonder NaN', () => {
    const { container } = renderClient()
    const edgeHit = container.querySelectorAll('path[role="button"]')
    expect(edgeHit.length).toBe(model.edges.length)
    container.querySelectorAll('path[d]').forEach((p) => expect(p.getAttribute('d')).not.toMatch(/NaN/))
  })

  it('klik op element → detail + relaties; Esc wist', () => {
    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /Applicatie · component: TriFinity-applicatie/i }))
    expect(screen.getByRole('heading', { level: 3, name: /TriFinity-applicatie/ })).toBeInTheDocument()
    expect(window.location.hash).toBe('#app-comp')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(window.location.hash).toBe('')
  })

  it('Enter op een gefocust element selecteert', () => {
    renderClient()
    fireEvent.keyDown(screen.getByRole('button', { name: /Business · proces: Belasting beheersen/i }), { key: 'Enter' })
    expect(screen.getByRole('heading', { level: 3, name: /Belasting beheersen/ })).toBeInTheDocument()
  })

  it('hash-deeplink selecteert element bij laden', () => {
    window.history.replaceState(null, '', '/beheer/architectuur#as-huishouden')
    render(<ArchitectuurClient model={model} insights={insights} diff={diff} generatedDate="2026-06-10" />)
    expect(screen.getByRole('heading', { level: 3, name: /Huishouden- & perspectiefdienst/ })).toBeInTheDocument()
  })
})

describe('ArchitectuurClient — relaties (Wave 1)', () => {
  it('klik op relatie → relatie-detail met payload + echte contract-routes', () => {
    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /Relatie: AI-gateway .* TriFinity-applicatie/i }))
    expect(screen.getByText(/Streaming-completions en tool-calls/i)).toBeInTheDocument()
    // contract-route uit de insights-fixture
    expect(screen.getByText('/api/ai/recommendations')).toBeInTheDocument()
    expect(window.location.hash).toMatch(/^#rel:/)
  })

  it('relatie-deeplink #rel:<id> opent de relatie-kaart', () => {
    const edge = model.edges.find((e) => e.from === 't-aigateway' && e.to === 'app-comp')!
    window.history.replaceState(null, '', `/beheer/architectuur#rel:${edge.id}`)
    render(<ArchitectuurClient model={model} insights={insights} diff={diff} generatedDate="2026-06-10" />)
    expect(screen.getByText(/^Relatie · /)).toBeInTheDocument()
  })

  it('relatie-kaart navigeert terug naar een element', () => {
    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /Relatie: AI-gateway .* TriFinity-applicatie/i }))
    fireEvent.click(screen.getByRole('button', { name: /^AI-gateway/i }))
    expect(screen.getByRole('heading', { level: 3, name: /AI-gateway/ })).toBeInTheDocument()
  })
})

describe('ArchitectuurClient — stromen-lens (Wave 2-data, nu beschikbaar)', () => {
  it('toont de stromen-tab en een flow met stappen', () => {
    renderClient()
    fireEvent.click(screen.getByRole('tab', { name: 'Stromen' }))
    expect(screen.getByRole('button', { name: 'Transactie → vrijheid' })).toBeInTheDocument()
    expect(screen.getByText(/Spaarquote × inkomen → projectie/i)).toBeInTheDocument()
  })

  it('klik op een flow-stap selecteert het element', () => {
    renderClient()
    fireEvent.click(screen.getByRole('tab', { name: 'Stromen' }))
    fireEvent.click(screen.getByRole('button', { name: /FIRE-datum/i }))
    expect(screen.getByRole('heading', { level: 3, name: /Toekomstplannen/ })).toBeInTheDocument()
  })

  it('element-detail linkt naar de stroom waar het in zit', () => {
    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /Data · object: Transactie/i }))
    const flowBtn = screen.getByRole('button', { name: /Transactie → vrijheid/i })
    fireEvent.click(flowBtn)
    // lens schakelt naar stromen → de lead verschijnt
    expect(screen.getByText(/de kernketen van de app/i)).toBeInTheDocument()
  })
})

describe('ArchitectuurClient — aandachtspunten-lens', () => {
  it('toont aandachtspunten en navigeert naar het element', () => {
    renderClient()
    fireEvent.click(screen.getByRole('tab', { name: 'Aandachtspunten' }))
    fireEvent.click(screen.getByRole('button', { name: /horizon-client\.tsx is een god-component/i }))
    expect(screen.getByRole('heading', { level: 3, name: /Toekomstplannen/ })).toBeInTheDocument()
  })

  it('element-detail toont zijn aandachtspunten', () => {
    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /Technologie · service: Supabase/i }))
    expect(screen.getByText(/Supabase migratie-drift/i)).toBeInTheDocument()
  })
})

describe('ArchitectuurClient — datatoegang-lens (gated op data)', () => {
  it('verschijnt niet zonder tableAccess', () => {
    renderClient()
    expect(screen.queryByRole('tab', { name: 'Datatoegang' })).not.toBeInTheDocument()
  })

  it('verschijnt met tableAccess en toont koppelrisico + writers', () => {
    renderClient({
      tableAccess: {
        byDomain: { budgets: [{ name: 'budgets', write: true }], assets: [{ name: 'profiles', write: true }] },
        byTable: {
          profiles: [
            { domain: 'assets', label: 'Bezittingen', write: true, routes: ['/api/assets'] },
            { domain: 'budgets', label: 'Budgetten', write: true, routes: ['/api/budgets'] },
          ],
        },
        multiWriter: ['profiles'],
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Datatoegang' }))
    expect(screen.getByText(/Koppelrisico/i)).toBeInTheDocument()
    // data-object 'Profiel & snapshots' bevat 'profiles' → writers zichtbaar in detail
    fireEvent.click(screen.getByRole('button', { name: /Data · object: Profiel & snapshots/i }))
    expect(screen.getByText(/Wie raakt deze tabel/i)).toBeInTheDocument()
  })
})

describe('ArchitectuurClient — zoeken & trend', () => {
  it('zoekt en selecteert een element', () => {
    renderClient()
    fireEvent.change(screen.getByRole('searchbox', { name: /zoek op de plaat/i }), { target: { value: 'belasting' } })
    const results = screen.getAllByRole('button', { name: /belasting/i })
    expect(results.length).toBeGreaterThan(0)
    fireEvent.click(results[0])
    expect(screen.getByRole('heading', { level: 3, name: /belasting/i })).toBeInTheDocument()
  })

  it('toont de trend-strip wanneer er geschiedenis is', () => {
    renderClient({
      statsHistory: [
        { date: '2026-06-08', api: 370, components: 700, tables: 47, routesProduction: 90 },
        { date: '2026-06-10', api: 376, components: 706, tables: 47, routesProduction: 92 },
      ],
    })
    // api 370→376 én components 700→706 leveren elk +6 op
    expect(screen.getAllByText('376').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('+6').length).toBeGreaterThanOrEqual(2)
  })

  it('toont de wijzigingen-strook', () => {
    renderClient()
    expect(screen.getByText(/Wijzigingen · snapshot 2026-06-10/i)).toBeInTheDocument()
    expect(screen.getByText('/beheer/architectuur')).toBeInTheDocument()
  })

  it('toont export-knoppen', () => {
    renderClient()
    expect(screen.getByRole('button', { name: /Exporteer SVG/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exporteer PNG/i })).toBeInTheDocument()
  })
})

describe('ArchitectuurClient — churn & ADR (Wave 3)', () => {
  it('churn-lens verschijnt met data en toont gebieden + hot files', () => {
    renderClient({
      churn: {
        sinceDays: 90,
        areas: [{ path: 'lib/ai', commits: 33 }, { path: 'app/(app)/overzicht', commits: 74 }],
        hotFiles: [{ file: 'components/app/horizon/horizon-client.tsx', loc: 6802, commits: 100 }],
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Activiteit' }))
    expect(screen.getByText(/Drukste gebieden/i)).toBeInTheDocument()
    expect(screen.getByText('horizon-client.tsx')).toBeInTheDocument()
  })

  it('element-detail toont een ADR die het element raakt', () => {
    renderClient({
      adrs: [
        { id: '0003', title: 'Supabase Auth canoniek', status: 'aanvaard', date: '2026-06-01', elements: ['t-supabase'], summary: 'RLS op auth.uid().', file: 'docs/adr/0003.md' },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Technologie · service: Supabase/i }))
    expect(screen.getByText('Supabase Auth canoniek')).toBeInTheDocument()
    expect(screen.getByText(/Besluiten \(ADR\)/i)).toBeInTheDocument()
  })
})
