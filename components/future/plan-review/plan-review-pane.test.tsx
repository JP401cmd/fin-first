import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/toekomst',
  useSearchParams: () => new URLSearchParams(),
}))

// TPR-15 — een neppe editor voor stap 1, zodat de pane-test niet op de echte body (en
// de kernel) leunt. Hij publiceert het host-contract en schrijft via een domeinroute.
const nep = vi.hoisted(() => ({
  changed: true,
  saving: false,
  onSaved: null as null | (() => void),
  woonstrategieGeschreven: false,
  aowGeschreven: false,
}))
vi.mock('./editors', async () => {
  const React = await import('react')
  function NepPlanEditor(props: {
    context: { firePlan: { endAge: number } | null }
    onActionsChange: (s: { canSave: boolean; saving: boolean; save: () => void; changed?: boolean }) => void
    onSaved: () => void
  }) {
    const { onActionsChange, onSaved } = props
    nep.onSaved = onSaved
    React.useEffect(() => {
      onActionsChange({
        canSave: nep.changed,
        saving: nep.saving,
        changed: nep.changed,
        save: async () => {
          await fetch('/api/fire-settings', { method: 'PUT', body: JSON.stringify({ fire_end_age: 95 }) })
          onSaved()
        },
      })
    }, [onActionsChange, onSaved])
    return React.createElement('p', null, `Editor met eindleeftijd ${props.context.firePlan?.endAge}`)
  }
  // Stap 4: meldt bij opslaan of de woonstrategie geschreven werd (verkoopinstelling = nee).
  function NepWoningEditor(props: {
    onActionsChange: (s: { canSave: boolean; saving: boolean; save: () => void; changed?: boolean }) => void
    onSaved: (info?: { woonstrategieGeschreven?: boolean }) => void
  }) {
    const { onActionsChange, onSaved } = props
    React.useEffect(() => {
      onActionsChange({
        canSave: true,
        saving: false,
        changed: true,
        save: () => onSaved({ woonstrategieGeschreven: nep.woonstrategieGeschreven }),
      })
    }, [onActionsChange, onSaved])
    return React.createElement('p', null, 'Woning-editor')
  }
  // Stap 3: meldt bij opslaan of de eigen AOW-rij geschreven werd (werk/pensioen = nee).
  function NepInkomstenEditor(props: {
    onActionsChange: (s: { canSave: boolean; saving: boolean; save: () => void; changed?: boolean }) => void
    onSaved: (info?: { aowGeschreven?: boolean }) => void
  }) {
    const { onActionsChange, onSaved } = props
    React.useEffect(() => {
      onActionsChange({
        canSave: true,
        saving: false,
        changed: true,
        save: () => onSaved({ aowGeschreven: nep.aowGeschreven }),
      })
    }, [onActionsChange, onSaved])
    return React.createElement('p', null, 'Inkomsten-editor')
  }
  return {
    PLAN_REVIEW_EDITORS: {
      plan: NepPlanEditor,
      uitgaven: null,
      inkomsten: NepInkomstenEditor,
      woning: NepWoningEditor,
      potten: null,
    },
  }
})

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
let facts: PlanReviewFacts = FACTS
let hangGetVoor: PlanReviewStap | null = null
let failDomain = false
let failEditorContext = false
let failMarkering = false

