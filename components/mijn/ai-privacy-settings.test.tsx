import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiPrivacySettings } from './ai-privacy-settings'

// Component laadt ai_enabled + financial_context via de supabase-client en
// schrijft terug bij toggle/opslaan. Mock de client met een instelbaar
// profiel-resultaat.
const updateSpy = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: { ai_enabled: true, financial_context: 'zzp in de IT' },
          }),
        }),
      }),
      update: updateSpy,
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  }),
}))

describe('AiPrivacySettings', () => {
  it('toont AI-toggle en transparantie-blokken', async () => {
    render(<AiPrivacySettings />)
    await screen.findByText('AI-features inschakelen')
    expect(screen.getByText('Wat wordt gedeeld')).toBeTruthy()
    expect(screen.getByText('Wat wordt gemaskeerd')).toBeTruthy()
    expect(screen.getByText('Hoe je data wordt verwerkt')).toBeTruthy()
  })

  it('laadt opgeslagen financiële toelichting in de textarea', async () => {
    render(<AiPrivacySettings />)
    await waitFor(() => {
      const ta = screen.getByPlaceholderText(/zzp'er in de IT/i) as HTMLTextAreaElement
      expect(ta.value).toBe('zzp in de IT')
    })
  })

  it('AI-toggle schrijft ai_enabled naar profiel', async () => {
    updateSpy.mockClear()
    render(<AiPrivacySettings />)
    const toggle = await screen.findByRole('switch', { name: /AI-features/i })
    fireEvent.click(toggle)
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ ai_enabled: false }))
  })

  it('opent de volledige privacyverklaring in een sheet', async () => {
    render(<AiPrivacySettings />)
    fireEvent.click(screen.getByText('Volledige privacyverklaring'))
    await waitFor(() => expect(screen.getByText(/Welke gegevens verzamelen we/i)).toBeTruthy())
  })
})
