import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { AddExchangeModal } from './add-exchange-modal'

/**
 * Regressie: na een geslaagde "Test verbinding" (groen "Verbinding werkt") en
 * daarna een mislukte "Koppel" mogen het groene succes- en het rode foutbericht
 * NIET tegelijk in beeld staan. handleSubmit reset daarom de test-status.
 */
describe('AddExchangeModal — status-berichten sluiten elkaar uit', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('verbergt "Verbinding werkt" zodra het koppelen faalt', async () => {
    const fetchMock = vi
      .fn()
      // 1) /validate → ok
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
      // 2) /connect → netwerkfout (fetch throwt)
      .mockRejectedValueOnce(new Error('network'))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AddExchangeModal
        open
        onClose={() => {}}
        linkedAssetId="asset-1"
        linkedAssetName="Crypto"
        onConnected={() => {}}
      />,
    )

    const creds = '0123456789abcdef0123' // 20 chars ≥ min 16
    fireEvent.change(screen.getByLabelText(/api-key/i), { target: { value: creds } })
    fireEvent.change(screen.getByLabelText(/api-secret/i), { target: { value: creds } })

    fireEvent.click(screen.getByRole('button', { name: 'Test verbinding' }))
    expect(await screen.findByText(/Verbinding werkt/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Koppel Bitvavo' }))
    expect(await screen.findByText(/Netwerkfout/)).toBeTruthy()

    // De kern van de fix: het groene bericht is weg.
    expect(screen.queryByText(/Verbinding werkt/)).toBeNull()
  })
})
