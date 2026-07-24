import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Regressie: de dubbele info-knop (i) op /overzicht/bezittingen en
 * /overzicht/schulden.
 *
 * Beide pagina-shells renderen zélf de header-controls (i + statuspunt +
 * insight-toggle) volgens de meldingen-conventie. De ge-embedde client-eilanden
 * (`AssetsPage` / `DebtsClient`) dragen echter óók een ingebouwde
 * `PageInfoButton` uit hun standalone `/core`-verleden. Zonder onderdrukking
 * verschijnen er dus TWEE i's. De wrappers moeten daarom `showPageInfo={false}`
 * doorgeven; deze test lockt dat contract (verwijdert iemand de prop → default
 * `true` → dubbele i keert terug → test rood).
 *
 * De echte clients zijn zwaar (perspectief-context, supabase, display-mode);
 * we mocken ze tot een stub die enkel de ontvangen prop vastlegt.
 */

vi.mock('@/components/core/assets-client', () => ({
  __esModule: true,
  default: (props: { showPageInfo?: boolean }) => (
    <div data-testid="assets-client" data-show-page-info={String(props.showPageInfo)} />
  ),
}))

vi.mock('@/app/(app)/core/debts/debts-client', () => ({
  __esModule: true,
  DebtsClient: (props: { showPageInfo?: boolean }) => (
    <div data-testid="debts-client" data-show-page-info={String(props.showPageInfo)} />
  ),
}))

import { BezittingenView } from './bezittingen-view'
import { SchuldenView } from './schulden-view'

describe('Embedded overzicht-wrappers onderdrukken de ingebouwde PageInfoButton', () => {
  it('BezittingenView geeft showPageInfo=false aan AssetsPage (page-shell rendert de i)', () => {
    render(<BezittingenView inspirationCards={null} />)
    expect(screen.getByTestId('assets-client').getAttribute('data-show-page-info')).toBe('false')
  })

  it('SchuldenView geeft showPageInfo=false aan DebtsClient (page-shell rendert de i)', () => {
    render(<SchuldenView />)
    expect(screen.getByTestId('debts-client').getAttribute('data-show-page-info')).toBe('false')
  })
})
