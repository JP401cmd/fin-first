import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState, type ReactNode } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { EntityBackfillEditor, type EntityBackfillEditorProps } from './entity-backfill-editor'

/**
 * Tests voor EntityBackfillEditor — de per-entiteit-backfill-editor.
 *
 * We mocken GET/POST /api/snapshots/entity-backfill (asset + debt) en verifiëren:
 *  - gegroepeerde entiteiten met voor-ingevulde waardes uit de GET
 *  - doortrekken vult alleen lege latere maanden, overschrijft gevulde niet
 *  - opslaan → eerst dryRun-POST + preview; bevestigen → echte diff-only POST + onSaved
 *  - annuleren in preview → geen echte POST
 *  - foutpad → role="alert" met servertekst
 *  - setFooter wordt gezet en bij unmount met null opgeruimd
 */

// De editor plaatst zijn acties via setFooter in de sheet-footer. In de test
// renderen we die footer-node zelf zodat de knoppen klikbaar zijn.
const noop = () => {}

function Harness(props: Partial<EntityBackfillEditorProps>) {
  const [footer, setFooter] = useState<ReactNode>(null)
  return (
    <div>
      <EntityBackfillEditor
        onClose={props.onClose ?? noop}
        onSaved={props.onSaved ?? noop}
        setFooter={props.setFooter ?? setFooter}
      />
      <div data-testid="footer">{footer}</div>
    </div>
  )
}

