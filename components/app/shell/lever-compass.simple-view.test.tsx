/**
 * NAV-6 — mobiele topbar in Eenvoudig: de vier naamloze statuspunten worden
 * één samengevat punt; het paneel eronder blijft de vier hefbomen mét naam
 * tonen. In Volledig blijven de vier stippen staan.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §6 (fase 4).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { LeverCompassMobile, worstLeverStatus } from './lever-compass'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import type { LeverScores, LeverStatus } from '@/components/app/shell/lever-scores'

function scoresWith(statuses: Partial<Record<keyof LeverScores, LeverStatus>>): LeverScores {
  const base = (status: LeverStatus) => ({ score: 50, status, detail: 'detail' })
  return {
    assets: base(statuses.assets ?? 'green'),
    debts: base(statuses.debts ?? 'green'),
    cashflow: base(statuses.cashflow ?? 'green'),
    tax: base(statuses.tax ?? 'green'),
  }
}

function renderCompass(mode: DisplayMode, scores: LeverScores) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <LeverCompassMobile scores={scores} />
    </DisplayModeProvider>,
  )
}

/** De gekleurde stippen ín de trigger-knop (het paneel telt niet mee). */
function triggerDots(button: HTMLElement): Element[] {
  return Array.from(button.querySelectorAll('span[aria-hidden]'))
}

describe('LeverCompassMobile — NAV-6 statuspunt-reductie', () => {
  afterEach(cleanup)

  it("toont in 'full' vier stippen in de trigger", () => {
    renderCompass('full', scoresWith({}))
    const button = screen.getByRole('button', { name: 'Kompas openen' })
    expect(triggerDots(button)).toHaveLength(4)
  })

  it("toont in 'simple' één stip, met de status in de aria-label", () => {
    renderCompass('simple', scoresWith({ debts: 'amber' }))
    const button = screen.getByRole('button', { name: /Kompas: aandacht/ })
    expect(triggerDots(button)).toHaveLength(1)
  })

  it("laat in 'simple' de zwaarste status winnen (rood boven oranje)", () => {
    renderCompass('simple', scoresWith({ debts: 'amber', tax: 'red' }))
    expect(screen.getByRole('button', { name: /Kompas: zorg/ })).toBeInTheDocument()
  })

  it("laat 'geen data' nooit een echte waarschuwing overstemmen", () => {
    expect(worstLeverStatus(scoresWith({ assets: 'neutral', debts: 'amber' }))).toBe('amber')
    expect(worstLeverStatus(scoresWith({
      assets: 'neutral', debts: 'neutral', cashflow: 'neutral', tax: 'neutral',
    }))).toBe('neutral')
  })

  it("noemt in 'simple' alle vier de hefbomen zodra het paneel open is", () => {
    renderCompass('simple', scoresWith({}))
    fireEvent.click(screen.getByRole('button', { name: /Kompas:/ }))
    const panel = screen.getByRole('dialog', { name: 'Financieel kompas' })
    for (const label of ['Bezittingen', 'Schulden', 'Cashflow', 'Belasting']) {
      expect(within(panel).getByText(label)).toBeInTheDocument()
    }
  })

  // Bug: de trigger staat als tweede icoon in de TopBar-rij (na
  // PerspectiveSwitcher, vóór PrivacyToggle — zie top-bar.tsx), dus niet aan
  // de rechterrand. Een `right-0`-geankerd 256px-paneel groeide dan naar
  // links tot voorbij de viewport-rand (zichtbaar afgesneden op 390px breed).
  // Given het paneel open is, when het rendert, then hangt het gecentreerd
  // onder de trigger (net als de tooltip in LeverCompassDots hierboven in
  // dit bestand) met een viewport-clamp, niet hard tegen de rechterrand.
  it('hangt het paneel gecentreerd onder de trigger, niet hard right-anchored (voorkomt off-screen op smalle mobiele schermen)', () => {
    renderCompass('simple', scoresWith({}))
    fireEvent.click(screen.getByRole('button', { name: /Kompas:/ }))
    const panel = screen.getByRole('dialog', { name: 'Financieel kompas' })
    expect(panel.className).not.toMatch(/(?:^|\s)right-0(?:\s|$)/)
    expect(panel.className).toMatch(/left-1\/2/)
    expect(panel.className).toMatch(/-translate-x-1\/2/)
    expect(panel.className).toMatch(/max-w-\[calc\(100vw-2rem\)\]/)
  })
})
