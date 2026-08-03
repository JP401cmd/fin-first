import { describe, it, expect } from 'vitest'
import {
  guardPersonalImpact,
  normalizeNumericToken,
  numericValueSet,
} from './local-news-guard'

// Grondslag zoals de resolver 'm samenstelt: artikeltekst + gerenderd profiel.
const ARTIKEL = 'De ECB verhoogt de rente naar 3,25 procent. Spaarrekeningen stijgen mee met 0,5 procentpunt.'
const PROFIEL = [
  'PROFIEL VAN DE GEBRUIKER (canoniek berekend):',
  '- Netto vermogen: €85.000 (≈ 2 jaar en 9 maanden vrijgekochte tijd)',
  '- Maandinkomen netto: €3.400 · maanduitgaven: €2.550',
  '- Spaarquote: 25% · dagtarief (uitgaven per dag): €85',
].join('\n')

const GROND = [ARTIKEL, PROFIEL]

describe('normalizeNumericToken', () => {
  it('brengt nl-NL, en-US en kale notatie tot dezelfde waarde', () => {
    // Hetzelfde bedrag, drie schrijfwijzen — de guard mag ze niet als
    // verschillende getallen zien, anders keurt hij correcte cijfers af.
    expect(normalizeNumericToken('1.234')).toBe(normalizeNumericToken('1234'))
    expect(normalizeNumericToken('1,234')).toBe('1234')
    expect(normalizeNumericToken('3,4')).toBe('3.4')
    expect(normalizeNumericToken('3.40')).toBe('3.4')
    expect(normalizeNumericToken('007')).toBe('7')
  })

  it('houdt verschillende bedragen uit elkaar', () => {
    expect(normalizeNumericToken('45')).not.toBe(normalizeNumericToken('450'))
  })
})

describe('numericValueSet — grondslag per EENHEID', () => {
  it('sorteert de getallen op hun eenheid', () => {
    const sets = numericValueSet(GROND.join('\n'))
    expect(sets.get('pct')!.has('3.25')).toBe(true) // "3,25 procent"
    expect(sets.get('eur')!.has('85000')).toBe(true) // "€85.000"
    expect(sets.get('eur')!.has('2550')).toBe(true) // "€2.550"
    expect(sets.get('eur')!.has('85')).toBe(true) // dagtarief "€85"
    expect(sets.get('pct')!.has('25')).toBe(true) // "Spaarquote: 25%"
  })
})

describe('guardPersonalImpact — eenheid-kruisbestuiving is GEEN grondslag', () => {
  // Vier gevallen die de vorige, eenheid-blinde versie allemaal doorliet. Elk is
  // een verzonnen geldclaim die toevallig hetzelfde cijfer deelt met iets
  // volstrekt anders in de grondslag.
  const GROND_MET_JAAR = [`${ARTIKEL} Vanaf 2026 geldt de nieuwe regel.`, PROFIEL]

  it('een BEDRAG mag niet steunen op een percentage', () => {
    // Grond bevat "Spaarquote: 25%", níét €25.
    expect(guardPersonalImpact('Dit bespaart je €25 per maand.', GROND)).toBeNull()
  })

  it('een BEDRAG mag niet steunen op een jaartal', () => {
    // Grond bevat "2026" als jaartal, níét €2.026.
    expect(guardPersonalImpact('Je bespaart €2.026 per jaar.', GROND_MET_JAAR)).toBeNull()
  })

  it('een PERCENTAGE mag niet steunen op een bedrag', () => {
    // Grond bevat dagtarief "€85", níét 85%.
    expect(guardPersonalImpact('Je rendement stijgt met 85 procent.', GROND)).toBeNull()
  })

  it('een BEDRAG mag niet steunen op een procentpunt', () => {
    // Grond bevat "0,5 procentpunt", níét €0,50.
    expect(guardPersonalImpact('Dat kost je €0,50 per dag.', GROND)).toBeNull()
  })

  it('maar dezelfde eenheid gront wél', () => {
    const zin = 'Met jouw maanduitgaven van €2.550 telt dit aan.'
    expect(guardPersonalImpact(zin, GROND)).toBe(zin)
    const pctZin = 'De rente van 3,25 procent raakt je spaargeld.'
    expect(guardPersonalImpact(pctZin, GROND)).toBe(pctZin)
  })

  it('een KAAL bron-getal gront GEEN claim mét eenheid (bewuste strengheid)', () => {
    // Anders zou het jaartal 2026 een verzonnen "€2.026" gronden. De prijs is
    // dat een artikel dat "3,25" zonder procentteken schrijft de impactzin niet
    // draagt — die vervalt dan stil en het bericht wordt 'relevant'.
    const grond = ['De rente gaat van 2 naar 3,25.']
    expect(guardPersonalImpact('De rente is nu 3,25 procent.', grond)).toBeNull()
  })

  it('een KALE claim mag op elke bron steunen', () => {
    // "2550" zonder teken, gegrond op "€2.550" in het profiel.
    const zin = 'Je maanduitgaven van 2550 blijven gelijk.'
    expect(guardPersonalImpact(zin, GROND)).toBe(zin)
  })
})

