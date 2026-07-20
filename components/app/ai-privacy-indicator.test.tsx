import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AiPrivacyIndicator } from './ai-privacy-indicator'

/**
 * Regressietests voor de privé-modus-bewuste labeling (#883, fase C2a).
 *
 * Bug: de indicator toonde altijd "geanonimiseerd verstuurd" — ook wanneer de
 * AI in privé-modus on-device draait (dan verlaat er niets het toestel, dus
 * "geanonimiseerd verstuurd" is feitelijk onjuist). De fix leest `usePrivacyMode`
 * en kiest LOCAL_LABEL wanneer privé-modus aan staat, anders CLOUD_LABEL. Een
 * expliciete `localMode`-prop wint van de gelezen waarde (call-sites die de
 * modus al kennen kunnen 'm doorgeven i.p.v. een eigen hook-call).
 */

const mockUsePrivacyMode = vi.fn()

vi.mock('./use-privacy-mode', () => ({
  usePrivacyMode: () => mockUsePrivacyMode(),
}))

beforeEach(() => {
  mockUsePrivacyMode.mockReset()
})

describe('AiPrivacyIndicator — privacy-modus-bewuste labeling', () => {
  it('toont CLOUD_LABEL wanneer privé-modus uit staat', () => {
    mockUsePrivacyMode.mockReturnValue(false)
    render(<AiPrivacyIndicator />)

    expect(
      screen.getByRole('img', { name: /je data wordt geanonimiseerd verstuurd/i }),
    ).toBeInTheDocument()
  })

  it('toont LOCAL_LABEL wanneer privé-modus aan staat', () => {
    mockUsePrivacyMode.mockReturnValue(true)
    render(<AiPrivacyIndicator />)

    expect(
      screen.getByRole('img', { name: /draait lokaal op je toestel.*verlaten je toestel niet/i }),
    ).toBeInTheDocument()
  })

  it('behandelt null (nog aan het laden) als cloud — geen lege/knipperende tekst', () => {
    mockUsePrivacyMode.mockReturnValue(null)
    render(<AiPrivacyIndicator />)

    expect(
      screen.getByRole('img', { name: /je data wordt geanonimiseerd verstuurd/i }),
    ).toBeInTheDocument()
  })

  it('een expliciete localMode-prop wint van de gelezen waarde (true wint van gelezen false)', () => {
    mockUsePrivacyMode.mockReturnValue(false)
    render(<AiPrivacyIndicator localMode />)

    expect(
      screen.getByRole('img', { name: /draait lokaal op je toestel/i }),
    ).toBeInTheDocument()
  })

  it('een expliciete localMode={false} wint van een gelezen true', () => {
    mockUsePrivacyMode.mockReturnValue(true)
    render(<AiPrivacyIndicator localMode={false} />)

    expect(
      screen.getByRole('img', { name: /je data wordt geanonimiseerd verstuurd/i }),
    ).toBeInTheDocument()
  })

  it('toont hetzelfde label in de tooltip bij klik', () => {
    mockUsePrivacyMode.mockReturnValue(true)
    render(<AiPrivacyIndicator />)

    fireEvent.click(screen.getByRole('img'))

    expect(screen.getByRole('tooltip')).toHaveTextContent(/draait lokaal op je toestel/i)
  })
})
