/**
 * Tests voor de `alreadyExists`-vlag van `detectRecurringTransactions`.
 *
 * Dat is het gedrag dat de `existingRecurrings`-vergelijking bewaakt: een al
 * bevestigde vaste last mag niet opnieuw als "nieuw gedetecteerd" aan de gebruiker
 * worden voorgelegd. De vergelijking draait op GENORMALISEERDE namen
 * (`normalizeCounterparty`), zodat "NETFLIX INTERNATIONAL B.V." en
 * "Netflix International BV" dezelfde vaste last zijn.
 *
 * De opbouw van die vergelijkingsset is uit de groepslus gehoist (T1.4). Deze
 * suite legt vast dat dat gedragsneutraal is: dezelfde vlag per groep, per
 * richting, met dezelfde normalisatie- en fallback-regels.
 */

import { describe, it, expect } from 'vitest'
import {
  detectRecurringTransactions,
  detectCategory,
  isVariableMerchant,
  RECURRING_ANALYSIS_MONTHS,
  type TransactionForDetection,
} from './recurring-detection'

/** Vier maandelijkse afschrijvingen van dezelfde tegenpartij → één detectie. */
function maandelijkseTx(
  counterparty: string,
  amount: number,
  opts: { startDag?: string } = {},
): TransactionForDetection[] {
  const maanden = ['2026-02', '2026-03', '2026-04', '2026-05']
  const dag = opts.startDag ?? '12'
  return maanden.map((maand, i) => ({
    id: `${counterparty}-${i}`,
    date: `${maand}-${dag}`,
    amount,
    description: `${counterparty} abonnement`,
    counterparty_name: counterparty,
    is_income: amount > 0,
    budget_id: null,
  }))
}

const NETFLIX = 'Netflix International B.V.'
const SPOTIFY = 'Spotify AB'

const vind = (detected: ReturnType<typeof detectRecurringTransactions>, naam: string) =>
  detected.find((d) => d.counterpartyName === naam)

describe('detectRecurringTransactions — alreadyExists', () => {
  it('zonder bevestigde recurrings is niets als bestaand gemarkeerd', () => {
    const detected = detectRecurringTransactions(maandelijkseTx(NETFLIX, -12.99))
    expect(detected).toHaveLength(1)
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(false)
  })

  it('een bevestigde recurring met dezelfde tegenpartij wordt als bestaand gemarkeerd', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: NETFLIX, amount: -12.99, name: 'Netflix' }],
    )
    expect(detected).toHaveLength(1)
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
  })

  it('markeert alleen de groep die écht matcht, niet alle groepen', () => {
    // De kern van de hoist: de vergelijkingsset is loop-invariant, de UITKOMST
    // per groep niet. Zou `alreadyExists` één keer buiten de lus bepaald worden,
    // dan zou Spotify hier ten onrechte meeliften.
    const detected = detectRecurringTransactions(
      [...maandelijkseTx(NETFLIX, -12.99), ...maandelijkseTx(SPOTIFY, -10.99, { startDag: '03' })],
      [{ counterparty_name: NETFLIX, amount: -12.99, name: 'Netflix' }],
    )
    expect(detected).toHaveLength(2)
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
    expect(vind(detected, SPOTIFY)!.alreadyExists).toBe(false)
  })

  it('vergelijkt genormaliseerd: andere casing/leestekens is dezelfde vaste last', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: 'NETFLIX  INTERNATIONAL BV!', amount: -12.99, name: 'x' }],
    )
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
  })

  it('valt terug op `name` wanneer de bevestigde recurring geen counterparty_name heeft', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: null, amount: -12.99, name: NETFLIX }],
    )
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
  })

  it('een bevestigde recurring van een ándere tegenpartij markeert niets', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: SPOTIFY, amount: -10.99, name: 'Spotify' }],
    )
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(false)
  })

  it('inkomsten en uitgaven van dezelfde tegenpartij krijgen elk hun eigen vlag', () => {
    // Eén tegenpartij kan twee richtingen hebben (bv. salaris + terugbetaling).
    // Beide subgroepen delen dezelfde genormaliseerde naam, dus beide vlaggen
    // horen mee te bewegen met dezelfde bevestigde recurring.
    const werkgever = 'Werkgever BV'
    const detected = detectRecurringTransactions(
      [
        ...maandelijkseTx(werkgever, 2500),
        ...maandelijkseTx(werkgever, -75, { startDag: '20' }),
      ],
      [{ counterparty_name: werkgever, amount: 2500, name: 'Salaris' }],
    )
    expect(detected).toHaveLength(2)
    expect(detected.every((d) => d.alreadyExists)).toBe(true)
    expect(detected.filter((d) => d.isIncome)).toHaveLength(1)
  })
})

