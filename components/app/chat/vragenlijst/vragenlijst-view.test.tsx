import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VragenlijstView } from './vragenlijst-view'
import type { ActieveVragenlijst } from './use-actieve-vragenlijsten'

vi.mock('@/components/app/fin-dots', () => ({ FinDots: () => <span data-testid="fin-dots" /> }))

/**
 * De vragenlijst in de chat bij Fin: Fin stelt de vragen één voor één, elk
 * antwoord gaat meteen als eigen POST naar de server, een open sessie wordt
 * hervat bij de eerste open vraag, en na de laatste vraag rondt de view zelf af.
 */

const QID = 'q-1'
const LIJST: ActieveVragenlijst = {
  id: QID,
  title: 'Eerste indruk',
  description: null,
  question_count: 3,
  answered_count: 0,
  has_open_session: false,
  has_completed: false,
}

const VRAGEN = [
  { id: 'v1', sort_order: 1, type: 'scale', question_text: 'Hoe vind je de app?', options: null, scale_min_label: 'Slecht', scale_max_label: 'Top', is_required: true, is_multi_select: false },
  { id: 'v2', sort_order: 2, type: 'multiple_choice', question_text: 'Was het duidelijk?', options: ['Ja', 'Nee'], scale_min_label: null, scale_max_label: null, is_required: true, is_multi_select: false },
  { id: 'v3', sort_order: 3, type: 'open', question_text: 'Nog iets?', options: null, scale_min_label: null, scale_max_label: null, is_required: false, is_multi_select: false },
]

interface Aanroep { url: string; method: string; body: Record<string, unknown> | null }
let aanroepen: Aanroep[]

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
}

function stubFetch({ bestaandeAntwoorden = [] as Record<string, unknown>[], sessie = true } = {}) {
  aanroepen = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null
    aanroepen.push({ url, method, body })

    if (url.endsWith('/session') && method === 'GET') {
      return json({
        questionnaire: { id: QID, title: 'Eerste indruk', description: null },
        questions: VRAGEN,
        session: sessie ? { id: 's-1', answers: bestaandeAntwoorden } : null,
      })
    }
    if (url.endsWith('/session') && method === 'POST') {
      return json({ session: { id: 's-nieuw', answers: [] } }, 201)
    }
    if (url.endsWith('/respond') && method === 'POST') {
      const vraag = VRAGEN.find((v) => v.id === body?.question_id)!
      const antwoord = {
        question_id: vraag.id,
        answer_text: (body?.answer_text as string) ?? null,
        answer_scale: (body?.answer_scale as number) ?? null,
        answer_choice: Array.isArray(body?.answer_choices) ? (body!.answer_choices as string[])[0] : null,
      }
      return json({ success: true, answer: antwoord })
    }
    if (url.endsWith('/respond') && method === 'PATCH') return json({ success: true })
    return json({ error: 'onverwacht' }, 500)
  }))
}

beforeEach(() => stubFetch())
afterEach(() => vi.unstubAllGlobals())

