import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from './page'

/**
 * Regressietest voor de login-pagina ná de perf-slanking (Task 3.1): de
 * Supabase-client wordt nu DYNAMISCH geladen (`await import('@/lib/supabase/
 * client')`) binnen de submit-handler i.p.v. via een statische module-top-
 * import. Deze test borgt dat die verplaatsing het handler-gedrag NIET brak:
 * een geslaagde login redirect nog steeds, en een foutieve login toont nog
 * steeds de vertaalde `translateAuthError`-copy. Vitest's `vi.mock` onderschept
 * óók de dynamische `import()`, dus de mock-client resolvet door de await heen.
 */

const signInWithPassword = vi.fn()
const mockSupabase = { auth: { signInWithPassword } }

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(''),
}))

beforeEach(() => {
  signInWithPassword.mockReset()
  push.mockReset()
})

function submitLogin() {
  fireEvent.change(screen.getByLabelText('E-mailadres'), {
    target: { value: 'iemand@voorbeeld.nl' },
  })
  fireEvent.change(screen.getByLabelText('Wachtwoord'), {
    target: { value: 'geheim123' },
  })
  const form = screen.getByRole('button', { name: /^inloggen$/i }).closest('form')
  fireEvent.submit(form!)
}

describe('LoginPage — dynamische client-init laat het handler-gedrag intact', () => {
  it('redirect na een geslaagde login (dynamische createClient resolvet de mock)', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)
    submitLogin()
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
    // Geen foutmelding bij succes.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('toont de vertaalde foutmelding bij foute inloggegevens (geen kale Supabase-tekst)', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    render(<LoginPage />)
    submitLogin()
    await waitFor(() =>
      expect(screen.getByText('E-mailadres of wachtwoord klopt niet.')).toBeTruthy(),
    )
    expect(push).not.toHaveBeenCalled()
  })
})
