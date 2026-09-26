import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { RegelBewerkenPane } from './regel-bewerken-pane'
import { EINDSTRATEGIE_ANKER } from '@/lib/toekomst/instellingen-rij'

/**
 * ADR 0179 fase 3 — drie rijen (Stopmoment, "Tot welke leeftijd, en wat blijft over",
 * Geen tekort-lening) openen dezelfde eindstrategie-body, elk op hun eigen plek. Gepind: de
 * ankers bestaan in de body, en de pane scrolt na openen naar het gevraagde anker.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const gescrold: string[] = []

beforeEach(() => {
  gescrold.length = 0
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}))))
  Element.prototype.scrollIntoView = function (this: Element) {
    gescrold.push(this.id)
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPane(anker?: string) {
  return render(
    <RegelBewerkenPane
      open
      regelId="eindstrategie"
      anker={anker}
      onClose={() => {}}
      onSaved={() => {}}
      simSnapshot={null}
      fireStrategy={{ strategy: 'deplete', endAge: 90, legacyAmount: 0 }}
      firePlan={null}
      withdrawalStrategy={{ strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 }}
      potRules={{ withdrawalOrderGroups: [], surplusGroup: 'beleggingen', deficitOrderGroups: [] }}
      potBalances={{ spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0 }}
    />,
  )
}

describe('RegelBewerkenPane — anker', () => {
  it.each(Object.values(EINDSTRATEGIE_ANKER))('het anker %s bestaat in de eindstrategie-body en de pane scrolt erheen', async (anker) => {
    renderPane(anker)
    expect(document.getElementById(anker)).not.toBeNull()
    await waitFor(() => expect(gescrold).toContain(anker))
  })

  it('zonder anker: niet scrollen', async () => {
    renderPane()
    await new Promise((r) => setTimeout(r, 50))
    expect(gescrold).toEqual([])
  })
})