describe('guardPersonalImpact — de kern: verzonnen bedragen vervallen', () => {
  it('VERWERPT een verzonnen bedrag (het scenario uit de opdracht)', () => {
    // €45 komt in geen van beide bronnen voor: het model heeft het bedacht.
    const verzonnen = 'Dit bespaart je €45 per maand.'
    expect(guardPersonalImpact(verzonnen, GROND)).toBeNull()
  })

  it('VERWERPT een zelf uitgerekend vrijheidsdagen-getal', () => {
    // Precies waarom de prompt de €→dagen-vertaling in WOORDEN vraagt: 1,2 is
    // nergens gegrond, dus de hele regel valt weg.
    expect(guardPersonalImpact('Dat is 1,2 vrijheidsdagen.', GROND)).toBeNull()
  })

  it('VERWERPT een plausibel lijkend bedrag dat een deelstring van een echt bedrag is', () => {
    // Dit is het verschil met de losse `includes`-tolerantie van de briefing-
    // guard: "€255" lijkt op "€2.550" maar is een andere claim.
    expect(guardPersonalImpact('Je betaalt €255 extra.', GROND)).toBeNull()
  })

  it('ACCEPTEERT een bedrag dat letterlijk in het bronartikel staat', () => {
    const zin = 'De rente gaat naar 3,25 procent — dat raakt je spaargeld.'
    expect(guardPersonalImpact(zin, GROND)).toBe(zin)
  })

  it('ACCEPTEERT een bedrag uit het profiel, ook in andere notatie', () => {
    // Het profiel schrijft "€2.550"; het model schrijft "2550". Zelfde waarde.
    const zin = 'Met jouw maanduitgaven van 2550 euro merk je dit direct.'
    expect(guardPersonalImpact(zin, GROND)).toBe(zin)
  })

  it('ACCEPTEERT een zin zonder enig getal', () => {
    const zin = 'Als spaarder merk je hier iets van, zonder dat je nu iets hoeft te doen.'
    expect(guardPersonalImpact(zin, GROND)).toBe(zin)
  })

  it('geeft null bij lege of ontbrekende invoer', () => {
    expect(guardPersonalImpact(null, GROND)).toBeNull()
    expect(guardPersonalImpact('   ', GROND)).toBeNull()
  })

  it('verwerpt élk getal wanneer er geen grondslag is', () => {
    // Zonder bron valt er niets te bewijzen — fail-safe kant op.
    expect(guardPersonalImpact('Je bespaart €45.', [])).toBeNull()
    expect(guardPersonalImpact('Goed nieuws voor spaarders.', [])).toBe(
      'Goed nieuws voor spaarders.',
    )
  })

  it('verwerpt de zin zodra ÉÉN van meerdere getallen ongegrond is', () => {
    // 3,25 is gegrond, 99 niet. De hele regel vervalt.
    expect(guardPersonalImpact('Van 3,25 procent naar 99 procent.', GROND)).toBeNull()
  })
})