describe('VragenlijstView', () => {
  it('begint direct bij één actieve lijst en stelt de eerste vraag', async () => {
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={() => {}} />)
    expect(await screen.findByText('Hoe vind je de app?')).toBeInTheDocument()
    expect(screen.getByTestId('vraag-voortgang')).toHaveTextContent('Vraag 1 van 3')
  })

  it('maakt een sessie aan als er nog geen open sessie is', async () => {
    stubFetch({ sessie: false })
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={() => {}} />)
    await screen.findByText('Hoe vind je de app?')
    expect(aanroepen.some((a) => a.url.endsWith('/session') && a.method === 'POST')).toBe(true)
  })

  it('slaat elk antwoord apart op, rondt na de laatste vraag af en meldt de wijziging', async () => {
    const onVeranderd = vi.fn()
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={onVeranderd} />)

    fireEvent.click(await screen.findByRole('button', { name: '8' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ja' }))
    fireEvent.change(await screen.findByLabelText(/Je antwoord: Nog iets\?/), { target: { value: 'Mooi werk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antwoord versturen' }))

    await waitFor(() => expect(screen.getByText(/Je antwoorden zijn bewaard/)).toBeInTheDocument())

    const posts = aanroepen.filter((a) => a.url.endsWith('/respond') && a.method === 'POST')
    expect(posts.map((p) => p.body)).toEqual([
      { session_id: 's-1', question_id: 'v1', answer_scale: 8 },
      { session_id: 's-1', question_id: 'v2', answer_choices: ['Ja'] },
      { session_id: 's-1', question_id: 'v3', answer_text: 'Mooi werk' },
    ])
    expect(aanroepen.filter((a) => a.method === 'PATCH')).toHaveLength(1)
    expect(onVeranderd).toHaveBeenCalled()
    // Het gesprek blijft leesbaar: vraag én antwoord staan in beeld.
    expect(screen.getByText('8 van 10')).toBeInTheDocument()
  })

  it('hervat bij de eerste open vraag', async () => {
    stubFetch({ bestaandeAntwoorden: [{ question_id: 'v1', answer_text: null, answer_scale: 6, answer_choice: null }] })
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={() => {}} />)
    expect(await screen.findByTestId('vraag-voortgang')).toHaveTextContent('Vraag 2 van 3')
    expect(screen.getByText('6 van 10')).toBeInTheDocument()
    // Hervatten is zichtbaar, en de uitgang zegt dat je later verder kunt.
    expect(screen.getByText(/Welkom terug! Je had al 1 van de 3 vragen beantwoord/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Later afmaken' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    await waitFor(() => expect(screen.queryByText(/Welkom terug!/)).not.toBeInTheDocument())
  })

  it('toont in de keuze de voortgang van een deels ingevulde lijst', () => {
    render(
      <VragenlijstView
        lijsten={[
          { ...LIJST, has_open_session: true, answered_count: 2 },
          { ...LIJST, id: 'q-2', title: 'Nieuw', has_open_session: false, answered_count: 0 },
        ]}
        onClose={() => {}}
        onVeranderd={() => {}}
      />,
    )
    expect(screen.getByText('2 van 3 beantwoord · verder waar je was')).toBeInTheDocument()
    const balk = screen.getByRole('progressbar', { name: '2 van 3 vragen beantwoord' })
    expect(balk).toHaveAttribute('aria-valuenow', '2')
    // Een nog niet begonnen lijst heeft geen voortgangsbalk.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByText(/je kunt altijd stoppen en later verdergaan/)).toBeInTheDocument()
    // De invuller moet weten dat dit geen AI-gesprek is.
    expect(screen.getByText(/Dit is geen gesprek met de AI: je antwoorden gaan rechtstreeks naar het TriFinity-team/)).toBeInTheDocument()
  })

  it('laat een niet-verplichte vraag overslaan zonder iets op te slaan', async () => {
    stubFetch({
      bestaandeAntwoorden: [
        { question_id: 'v1', answer_text: null, answer_scale: 6, answer_choice: null },
        { question_id: 'v2', answer_text: null, answer_scale: null, answer_choice: 'Nee' },
      ],
    })
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Overslaan' }))

    await waitFor(() => expect(screen.getByText(/Je antwoorden zijn bewaard/)).toBeInTheDocument())
    expect(aanroepen.filter((a) => a.url.endsWith('/respond') && a.method === 'POST')).toHaveLength(0)
  })

  it('toont de serverfout en blijft op dezelfde vraag', async () => {
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={() => {}} />)
    await screen.findByText('Hoe vind je de app?')
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Deze invulling is afgerond of niet van jou' }, 403)))

    fireEvent.click(screen.getByRole('button', { name: '8' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Deze invulling is afgerond of niet van jou')
    expect(screen.getByTestId('vraag-voortgang')).toHaveTextContent('Vraag 1 van 3')
  })

  it('blijft niet hangen na een mislukte afronding: wijzigen + opnieuw beantwoorden probeert wéér af te ronden', async () => {
    // Alles al beantwoord → de view rondt direct af; die eerste PATCH faalt.
    const alles = [
      { question_id: 'v1', answer_text: null, answer_scale: 6, answer_choice: null },
      { question_id: 'v2', answer_text: null, answer_scale: null, answer_choice: 'Nee' },
      { question_id: 'v3', answer_text: 'ok', answer_scale: null, answer_choice: null },
    ]
    stubFetch({ bestaandeAntwoorden: alles })
    const basis = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>
    let patches = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/respond') && init?.method === 'PATCH') {
        patches += 1
        if (patches === 1) return json({ error: 'Nog niet alle verplichte vragen zijn beantwoord' }, 400)
      }
      return basis(url, init)
    }))

    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Nog niet alle verplichte vragen')

    fireEvent.click(screen.getByRole('button', { name: 'Wijzig je antwoord op: Hoe vind je de app?' }))
    fireEvent.click(await screen.findByRole('button', { name: '9' }))

    await waitFor(() => expect(screen.getByText(/Je antwoorden zijn bewaard/)).toBeInTheDocument())
    expect(patches).toBe(2)
  })

  it('toont een eindtoestand en ververst de lijst als beheer de vragenlijst halverwege deactiveert', async () => {
    const onVeranderd = vi.fn()
    render(<VragenlijstView lijsten={[LIJST]} onClose={() => {}} onVeranderd={onVeranderd} />)
    await screen.findByText('Hoe vind je de app?')
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Deze vragenlijst is niet (meer) beschikbaar' }, 404)))

    fireEvent.click(screen.getByRole('button', { name: '8' }))
    expect(await screen.findByText('Deze vragenlijst is niet (meer) beschikbaar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '8' })).not.toBeInTheDocument()
    expect(onVeranderd).toHaveBeenCalled()
  })

  it('toont een keuze bij meerdere lijsten', async () => {
    render(
      <VragenlijstView
        lijsten={[LIJST, { ...LIJST, id: 'q-2', title: 'Tweede ronde' }]}
        onClose={() => {}}
        onVeranderd={() => {}}
      />,
    )
    expect(screen.getByTestId('vragenlijst-keuze')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Tweede ronde/ }))
    await screen.findByText('Hoe vind je de app?')
    expect(aanroepen[0].url).toBe('/api/questionnaires/q-2/session')
  })

  it('slaat de keuzelijst over als de popup al een lijst aanwees (initieelId)', async () => {
    // ADR 0147: wie op "Nu invullen" klikt heeft zijn keuze al gemaakt en hoort
    // niet alsnog in een keuzescherm te landen.
    render(
      <VragenlijstView
        lijsten={[LIJST, { ...LIJST, id: 'q-2', title: 'Tweede ronde' }]}
        initieelId="q-2"
        onClose={() => {}}
        onVeranderd={() => {}}
      />,
    )
    expect(screen.queryByTestId('vragenlijst-keuze')).not.toBeInTheDocument()
    await screen.findByText('Hoe vind je de app?')
    expect(aanroepen[0].url).toBe('/api/questionnaires/q-2/session')
  })

  it('valt terug op de keuzelijst als de aangewezen lijst er niet meer is', () => {
    render(
      <VragenlijstView
        lijsten={[LIJST, { ...LIJST, id: 'q-2', title: 'Tweede ronde' }]}
        initieelId="q-weg"
        onClose={() => {}}
        onVeranderd={() => {}}
      />,
    )
    expect(screen.getByTestId('vragenlijst-keuze')).toBeInTheDocument()
  })
})

