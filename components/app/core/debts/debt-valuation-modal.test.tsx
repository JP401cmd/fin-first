/**
 * A11y-regression test voor de herwaarderen-/valuation-modal.
 *
 * Bug (Notion 394f9e8d…): de labels Datum / Nieuwe waarde-of-Nieuw saldo /
 * Notitie stonden los boven hun <input> zonder htmlFor/id-koppeling, waardoor
 * een klik op het label niet focuste en screenreaders het veld niet benoemden.
 *
 * Deze test pint de koppeling: getByLabelText vindt elk veld (faalde vóór de
 * fix) en label.htmlFor === input.id.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ValuationModal } from './debt-valuation-modal'

// De modal importeert de supabase-browserclient op module-niveau; die wordt
// pas bij opslaan aangeroepen. Voor een pure render-/a11y-assertie mocken we
// 'm weg zodat er geen echte client geïnitialiseerd wordt.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }),
}))

function renderModal(entityType: 'asset' | 'debt') {
  return render(
    <ValuationModal
      entityId="debt-1"
      entityType={entityType}
      entityName="Studieschuld"
      entitySubtype="studieschuld"
      currentValue={12000}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
}

describe('ValuationModal (schuld/bezit) — label→input koppeling', () => {
  it('koppelt elk label aan zijn input voor het schuld-pad', () => {
    renderModal('debt')

    const datum = screen.getByLabelText('Datum')
    const saldo = screen.getByLabelText('Nieuw saldo')
    const notitie = screen.getByLabelText('Notitie (optioneel)')

    expect(datum.tagName).toBe('INPUT')
    expect(saldo.tagName).toBe('INPUT')
    expect(notitie.tagName).toBe('INPUT')

    // htmlFor === id koppeling (uniek per veld)
    expect(datum.id).toBeTruthy()
    expect(saldo.id).toBeTruthy()
    expect(notitie.id).toBeTruthy()
    expect(new Set([datum.id, saldo.id, notitie.id]).size).toBe(3)
  })

  it('gebruikt het bezit-label "Nieuwe waarde" en houdt de koppeling', () => {
    renderModal('asset')

    expect(screen.getByLabelText('Datum').tagName).toBe('INPUT')
    expect(screen.getByLabelText('Nieuwe waarde').tagName).toBe('INPUT')
    expect(screen.getByLabelText('Notitie (optioneel)').tagName).toBe('INPUT')
  })
})