/**
 * H14 — variabele tegenpartijen. Deze lijst is de AANVULLING op de
 * frequentie-snede in `lib/vaste-lasten-summary.ts`, niet de regel zelf: hij
 * vangt de winkels/tankstations/horeca die MAANDELIJKS afrekenen en dus niet
 * door de frequentie worden gepakt.
 *
 * `detectCategory` blijft bewust ongewijzigd — een supermarkt is nog steeds
 * `other_expense`, want er is geen categorie waar hij bij hoort. Alleen de
 * ROUTERING in de vaste-lastensamenvatting verandert.
 */
describe('isVariableMerchant', () => {
  it('herkent supermarkt, tanken, horeca en winkel', () => {
    for (const naam of [
      'ALBERT HEIJN 1234',
      'Jumbo Supermarkten',
      'LIDL NEDERLAND',
      'Aldi Zaandam',
      'Picnic',
      'Shell Station Kanaalweg',
      'BP Amsterdam',
      'Restaurant De Kade',
      'McDonalds',
      'H&M',
      'Action 4021',
      'HEMA',
      'IKEA Delft',
    ]) {
      expect(isVariableMerchant(naam, '')).toBe(true)
    }
  })

  it('laat echte vaste lasten met rust', () => {
    for (const naam of [
      'Vattenfall',
      'Zilveren Kruis',
      'Netflix',
      'Odido',
      'Gemeente Utrecht belasting',
      'Vestia',
      'J. Jansen',
      'Boekhouder Van Dijk',
      // Bevat "action" als deel van een woord — mag NIET matchen.
      'Transaction fee',
    ]) {
      expect(isVariableMerchant(naam, '')).toBe(false)
    }
  })

  it('detectCategory blijft ongewijzigd (de fix zit in de routering, niet hier)', () => {
    expect(detectCategory('Albert Heijn', 'Boodschappen', false)).toBe('other_expense')
    expect(detectCategory('Vattenfall', 'energie', false)).toBe('utility')
    expect(detectCategory('Netflix', 'Netflix', false)).toBe('subscription')
  })
})

/**
 * V-001 — LANGE INTERVALLEN TELLEN MEE VANAF TWEE BETALINGEN.
 *
 * De melding: "mijn HBO-abonnement is niet gedetecteerd, en ik verwacht veel
 * meer abonnementen dan er nu gedetecteerd zijn." De oorzaak zat niet in de
 * namenlijst maar in de betrouwbaarheidsregel: `MIN_OCCURRENCES.yearly` stond al
 * op 2, maar 'medium' vroeg drie waarnemingen — en `lib/vaste-lasten-summary.ts`
 * gooit alles weg wat 'low' blijft. Een jaarabonnement haalde die derde
 * waarneming pas na drie jaar historie en stond dus structureel buiten beeld.
 *
 * Wat hier vastligt:
 *  - jaar (340-395 dagen) en halfjaar (160-200 dagen, door de detector als
 *    'yearly' benaderd) halen 'medium' bij twee betalingen met een stabiel
 *    bedrag;
 *  - de BEDRAGSEIS is niet meeverlaagd: een jaarlijkse post met een grillig
 *    bedrag blijft 'low';
 *  - maandelijks en wekelijks houden hun drempels ONVERANDERD. Dat is de
 *    regressiekant van deze wijziging: daar is een derde waarneming binnen een
 *    kwartaal te halen, en juist daar is een toevallig paar betalingen een
 *    realistisch vals-positief.
 */

/** Twee losse posten van unieke tegenpartijen: een groep van één valt af, maar
 *  ze tillen de fixture wel boven de ondergrens van drie transacties. */
function ruis(): TransactionForDetection[] {
  return [
    {
      id: 'ruis-1', date: '2025-03-04', amount: -8.5, description: 'losse aankoop',
      counterparty_name: 'EENMALIG A', is_income: false, budget_id: null,
    },
    {
      id: 'ruis-2', date: '2025-09-21', amount: -19.95, description: 'losse aankoop',
      counterparty_name: 'EENMALIG B', is_income: false, budget_id: null,
    },
  ]
}