/**
 * De aanvullende vraagtypes in de chat: ja/nee, schaal met eigen bereik,
 * "Anders, namelijk" en rangschikken. Elke vraag staat alleen in de lijst, zodat
 * de test precies de invoer van dat type raakt.
 */
describe('VragenlijstView — aanvullende vraagtypes', () => {
  function metVraag(vraag: Record<string, unknown>) {
    const volledig = {
      id: 'x1', sort_order: 1, question_text: 'De vraag', options: null, scale_min: 1, scale_max: 10,
      scale_min_label: null, scale_max_label: null, is_required: true, is_multi_select: false, allow_other: false,
      ...vraag,
    }
    aanroepen = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null
      aanroepen.push({ url, method, body })
      if (url.endsWith('/session')) {
        return json({ questionnaire: { id: QID, title: 'T', description: null }, questions: [volledig], session: { id: 's-1', answers: [] } })
      }
      if (url.endsWith('/respond') && method === 'POST') {
        return json({ success: true, answer: { question_id: 'x1', answer_text: body?.answer_other ?? null, answer_scale: body?.answer_scale ?? null, answer_choice: JSON.stringify(body?.answer_choices ?? null) } })
      }
      return json({ success: true })
    }))
    render(<VragenlijstView lijsten={[{ ...LIJST, question_count: 1 }]} onClose={() => {}} onVeranderd={() => {}} />)
  }
  const posts = () => aanroepen.filter((a) => a.url.endsWith('/respond') && a.method === 'POST').map((a) => a.body)

  it('ja/nee: één tik verstuurt', async () => {
    metVraag({ type: 'yes_no' })
    fireEvent.click(await screen.findByRole('button', { name: 'Nee' }))
    await waitFor(() => expect(posts()).toEqual([{ session_id: 's-1', question_id: 'x1', answer_choices: ['Nee'] }]))
  })

  it('schaal 0–10: toont elf knoppen, van 0 tot en met 10', async () => {
    metVraag({ type: 'scale', scale_min: 0, scale_max: 10 })
    const groep = await screen.findByRole('group', { name: /Kies een cijfer van 0 tot 10/ })
    expect(groep.querySelectorAll('button')).toHaveLength(11)
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    await waitFor(() => expect(posts()).toEqual([{ session_id: 's-1', question_id: 'x1', answer_scale: 0 }]))
  })

  it('meerkeuze met "Anders": eerst je eigen tekst, dan versturen', async () => {
    metVraag({ type: 'multiple_choice', options: ['A', 'B'], allow_other: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Anders, namelijk…' }))
    // Nog niets verstuurd: "Anders" wacht op de tekst.
    expect(posts()).toHaveLength(0)
    const verstuur = screen.getByRole('button', { name: 'Verstuur' })
    expect(verstuur).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Anders, namelijk: De vraag/), { target: { value: 'Iets anders' } })
    fireEvent.click(verstuur)
    await waitFor(() =>
      expect(posts()).toEqual([{ session_id: 's-1', question_id: 'x1', answer_choices: ['Anders, namelijk'], answer_other: 'Iets anders' }]),
    )
  })

  it('rangschikken: pijlen verplaatsen, versturen stuurt de hele volgorde', async () => {
    metVraag({ type: 'ranking', options: ['A', 'B', 'C'] })
    fireEvent.click(await screen.findByRole('button', { name: 'C omhoog' }))
    fireEvent.click(screen.getByRole('button', { name: 'C omhoog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volgorde versturen' }))
    await waitFor(() => expect(posts()).toEqual([{ session_id: 's-1', question_id: 'x1', answer_choices: ['C', 'A', 'B'] }]))
  })

  it('rangschikken: de lijst houdt zijn aanrakingen zelf, zodat slepen het chatpaneel niet meesleept (B-050)', async () => {
    metVraag({ type: 'ranking', options: ['A', 'B', 'C'] })
    const lijst = await screen.findByRole('list', { name: 'De vraag' })
    expect(lijst).toHaveAttribute('data-sheet-gesture', 'none')
  })
})
