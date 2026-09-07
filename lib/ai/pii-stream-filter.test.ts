import { describe, it, expect } from 'vitest'
import { createPIITextFilter, pendingPIITailLength } from './pii-stream-filter'

/**
 * De streamende variant van `maskPIIInOutput`. De kern van deze suite is de
 * staart: zonder die buffer maskeert het filter in de praktijk niets, omdat een
 * IBAN vrijwel altijd over een chunkgrens breekt.
 */

describe('pendingPIITailLength — welke staart wordt vastgehouden', () => {
  it('houdt een IBAN-aanhef vast', () => {
    expect(pendingPIITailLength('Je rekening NL91 ')).toBe('NL91 '.length)
    expect(pendingPIITailLength('Je rekening NL91 ABNA 04')).toBe('NL91 ABNA 04'.length)
    expect(pendingPIITailLength('storting naar NL')).toBe(2)
  })

  it('houdt een cijferstaart vast, inclusief het scheidingsteken', () => {
    // "is 1234" leest als een mogelijke IBAN-aanhef (landcode + controlecijfers),
    // dus de staart begint hier al bij het woord ervóór. Bewust conservatief: te
    // veel vasthouden kost hooguit één chunk vertraging, te weinig lekt.
    expect(pendingPIITailLength('Je BSN is 1234')).toBe('is 1234'.length)
    expect(pendingPIITailLength('BSN 1234')).toBe(4)
    expect(pendingPIITailLength('het getal 123456789.')).toBe('123456789.'.length)
  })

  it('houdt gewone woorden NIET vast — de stream mag niet stokken', () => {
    expect(pendingPIITailLength('Je spaarquote is prima')).toBe(0)
    expect(pendingPIITailLength('- op koers')).toBe(0)
    expect(pendingPIITailLength('dat klopt.')).toBe(0)
    expect(pendingPIITailLength('')).toBe(0)
  })

  it('blijft binnen het plafond, ook bij een lange alfanumerieke reeks', () => {
    expect(pendingPIITailLength(`x ${'A9'.repeat(80)}`)).toBeLessThanOrEqual(48)
  })
})

describe('createPIITextFilter — maskeren over chunkgrenzen heen', () => {
  function stroom(deltas: string[], id = 'a'): string {
    const filter = createPIITextFilter()
    return deltas.map((d) => filter.delta(id, d)).join('') + filter.end(id)
  }

  it('maskeert een gesplitste IBAN', () => {
    expect(stroom(['Je rekening NL91 ', 'ABNA 0417 ', '1643 00 is actief.'])).toBe(
      'Je rekening **** is actief.',
    )
  })

  it('maskeert een gesplitste BSN', () => {
    expect(stroom(['Je BSN is 1234', '56789 en dat klopt.'])).toBe('Je BSN is **** en dat klopt.')
  })

  it('maskeert een IBAN die pas bij het sluiten van het blok compleet is', () => {
    expect(stroom(['Rekening: ', 'NL91 ABNA 0417 1643 00'])).toBe('Rekening: ****')
  })

  it('houdt de context vast zodat een gesplitst bedrag niet als BSN telt', () => {
    expect(stroom(['Je vermogen is €1234', '56789 op dit moment.'])).toBe(
      'Je vermogen is €123456789 op dit moment.',
    )
  })

  it('laat tekst zonder PII volledig en ongewijzigd door', () => {
    const deltas = ['Je spaarquote is ', '18% en dat is ', 'ruim boven het gemiddelde.']
    expect(stroom(deltas)).toBe(deltas.join(''))
  })

  it('houdt de staart per tekstblok gescheiden', () => {
    const filter = createPIITextFilter()
    filter.delta('a', 'Rekening NL91 ')
    filter.delta('b', 'Tweede blok 5678')
    expect(filter.end('a', 'ABNA 0417 1643 00')).toBe('****')
    expect(filter.end('b', '9 euro')).toBe('56789 euro')
  })

  it('neemt de staart van een ander filter mee bij het sluiten', () => {
    // Zo koppelt `chat-output-filter` de emoji-staart aan de PII-laag.
    const filter = createPIITextFilter()
    expect(filter.delta('a', 'Rekening NL91 ABNA 0417 ')).toBe('Rekening ')
    expect(filter.end('a', '1643 00')).toBe('****')
  })
})