/** Twee betalingen aan dezelfde tegenpartij, op de opgegeven datums. */
function tweeBetalingen(
  counterparty: string,
  datums: [string, string],
  bedragen: [number, number],
): TransactionForDetection[] {
  return datums.map((date, i) => ({
    id: `${counterparty}-${i}`,
    date,
    amount: bedragen[i],
    description: `${counterparty} abonnement`,
    counterparty_name: counterparty,
    is_income: false,
    budget_id: null,
  }))
}

/**
 * VAST "NU" VOOR ALLE V-001-TESTS — 12 september 2026.
 *
 * Verplicht sinds de staarttermijn bestaat (`STALE_AFTER_DAYS`): de uitkomst
 * hangt nu áf van hoe lang geleden de laatste betaling was, dus een fixture met
 * vaste datums en een lopende wandklok verandert stil van betekenis. Een suite
 * die vandaag groen is zou over een paar maanden rood worden zonder dat er iets
 * aan de code veranderde. Dit is niet hypothetisch: precies dat gebeurde toen de
 * staarttermijn werd toegevoegd, met een fixture die tot dan toe klopte.
 */
const NU = new Date(2026, 8, 12, 12, 0, 0)

/** `detectRecurringTransactions` met het vaste "nu" hierboven. */
function detecteer(txs: TransactionForDetection[]) {
  return detectRecurringTransactions(txs, [], [], { now: NU })
}

describe('detectRecurringTransactions — halfjaar/jaar vanaf twee betalingen (V-001)', () => {
  it('vindt een JAARabonnement met twee betalingen die twaalf maanden uit elkaar liggen', () => {
    const detected = detecteer([
      ...ruis(),
      // 2025-02-10 tot 2026-02-10 = 365 dagen, dus het jaarvak (340-395).
      ...tweeBetalingen('JAARPOLIS', ['2025-02-10', '2026-02-10'], [-119, -119]),
    ])

    const post = vind(detected, 'JAARPOLIS')
    expect(post).toBeDefined()
    expect(post!.frequency).toBe('yearly')
    expect(post!.occurrences).toBe(2)
    // 'medium' is de drempel die telt: de vaste-lastensamenvatting filtert 'low'
    // weg, dus alles onder medium verdwijnt alsnog van het scherm.
    expect(post!.confidence).toBe('medium')
  })

  it('vindt een HALFJAARabonnement met twee betalingen (160-200 dagen)', () => {
    const detected = detecteer([
      ...ruis(),
      // 2025-08-15 tot 2026-02-15 = 184 dagen: het halfjaarvak, door de detector
      // als 'yearly' benaderd (zie detectFrequency).
      ...tweeBetalingen('HALFJAARBOND', ['2025-08-15', '2026-02-15'], [-64.5, -64.5]),
    ])

    const post = vind(detected, 'HALFJAARBOND')
    expect(post).toBeDefined()
    expect(post!.frequency).toBe('yearly')
    expect(post!.occurrences).toBe(2)
    expect(post!.confidence).toBe('medium')
  })

  it('REGRESSIE: een MAANDELIJKS patroon met twee betalingen valt nog steeds af', () => {
    const detected = detecteer([
      ...ruis(),
      ...tweeBetalingen('TWEEMAAL', ['2026-04-10', '2026-05-10'], [-30, -30]),
    ])

    // `MIN_OCCURRENCES.monthly` = 3: de groep wordt niet eens een detectie.
    expect(vind(detected, 'TWEEMAAL')).toBeUndefined()
  })

  it('REGRESSIE: een maandelijks patroon met drie betalingen blijft precies zoals het was', () => {
    const detected = detecteer([
      ...ruis(),
      // Dicht tegen NU aan: een LOPEND maandpatroon. Stond hier eerst op
      // maart-mei 2026 en dat was — terecht — stilgevallen ten opzichte van
      // september; de betrouwbaarheid die deze test bewaakt gaat over de
      // drempels, niet over de staart.
      ...[0, 1, 2].map((i) => ({
        id: `driemaal-${i}`,
        date: `2026-0${7 + i}-08`,
        amount: -22,
        description: 'DRIEMAAL abonnement',
        counterparty_name: 'DRIEMAAL',
        is_income: false,
        budget_id: null,
      })),
    ])

    const post = vind(detected, 'DRIEMAAL')
    expect(post).toBeDefined()
    expect(post!.frequency).toBe('monthly')
    expect(post!.confidence).toBe('medium')
  })

  it('de bedragseis is NIET meeverlaagd: een jaarpost met een grillig bedrag blijft low', () => {
    const detected = detecteer([
      ...ruis(),
      // Variatiecoefficient 0,6 — ruim boven de bestaande grens van 0,50.
      ...tweeBetalingen('WISSELVALLIG', ['2025-02-10', '2026-02-10'], [-100, -400]),
    ])

    const post = vind(detected, 'WISSELVALLIG')
    expect(post).toBeDefined()
    expect(post!.confidence).toBe('low')
  })

  it('low-kandidaten staan achteraan — de kandidaat-cap van de AI-route kan geen medium verdringen', () => {
    // Dit is de aanname waarop `/api/subscriptions/analyse-ai` leunt sinds hij
    // óók de twijfelgevallen ter beoordeling meestuurt (V-001, besluit 4): de
    // lijst wordt afgekapt op MAX_AI_CANDIDATES, en dat mag alleen de staart
    // raken. Zou deze sortering ooit omgaan, dan verliest die route stil de
    // kandidaten die er vóór de wijziging wél in zaten.
    const detected = detecteer([
      ...ruis(),
      ...tweeBetalingen('JAARPOLIS', ['2025-02-10', '2026-02-10'], [-119, -119]),
      ...tweeBetalingen('WISSELVALLIG', ['2025-02-10', '2026-02-10'], [-100, -400]),
    ])

    const volgorde = detected.map((d) => d.confidence)
    const eersteLow = volgorde.indexOf('low')
    expect(eersteLow).toBeGreaterThanOrEqual(0)
    // Geen enkele medium/high staat ná de eerste low.
    expect(volgorde.slice(eersteLow).every((c) => c === 'low')).toBe(true)
  })

  it('het analysevenster is 24 maanden — breed genoeg voor twee jaarbetalingen', () => {
    // Zonder dit getal is de regel hierboven een lege belofte: twee betalingen
    // met een jaar ertussen passen niet in een venster van twaalf maanden.
    expect(RECURRING_ANALYSIS_MONTHS).toBeGreaterThanOrEqual(24)
  })

  it('bij PRECIES TWEE waarnemingen geldt een strenge bedragseis', () => {
    // Met n=2 is de variatiecoefficient een zwak signaal: twee willekeurige
    // bedragen liggen al snel "dicht genoeg" bij elkaar voor de generieke grens
    // van 0,50. Concreet: EUR 100 en EUR 280 geeft cv 0,47 — onder 0,50, dus
    // zonder deze eis zouden twee losse aankopen met een half jaar ertussen een
    // 'medium' jaarabonnement van EUR 15,83/mnd worden.
    const detected = detecteer([
      ...ruis(),
      ...tweeBetalingen('TOEVALLIG PAAR', ['2025-08-15', '2026-02-15'], [-100, -280]),
    ])

    const post = vind(detected, 'TOEVALLIG PAAR')
    expect(post).toBeDefined()
    expect(post!.amountVariation).toBeGreaterThan(0.15)
    expect(post!.amountVariation).toBeLessThan(0.5)
    expect(post!.confidence).toBe('low')
  })
})

