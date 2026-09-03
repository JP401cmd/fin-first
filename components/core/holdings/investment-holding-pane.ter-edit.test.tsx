/**
 * WF-BEZIT-16-bug2 — de TER is ook ná het aanmaken van een holding te wijzigen.
 *
 * De repro: het bewerk-formulier van `InvestmentHoldingPane` (edit-mode) kende
 * geen TER-veld. De PATCH-body bevatte alleen `notes`, en optioneel
 * `avg_purchase_price`/`units`. Netto was de TER dus uitsluitend bij CREATIE in
 * te vullen — terwijl de typed detailpagina wél belooft: "Voeg de TER toe via
 * 'Bewerken' om jaarlijkse fondskosten inzichtelijk te maken". De backend
 * (`PATCH /api/holdings/[id]`) ondersteunde `ter`/`ter_source` al volledig; het
 * gat zat puur in de UI.
 *
 * Deze suite pint de vier eigenschappen die de belofte waarmaken:
 *   1. Het veld bestaat en is voorgevuld met de opgeslagen TER — in PROCENT
 *      (0.0022 → "0.22"), dezelfde invoereenheid als het aanmaakformulier.
 *   2. Wijzigen stuurt `ter` (decimaal) én `ter_source: 'manual'` mee.
 *   3. Het veld blijft bewerkbaar bij een transactie-afgeleide/broker-gesyncte
 *      positie, waar units en gem. inkoopprijs juist read-only zijn — dat is
 *      precies de holding waarop de bug live is aangetoond (Meesman).
 *   4. Leegmaken wist zowel `ter` als `ter_source`, en een save die de TER niet
 *      aanraakt laat beide velden ongemoeid (geen ongevraagde `ter_source`-
 *      overschrijving bij het opslaan van enkel een notitie).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ToastProvider } from '@/components/app/toast-provider'
import {
  InvestmentHoldingPane,
  type InvestmentHoldingPaneInput,
} from './investment-holding-pane'

/** Meesman-achtige holding: eenheden uit transacties, TER 0,22%. */
function makeHolding(
  overrides: Partial<InvestmentHoldingPaneInput> = {},
): InvestmentHoldingPaneInput {
  return {
    id: 'h1',
    ticker: 'MEESMAN',
    name: 'Meesman Wereldwijd Totaal',
    isin: 'NL0010937523',
    units: 42,
    currency: 'EUR',
    currentPrice: 120,
    avgPurchasePrice: 100,
    notes: 'bestaande notitie',
    externalSource: null,
    lastPriceUpdate: null,
    dailyChangePercent: null,
    ter: 0.0022,
    ...overrides,
  }
}

/** Eén transactie ⇒ units en gem. inkoopprijs zijn server-afgeleid (read-only). */
const DETAIL_WITH_TX = {
  holding: { notes: 'bestaande notitie' },
  transactions: [
    {
      id: 't1',
      transaction_type: 'buy',
      units: 42,
      price_per_unit: 100,
      transaction_date: '2026-01-15',
      fees: 0,
      total_amount: 4200,
      external_source: null,
    },
  ],
}

/** Opgevangen PATCH-bodies, in volgorde. */
let patchBodies: Record<string, unknown>[] = []

function installFetch(detail: unknown = DETAIL_WITH_TX) {
  patchBodies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchBodies.push(JSON.parse(String(init.body)))
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as unknown as Response
      }
      if (String(url).includes('/detail')) {
        return {
          ok: true,
          status: 200,
          json: async () => detail,
        } as unknown as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
    }),
  )
}

/** Rendert de pane en klikt door naar edit-mode. */
async function openEdit(holding: InvestmentHoldingPaneInput) {
  render(
    <ToastProvider>
      <InvestmentHoldingPane holding={holding} onClose={vi.fn()} />
    </ToastProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Bewerken' }))
  return screen.findByTestId('investment-edit-ter-input')
}

describe('InvestmentHoldingPaneEdit — TER is na creatie te wijzigen', () => {
  beforeEach(() => installFetch())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('toont een TER-veld, voorgevuld in procent (0.0022 → "0.22")', async () => {
    const input = (await openEdit(makeHolding())) as HTMLInputElement
    expect(input.value).toBe('0.22')
    // De regressie: vóór de fix bestond dit veld helemaal niet.
    expect(input.readOnly).toBe(false)
  })

  it('stuurt bij wijziging ter (decimaal) + ter_source "manual" mee in de PATCH', async () => {
    const input = await openEdit(makeHolding())
    // 0,50% → 0,40%, de wijziging uit het acceptatiecriterium.
    fireEvent.change(input, { target: { value: '0.40' } })

    const save = await screen.findByRole('button', { name: 'Opslaan' })
    expect(save).not.toBeDisabled()
    fireEvent.click(save)

    await waitFor(() => expect(patchBodies).toHaveLength(1))
    expect(patchBodies[0].ter).toBeCloseTo(0.004, 10)
    expect(patchBodies[0].ter_source).toBe('manual')
  })

  it('blijft bewerkbaar terwijl units en gem. inkoopprijs transactie-afgeleid (read-only) zijn', async () => {
    const ter = (await openEdit(makeHolding())) as HTMLInputElement
    const units = screen.getByLabelText('Aantal eenheden') as HTMLInputElement
    const avg = screen.getByLabelText('Gem. inkoopprijs (EUR)') as HTMLInputElement

    // Precies de live-situatie van de bugmelding: positie server-afgeleid,
    // TER toch invulbaar. Zonder deze scheiding zou de fix onbereikbaar zijn op
    // exact de holdings waar de gebruiker hem tegenkwam.
    expect(units.readOnly).toBe(true)
    expect(avg.readOnly).toBe(true)
    expect(ter.readOnly).toBe(false)
  })

  it('wist ter én ter_source wanneer het veld wordt leeggemaakt', async () => {
    const input = await openEdit(makeHolding())
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(patchBodies).toHaveLength(1))
    expect(patchBodies[0].ter).toBeNull()
    expect(patchBodies[0].ter_source).toBeNull()
  })

  it('laat ter/ter_source weg wanneer alleen de notitie wijzigt', async () => {
    await openEdit(makeHolding())
    fireEvent.change(screen.getByLabelText('Notities'), {
      target: { value: 'nieuwe notitie' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(patchBodies).toHaveLength(1))
    expect(patchBodies[0]).not.toHaveProperty('ter')
    expect(patchBodies[0]).not.toHaveProperty('ter_source')
  })

  it('weigert een TER buiten de serverrange 0–10% zonder te PATCHen', async () => {
    const input = await openEdit(makeHolding())
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Opslaan' }))

    expect(await screen.findByText('TER moet tussen 0% en 10% liggen.')).toBeTruthy()
    expect(patchBodies).toHaveLength(0)
  })

  it('toont een leeg veld wanneer de holding nog geen TER heeft', async () => {
    const input = (await openEdit(makeHolding({ ter: null }))) as HTMLInputElement
    expect(input.value).toBe('')
  })
})
