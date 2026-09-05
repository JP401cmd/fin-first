import type { ReactElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { formatFreedomRateFootnote } from '@/lib/format'

/**
 * De wisselkoers naast een tijdgetal (UR3-08).
 *
 * Deze suite pint drie dingen die stil kunnen wegdrijven:
 *
 *  1. **Eén formulering.** De gerenderde tekst is BYTE-gelijk aan wat
 *     `formatFreedomRateFootnote` teruggeeft — geen tweede variant van de zin
 *     in het component.
 *  2. **Maskering (ADR 0091 laag 4).** Met maskering aan verdwijnt de koers,
 *     want anders is elk gemaskeerd bedrag terug te rekenen (dagen × tarief).
 *  3. **Onbekend is geen nul (ADR 0131).** `source: 'none'` en tarief 0 geven
 *     niets — een tijdgetal op een onbekende grondslag krijgt geen koers.
 */

const { maskedRef } = vi.hoisted(() => ({ maskedRef: { current: false } }))

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({
    masked: maskedRef.current,
    setMasked: () => {},
    toggle: () => {},
  }),
}))

const { VrijheidstijdVoetnoot } = await import('./vrijheidstijd-voetnoot')

const DAGTARIEF = 105

/**
 * De gerenderde tekst, letterlijk. Bewust `textContent` en niet `getByText`:
 * `formatCurrency` zet een harde spatie (NBSP) tussen euroteken en bedrag, en
 * de queries van testing-library normaliseren die weg — dan zou de toets een
 * andere zin groen laten dan er staat, precies wat hier bewaakt moet worden.
 */
function tekstVan(ui: ReactElement): string {
  return render(ui).container.textContent ?? ''
}

describe('VrijheidstijdVoetnoot', () => {
  it('rendert exact de zin uit formatFreedomRateFootnote (geen tweede formulering)', () => {
    maskedRef.current = false
    const verwacht = formatFreedomRateFootnote(DAGTARIEF, 'transactions', false)!

    expect(tekstVan(<VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="transactions" />)).toBe(
      verwacht,
    )
    expect(verwacht).toContain('afgelopen 12 maanden')
  })

  it('benoemt een profielschatting als schatting', () => {
    maskedRef.current = false
    const verwacht = formatFreedomRateFootnote(DAGTARIEF, 'estimate', false)!

    expect(tekstVan(<VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="estimate" />)).toBe(
      verwacht,
    )
    expect(verwacht).toMatch(/schatting/i)
  })

  it('benoemt een cohort-tarief als schatting op leeftijd', () => {
    maskedRef.current = false
    const verwacht = formatFreedomRateFootnote(DAGTARIEF, 'cohort', false)!

    expect(tekstVan(<VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="cohort" />)).toBe(verwacht)
    expect(verwacht).toMatch(/schatting/i)
  })

  it("gebruikt de compacte vorm bij vorm='inline'", () => {
    maskedRef.current = false
    const verwacht = formatFreedomRateFootnote(DAGTARIEF, 'transactions', false, 'short')!

    expect(
      tekstVan(<VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="transactions" vorm="inline" />),
    ).toBe(verwacht)
    expect(verwacht).toMatch(/^bij\s.*105\/dag$/)
  })

  it('toont niets in privacymodus — de koers zou de maskering inverteerbaar maken', () => {
    maskedRef.current = true
    const { container } = render(
      <VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="transactions" />,
    )

    expect(container.textContent).toBe('')
    expect(container.textContent).not.toContain('105')
  })

  it("toont niets bij source 'none' of een tarief van 0 (grondslag onbekend)", () => {
    maskedRef.current = false
    const geenBron = render(<VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="none" />)
    expect(geenBron.container.textContent).toBe('')

    const geenTarief = render(<VrijheidstijdVoetnoot dailyRate={0} />)
    expect(geenTarief.container.textContent).toBe('')

    const ontbreekt = render(<VrijheidstijdVoetnoot dailyRate={null} />)
    expect(ontbreekt.container.textContent).toBe('')
  })

  it('valt zonder expliciete bron terug op "gemeten" bij een tarief > 0', () => {
    maskedRef.current = false
    const verwacht = formatFreedomRateFootnote(DAGTARIEF, 'transactions', false)!

    expect(tekstVan(<VrijheidstijdVoetnoot dailyRate={DAGTARIEF} />)).toBe(verwacht)
  })

  it('voegt zelf geen vrijheidstijd toe (eigenaarsbesluit 2: geen nieuw tijdgetal)', () => {
    maskedRef.current = false
    const { container } = render(
      <VrijheidstijdVoetnoot dailyRate={DAGTARIEF} source="transactions" />,
    )

    // "afgelopen 12 maanden" is het MEETVENSTER, geen vrijheidstijd — de zin
    // mag dus wel een maandaanduiding dragen, maar nooit een vrijheidsgetal.
    expect(container.textContent).not.toMatch(/vrijheid/i)
    expect(container.textContent).not.toMatch(/\bjaar\b/i)
  })
})