/**
 * V-001 — OPGEZEGDE ABONNEMENTEN MOGEN NIET HERLEVEN.
 *
 * `detectFrequency` rekent uitsluitend met de INTERVALLEN tussen betalingen en
 * kijkt nooit naar "hoe lang geleden was de laatste". Een reeks nette
 * maandbetalingen blijft daardoor een 'high'-patroon, ook als hij anderhalf jaar
 * geleden is opgehouden — en `lib/vaste-lasten-summary.ts` filtert alleen op
 * categorie, richting en betrouwbaarheid. `isRecurringExpired` helpt hier niet:
 * dat geldt alleen voor BEVESTIGDE rijen met een `end_date`.
 *
 * Het venster van 24 maanden maakt die staart twee keer zo lang, dus dit moest
 * mee: een abonnement dat in februari 2025 is opgezegd stond anders in september
 * 2026 gewoon weer voor het volle bedrag in het totaal, in de inkomensmeter en
 * in de vrijheidsdagen.
 */
describe('detectRecurringTransactions — stilgevallen patronen (V-001)', () => {
  function maandreeks(counterparty: string, maanden: string[], bedrag: number) {
    return maanden.map((maand, i) => ({
      id: `${counterparty}-${i}`,
      date: `${maand}-15`,
      amount: bedrag,
      description: `${counterparty} maandnota`,
      counterparty_name: counterparty,
      is_income: false,
      budget_id: null,
    }))
  }

  it('een in februari 2025 opgezegd abonnement telt in september 2026 niet meer mee', () => {
    // Vijf nette maandbetalingen — op zichzelf een perfect 'high'-patroon.
    const detected = detecteer([
      ...ruis(),
      ...maandreeks('ZIGGO', ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02'], -55),
    ])

    const post = vind(detected, 'ZIGGO')
    expect(post).toBeDefined()
    // Het patroon blijft bestaan (de historie is echt), maar zakt naar 'low' —
    // en 'low' wordt door de vaste-lastensamenvatting weggefilterd.
    expect(post!.frequency).toBe('monthly')
    expect(post!.confidence).toBe('low')
  })

  it('hetzelfde patroon dat WEL doorloopt houdt zijn hoge betrouwbaarheid', () => {
    // De spiegelzijde: zonder deze getuige zou "alles naar low" ook groen zijn.
    const detected = detecteer([
      ...ruis(),
      ...maandreeks('ZIGGO', ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], -55),
    ])

    expect(vind(detected, 'ZIGGO')!.confidence).toBe('high')
  })

  it('een JAARabonnement mag ruim een jaar stilliggen zonder te vervallen', () => {
    // De staarttermijn schaalt mee met het interval: bij een jaarpatroon is
    // dertien maanden stilte normaal, geen signaal. Zou hier één vaste termijn
    // staan, dan sneuvelde elk jaarabonnement — precies wat V-001 juist zichtbaar
    // moest maken.
    const detected = detecteer([
      ...ruis(),
      ...tweeBetalingen('JAARPOLIS', ['2024-11-10', '2025-11-10'], [-119, -119]),
    ])

    expect(vind(detected, 'JAARPOLIS')!.confidence).toBe('medium')
  })

  it('een jaarpatroon dat twee jaar stilligt vervalt wél', () => {
    const detected = detecteer([
      ...ruis(),
      ...tweeBetalingen('OUDE JAARPOLIS', ['2023-05-10', '2024-05-10'], [-119, -119]),
    ])

    expect(vind(detected, 'OUDE JAARPOLIS')!.confidence).toBe('low')
  })
})

