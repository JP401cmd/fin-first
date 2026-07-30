import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AccountSourceIcon, ACCOUNT_SOURCE_TOOLTIP, accountSourceSuffix } from './account-source-icon'
import { VermogenAssetCard } from './vermogen-asset-card'
import type { BankLinkState } from '@/lib/bank-connection-status'
import type { Asset } from '@/lib/asset-data'

// VermogenAssetCard hangt aan de app-shell (router, toasts, module-toegang).
// Voor deze weergavetest zijn dat inerte stubs — het gedrag onder toets is
// uitsluitend of de herkomst/koppeltoestand van de rekening correct wordt
// weergegeven, benoemd en (bij verbinding kwijt) herstelbaar gemaakt.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/app/toast-provider', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/components/app/feature-access-provider', () => ({
  useFeatureAccess: () => ({ activeModules: [] }),
}))

const asset = {
  id: 'a1',
  name: 'Betaalrekening',
  asset_type: 'cash',
  current_value: 1234,
  ownership: 'personal',
} as unknown as Asset

/**
 * Lucide zet de icoonnaam als class op de `<svg>` (`lucide lucide-unlink`), dus
 * het gekozen GLYPH is toetsbaar zonder een snapshot van het pad. Dat is precies
 * wat fase 7 nodig heeft: de bug was dat een dode koppeling er hetzelfde uitzag
 * als een rekening die nooit gekoppeld was.
 */
const GLYPH_CLASS = {
  linked: 'lucide-link-2',
  'linked-broken': 'lucide-unlink',
  manual: 'lucide-file-text',
} as const satisfies Record<BankLinkState, string>

const STATES: BankLinkState[] = ['linked', 'linked-broken', 'manual']

function renderCard(props: Partial<React.ComponentProps<typeof VermogenAssetCard>> = {}) {
  return render(
    <VermogenAssetCard
      asset={asset}
      onClick={() => {}}
      onEditClick={() => {}}
      onRevalueClick={() => {}}
      {...props}
    />,
  )
}

describe('AccountSourceIcon — drie toestanden', () => {
  it.each(STATES)('toont voor "%s" het eigen symbool én de eigen hover-titel', (state) => {
    const { container } = render(<AccountSourceIcon state={state} />)
    expect(container.querySelector(`[title="${ACCOUNT_SOURCE_TOOLTIP[state]}"]`)).not.toBeNull()
    expect(container.querySelector(`svg.${GLYPH_CLASS[state]}`)).not.toBeNull()
  })

  it('onderscheidt "verbinding kwijt" van "handmatig" — glyph, titel én suffix', () => {
    // Dit is de bug die fase 7 oplost: vóór de derde toestand viel een verlopen
    // of verbroken koppeling stil terug in "handmatig", en was een dode
    // koppeling visueel niet te onderscheiden van een rekening die nooit
    // gekoppeld was. Alle drie de dragers moeten dus verschillen.
    expect(GLYPH_CLASS['linked-broken']).not.toBe(GLYPH_CLASS.manual)
    expect(ACCOUNT_SOURCE_TOOLTIP['linked-broken']).not.toBe(ACCOUNT_SOURCE_TOOLTIP.manual)
    expect(accountSourceSuffix('linked-broken')).not.toBe(accountSourceSuffix('manual'))

    const broken = render(<AccountSourceIcon state="linked-broken" />)
    expect(broken.container.querySelector(`svg.${GLYPH_CLASS.manual}`)).toBeNull()
    const manual = render(<AccountSourceIcon state="manual" />)
    expect(manual.container.querySelector(`svg.${GLYPH_CLASS['linked-broken']}`)).toBeNull()
  })

  it('noemt de oorzaak niet — copy is neutraal over expired/revoked', () => {
    // `bank_connections.status` kent `revoked`, maar geen enkel codepad schrijft
    // die waarde ooit. Copy die het onderscheid benoemt zou een detectie
    // suggereren die de app niet heeft.
    const broken = ACCOUNT_SOURCE_TOOLTIP['linked-broken'].toLowerCase()
    expect(broken).not.toContain('ingetrokken')
    expect(broken).not.toContain('verlopen')
  })

  it('is altijd aria-hidden — de omvattende control draagt de naam', () => {
    const { container } = render(<AccountSourceIcon state="linked" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-hidden]')).not.toBeNull()
  })

  it('erft de tekstkleur met inheritColor (gekleurde pill)', () => {
    const { container } = render(<AccountSourceIcon state="linked" inheritColor />)
    expect(container.querySelector('span')?.className).not.toContain('--ink-')
  })
})

