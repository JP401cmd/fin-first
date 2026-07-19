import { describe, it, expect } from 'vitest'
import { KNOWLEDGE_STARTER_SET, KNOWLEDGE_CATEGORIES, buildStarterItems } from './knowledge-starter-set'
import { LocalKnowledgeItemSchema, LocalKnowledgePutSchema } from './knowledge-schema'

/**
 * Startset kennisbank lokale AI (fase K1 / K1.1). Bewaakt: het aantal
 * begrippen, dat elk item geldig is tegen het route-schema (zodat "Startset
 * laden" → opslaan niet stukloopt) en — hard — de inhoudsregel: uitleg zonder
 * cijfers/tarieven/jaartallen (alleen de eigennamen Box 1/2/3 mogen een cijfer
 * bevatten).
 */

// Verwijder de eigennamen Box 1/2/3 zodat alleen "echte" cijfers overblijven.
function stripBoxNames(s: string): string {
  return s.replace(/box\s*[123]/gi, 'box')
}

describe('KNOWLEDGE_STARTER_SET', () => {
  it('bevat de volledige K1.2-set (89 begrippen: 10 uit K1 + 61 uit K1.1 + 18 verdieping)', () => {
    expect(KNOWLEDGE_STARTER_SET).toHaveLength(89)
  })

  it('dekt de C1a-kernbegrippen', () => {
    const titels = KNOWLEDGE_STARTER_SET.map((t) => t.titel.toLowerCase())
    for (const nodig of ['box 1', 'box 2', 'box 3', 'jaarruimte', 'vrijheidstijd', 'spaarquote', 'fire']) {
      expect(titels.some((t) => t.includes(nodig))).toBe(true)
    }
  })

  it('heeft unieke titels en elk item minstens één trefwoord', () => {
    const titels = KNOWLEDGE_STARTER_SET.map((t) => t.titel.trim().toLowerCase())
    expect(new Set(titels).size).toBe(titels.length)
    for (const t of KNOWLEDGE_STARTER_SET) {
      expect(t.tags.length).toBeGreaterThan(0)
    }
  })

  it('bevat geen cijfers/tarieven/jaartallen (Box-namen uitgezonderd)', () => {
    for (const t of KNOWLEDGE_STARTER_SET) {
      expect(stripBoxNames(t.titel)).not.toMatch(/\d/)
      expect(stripBoxNames(t.tekst)).not.toMatch(/\d/)
      for (const tag of t.tags) {
        expect(stripBoxNames(tag)).not.toMatch(/\d/)
      }
    }
  })

  it('elk item heeft een geldige categorie uit KNOWLEDGE_CATEGORIES', () => {
    for (const t of KNOWLEDGE_STARTER_SET) {
      expect(KNOWLEDGE_CATEGORIES).toContain(t.categorie)
    }
  })

  it('elke categorie heeft minstens één begrip', () => {
    const gedekt = new Set(KNOWLEDGE_STARTER_SET.map((t) => t.categorie))
    for (const categorie of KNOWLEDGE_CATEGORIES) {
      expect(gedekt.has(categorie)).toBe(true)
    }
  })

  it('controleerVoor is ontbrekend of een geldige ISO-datumstring', () => {
    for (const t of KNOWLEDGE_STARTER_SET) {
      if (t.controleerVoor === undefined) continue
      expect(Number.isNaN(new Date(t.controleerVoor).getTime())).toBe(false)
    }
  })
})

describe('buildStarterItems', () => {
  it('elk gematerialiseerd item is geldig tegen het route-item-schema', () => {
    for (const item of buildStarterItems()) {
      const result = LocalKnowledgeItemSchema.safeParse(item)
      expect(result.success).toBe(true)
    }
  })

  it('de hele set is een geldige PUT-payload', () => {
    const result = LocalKnowledgePutSchema.safeParse({ items: buildStarterItems() })
    expect(result.success).toBe(true)
  })

  it('geeft verse ids, oplopende volgorde vanaf de basis en actief=true', () => {
    const items = buildStarterItems(5)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(items.map((i) => i.volgorde)).toEqual(items.map((_, i) => 5 + i))
    expect(items.every((i) => i.actief)).toBe(true)
  })
})
