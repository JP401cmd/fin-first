import { describe, it, expect } from 'vitest'
import {
  dgaLeningTotalForUser,
  dgaLeningTotalCombined,
  type DgaLeningSources,
} from './box2-dga-lening'

const A = 'user-a'
const B = 'user-b'

describe('box2-dga-lening — Wet excessief lenen aggregatie (optie B)', () => {
  it('kernbug: alleen een dga_schuld (geen vordering) telt volledig mee', () => {
    // Vroeger trok de route de vordering (0) van de schuld af → −600k → 0.
    const sources: DgaLeningSources = {
      schulden: [{ userId: A, ownership: 'personal', amount: 600000 }],
      vorderingen: [],
    }
    expect(dgaLeningTotalForUser(sources, A)).toBe(600000)
  })

  it('telt schulden EN vorderingen op (niet af)', () => {
    const sources: DgaLeningSources = {
      schulden: [{ userId: A, ownership: 'personal', amount: 400000 }],
      vorderingen: [{ userId: A, ownership: 'personal', amount: 200000 }],
    }
    expect(dgaLeningTotalForUser(sources, A)).toBe(600000)
  })

  it('per persoon: eigen posten + gedeelde, niet de persoonlijke posten van de ander', () => {
    const sources: DgaLeningSources = {
      schulden: [
        { userId: A, ownership: 'personal', amount: 100000 },
        { userId: B, ownership: 'personal', amount: 50000 },
        { userId: A, ownership: 'shared', amount: 30000 },
      ],
      vorderingen: [{ userId: B, ownership: 'personal', amount: 20000 }],
    }
    // A: eigen 100k + gedeeld 30k = 130k (B's persoonlijke 50k/20k tellen niet mee)
    expect(dgaLeningTotalForUser(sources, A)).toBe(130000)
    // B: eigen 50k + 20k + gedeeld 30k = 100k
    expect(dgaLeningTotalForUser(sources, B)).toBe(100000)
  })

  it('gecombineerd: alle posten als niets verborgen is', () => {
    const sources: DgaLeningSources = {
      schulden: [
        { userId: A, ownership: 'personal', amount: 100000 },
        { userId: B, ownership: 'personal', amount: 50000 },
        { userId: A, ownership: 'shared', amount: 30000 },
      ],
      vorderingen: [{ userId: B, ownership: 'personal', amount: 20000 }],
    }
    expect(dgaLeningTotalCombined(sources, A, false)).toBe(200000)
  })

  it('gecombineerd met verborgen partner: diens persoonlijke posten vallen weg, gedeeld blijft', () => {
    const sources: DgaLeningSources = {
      schulden: [
        { userId: A, ownership: 'personal', amount: 100000 },
        { userId: B, ownership: 'personal', amount: 50000 },
        { userId: A, ownership: 'shared', amount: 30000 },
      ],
      vorderingen: [{ userId: B, ownership: 'personal', amount: 20000 }],
    }
    // A eigen 100k + gedeeld 30k = 130k; B's persoonlijke 50k+20k weg.
    expect(dgaLeningTotalCombined(sources, A, true)).toBe(130000)
  })

  it('nooit negatief bij lege of ontbrekende bronnen', () => {
    expect(dgaLeningTotalForUser({ schulden: [], vorderingen: [] }, A)).toBe(0)
    expect(dgaLeningTotalCombined({ schulden: [], vorderingen: [] }, A, true)).toBe(0)
  })
})