/** 24 maanden oud→nieuw, met per meegegeven maand een balance (rest null). */
function buildMonths(values: Record<string, number>): { month: string; balance: number | null }[] {
  const out: { month: string; balance: number | null }[] = []
  const d = new Date()
  d.setDate(1)
  for (let mb = 24; mb >= 1; mb--) {
    const dd = new Date(d)
    dd.setMonth(dd.getMonth() - mb)
    const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`
    out.push({ month: key, balance: key in values ? values[key] : null })
  }
  return out
}

/** 'YYYY-MM' van `monthsBack` maanden terug (spiegelt de editor). */
function isoMonthBack(monthsBack: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - monthsBack)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTH_NAMES = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

interface PostBody {
  entityType: string
  entityId: string
  entries: { month: string; balance: number }[]
  dryRun?: boolean
}

/**
 * Mock fetch. GET geeft de opgegeven entiteiten per type. POST met dryRun:true
 * geeft een preview afgeleid van de entries; dryRun:false geeft { count }.
 * Alle POST-bodies worden opgevangen in `posted`.
 */
function setupFetch(opts: {
  asset?: unknown[]
  debt?: unknown[]
  postFails?: boolean
  postError?: string
}) {
  const posted: PostBody[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as PostBody
      posted.push(body)
      if (body.dryRun) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              preview: body.entries.map((e) => ({
                month: e.month,
                oldBalance: null,
                newBalance: e.balance,
                action: 'insert' as const,
              })),
            }),
        })
      }
      if (opts.postFails) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: opts.postError ?? 'Opslaan mislukt' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: body.entries.length }) })
    }
    // GET
    const isAsset = url.includes('entityType=asset')
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ entities: isAsset ? (opts.asset ?? []) : (opts.debt ?? []) }),
    })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return { fetchMock, posted }
}

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('EntityBackfillEditor', () => {
  it('rendert gegroepeerde entiteiten met voor-ingevulde waardes uit de GET', async () => {
    const aprAsset = isoMonthBack(2)
    setupFetch({
      asset: [
        {
          id: 'a1',
          name: 'Spaarrekening',
          group: 'spaargeld',
          subtype: null,
          isActive: true,
          currentValue: 12000,
          months: buildMonths({ [aprAsset]: 10000 }),
        },
      ],
      debt: [
        {
          id: 'd1',
          name: 'Hypotheek',
          group: 'wonen',
          subtype: 'annuiteit',
          isActive: true,
          currentValue: 240000,
          months: buildMonths({}),
        },
      ],
    })

    render(<Harness />)

    // Groepskoppen + supergroepen.
    await waitFor(() => expect(screen.getByText('Bezittingen')).toBeTruthy())
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Spaargeld')).toBeTruthy()
    expect(screen.getByText('Wonen')).toBeTruthy()

    // Voor-ingevulde waarde uit de GET staat in het juiste maandveld.
    const input = screen.getByLabelText(`Spaarrekening ${monthLabel(aprAsset)}`) as HTMLInputElement
    expect(input.value).toBe('10000')
  })

  it('doortrekken vult alleen lege latere maanden en laat gevulde staan', async () => {
    const anchor = isoMonthBack(5) // laatst bekende waarde
    const laterFilled = isoMonthBack(2) // reeds gevuld — mag NIET overschreven worden
    setupFetch({
      asset: [
        {
          id: 'a1',
          name: 'Beleggingen',
          group: 'beleggingen',
          subtype: null,
          isActive: true,
          currentValue: 50000,
          months: buildMonths({ [anchor]: 30000, [laterFilled]: 44000 }),
        },
      ],
      debt: [],
    })

    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Bezittingen')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Waarde doortrekken voor Beleggingen' }))

    // Een lege latere maand (tussen anchor en nu, maar niet de reeds gevulde) is
    // nu gevuld met de anchor-waarde.
    const between = screen.getByLabelText(`Beleggingen ${monthLabel(isoMonthBack(4))}`) as HTMLInputElement
    expect(between.value).toBe('30000')

    // De reeds gevulde latere maand blijft ongemoeid.
    const kept = screen.getByLabelText(`Beleggingen ${monthLabel(laterFilled)}`) as HTMLInputElement
    expect(kept.value).toBe('44000')

    // Een maand vóór de anchor blijft leeg (geen back-cast).
    const before = screen.getByLabelText(`Beleggingen ${monthLabel(isoMonthBack(6))}`) as HTMLInputElement
    expect(before.value).toBe('')
  })

  it('opslaan doet eerst dryRun + preview, bevestigen POST diff-only en roept onSaved', async () => {
    const onSaved = vi.fn()
    const targetMonth = isoMonthBack(3)
    const { posted } = setupFetch({
      asset: [
        {
          id: 'a1',
          name: 'Spaarrekening',
          group: 'spaargeld',
          subtype: null,
          isActive: true,
          currentValue: 12000,
          months: buildMonths({}),
        },
      ],
      debt: [],
    })

    render(<Harness onSaved={onSaved} />)
    await waitFor(() => expect(screen.getByText('Bezittingen')).toBeTruthy())

    // Vul één maand in.
    const input = screen.getByLabelText(`Spaarrekening ${monthLabel(targetMonth)}`)
    fireEvent.change(input, { target: { value: '9000' } })

    // Opslaan → dry-run.
    fireEvent.click(await screen.findByRole('button', { name: /Opslaan/ }))

    // Preview verschijnt.
    await waitFor(() => expect(screen.getByText('Controleer je wijzigingen')).toBeTruthy())
    const dryRunPosts = posted.filter((b) => b.dryRun)
    expect(dryRunPosts).toHaveLength(1)
    expect(dryRunPosts[0].entries).toEqual([{ month: targetMonth, balance: 9000 }])
    // Nog geen echte POST.
    expect(posted.filter((b) => b.dryRun === false)).toHaveLength(0)

    // Bevestigen → echte POST.
    fireEvent.click(await screen.findByRole('button', { name: /Bevestigen en opslaan/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const realPosts = posted.filter((b) => b.dryRun === false)
    expect(realPosts).toHaveLength(1)
    expect(realPosts[0].entityType).toBe('asset')
    expect(realPosts[0].entityId).toBe('a1')
    expect(realPosts[0].entries).toEqual([{ month: targetMonth, balance: 9000 }])
  })

  it('annuleren in preview doet geen echte POST', async () => {
    const onSaved = vi.fn()
    const targetMonth = isoMonthBack(3)
    const { posted } = setupFetch({
      asset: [
        {
          id: 'a1',
          name: 'Spaarrekening',
          group: 'spaargeld',
          subtype: null,
          isActive: true,
          currentValue: 12000,
          months: buildMonths({}),
        },
      ],
      debt: [],
    })

    render(<Harness onSaved={onSaved} />)
    await waitFor(() => expect(screen.getByText('Bezittingen')).toBeTruthy())

    fireEvent.change(screen.getByLabelText(`Spaarrekening ${monthLabel(targetMonth)}`), {
      target: { value: '9000' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Opslaan/ }))
    await waitFor(() => expect(screen.getByText('Controleer je wijzigingen')).toBeTruthy())

    // Terug uit de preview.
    fireEvent.click(await screen.findByRole('button', { name: 'Terug' }))
    await waitFor(() => expect(screen.getByText('Historie per onderdeel')).toBeTruthy())

    expect(posted.filter((b) => b.dryRun === false)).toHaveLength(0)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('toont role="alert" met servertekst wanneer de echte opslag faalt', async () => {
    const onSaved = vi.fn()
    const targetMonth = isoMonthBack(3)
    setupFetch({
      asset: [
        {
          id: 'a1',
          name: 'Spaarrekening',
          group: 'spaargeld',
          subtype: null,
          isActive: true,
          currentValue: 12000,
          months: buildMonths({}),
        },
      ],
      debt: [],
      postFails: true,
      postError: 'Ongeldige maand',
    })

    render(<Harness onSaved={onSaved} />)
    await waitFor(() => expect(screen.getByText('Bezittingen')).toBeTruthy())

    fireEvent.change(screen.getByLabelText(`Spaarrekening ${monthLabel(targetMonth)}`), {
      target: { value: '9000' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Opslaan/ }))
    await waitFor(() => expect(screen.getByText('Controleer je wijzigingen')).toBeTruthy())
    fireEvent.click(await screen.findByRole('button', { name: /Bevestigen en opslaan/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Ongeldige maand/)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('zet de footer en ruimt die met null op bij unmount', async () => {
    const setFooter = vi.fn()
    setupFetch({
      asset: [
        {
          id: 'a1',
          name: 'Spaarrekening',
          group: 'spaargeld',
          subtype: null,
          isActive: true,
          currentValue: 12000,
          months: buildMonths({}),
        },
      ],
      debt: [],
    })

    const { unmount } = render(<Harness setFooter={setFooter} />)
    await waitFor(() => expect(setFooter).toHaveBeenCalled())
    // Ten minste één keer met een echte node gezet.
    expect(setFooter.mock.calls.some((c) => c[0] != null)).toBe(true)

    unmount()
    // Laatste aanroep ruimt op met null.
    expect(setFooter).toHaveBeenLastCalledWith(null)
  })
})