beforeEach(() => {
  calls = []
  facts = FACTS
  hangGetVoor = null
  nep.woonstrategieGeschreven = false
  nep.aowGeschreven = false
  failDomain = false
  failEditorContext = false
  nep.changed = true
  nep.saving = false
  nep.onSaved = null
  failMarkering = false
  push.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      if (url === '/api/plan-review/editor-context') {
        return failEditorContext
          ? new Response(JSON.stringify({ error: 'Er ging iets mis' }), { status: 500 })
          : new Response(JSON.stringify({ snapshot: null, firePlan: { endAge: 90 } }))
      }
      if (method === 'GET') {
        const stap = new URL(url, 'http://x').searchParams.get('stap') as PlanReviewStap
        // Stap-4-tests: de volgende lezing blijft hangen, zodat de lokaal afgeleide voortgang
        // niet door het (vaste) antwoord van de mock wordt overschreven.
        if (hangGetVoor === stap) return new Promise<Response>(() => {})
        return new Response(JSON.stringify({ overzicht: overzicht(stap), progress: progress([]), facts }))
      }
      if (url === '/api/fire-settings') {
        return failDomain
          ? new Response(JSON.stringify({ error: 'Ongeldige eindleeftijd' }), { status: 400 })
          : new Response(JSON.stringify({ ok: true }))
      }
      if (url === '/api/plan-review') {
        if (failMarkering) return new Response(JSON.stringify({ error: 'Markering mislukt' }), { status: 500 })
        const stap = (body as { stap: string }).stap
        return new Response(
          JSON.stringify({ ok: true, plan_review_state: { [stap]: { bevestigd_op: '2026-09-13T10:00:00.000Z', bron: 'review' } } }),
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

  it('een stap zónder inline editor: Aanpassen sluit de pane en navigeert naar het bestaande scherm', async () => {
    const { onClose } = renderPane('uitgaven')
    await screen.findByText('De app rekent nu met uitgaven.')
    fireEvent.click(screen.getByRole('button', { name: /Plan aanpassen/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/toekomst/voorkeuren?regel=eindstrategie'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('PlanReviewPane — bewerkstand (TPR-15)', () => {
  async function openBewerkstand() {
    const handles = renderPane('plan')
    await screen.findByText('De app rekent nu met plan.')
    fireEvent.click(screen.getByRole('button', { name: 'Plan aanpassen' }))
    await screen.findByText('Editor met eindleeftijd 90')
    return handles
  }

  it('Aanpassen opent de bestaande editor ín de stap, zonder te navigeren of de pane te sluiten', async () => {
    const { onClose } = await openBewerkstand()
    expect(push).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Het statische effect wijkt voor de editor; keuze en waarom blijven staan.
    expect(screen.queryByText('Effect plan.')).not.toBeInTheDocument()
    expect(screen.getByText('De app rekent nu met plan.')).toBeInTheDocument()
    expect(screen.getByText('Waarom plan ertoe doet.')).toBeInTheDocument()
    expect(calls.filter((c) => c.url === '/api/plan-review/editor-context')).toHaveLength(1)
  })

  it('opslaan = bevestigen: eerst de route van de editor, dan de markering, dan de volgende stap', async () => {
    const { onChanged } = await openBewerkstand()
    // De editor publiceert zijn save-state in een effect ná de render die zijn tekst toont;
    // onder testbelasting kan de klik daar anders vóór vallen (knop nog uit → klik doet niets).
    const knop = () => screen.getAllByRole('button', { name: 'Opslaan en bevestigen' })[0]
    await waitFor(() => expect(knop()).toBeEnabled())
    fireEvent.click(knop())
    await screen.findByText('De app rekent nu met uitgaven.')
    const puts = calls.filter((c) => c.method === 'PUT')
    expect(puts.map((c) => c.url)).toEqual(['/api/fire-settings', '/api/plan-review'])
    expect(puts[0].body).toEqual({ fire_end_age: 95 })
    expect(puts[1].body).toEqual({ stap: 'plan', bevestigd: true })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('zonder wijziging in de editor heet de knop gewoon Bevestigen en schrijft hij alleen de gewone bevestiging', async () => {
    nep.changed = false
    await openBewerkstand()
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Opslaan en bevestigen' })).toHaveLength(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Bevestigen' })[0])
    await screen.findByText('De app rekent nu met uitgaven.')
    // De gewone bevestiging: de huidige waarde uit het overzicht, niet de editor-write.
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { fire_end_age: 90 },
      { stap: 'plan', bevestigd: true },
    ])
  })

  it('Annuleren sluit alleen de bewerkstand en schrijft niets', async () => {
    await openBewerkstand()
    fireEvent.click(screen.getAllByRole('button', { name: 'Annuleren' })[0])
    expect(await screen.findByText('Effect plan.')).toBeInTheDocument()
    expect(screen.queryByText('Editor met eindleeftijd 90')).not.toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('een mislukte editor-context toont een foutregel met opnieuw proberen', async () => {
    failEditorContext = true
    renderPane('plan')
    await screen.findByText('De app rekent nu met plan.')
    fireEvent.click(screen.getByRole('button', { name: 'Plan aanpassen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Er ging iets mis')
    failEditorContext = false
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }))
    expect(await screen.findByText('Editor met eindleeftijd 90')).toBeInTheDocument()
  })

  it('tijdens een lopende editor-save kun je niet van stap wisselen (review H2)', async () => {
    nep.saving = true
    await openBewerkstand()
    await waitFor(() => expect(screen.getByRole('button', { name: /2\. Leven na stoppen/ })).toBeDisabled())
  })

  it('een editor-write die binnenkomt nadat je de stap verliet, bevestigt de nieuwe stap níét (review H2)', async () => {
    await openBewerkstand()
    const onSavedVanPlan = nep.onSaved!
    fireEvent.click(screen.getAllByRole('button', { name: 'Annuleren' })[0])
    fireEvent.click(screen.getByRole('button', { name: /2\. Leven na stoppen/ }))
    await screen.findByText('De app rekent nu met uitgaven.')
    onSavedVanPlan()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.some((c) => c.url === '/api/plan-review' && c.method === 'PUT')).toBe(false)
  })

  it('mislukte markering na een geslaagde write: foutregel blijft staan en de editor-context wordt opnieuw gelezen (review M1/M2)', async () => {
    failMarkering = true
    await openBewerkstand()
    const knop = () => screen.getAllByRole('button', { name: 'Opslaan en bevestigen' })[0]
    await waitFor(() => expect(knop()).toBeEnabled())
    fireEvent.click(knop())
    expect(await screen.findByText(/Je instelling is opgeslagen, maar bevestigen is niet gelukt: Markering mislukt/)).toBeInTheDocument()
    // Terug in het overzicht van dezelfde stap, na herlezen.
    expect(await screen.findByText('Effect plan.')).toBeInTheDocument()
    expect(screen.getByText(/Je instelling is opgeslagen/)).toBeInTheDocument()
    // Opnieuw aanpassen leest de context opnieuw (niet de oude waarde als "opgeslagen").
    fireEvent.click(screen.getByRole('button', { name: 'Plan aanpassen' }))
    await screen.findByText('Editor met eindleeftijd 90')
    expect(calls.filter((c) => c.url === '/api/plan-review/editor-context')).toHaveLength(2)
  })
})

describe('PlanReviewPane — stap 4 inline (TPR-15)', () => {
  // Eigen huis zonder woonstrategie: de stap blijft open tot er een woonstrategie is (A10).
  const MET_HUIS: PlanReviewFacts = { hasAowEvent: true, hasEigenHuis: true, hasNietLiquideBezit: true, housingConfigured: false }

  async function slaWoningOp() {
    facts = MET_HUIS
    // De herlezing na de save blijft hangen, zodat de lokaal afgeleide voortgang niet door
    // het (vaste) antwoord van de mock wordt overschreven.
    hangGetVoor = 'potten'
    renderPane('woning')
    await screen.findByText('De app rekent nu met woning.')
    fireEvent.click(screen.getByRole('button', { name: 'Plan aanpassen' }))
    await screen.findByText('Woning-editor')
    const knop = () => screen.getAllByRole('button', { name: 'Opslaan en bevestigen' })[0]
    await waitFor(() => expect(knop()).toBeEnabled())
    fireEvent.click(knop())
  }

  it('een verkoopinstelling zonder woonstrategie: markering gezet, maar de wizard blijft in de stap en zegt waarom (review M1)', async () => {
    nep.woonstrategieGeschreven = false
    await slaWoningOp()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Je instelling is opgeslagen. Deze stap blijft open tot er een woonstrategie voor je huis is opgeslagen.',
    )
    expect(calls.find((c) => c.url === '/api/plan-review' && c.method === 'PUT')?.body).toEqual({ stap: 'woning', bevestigd: true })
    // Terug in het overzicht van stap 4, niet door naar stap 5.
    expect(await screen.findByText('De app rekent nu met woning.')).toBeInTheDocument()
    expect(screen.queryByText('Woning-editor')).not.toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/plan-review?stap=potten')).toBe(false)
  })

  it('de woonstrategie opslaan telt de woning lokaal als ingesteld en gaat door', async () => {
    nep.woonstrategieGeschreven = true
    await slaWoningOp()
    await screen.findByText('De app rekent deze stap door…')
    expect(screen.getByRole('button', { name: /4\. .*\(bevestigd\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  async function slaInkomstenOp() {
    facts = { ...FACTS, hasAowEvent: false }
    // Stap 4 is hier n.v.t.: de wizard gaat door naar stap 5, en díe lezing blijft hangen.
    hangGetVoor = 'potten'
    renderPane('inkomsten')
    await screen.findByText('De app rekent nu met inkomsten.')
    fireEvent.click(screen.getByRole('button', { name: 'Plan aanpassen' }))
    await screen.findByText('Inkomsten-editor')
    const knop = () => screen.getAllByRole('button', { name: 'Opslaan en bevestigen' })[0]
    await waitFor(() => expect(knop()).toBeEnabled())
    fireEvent.click(knop())
  }

  it('TPR-15 stap 3 — AOW opgeslagen: de AOW telt lokaal als aanwezig en de wizard gaat door', async () => {
    nep.aowGeschreven = true
    await slaInkomstenOp()
    await screen.findByText('De app rekent deze stap door…')
    expect(screen.getByRole('button', { name: /3\. .*\(bevestigd\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('TPR-15 stap 3 — een pensioenpot zonder AOW: opgeslagen, maar de wizard blijft in de stap en zegt waarom', async () => {
    nep.aowGeschreven = false
    await slaInkomstenOp()
    expect(await screen.findByRole('status')).toHaveTextContent('Je instelling is opgeslagen.')
    expect(await screen.findByText('De app rekent nu met inkomsten.')).toBeInTheDocument()
    expect(screen.queryByText('Inkomsten-editor')).not.toBeInTheDocument()
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
