/**
 * Componenttests voor de twee bevestigingen van transactie-bulkbewerken —
 * AC9 (verwijderen vraagt om gewicht) en AC10 (waarschuwing bij bankgekoppelde
 * rijen). Tot nu toe was `BulkDeleteConfirm` nergens gerenderd in een test: de
 * bulkbewerk-overlay-suite dekt alleen zoeken/tellen/selecteren (AC2–AC5), niet
 * de verwijder-bevestiging zelf.
 *
 * AC9 eist letterlijk: aantal, totaalbedrag, actieve filters, de tekst "dit is
 * definitief", een knoptekst die de uitkomst benoemt ("Verwijder 43
 * transacties") en — boven de drempel — een over te typen aantal.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TYPE_TO_CONFIRM_THRESHOLD } from '@/lib/transactions/bulk-contract'
import { BulkDeleteConfirm, BulkBudgetSheet } from './bulk-bevestigingen'

function renderDeleteConfirm(overrides: Partial<Parameters<typeof BulkDeleteConfirm>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <BulkDeleteConfirm
      open
      onClose={onClose}
      onConfirm={onConfirm}
      busy={false}
      error={null}
      count={43}
      sumPositief={0}
      sumNegatief={-1240}
      filterLines={['Rekening: Betaalrekening', 'Richting: uitgaven']}
      bankLinkedCount={0}
      linkedCounterpartCount={0}
      splitCount={0}
      {...overrides}
    />,
  )
  return { onConfirm, onClose }
}

/** Dezelfde duizendtal-notatie als de component, zodat 1.000 niet als "1000" wordt gezocht. */
const nl = new Intl.NumberFormat('nl-NL')

/** Het keuzevakje "gekoppelde tegenboeking mee verwijderen". */
function counterpartCheckbox(): HTMLElement {
  return screen.getByRole('checkbox', { name: /Gekoppelde tegenboeking mee verwijderen/ })
}

