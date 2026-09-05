import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BedragenVerbergenBlok } from './bedragen-verbergen-blok'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MaskedAmount } from '@/components/app/masked-amount'

/**
 * UR3-14 deel B: "Bedragen verbergen" was alleen bereikbaar via ⌘K — dit blok
 * zet dezelfde schakelaar rechtstreeks op /mijn/privacy. Bewaakt het GEEN
 * TWEEDE SCHRIJFPAD-contract: de schakelaar drijft op `useMaskedAmounts()`,
 * dezelfde `localStorage`-sleutel als de ⌘K-actie en de app-brede
 * `MaskedAmount`-renderer.
 */

function renderBlok(children: React.ReactNode = null) {
  return render(
    <PrivacyProvider>
      <BedragenVerbergenBlok />
      {children}
    </PrivacyProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('BedragenVerbergenBlok', () => {
  it('rendert uit met de schakelaar op "uit" wanneer niets is opgeslagen', () => {
    renderBlok()
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('zet de schakelaar aan en schrijft naar dezelfde localStorage-sleutel als ⌘K', () => {
    renderBlok()
    const toggle = screen.getByRole('switch')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(window.localStorage.getItem(PRIVACY_MASKED_STORAGE_KEY)).toBe('true')
  })

  it('verbergt een bedrag elders op de pagina via dezelfde context (geen tweede schrijfpad)', () => {
    renderBlok(<MaskedAmount value={1234} />)
    expect(screen.getByText(/€\s*1\.234/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch'))

    expect(screen.queryByText(/€\s*1\.234/)).not.toBeInTheDocument()
    expect(screen.getByText('••••••')).toBeInTheDocument()
  })

  it('noemt "dit apparaat" — geen belofte van cross-device sync', () => {
    renderBlok()
    expect(screen.getByText(/Geldt voor dit apparaat/i)).toBeInTheDocument()
  })

  it('noemt nergens het woord "privacymodus" — die naam is elders al bezet', () => {
    renderBlok()
    expect(screen.queryByText(/privacymodus/i)).not.toBeInTheDocument()
  })
})
