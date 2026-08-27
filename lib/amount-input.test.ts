import { describe, expect, it } from 'vitest'
import { parseAmountInput, sanitizeAmountInput } from './amount-input'

/**
 * Regressie op bevinding H9 — "Bedragvelden muteren invoer stilzwijgend".
 *
 * De kern van de bug was niet DAT er tekens geweigerd werden, maar dat het
 * stilzwijgend gebeurde. Elke test hieronder controleert dus twee dingen: wat
 * er in het veld overblijft, én dat er een uitlegbare reden mee terugkomt. Een
 * test die alleen `value` assert zou groen blijven op de oude implementatie.
 */
describe('sanitizeAmountInput', () => {
  it('meldt het geweigerde minteken op een positief-only veld (repro-stap 2)', () => {
    const result = sanitizeAmountInput('-500')
    expect(result.value).toBe('500')
    expect(result.rejected).toEqual(['-'])
    // Dit is de assertion die op de oude implementatie faalt: die gaf '500'
    // terug zonder enig signaal dat het minteken verdwenen was.
    expect(result.reason).toBeTruthy()
    expect(result.reason).toContain('minteken')
  })

  it('behoudt het minteken wanneer het veld negatief toestaat', () => {
    const result = sanitizeAmountInput('-500', 'allow-negative')
    expect(result.value).toBe('-500')
    expect(result.rejected).toEqual([])
    expect(result.reason).toBeNull()
  })

  it('weigert een minteken midden in het getal, ook op een allow-negative veld', () => {
    const result = sanitizeAmountInput('5-0', 'allow-negative')
    expect(result.value).toBe('50')
    expect(result.reason).toBeTruthy()
  })

  it('meldt geweigerde letters (repro-stap 1)', () => {
    const result = sanitizeAmountInput('abc')
    expect(result.value).toBe('')
    expect(result.rejected).toEqual(['a', 'b', 'c'])
    expect(result.reason).toBeTruthy()
  })

  it('laat geldige invoer ongemoeid en meldt niets', () => {
    for (const input of ['0', '1234', '12,50', '1.234,56', '']) {
      const result = sanitizeAmountInput(input)
      expect(result.value).toBe(input)
      expect(result.reason).toBeNull()
    }
  })

  it('ontdubbelt de geweigerde tekens maar behoudt de volgorde van eerste voorkomen', () => {
    expect(sanitizeAmountInput('1a2b1a').rejected).toEqual(['a', 'b'])
  })
})

describe('parseAmountInput', () => {
  it('leest de NL-notatie zoals de rest van de app dat doet', () => {
    expect(parseAmountInput('45.000')).toBe(45000)
    expect(parseAmountInput('2.150,50')).toBe(2150.5)
    expect(parseAmountInput('12,5')).toBe(12.5)
    expect(parseAmountInput('1.234')).toBe(1234)
    expect(parseAmountInput('0')).toBe(0)
  })

  it('geeft null bij onleesbare invoer — nooit een stille 0', () => {
    // Een stille 0 is precies hoe €500 aan maanduitgaven in een profiel belandde
    // terwijl het inkomen leeg bleef.
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('-')).toBeNull()
  })

  it('weigert een negatief bedrag op een positief-only veld', () => {
    // Sanitize haalt het minteken al weg, dus dit is 500 — niet -500, en zeker
    // niet stilzwijgend 0.
    expect(parseAmountInput('-500')).toBe(500)
    expect(parseAmountInput('-500', 'allow-negative')).toBe(-500)
  })
})
