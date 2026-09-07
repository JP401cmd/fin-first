/**
 * UR3-20 — toegankelijkheid op shell-niveau (A + B).
 *
 * De zijbalk rendert op élke desktop-route, dus twee fouten in dit ene bestand
 * telden in de Lighthouse-meting van 6 sep 2026 op tot 45 elementen over 21 van
 * de 22 gemeten routes (A) en 40 elementen over 12 routes (B). Deze suite pint
 * beide herstellingen, juist omdát een terugval hier meteen app-breed is:
 *
 *  A — de account-link droeg `aria-label="Account-menu"`, en een aria-label
 *      VERVANGT de berekende naam. De zichtbare gebruikersnaam verdween
 *      daarmee uit de toegankelijke naam (WCAG 2.5.3 Label in Name), zodat
 *      spraakbediening de link niet kon aanspreken op wat er staat.
 *
 *  B — de uitgeklapte subnavigatie gebruikte `py-0.5` op 11-12px tekst, wat
 *      rijen van ~19-20px opleverde tegen de WCAG 2.5.8-AA-ondergrens van 24px.
 *      jsdom doet geen layout, dus we pinnen de gedeelde vloer-class
 *      (`TAP_TARGET_ROW_MIN`) op de gerenderde rijen én de afwezigheid van de
 *      oude `py-0.5` — dat is precies wat de fix verplaatst.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { TAP_TARGET_ROW_MIN } from '@/components/editorial/tap-target'

// Een route diep in de Overzicht-module, zodat zowel de subtag-strip als het
// derde niveau (Budget → Transacties/…) daadwerkelijk uitklapt.
vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht/budget/transacties',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

vi.mock('@/components/app/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: () => {}, close: () => {}, isOpen: false }),
}))
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ isHousehold: false, loading: false }),
}))
vi.mock('@/components/app/perspective-switcher', () => ({
  PerspectiveSwitcher: () => null,
}))
vi.mock('@/lib/hooks/use-euro-view', () => ({
  useEuroView: () => ({ view: 'nominaal', setView: () => {}, loading: false }),
}))
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({ unreadCount: 0, openModal: () => {} }),
}))
vi.mock('@/components/app/cashflow-status-provider', () => ({
  useCashflowStatusContext: () => ({}),
}))
vi.mock('@/components/sync/global-sync-button', () => ({
  GlobalSyncButton: () => null,
}))
vi.mock('@/components/sync/sync-report-modal', () => ({
  SyncReportModal: () => null,
}))

const USER_NAME = 'Jan Paul'

function renderSidebar() {
  return render(
    <DisplayModeProvider initialMode="full">
      <Sidebar netWorth={1_100_000} actionCount={0} userInitials="JP" userName={USER_NAME} />
    </DisplayModeProvider>,
  )
}

describe('Sidebar — toegankelijke naam van de account-link (UR3-20/A)', () => {
  afterEach(cleanup)

  it('draagt de zichtbare gebruikersnaam als toegankelijke naam', () => {
    renderSidebar()
    // getByRole matcht op de BEREKENDE naam — dit faalt zodra er weer een
    // aria-label overheen wordt gezet dat de naam niet bevat.
    const link = screen.getByRole('link', { name: USER_NAME })
    expect(link.getAttribute('href')).toBe('/mijn')
  })

  it('vervangt de naam niet meer door het (bovendien onjuiste) "Account-menu"', () => {
    const { container } = renderSidebar()
    const link = container.querySelector('a[href="/mijn"]')
    expect(link, 'de zijbalk hoort een /mijn-ingang te hebben').not.toBeNull()
    expect(link!.getAttribute('aria-label')).toBeNull()
  })

  it('houdt de initialen decoratief, zodat de naam niet dubbel wordt voorgelezen', () => {
    const { container } = renderSidebar()
    const initials = container.querySelector('a[href="/mijn"] span[aria-hidden]')
    expect(initials, 'de initialen-bubbel hoort aria-hidden te zijn').not.toBeNull()
    expect(initials!.textContent).toBe('JP')
  })
})

describe('Sidebar — raakdoel van de uitgeklapte subnavigatie (UR3-20/B)', () => {
  afterEach(cleanup)

  /** Alle links die de compacte subnav-rij-opmaak gebruiken. */
  function subNavRows(container: HTMLElement): HTMLAnchorElement[] {
    // `gap-2 ` mét spatie: dat sluit de account-link (`gap-2.5`) uit, die een
    // eigen h-10-doos heeft en niet tot de compacte subnav hoort.
    return Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).filter((el) =>
      el.className.includes('flex items-center gap-2 '),
    )
  }

  it('geeft elke uitgeklapte subnav-rij de gedeelde 24px-vloer', () => {
    const { container } = renderSidebar()
    const rows = subNavRows(container)
    expect(rows.length, 'de subnavigatie hoort uitgeklapt te zijn op deze route').toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.className, `rij "${row.textContent}" mist de raakdoel-vloer`).toContain(
        TAP_TARGET_ROW_MIN,
      )
    }
  })

  it('gebruikt nergens meer de oude py-0.5-rijhoogte in de subnavigatie', () => {
    const { container } = renderSidebar()
    for (const row of subNavRows(container)) {
      expect(row.className).not.toContain('py-0.5')
    }
  })
})
