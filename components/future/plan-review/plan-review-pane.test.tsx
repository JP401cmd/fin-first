import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/toekomst',
  useSearchParams: () => new URLSearchParams(),
}))

import { PlanReviewPane, volgendScherm } from './plan-review-pane'
import { resolveStartStap } from './plan-review-provider'
import type { PlanReviewFacts, PlanReviewProgress, PlanReviewStap } from '@/lib/plan-review/types'
import type { PlanReviewStapOverzicht } from '@/lib/plan-review/overzicht'

/**
 * TPR-01 — de review-pane. Gepind: de drie zichtbare blokken (keuze · effect · waarom),
 * de volgorde van schrijven bij "Bevestigen" (eerst de domeinroute, dan de markering —
 * A5), dat een mislukte domein-write géén markering zet, overslaan zonder bevestigen
 * (A6), en het afsluitscherm "Voor wie wil" (laag 2).
 */

afterEach(cleanup)

const FACTS: PlanReviewFacts = { hasAowEvent: true, hasEigenHuis: false, hasNietLiquideBezit: false, housingConfigured: false }

function progress(bevestigd: PlanReviewStap[]): PlanReviewProgress {
  const stappen = (['plan', 'uitgaven', 'inkomsten', 'woning', 'potten'] as PlanReviewStap[]).map((stap) => ({
    stap,
    status: stap === 'woning' ? ('nvt' as const) : bevestigd.includes(stap) ? ('bevestigd' as const) : ('open' as const),
    reden: null,
  }))
  const eersteOpen = stappen.find((s) => s.status === 'open')?.stap ?? null
  return {
    stappen,
    bevestigd: stappen.filter((s) => s.status === 'bevestigd').length,
    totaal: 4,
    eersteOpen,
    voltooid: eersteOpen === null,
  }
}

function overzicht(stap: PlanReviewStap): PlanReviewStapOverzicht {
  return {
    stap,
    titel: `Titel ${stap}`,
    rekentNu: `De app rekent nu met ${stap}.`,
    details: [{ label: 'Detail', waarde: 'x' }],
    effect: [`Effect ${stap}.`],
    vergelijking: [],
    waarom: `Waarom ${stap} ertoe doet.`,
    keuzes: [],
    keuzeVerplicht: false,
    schrijf: [{ url: '/api/fire-settings', body: { fire_end_age: 90 } }],
    blokkade: null,
    aanpassen: [{ href: '/toekomst/voorkeuren?regel=eindstrategie', label: 'Plan aanpassen' }],
    beperking: null,
  }
}

let calls: Array<{ url: string; method: string; body: unknown }>
let failDomain = false

beforeEach(() => {
  calls = []
  failDomain = false
  push.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      if (method === 'GET') {
        const stap = new URL(url, 'http://x').searchParams.get('stap') as PlanReviewStap
        return new Response(JSON.stringify({ overzicht: overzicht(stap), progress: progress([]), facts: FACTS }))
      }
      if (url === '/api/fire-settings') {
        return failDomain
          ? new Response(JSON.stringify({ error: 'Ongeldige eindleeftijd' }), { status: 400 })
          : new Response(JSON.stringify({ ok: true }))
      }
      if (url === '/api/plan-review') {
        return new Response(
          JSON.stringify({ ok: true, plan_review_state: { plan: { bevestigd_op: '2026-09-13T10:00:00.000Z', bron: 'review' } } }),
        )
      }
      return new Response('{}', { status: 404 })
    }),
  )
})

function renderPane(startStap: PlanReviewStap = 'plan') {
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(
    <PlanReviewPane open startStap={startStap} initialProgress={progress([])} onClose={onClose} onChanged={onChanged} />,
  )
  return { onChanged, onClose }
}

describe('PlanReviewPane', () => {
  it('toont keuze · effect · waarom van de geopende stap', async () => {
    renderPane()
    expect(await screen.findByText('De app rekent nu met plan.')).toBeInTheDocument()
    expect(screen.getByText('Effect plan.')).toBeInTheDocument()
    expect(screen.getByText('Waarom plan ertoe doet.')).toBeInTheDocument()
    expect(screen.getByText('Waar de app nu mee rekent')).toBeInTheDocument()
    expect(screen.getByText('Wat het doet')).toBeInTheDocument()
  })

  it('Bevestigen: eerst de domeinroute, dan de markering; daarna door naar de volgende stap', async () => {
    const { onChanged } = renderPane()
    await screen.findByText('De app rekent nu met plan.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Bevestigen' })[0])
    await screen.findByText('De app rekent nu met uitgaven.')
    const puts = calls.filter((c) => c.method === 'PUT').map((c) => c.url)
    expect(puts).toEqual(['/api/fire-settings', '/api/plan-review'])
    expect(calls.find((c) => c.url === '/api/plan-review')?.body).toEqual({ stap: 'plan', bevestigd: true })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('een mislukte domein-write zet géén markering en toont de fout', async () => {
    failDomain = true
    renderPane()
    await screen.findByText('De app rekent nu met plan.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Bevestigen' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Ongeldige eindleeftijd')
    expect(calls.some((c) => c.url === '/api/plan-review' && c.method === 'PUT')).toBe(false)
  })

  it('Overslaan gaat door zonder te schrijven (A6)', async () => {
    renderPane()
    await screen.findByText('De app rekent nu met plan.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Overslaan' })[0])
    await screen.findByText('De app rekent nu met uitgaven.')
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('na de laatste stap: "Voor wie wil" met de laag-2-verwijzingen', async () => {
    renderPane('potten')
    await screen.findByText('De app rekent nu met potten.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Overslaan' })[0])
    expect(await screen.findByText('Voor wie wil')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Box 3-methode' })).toHaveAttribute('href', '/toekomst/voorkeuren')
    expect(screen.getByRole('link', { name: 'Bezittingen' })).toHaveAttribute('href', '/overzicht/bezittingen')
  })

  it('Aanpassen sluit de pane en navigeert naar het bestaande scherm', async () => {
    const { onClose } = renderPane()
    await screen.findByText('De app rekent nu met plan.')
    fireEvent.click(screen.getByRole('button', { name: /Plan aanpassen/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/toekomst/voorkeuren?regel=eindstrategie'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('navigatie-helpers', () => {
  it('volgendScherm slaat n.v.t.-stappen over en eindigt op het afsluitscherm', () => {
    const p = progress([])
    expect(volgendScherm(p, 'inkomsten')).toBe('potten')
    expect(volgendScherm(p, 'potten')).toBe('afsluiten')
  })

  it('resolveStartStap: gevraagd > eerste open > stap 1', () => {
    expect(resolveStartStap(progress(['plan']), null)).toBe('uitgaven')
    expect(resolveStartStap(progress(['plan']), 'potten')).toBe('potten')
    expect(resolveStartStap(progress(['plan', 'uitgaven', 'inkomsten', 'potten']), null)).toBe('plan')
  })
})
