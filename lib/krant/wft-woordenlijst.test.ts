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

  // Compliance-check 28 sep, §5: de lijst was aan de te-SMALLE kant. Elke zin
  // hieronder glipte eerder door; nu niet meer.
  it.each([
    'Overweeg om extra af te lossen.',
    'Het loont om nu extra in te leggen.',
    'Profiteer van de hogere spaarrente.',
    'Wacht met verkopen tot januari.',
    'Kijk of je recht hebt op huurtoeslag.',
    'Maak gebruik van je jaarruimte om belasting te besparen.',
    'Check of je bank de rente al verhoogt.',
    'Doe er goed aan de hypotheek nu over te sluiten.',
    'Wij raden aan je spaargeld te spreiden.',
    'We raden je aan te sparen.',
    'Een aanrader voor starters.',
    'Tip: leg extra in.',
    'De beste spaarrekening van dit moment.',
    'De goedkoopste hypotheek.',
  ])('weert de aansporing of aanbeveling: %s', (zin) => {
    expect(vindWftOvertreding(zin)).not.toBeNull()
  })

  it.each([
    ['Bij Nationale Nederlanden is de premie hoger.', 'Nationale Nederlanden'],
    ['Bij Nationale-Nederlanden is de premie hoger.', 'Nationale-Nederlanden'],
    ['NN verhoogt de premie.', 'NN'],
    ['ASR verhoogt de premie.', 'ASR'],
    ['Bij de Rabo gaat de rente omhoog.', 'Rabo'],
    ['Interactive Brokers rekent minder.', 'Interactive Brokers'],
    ['IBKR rekent minder.', 'IBKR'],
    ['Via eToro gaat het sneller.', 'eToro'],
    ['Lynx verlaagt de kosten.', 'Lynx'],
    ['Flatex verlaagt de kosten.', 'Flatex'],
    ['Kraken noteert een koers.', 'Kraken'],
    ['Binance noteert een koers.', 'Binance'],
    ['Bitpanda noteert een koers.', 'Bitpanda'],
    ['ONVZ verhoogt de premie.', 'ONVZ'],
    ['FBTO verhoogt de premie.', 'FBTO'],
    ['Ohra verhoogt de premie.', 'Ohra'],
    ['Univé verhoogt de premie.', 'Univé'],
    ['Zorg en Zekerheid verhoogt de premie.', 'Zorg en Zekerheid'],
    ['Allianz verhoogt de premie.', 'Allianz'],
    ['Argenta verlaagt de hypotheekrente.', 'Argenta'],
    ['Munt Hypotheken verlaagt de rente.', 'Munt Hypotheken'],
    ['Tulp verlaagt de rente.', 'Tulp'],
    ['Venn verlaagt de rente.', 'Venn'],
  ])('weert de aanbieder bij naam: %s', (zin, naam) => {
    expect(vindWftOvertreding(zin)).toEqual({ soort: 'aanbieder', naam })
  })

  it('aanbieders die ook een gewoon woord zijn, alleen met de eigen hoofdletters', () => {
    expect(vindWftOvertreding('Oplichters kraken een wachtwoord.')).toBeNull()
    expect(vindWftOvertreding('Een tulp uit Amsterdam.')).toBeNull()
    expect(vindWftOvertreding('Een kwestie van zorg en zekerheid.')).toBeNull()
    expect(vindWftOvertreding('Het ANNO-rapport verscheen.')).toBeNull()
  })

  it('de aanvulling verruimt niets: beschrijvende zinnen komen er doorheen', () => {
    for (const zin of [
      'De rente blijft vijf jaar staan.',
      'Wie een lijfrente heeft, kijkt naar de jaarruimte.',
      'Het kabinet overweegt een nieuwe regeling.',
      'Volgens je profiel heb je beleggingen.',
      'Volgens je profiel heb je € 50.000 of meer spaargeld.',
      'De minister wacht met een besluit tot na de zomer.',
      'De jaarlijkse check van de Belastingdienst volgt in mei.',
      'De hoogste rente sinds 2008.',
      'Het beste moment is onbekend.',
    ]) {
      expect(vindWftOvertreding(zin), zin).toBeNull()
    }
  })

  // Catalogusteksten van Krant 1C (hoofdthread): die MOETEN schoon blijven.
  it('laat de 1C-catalogusteksten door', () => {
    for (const zin of [
      'Uitleg bij het nieuws, niet op jouw situatie afgestemd.',
      'Of en hoeveel het jou raakt, rekent de Krant hier niet uit.',
      'Dat geldt ook voor jou. Wat het in euro’s doet, rekent de Krant hier niet uit.',
      'Bij een restschuld van € 150.000 tot € 300.000 is elke 0,25 procentpunt hypotheekrente € 375 tot € 750 per jaar aan rente, vóór eventuele renteaftrek. Of en wanneer jouw rente meebeweegt, staat hier niet.',
      'Met je inkomen in je profiel kan de Krant zien of dit jou raakt.',
    ]) {
      expect(vindWftOvertreding(zin), zin).toBeNull()
    }
  })
})
