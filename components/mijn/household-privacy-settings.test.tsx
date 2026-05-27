import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HouseholdPrivacySettings } from './household-privacy-settings'

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('HouseholdPrivacySettings', () => {
  it('rendert niets zonder huishouden (404)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    const { container } = render(<HouseholdPrivacySettings />)
    await waitFor(() => expect(container.querySelector('[data-testid="household-privacy-section"]')).toBeNull())
  })

  it('toont per-categorie editor wanneer er een huishouden is', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          privacySettings: {
            vermogen: 'volledig',
            schulden: 'totalen',
            budgetten: 'totalen',
            transacties: 'verborgen',
            inkomen: 'totalen',
          },
        }),
    }) as unknown as typeof fetch
    render(<HouseholdPrivacySettings />)
    await screen.findByText('Privacy binnen je huishouden')
    expect(screen.getByText('Vermogen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Inkomen')).toBeTruthy()
  })

  it('slaat gewijzigde instellingen op via POST', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            privacySettings: {
              vermogen: 'totalen',
              schulden: 'totalen',
              budgetten: 'totalen',
              transacties: 'totalen',
              inkomen: 'totalen',
            },
          }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<HouseholdPrivacySettings />)
    await screen.findByText('Privacy binnen je huishouden')

    // Zet 'Vermogen' op 'Volledig' → maakt het formulier dirty.
    const volledigButtons = screen.getAllByRole('button', { name: /Volledig/i })
    fireEvent.click(volledigButtons[0])

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')
      expect(postCall).toBeTruthy()
      expect(postCall![0]).toBe('/api/household/privacy')
      const body = JSON.parse(postCall![1].body)
      expect(body.privacySettings.vermogen).toBe('volledig')
    })
  })
})
