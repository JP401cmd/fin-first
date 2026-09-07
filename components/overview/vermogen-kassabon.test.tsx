import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NettoVermogenKopgetal, VermogenKassabon } from './vermogen-kassabon'
import { calculateFreedomTime, formatCurrency, formatFreedomTimeString } from '@/lib/format'

/**
 * UR3-14 deel D — de kassabon achter het netto-vermogen-kopgetal op /overzicht.
 *
 * Wat deze suite bewaakt is niet "er staat een getal", maar dat de GERENDERDE
 * waardes de bundelwaardes zijn: het totaal is `currentNetWorth` zelf (niet de
 * som van de twee regels erboven), de excl.-woning-regel is
 * `netWorthExclHome` (niet vermogen − huis + hypotheek), en de tijdregel komt
 * uit het canonieke `calculateFreedomTime` op het meegegeven dagtarief. Precies
 * die drie zijn de plekken waar een kassabon stilletjes een tweede som zou
 * kunnen introduceren.
 */

/**
 * `formatCurrency` zet een harde spatie (U+00A0) tussen € en het getal;
 * testing-library normaliseert die in de DOM juist naar een gewone spatie.
 * Zonder deze vertaling zoekt een `getByText` naar een string die per definitie
 * nooit matcht.
 */
const eur = (value: number) => formatCurrency(value).replace(/[\u00a0\u202f]/g, ' ')

const BEZITTINGEN = 412_500
const SCHULDEN = 168_000
/**
 * BEWUST NIET `BEZITTINGEN - SCHULDEN`. De bon mag zijn totaal niet uit de
 * opsomming halen; door hier een afwijkende waarde te zetten faalt de test
 * zodra iemand alsnog gaat optellen.
 */
const NETTO_VERMOGEN = 244_000
const DAGTARIEF = 92

describe('VermogenKassabon — regels komen uit de bundel', () => {
  it('toont bezittingen, schulden en het meegegeven netto vermogen als totaal', () => {
    render(
      <VermogenKassabon
        currentNetWorth={NETTO_VERMOGEN}
        bezittingen={BEZITTINGEN}
        schulden={SCHULDEN}
      />,
    )

    expect(screen.getByText(eur(BEZITTINGEN))).toBeTruthy()
    expect(screen.getByText(eur(-SCHULDEN))).toBeTruthy()
    expect(screen.getByTestId('vermogen-kassabon-totaal').textContent).toContain(
      formatCurrency(NETTO_VERMOGEN),
    )
    // Zou de bon zelf optellen, dan stond hier 244.500 i.p.v. 244.000.
    expect(screen.getByTestId('vermogen-kassabon-totaal').textContent).not.toContain(
      formatCurrency(BEZITTINGEN - SCHULDEN),
    )
  })

  it('vertaalt het netto vermogen naar vrijheidstijd via het canonieke dagtarief', () => {
    render(
      <VermogenKassabon
        currentNetWorth={NETTO_VERMOGEN}
        bezittingen={BEZITTINGEN}
        schulden={SCHULDEN}
        dailyExpense={DAGTARIEF}
      />,
    )

    const verwacht = formatFreedomTimeString(
      calculateFreedomTime(NETTO_VERMOGEN, DAGTARIEF),
      'long',
    )
    expect(screen.getByText(new RegExp(verwacht.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
  })

  it('zwijgt over vrijheidstijd zonder dagtarief in plaats van er een te verzinnen', () => {
    render(
      <VermogenKassabon
        currentNetWorth={NETTO_VERMOGEN}
        bezittingen={BEZITTINGEN}
        schulden={SCHULDEN}
      />,
    )
    expect(screen.queryByText(/vrijheid/i)).toBeNull()
  })

  it('toont de excl.-eigen-woning-grondslag zoals de loader hem levert', () => {
    const EXCL = 61_000
    render(
      <VermogenKassabon
        currentNetWorth={NETTO_VERMOGEN}
        bezittingen={BEZITTINGEN}
        schulden={SCHULDEN}
        netWorthExclHome={EXCL}
        eigenHuisValue={340_000}
        mortgageBalance={157_000}
      />,
    )
    expect(screen.getByTestId('vermogen-kassabon-excl-woning').textContent).toContain(
      formatCurrency(EXCL),
    )
    expect(screen.getByText(eur(340_000))).toBeTruthy()
    expect(screen.getByText(eur(-157_000))).toBeTruthy()
  })
})

describe('NettoVermogenKopgetal — de doorklik', () => {
  it('rendert het kale kopgetal zonder opbouw (geen knop, geen sheet)', () => {
    render(<NettoVermogenKopgetal currentNetWorth={NETTO_VERMOGEN} />)
    expect(screen.queryByTestId('netto-vermogen-kopgetal')).toBeNull()
    expect(screen.getByText(eur(NETTO_VERMOGEN))).toBeTruthy()
  })

  it('opent de kassabon bij een klik op het kopgetal', () => {
    render(
      <NettoVermogenKopgetal
        currentNetWorth={NETTO_VERMOGEN}
        opbouw={{ bezittingen: BEZITTINGEN, schulden: SCHULDEN }}
      />,
    )

    const knop = screen.getByTestId('netto-vermogen-kopgetal')
    // Het bedrag blijft de toegankelijke naam van de knop — een aria-label zou
    // dat juist vervangen en het getal bij de schermlezer weghalen.
    expect(knop.textContent).toContain(formatCurrency(NETTO_VERMOGEN))

    expect(screen.queryByTestId('vermogen-kassabon-totaal')).toBeNull()
    fireEvent.click(knop)
    expect(screen.getByTestId('vermogen-kassabon-totaal')).toBeTruthy()
  })
})
