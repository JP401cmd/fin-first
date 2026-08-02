import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { formatTimestamp } from '@/lib/format'
import { BANK_LINK_EXPIRY_WARNING_DAYS, deriveBankLinkHealth } from '@/lib/bank-connection-status'
import { SyncStatusBadge } from './sync-status-badge'

/**
 * Tests voor SyncStatusBadge — de status-pil van één bankkoppeling
 * (specs/bank-connect-doelrekening/plan.md, fase 7).
 *
 * Twee dingen worden hier gepind. **Eén:** de vier toestanden en hun woorden,
 * zodat de omzetting naar de gedeelde afleiding (`deriveBankLinkHealth`)
 * gedragsbehoudend is en blijft. **Twee:** dat er geen Tailwind-standaardkleur in
 * dit bestand terugkeert. Dat laatste is geen smaakassertie: `red-*`/`orange-*`/
 * `green-*` voor semantiek is deze week drie keer in review teruggedraaid, en een
 * class-string is de enige plek waar dat aantoonbaar is.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Tailwind-standaardkleuren die in dit domein verboden zijn (tokens only). */
const FORBIDDEN_COLOR_CLASSES = /\b(?:bg|text|border)-(?:red|orange|green|emerald|amber|teal|violet|purple|sky|zinc|slate|gray|grey)-\d{2,3}\b/

/**
 * De vier RAUWE signalen blijven de invoer van deze suite, ook nu de pil zelf een
 * kant-en-klaar `health`-oordeel binnenkrijgt.
 *
 * Bewust zo: de assertie die ertoe doet is "welke woorden en welke kleur hoort
 * bij deze situatie in de wereld", en die situatie beschrijf je met een status en
 * een vervaldatum — niet met een `BankLinkHealth`-literal, want dan zou de test
 * het oordeel zélf opschrijven en niets meer bewaken. `deriveBankLinkHealth` is
 * dezelfde functie die de server (`/api/bank-connect/linked-accounts`) draait, dus
 * dit blijft het echte pad naspelen.
 */
function renderBadge(
  props: {
    lastSyncedAt?: string | null
    dailyRequests?: number
    tokenExpiresAt?: string | null
    connectionStatus?: string
  } = {},
) {
  const {
    lastSyncedAt = null,
    dailyRequests = 0,
    tokenExpiresAt = null,
    connectionStatus = 'active',
  } = props
  return render(
    <SyncStatusBadge
      health={deriveBankLinkHealth({
        // De lijst waaruit de pil gevoed wordt is op actieve koppelingen
        // gefilterd; `is_active` is hier dus altijd waar. De koppelrij-brede
        // lezing van dat signaal doet de route.
        linkIsActive: true,
        connectionStatus,
        tokenExpiresAt,
        lastSyncedAt,
      })}
      dailyRequests={dailyRequests}
    />,
  )
}

/** Wat `renderBadge` accepteert — de rauwe situatie, niet de props van de pil. */
type BadgeSituation = Parameters<typeof renderBadge>[0]

/**
 * Staat er ergens `text-warning` als TEKSTkleur op een `--warning-bg`-vlak?
 *
 * Die combinatie haalt 4,48:1 (gemeten op de tokens in `app/globals.css`:
 * `--warning` → luminantie 0,1634, `--warning-bg` → 0,9063) en blijft daarmee
 * onder de 4,5:1 die AA voor tekst ≤18px eist. Een ICOON mag er wél in staan: dat
 * is een grafisch element en 3:1 volstaat (WCAG 1.4.11). Vandaar de filter op
 * tekst-dragende elementen — een `<svg>` heeft geen `textContent`.
 *
 * Geëxporteerd via een eigen helper in twee testbestanden zou een derde bron
 * worden; hij staat hier én in `connected-account-card.test.tsx` bewust apart,
 * want beide suites moeten los kunnen falen.
 */
function warningTextOnWarningSurface(container: HTMLElement): string[] {
  const surfaces = Array.from(container.querySelectorAll('[class*="bg-warning-bg"]'))
  return surfaces.flatMap((surface) =>
    [surface, ...Array.from(surface.querySelectorAll('*'))]
      .filter((el) => /(?:^|\s)text-warning(?:$|\s)/.test(el.getAttribute('class') ?? ''))
      .filter((el) => (el.textContent ?? '').trim().length > 0)
      .map((el) => el.getAttribute('class') ?? ''),
  )
}