/**
 * V-001 — uitbreiding van de namenlijst. Twee kanten, allebei nodig: de nieuwe
 * merken moeten landen, en ze mogen niets meeslepen. De melding noemde HBO Max,
 * dat op een afschrift zelden "HBO" heet; een kaal `max` zou echter elke
 * particuliere "Max" als abonnement bestempelen.
 */
describe('detectCategory — uitgebreide abonnementenlijst (V-001)', () => {
  it('herkent de toegevoegde diensten als abonnement', () => {
    for (const naam of [
      'HBO MAX',
      'HBO Max Europe',
      'MAX.COM',
      'Warner Bros Discovery',
      'SkyShowtime',
      'DAZN Limited',
      'F1 TV Pro',
      'Pathe Thuis',
      'APPLE TV',
      'APPLE.COM/BILL',
      'Google Play',
      'YouTube Music',
      'Twitch Interactive',
      'Patreon Membership',
      'Substack Inc',
      'Het Financieele Dagblad',
      'De Groene Amsterdammer',
      'Canva Pty Ltd',
      'Figma Inc',
      'WeTransfer',
      'Microsoft OneDrive',
      'NordVPN',
      'Surfshark VPN',
      '1Password',
      'Bitwarden',
      'Duolingo',
      'Strava',
      'Headspace',
      'Zwift',
      'EA Play',
      'Discord Nitro',
      'LinkedIn Premium',
      'SportCity Nederland',
      'Fit For Free',
      'TrainMore',
      'Consumentenbond',
      'FNV Vakbond',
    ]) {
      expect(detectCategory(naam, '', false), naam).toBe('subscription')
    }
  })

  it('is precies: losse woorden mogen geen abonnement maken', () => {
    for (const naam of [
      // De valkuil uit de opdracht: een kaal "max" vangt van alles, inclusief
      // een particulier aan wie iemand maandelijks huur of alimentatie betaalt.
      'Max Jansen',
      'Maxime de Vries',
      'Maximaal Wonen BV',
      'MediaMarkt',
      // Bevat 'ea' en 'play' maar is geen EA Play.
      'Zeeland Playground BV',
    ]) {
      expect(detectCategory(naam, '', false), naam).not.toBe('subscription')
    }
  })
})
