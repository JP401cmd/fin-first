import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KrantWeekmetingPanel } from './krant-weekmeting-panel'
import { bouwWeekmeting } from '@/lib/krant/weekmeting'

const RECORD = bouwWeekmeting({
  week: '2026-W40',
  editieWeek: '2026-W41',
  gemetenOp: '2026-10-05T06:04:00.000Z',
  duiding: null,
  artikelen: [{ id: 'a', bron_soort: 'rss', bron_detail: 'gelezen', duiding_status: 'wacht', mechanisme: null, eerste_thema: null }],
  metSamenvattingPerBronsoort: { rss: 0, web_lijst: 0, web_pagina: 0 },
  metSamenvattingTotaal: 0,
  editieOnvolledig: false,
  vorigeWeek: null,
  backfillResterend: 3,
  edities: [],
  testaccountIds: new Set(),
  tokens: [{ feature: 'news-duiding', input_tokens: 1200, output_tokens: 30 }],
  afgekapt: false,
  leesfouten: [],
  rekent: () => false,
})

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
}

afterEach(() => vi.unstubAllGlobals())

describe('KrantWeekmetingPanel', () => {
  it('toont een lege staat zonder runs', async () => {
    mockFetch({ weken: [] })
    render(<KrantWeekmetingPanel ververs={0} />)
    expect(await screen.findByText(/Nog geen weekmeting/)).toBeInTheDocument()
  })

  it('toont een week met het aantal waarschuwingen en klapt de details uit', async () => {
    mockFetch({ weken: [{ status: 'partial', startedAt: '2026-10-05T06:04:00Z', record: RECORD }] })
    render(<KrantWeekmetingPanel ververs={0} />)
    expect(await screen.findByText('2026-W40')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details week 2026-W40' }))
    await waitFor(() => expect(screen.getByText('Dekking per brontype')).toBeInTheDocument())
    expect(screen.getByText(/backfill resterend 3/)).toBeInTheDocument()
    expect(screen.getByText(/news-duiding: 1× · in 1\.200 · uit 30/)).toBeInTheDocument()
    // duiding null → 0 binnen → waarschuwing 'geen-artikelen' in de lijst.
    expect(screen.getByText('Geen enkel artikel binnengekomen deze week')).toBeInTheDocument()
  })

  it('toont Wacht, markeert een week in de wachtrij als voorlopig en toont echte lezers per type', async () => {
    const wachtrij = {
      ...RECORD,
      artikelen: { ...RECORD.artikelen, binnen: 107, geduid: 1, wacht: 106 },
      verversingen: { ...RECORD.verversingen, perProfieltype: { 'p-echt': { edities: 'klein' as const, leeg: 'klein' as const } } },
    }
    mockFetch({ weken: [{ status: 'partial', startedAt: '2026-09-29T06:24:00Z', record: wachtrij }] })
    render(<KrantWeekmetingPanel ververs={0} />)
    expect(await screen.findByText('voorlopig')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Wacht' })).toBeInTheDocument()
    expect(screen.getByText('106')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details week 2026-W40' }))
    await waitFor(() => expect(screen.getByText(/Echte lezers/)).toBeInTheDocument())
    expect(screen.getByText(/p-echt:/)).toBeInTheDocument()
  })

  it('een record van vóór 29 sep zonder verdeling van echte lezers breekt niet', async () => {
    const oud = { ...RECORD, verversingen: { edities: 0, leeg: 0, onvolledig: false, testaccounts: {} } }
    mockFetch({ weken: [{ status: 'success', startedAt: '2026-09-29T06:24:00Z', record: oud }] })
    render(<KrantWeekmetingPanel ververs={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Details week 2026-W40' }))
    await waitFor(() => expect(screen.getByText('niet vastgelegd in deze run')).toBeInTheDocument())
  })

  it('meldt een fout met role=alert', async () => {
    mockFetch({ error: 'Geen toegang' }, false)
    render(<KrantWeekmetingPanel ververs={0} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Geen toegang')
  })
})