describe('SyncStatusBadge — verbinding kwijt', () => {
  it('toont "Verbinding kwijt" bij status expired', () => {
    const { container } = renderBadge({ connectionStatus: 'expired', lastSyncedAt: '2026-07-01T08:00:00Z' })

    // Eén woord per concept: het herkomst-symbool en de kaart eromheen noemen deze
    // toestand ook "verbinding kwijt". "Verlopen" benoemde bovendien een oorzaak.
    expect(screen.getByText('Verbinding kwijt')).toBeTruthy()
    // Verbinding kwijt is AANDACHT, geen verlies — zelfde tint als het
    // herkomst-symbool voor dezelfde toestand (`--warning`), nooit `--negative`.
    expect(container.innerHTML).toContain('bg-warning-bg')
    expect(container.innerHTML).toContain('text-warning')
    expect(container.innerHTML).not.toContain('negative')
  })

  it('zet die tekst op inkt, niet op text-warning (AA op --warning-bg)', () => {
    const { container } = renderBadge({ connectionStatus: 'expired', lastSyncedAt: '2026-07-01T08:00:00Z' })

    expect(warningTextOnWarningSurface(container)).toEqual([])
    // De tint moet wél ergens zitten: op het icoon (het enige <svg> in de pil).
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-warning')
  })

  it('houdt de pil op één regel (360px naast een lange banknaam)', () => {
    const { container } = renderBadge({ connectionStatus: 'expired' })

    // "Verbinding kwijt" is breder dan "Verlopen"; de status mag niet afbreken.
    const pil = container.querySelector('span')?.getAttribute('class') ?? ''
    expect(pil).toContain('whitespace-nowrap')
    expect(pil).toContain('shrink-0')
  })

  it('toont "Verbinding kwijt" bij status revoked (één herstelpad, geen eigen copy)', () => {
    renderBadge({ connectionStatus: 'revoked' })

    expect(screen.getByText('Verbinding kwijt')).toBeTruthy()
  })

  it('toont "Verbinding kwijt" zodra token_expires_at in het verleden ligt, ook bij status active', () => {
    renderBadge({
      connectionStatus: 'active',
      tokenExpiresAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      lastSyncedAt: '2026-07-01T08:00:00Z',
    })

    // De statuskolom wordt pas op 'expired' gezet door een mislukte
    // token-refresh; tot dat moment is de datum het enige eerlijke signaal.
    expect(screen.getByText('Verbinding kwijt')).toBeTruthy()
  })
})

describe('SyncStatusBadge — vooraankondiging', () => {
  it('toont "Verloopt over Nd" binnen de waarschuwingsdrempel', () => {
    const { container } = renderBadge({
      tokenExpiresAt: new Date(Date.now() + 9 * DAY_MS).toISOString(),
      lastSyncedAt: '2026-07-01T08:00:00Z',
    })

    // Afronding komt uit `deriveBankLinkHealth` (Math.ceil); de pil rekent niets na.
    expect(screen.getByText('Verloopt over 9d')).toBeTruthy()
    // Werkt nog: geen eigen warning-vlak, alleen de klok draagt de tint.
    expect(container.innerHTML).not.toContain('bg-warning-bg')
    expect(container.innerHTML).toContain('text-warning')
  })

  it('zwijgt net buiten de drempel en toont dan het gewone tijdlabel', () => {
    const synced = '2026-07-01T08:00:00Z'
    renderBadge({
      tokenExpiresAt: new Date(Date.now() + (BANK_LINK_EXPIRY_WARNING_DAYS + 2) * DAY_MS).toISOString(),
      lastSyncedAt: synced,
    })

    expect(screen.queryByText(/Verloopt over/)).toBeNull()
    expect(screen.getByText(formatTimestamp(synced))).toBeTruthy()
  })
})

describe('SyncStatusBadge — nog nooit gesynchroniseerd', () => {
  it('toont de neutrale pil zonder stoplichtkleur', () => {
    const { container } = renderBadge({ lastSyncedAt: null })

    expect(screen.getByText('Nog niet gesynchroniseerd')).toBeTruthy()
    // Een verse koppeling is gezond; hier hoort geen kleur bij.
    expect(container.innerHTML).not.toContain('warning')
    expect(container.innerHTML).not.toContain('negative')
    expect(container.innerHTML).not.toContain('positive')
  })
})

describe('SyncStatusBadge — gezond en gesynchroniseerd', () => {
  it('toont het tijdlabel uit formatTimestamp plus de verzoekteller', () => {
    const synced = '2026-07-01T08:00:00Z'
    const { container } = renderBadge({ lastSyncedAt: synced, dailyRequests: 3 })

    // Gepind tegen de canonieke helper, niet tegen een verwachte string: anders
    // test dit de tijdzone van de testrunner in plaats van het component.
    expect(screen.getByText(formatTimestamp(synced))).toBeTruthy()
    expect(screen.getByText('3/10')).toBeTruthy()
    expect(container.innerHTML).toContain('bg-positive-bg')
  })
})

describe('SyncStatusBadge — kleurconventie', () => {
  it('gebruikt in geen enkele toestand een Tailwind-standaardkleur', () => {
    const cases: BadgeSituation[] = [
      { connectionStatus: 'expired' },
      { tokenExpiresAt: new Date(Date.now() + 3 * DAY_MS).toISOString(), lastSyncedAt: '2026-07-01T08:00:00Z' },
      { lastSyncedAt: null },
      { lastSyncedAt: '2026-07-01T08:00:00Z', dailyRequests: 1 },
    ]

    for (const props of cases) {
      const { container, unmount } = renderBadge(props)
      expect(container.innerHTML).not.toMatch(FORBIDDEN_COLOR_CLASSES)
      unmount()
    }
  })
})