describe('BulkDeleteConfirm — AC9: verwijderen vraagt om gewicht', () => {
  it('toont het aantal, het totaalbedrag en de actieve filtercontext', () => {
    renderDeleteConfirm()
    expect(screen.getByText('Rekening: Betaalrekening')).toBeTruthy()
    expect(screen.getByText('Richting: uitgaven')).toBeTruthy()
    // BulkImpact toont het aantal en het bedrag — beide moeten ergens op het
    // scherm staan, niet alleen in de knoptekst.
    expect(screen.getAllByText(/43/).length).toBeGreaterThan(0)
  })

  it('stelt onomwonden dat het definitief is', () => {
    renderDeleteConfirm()
    expect(screen.getByText('Dit is definitief')).toBeTruthy()
    expect(screen.getByText(/geen prullenbak en geen ongedaan-maken/i)).toBeTruthy()
  })

  it('de knoptekst benoemt de uitkomst — "Verwijder 43 transacties", niet "OK"', () => {
    renderDeleteConfirm({ count: 43 })
    expect(screen.getByRole('button', { name: 'Verwijder 43 transacties' })).toBeTruthy()
  })

  it('onder de drempel is er geen type-to-confirm-veld, en de knop werkt meteen', () => {
    const { onConfirm } = renderDeleteConfirm({ count: 10 })
    expect(screen.queryByLabelText(/Typ het aantal over/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Verwijder 10 transacties' }))
    expect(onConfirm).toHaveBeenCalledWith({ confirmCount: undefined, includeLinkedCounterparts: true })
  })

  it(`boven de drempel (${TYPE_TO_CONFIRM_THRESHOLD}) moet het aantal worden overgetypt vóór de knop werkt`, () => {
    const { onConfirm } = renderDeleteConfirm({ count: TYPE_TO_CONFIRM_THRESHOLD + 1 })
    const button = screen.getByRole('button', { name: `Verwijder ${TYPE_TO_CONFIRM_THRESHOLD + 1} transacties` })

    // De knop is uitgeschakeld zolang er niets (of iets verkeerds) is getypt.
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()

    const input = screen.getByLabelText(/Typ het aantal over/)
    fireEvent.change(input, { target: { value: String(TYPE_TO_CONFIRM_THRESHOLD) } }) // verkeerd getal
    expect((button as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(input, { target: { value: String(TYPE_TO_CONFIRM_THRESHOLD + 1) } }) // juiste getal
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(onConfirm).toHaveBeenCalledWith({
      confirmCount: TYPE_TO_CONFIRM_THRESHOLD + 1,
      includeLinkedCounterparts: true,
    })
  })

  it('exact op de drempel wordt nog GEEN typing geëist (drempel is "meer dan", niet "vanaf")', () => {
    renderDeleteConfirm({ count: TYPE_TO_CONFIRM_THRESHOLD })
    expect(screen.queryByLabelText(/Typ het aantal over/)).toBeNull()
    expect(
      (screen.getByRole('button', { name: `Verwijder ${TYPE_TO_CONFIRM_THRESHOLD} transacties` }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})

describe('BulkDeleteConfirm — de overtyp-poort vraagt om een bewuste handeling', () => {
  const nl = new Intl.NumberFormat('nl-NL')
  const knop = (n: number) =>
    screen.getByRole('button', { name: `Verwijder ${nl.format(n)} transacties` }) as HTMLButtonElement
  const typ = (waarde: string) =>
    fireEvent.change(screen.getByLabelText(/Typ het aantal over/), { target: { value: waarde } })

  it('accepteert het getal precies zoals het op de knop staat', () => {
    renderDeleteConfirm({ count: 43 })
    typ('43')
    expect(knop(43).disabled).toBe(false)
  })

  it('accepteert ook de nl-weergavevorm met punt, want dát staat er op de knop', () => {
    renderDeleteConfirm({ count: 1250 })
    expect(knop(1250).textContent).toContain('1.250')
    typ('1.250')
    expect(knop(1250).disabled).toBe(false)
  })

  it('weigert getallen die alleen rekenkundig gelijk zijn', () => {
    // De poort bestaat om wrijving te geven. `Number()` zou 43.0, 4.3e1 en 0x2B
    // allemaal als 43 accepteren — dan is het geen bewuste handeling meer maar
    // een rekensom die toevallig uitkomt.
    renderDeleteConfirm({ count: 43 })
    for (const invoer of ['43.0', '4.3e1', '0x2B', '+43']) {
      typ(invoer)
      expect(knop(43).disabled).toBe(true)
    }
  })

  it('stuurt het getal van de knop mee, niet de rauwe invoer', () => {
    // `Number('1.250')` is 1,25 — de server zou dat als mismatch weigeren op
    // precies de invoer die de knop toestaat.
    const onConfirm = vi.fn()
    renderDeleteConfirm({ count: 1250, onConfirm })
    typ('1.250')
    fireEvent.click(knop(1250))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ confirmCount: 1250 }))
  })
})

describe('BulkDeleteConfirm — AC10: waarschuwing bij bankgekoppelde rijen', () => {
  it('waarschuwt dat bankgekoppelde rijen bij een volgende sync kunnen terugkeren', () => {
    renderDeleteConfirm({ bankLinkedCount: 3 })
    expect(screen.getByText(/3 van deze transacties komen/)).toBeTruthy()
    expect(screen.getByText(/opnieuw binnenkomen/)).toBeTruthy()
  })

  it('toont geen waarschuwing wanneer er geen bankgekoppelde rijen zijn', () => {
    renderDeleteConfirm({ bankLinkedCount: 0 })
    expect(screen.queryByText(/opnieuw binnenkomen/)).toBeNull()
  })

  it('enkelvoud bij precies 1', () => {
    renderDeleteConfirm({ bankLinkedCount: 1 })
    expect(screen.getByText(/Eén van deze transacties komt/)).toBeTruthy()
  })
})

describe('BulkDeleteConfirm — tegenboekingen tellen mee in het getoonde totaal', () => {
  it('het totaal (en dus de knoptekst) stijgt met het aantal tegenboekingen zolang "meenemen" aanstaat', () => {
    renderDeleteConfirm({ count: 20, linkedCounterpartCount: 6 })
    // 20 selectie + 6 tegenboekingen = 26 — bóven de drempel, dus type-to-confirm.
    expect(screen.getByRole('button', { name: 'Verwijder 26 transacties' })).toBeTruthy()
    expect(screen.getByLabelText(/Typ het aantal over/)).toBeTruthy()
  })

  it('het getoonde totaal zakt terug zodra "tegenboeking meenemen" wordt uitgezet', () => {
    renderDeleteConfirm({ count: 20, linkedCounterpartCount: 6 })
    fireEvent.click(counterpartCheckbox())
    expect(screen.getByRole('button', { name: 'Verwijder 20 transacties' })).toBeTruthy()
  })

  it('zonder tegenboekingen verschijnt het keuzevakje niet — het kan daar niets doen', () => {
    renderDeleteConfirm({ count: 20, linkedCounterpartCount: 0 })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('de tekst dekt óók automatisch gekoppelde paren, niet alleen handmatige overboekingen', () => {
    renderDeleteConfirm({ count: 5, linkedCounterpartCount: 1 })
    // `lib/transfer-matching.ts#linkUnmatchedTransfers` legt deze koppeling bij
    // ELKE bankimport; "tegenboeking van handmatige overboekingen" dekte dus de
    // lading niet voor iedereen met twee gekoppelde rekeningen.
    expect(screen.getByText(/automatisch aan elkaar geknoopt/)).toBeTruthy()
  })
})

/**
 * De rekensom van de verwijder-bevestiging, apart en uitputtend.
 *
 * Dit is de plek waar C1 en H1 zaten, en waar de bestaande tests langs keken:
 * ze dekten wél 20+6 (boven de drempel) maar niet de combinatie "tegenboeking
 * aanwezig én totaal onder de drempel" — precies het geval waarin de knop geen
 * type-to-confirm vraagt en de server dus zonder tweede poort verwijdert.
 *
 * De matrix is daarom volledig: tegenboeking wel/niet × onder/boven de drempel ×
 * meenemen aan/uit. Getoetst wordt telkens hetzelfde drietal: het getal op de
 * knop, of er getypt moet worden, en welk getal er naar de server gaat — want
 * die drie moeten hetzelfde zijn als wat er verdwijnt.
 */
describe('BulkDeleteConfirm — de rekensom (C1/H1)', () => {
  const D = TYPE_TO_CONFIRM_THRESHOLD

  const gevallen: {
    naam: string
    count: number
    counterparts: number
    meenemen: boolean
    /** Het getal dat op de knop hoort te staan én dat de server toetst. */
    totaal: number
    typenVerplicht: boolean
  }[] = [
    { naam: 'geen tegenboeking, onder de drempel', count: 5, counterparts: 0, meenemen: true, totaal: 5, typenVerplicht: false },
    { naam: 'geen tegenboeking, boven de drempel', count: D + 5, counterparts: 0, meenemen: true, totaal: D + 5, typenVerplicht: true },
    // C1: 5 aangevinkt, één daarvan heeft een tegenboeking. Vóór de fix zei de
    // knop "Verwijder 5 transacties" en verwijderde de server er 6.
    { naam: 'tegenboeking, totaal blijft onder de drempel', count: 5, counterparts: 1, meenemen: true, totaal: 6, typenVerplicht: false },
    { naam: 'tegenboeking, maar meenemen staat uit', count: 5, counterparts: 1, meenemen: false, totaal: 5, typenVerplicht: false },
    // De tegenboeking duwt het totaal net over de drempel.
    { naam: 'tegenboeking duwt het totaal over de drempel', count: D, counterparts: 1, meenemen: true, totaal: D + 1, typenVerplicht: true },
    { naam: 'zelfde selectie, meenemen uit → weer onder de drempel', count: D, counterparts: 1, meenemen: false, totaal: D, typenVerplicht: false },
    // H1: 46 + 1. De server rekent 47; vóór de fix vergeleek de knop met 46 en
    // bleef hij uitgeschakeld, hoe je ook typte.
    { naam: 'ruim boven de drempel, mét tegenboeking', count: 46, counterparts: 1, meenemen: true, totaal: 47, typenVerplicht: true },
  ]

  for (const g of gevallen) {
    it(`${g.naam}: knop noemt ${g.totaal}, typen ${g.typenVerplicht ? 'verplicht' : 'niet nodig'}`, () => {
      const { onConfirm } = renderDeleteConfirm({
        count: g.count,
        linkedCounterpartCount: g.counterparts,
      })
      if (!g.meenemen) fireEvent.click(counterpartCheckbox())

      const knop = screen.getByRole('button', {
        name: `Verwijder ${nl.format(g.totaal)} transacties`,
      }) as HTMLButtonElement

      if (!g.typenVerplicht) {
        expect(screen.queryByLabelText(/Typ het aantal over/)).toBeNull()
        expect(knop.disabled).toBe(false)
        fireEvent.click(knop)
        expect(onConfirm).toHaveBeenCalledWith({
          confirmCount: undefined,
          includeLinkedCounterparts: g.meenemen,
        })
        return
      }

      const veld = screen.getByLabelText(/Typ het aantal over/)
      expect(knop.disabled).toBe(true)
      // Het aantal AANGEVINKTE rijen is niet genoeg wanneer er tegenboekingen
      // meegaan — dat is exact het getal dat de server zou weigeren.
      fireEvent.change(veld, { target: { value: String(g.count) } })
      expect(knop.disabled).toBe(g.count !== g.totaal)

      fireEvent.change(veld, { target: { value: String(g.totaal) } })
      expect(knop.disabled).toBe(false)
      fireEvent.click(knop)
      expect(onConfirm).toHaveBeenCalledWith({
        confirmCount: g.totaal,
        includeLinkedCounterparts: g.meenemen,
      })
    })
  }
})

describe('BulkBudgetSheet — AC7: Eigen rekening-notice en mutableCount', () => {
  function renderBudgetSheet(overrides: Partial<Parameters<typeof BulkBudgetSheet>[0]> = {}) {
    const onConfirm = vi.fn()
    render(
      <BulkBudgetSheet
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        busy={false}
        error={null}
        count={12}
        mutableCount={12}
        sumPositief={0}
        sumNegatief={-1240}
        filterLines={[]}
        splitCount={0}
        budgetEntries={[]}
        budgetId={null}
        onBudgetChange={() => {}}
        isEigenRekening={false}
        {...overrides}
      />,
    )
    return { onConfirm }
  }

  it('toont de vrijheids-%/spaarquote-notice alleen wanneer het doel Eigen rekening is', () => {
    renderBudgetSheet({ isEigenRekening: true })
    expect(screen.getByText(/tellen niet meer mee als inkomst of uitgave/)).toBeTruthy()
  })

  it('toont die notice NIET voor een gewoon budget', () => {
    renderBudgetSheet({ isEigenRekening: false })
    expect(screen.queryByText(/tellen niet meer mee als inkomst of uitgave/)).toBeNull()
  })

  it('de knoptekst gebruikt mutableCount (na aftrek van splits), niet de volledige selectie', () => {
    renderBudgetSheet({ count: 12, mutableCount: 9 })
    expect(screen.getByRole('button', { name: 'Koppel 9 transacties' })).toBeTruthy()
  })

  it('meldt hoeveel geselecteerde transacties gesplitst zijn en dus buiten de wijziging blijven', () => {
    renderBudgetSheet({ count: 12, mutableCount: 9, splitCount: 3 })
    expect(screen.getByText(/3 geselecteerde transacties zijn gesplitst/)).toBeTruthy()
  })
})
