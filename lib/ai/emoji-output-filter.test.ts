import { describe, it, expect } from 'vitest'
import { stripEmoji, pendingEmojiTailLength, createEmojiTextFilter } from './emoji-output-filter'

/**
 * Emoji-uitvoertoets (UR3-11, spoor B — besluit eigenaar 6 sep 2026).
 *
 * De AI-regressieset mat 23 emoji in 129 antwoorden ondanks een expliciet verbod
 * in `lib/ai/dna/base.ts`. AC2 is absoluut geformuleerd ("bevat geen emoji"), dus
 * er hoort een deterministische laag onder. Deze suite is bewust modelvrij: alles
 * hier is puur tekstverwerking en dus reproduceerbaar.
 *
 * De voorbeelden komen letterlijk uit de meting van 6 sep 2026.
 */
describe('stripEmoji — de drie gemeten emoji-slots', () => {
  it('haalt de affectieve afsluiter na een uitroep weg, inclusief de spatie ervoor', () => {
    expect(stripEmoji('je komt uit met ruimte over. \u{1F4AA}')).toBe('je komt uit met ruimte over.')
    expect(stripEmoji('dat is enorm! \u{1F3AF}')).toBe('dat is enorm!')
    expect(stripEmoji('welkom bij TriFinity! \u{1F680}')).toBe('welkom bij TriFinity!')
  })

  it('haalt de sectiemarkeerder voor een tip- of let-op-blok weg', () => {
    expect(stripEmoji('\n\n\u{1F4A1} **Tip:** verhoog je inleg')).toBe('\n\n**Tip:** verhoog je inleg')
    expect(stripEmoji('\n\n\u{1F4A1} **Let op:** dit is geen advies')).toBe('\n\n**Let op:** dit is geen advies')
  })

  it('haalt status- en legendatekens weg', () => {
    expect(stripEmoji('- \u{1F7E2} op koers')).toBe('- op koers')
    expect(stripEmoji('- \u{1F7E1} aandacht')).toBe('- aandacht')
    expect(stripEmoji('- ✅ gedaan')).toBe('- gedaan')
    expect(stripEmoji('- ✓ gedaan')).toBe('- gedaan')
  })
})

describe('stripEmoji — wat bewust blijft staan', () => {
  it('behoudt het oneindig-symbool: base.ts licenseert het als merkteken', () => {
    expect(stripEmoji('passief inkomen dekt je uitgaven ∞')).toBe(
      'passief inkomen dekt je uitgaven ∞',
    )
  })

  it('behoudt pijlen: typografie in een opsomming, geen pictogram', () => {
    expect(stripEmoji('sparen → beleggen')).toBe('sparen → beleggen')
  })

  it('laat gewone tekst met euro-bedragen, procenten en cijfers ongemoeid', () => {
    const tekst = 'Je netto vermogen is €85.000 (14%), dat is 2 jaar en 9 maanden vrijheid.'
    expect(stripEmoji(tekst)).toBe(tekst)
  })

  it('is idempotent', () => {
    const een = stripEmoji('dat is enorm! \u{1F3AF} echt waar \u{1F4AA}')
    expect(stripEmoji(een)).toBe(een)
  })
})

describe('stripEmoji — spatiëring', () => {
  it('houdt precies één spatie over als de emoji middenin een zin stond', () => {
    expect(stripEmoji('sparen \u{1F3AF} beleggen')).toBe('sparen beleggen')
  })

  it('strijkt een run van meerdere emoji glad tot één ingreep', () => {
    expect(stripEmoji('goed bezig \u{1F3AF}\u{1F4AA}\u{1F680} vandaag')).toBe('goed bezig vandaag')
  })

  it('haalt een samengestelde ZWJ-reeks in zijn geheel weg', () => {
    // Familie-emoji: pictogram + ZWJ + pictogram + ZWJ + pictogram.
    const familie = '\u{1F468}‍\u{1F469}‍\u{1F466}'
    expect(stripEmoji(`ons gezin ${familie} groeit`)).toBe('ons gezin groeit')
  })

  it('haalt een variatieselector en een huidskleur-modificator mee weg', () => {
    expect(stripEmoji('let op ⚠️ nu')).toBe('let op nu')
    expect(stripEmoji('top \u{1F44D}\u{1F3FD} gedaan')).toBe('top gedaan')
  })
})

describe('createEmojiTextFilter — chunkgrenzen', () => {
  it('vangt een pictogram dat als surrogaatpaar over twee chunks breekt', () => {
    const filter = createEmojiTextFilter()
    const doel = '\u{1F3AF}' // twee code units
    const uit =
      filter.delta('t1', `dat is enorm! ${doel[0]}`) +
      filter.delta('t1', `${doel[1]} echt waar`) +
      filter.end('t1')
    expect(uit).toBe('dat is enorm! echt waar')
  })

  it('vangt een variatieselector die in de volgende chunk zit', () => {
    const filter = createEmojiTextFilter()
    const uit = filter.delta('t1', 'let op ⚠') + filter.delta('t1', '️ nu') + filter.end('t1')
    expect(uit).toBe('let op nu')
  })

  it('vangt een ZWJ-reeks die per deelteken binnenkomt', () => {
    const filter = createEmojiTextFilter()
    const uit =
      filter.delta('t1', 'ons gezin \u{1F468}') +
      filter.delta('t1', '‍') +
      filter.delta('t1', '\u{1F469}') +
      filter.delta('t1', ' groeit') +
      filter.end('t1')
    expect(uit).toBe('ons gezin groeit')
  })

  it('laat geen spatie achter als het antwoord op een emoji eindigde', () => {
    // De spatie vóór de emoji hoort mee in de vastgehouden staart; anders
    // eindigt het antwoord op "goed bezig! " met een losse spatie.
    const filter = createEmojiTextFilter()
    const uit = filter.delta('t1', 'goed bezig! \u{1F4AA}') + filter.end('t1')
    expect(uit).toBe('goed bezig!')
  })

  it('houdt de tekstblokken uit elkaar: de staart van blok A lekt niet naar B', () => {
    const filter = createEmojiTextFilter()
    // De emoji aan het eind van blok A blijft in A's staart hangen; hij mag niet
    // vooraan de eerste chunk van blok B opduiken.
    expect(filter.delta('a', 'eerste blok \u{1F3AF}')).toBe('eerste blok')
    expect(filter.delta('b', 'tweede blok')).toBe('tweede blok')
    expect(filter.end('a')).toBe('')
    expect(filter.end('b')).toBe('')
  })

  it('houdt gewone tekst niet vast — geen haperende bedragen', () => {
    const filter = createEmojiTextFilter()
    expect(filter.delta('t1', 'Je vermogen is €85.000')).toBe('Je vermogen is €85.000')
    expect(pendingEmojiTailLength('Je vermogen is €85.000')).toBe(0)
    expect(pendingEmojiTailLength('sparen →')).toBe(0)
    expect(pendingEmojiTailLength('vrijheid ∞')).toBe(0)
  })
})