describe('VermogenAssetCard — koppeltoestand van een bankrekening', () => {
  it.each(STATES)('benoemt "%s" in de accessible name van de kaart-knop', (state) => {
    renderCard({ bankLink: state })
    expect(
      screen.getByRole('button', {
        name: `Betaalrekening openen — ${accountSourceSuffix(state)}`,
      }),
    ).toBeInTheDocument()
  })

  it('laat naam én kaart ongewijzigd zonder bankLink — bezittingen-pagina en B4', () => {
    // `undefined` = geen enkel symbool. Zo levert `cash-overview` een puur
    // HANDMATIGE rekening aan (besluit B4: handmatig bijhouden is de normale
    // toestand en verdient geen markering) én de bezittingen-pagina, die van
    // herkomst niets weet. Het contract dat hier vastligt: geen prop → geen
    // symbool, in geen van de drie varianten.
    const { container } = renderCard()
    expect(screen.getByRole('button', { name: 'Betaalrekening openen' })).toBeInTheDocument()
    for (const state of STATES) {
      expect(container.querySelector(`[title="${ACCOUNT_SOURCE_TOOLTIP[state]}"]`)).toBeNull()
    }
  })
})

describe('VermogenAssetCard — herstelactie bij verbinding kwijt', () => {
  it('toont band + knop bij linked-broken', () => {
    const { container } = renderCard({ bankLink: 'linked-broken', onReconnect: () => {} })
    expect(container.querySelector('[data-testid="asset-card-reconnect-band"]')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Bankverbinding voor Betaalrekening opnieuw maken' }),
    ).toBeInTheDocument()
  })

  it('toont géén band bij een gezonde koppeling', () => {
    const { container } = renderCard({ bankLink: 'linked', onReconnect: () => {} })
    expect(container.querySelector('[data-testid="asset-card-reconnect-band"]')).toBeNull()
  })

  it('toont géén band bij een handmatige rekening', () => {
    const { container } = renderCard({ bankLink: 'manual', onReconnect: () => {} })
    expect(container.querySelector('[data-testid="asset-card-reconnect-band"]')).toBeNull()
  })

  it('zwijgt zonder handler — een melding zonder uitweg is erger dan geen melding', () => {
    const { container } = renderCard({ bankLink: 'linked-broken' })
    expect(container.querySelector('[data-testid="asset-card-reconnect-band"]')).toBeNull()
  })

  it('geeft het asset door aan de handler (één stabiele callback voor alle kaarten)', () => {
    const onReconnect = vi.fn()
    renderCard({ bankLink: 'linked-broken', onReconnect })
    fireEvent.click(
      screen.getByRole('button', { name: 'Bankverbinding voor Betaalrekening opnieuw maken' }),
    )
    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(onReconnect).toHaveBeenCalledWith(asset)
  })

  it('opent niet óók de kaart — de knop staat buiten de hoofdregel-<button>', () => {
    // Geen genest <button> (ongeldige HTML, onbereikbaar per toetsenbord): de
    // band is een sibling van de hoofdregel, geen kind. Dat toetsen we twee
    // keer — structureel (DOM-nesting) en gedragsmatig (de kaart gaat niet open).
    const onClick = vi.fn()
    const { container } = renderCard({ bankLink: 'linked-broken', onReconnect: () => {}, onClick })
    const cardButton = screen.getByRole('button', {
      name: `Betaalrekening openen — ${accountSourceSuffix('linked-broken')}`,
    })
    const band = container.querySelector('[data-testid="asset-card-reconnect-band"]')
    expect(band).not.toBeNull()
    expect(cardButton.contains(band as Node)).toBe(false)
    expect(cardButton.querySelector('button')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Bankverbinding voor Betaalrekening opnieuw maken' }),
    )
    expect(onClick).not.toHaveBeenCalled()
  })

  it('kleurt uitsluitend met warning-tokens — geen amber/orange/red-utilities', () => {
    // Aandacht, geen verlies: de autorisatie verloopt elk kwartaal, dat is
    // verwacht onderhoud. Deze assert is de gate die drie keer teruggedraaide
    // review-bevindingen voorkomt.
    const { container } = renderCard({ bankLink: 'linked-broken', onReconnect: () => {} })
    const band = container.querySelector('[data-testid="asset-card-reconnect-band"]')!
    expect(band.outerHTML).toContain('bg-warning-bg')
    expect(band.outerHTML).toContain('text-warning')
    expect(band.outerHTML).not.toMatch(/\b(amber|orange|red|emerald)-\d{2,3}\b/)
  })
})
