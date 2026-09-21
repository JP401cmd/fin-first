import { describe, expect, it } from 'vitest'
import { vindWftOvertreding } from './wft-woordenlijst'

describe('wft-woordenlijst', () => {
  it('vangt gebiedende wijs richting de lezer, maar niet de beschrijvende vorm', () => {
    expect(vindWftOvertreding('Vraag de toeslag aan vóór 31 oktober.')).toMatchObject({ soort: 'gebiedende-wijs' })
    expect(vindWftOvertreding('Stap over naar een andere bank.')).toMatchObject({ soort: 'gebiedende-wijs' })
    expect(vindWftOvertreding('Je zou moeten aflossen.')).toMatchObject({ soort: 'gebiedende-wijs' })
    expect(vindWftOvertreding('De aanvraag moet vóór 31 oktober binnen zijn.')).toBeNull()
    expect(vindWftOvertreding('Dit raakt jouw situatie; een bedrag valt er nu niet aan te hangen.')).toBeNull()
  })

  it('vangt aanbieders bij naam, hoofdletterongevoelig behalve korte afkortingen', () => {
    expect(vindWftOvertreding('Bij Rabobank is de rente lager.')).toEqual({ soort: 'aanbieder', naam: 'Rabobank' })
    expect(vindWftOvertreding('bij meesman betaal je minder')).toMatchObject({ soort: 'aanbieder', naam: 'Meesman' })
    expect(vindWftOvertreding('ING verlaagt de spaarrente')).toMatchObject({ soort: 'aanbieder', naam: 'ING' })
    // "ing" als woorddeel of kleine letters is geen aanbieder.
    expect(vindWftOvertreding('de verhoging gaat in')).toBeNull()
  })

  it('vangt de sparen-of-beleggen-keuze en de vrijheidstijd-woorden (B2)', () => {
    expect(vindWftOvertreding('Kijk of sparen of beleggen beter past.')).toMatchObject({ soort: 'handelingskeuze' })
    expect(vindWftOvertreding('Dat is 3 dagen vrijheid.')).toMatchObject({ soort: 'euro-only' })
    expect(vindWftOvertreding('Bij jouw dagtarief is dat veel.')).toMatchObject({ soort: 'euro-only' })
    expect(vindWftOvertreding('Dat scheelt € 100 per jaar.')).toBeNull()
  })
})
