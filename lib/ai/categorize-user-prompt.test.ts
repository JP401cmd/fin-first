import { describe, it, expect } from 'vitest'
import {
  buildCategorizeUserPrompt,
  batchItemId,
  type CategorizeUserPromptTx,
} from './categorize-system-prompt'

// ── Equivalentietest (ai-feature-eis, POC-les 5) ──────────────────────────────
//
// buildCategorizeUserPrompt (default, geen opts) MOET byte-voor-byte de opbouw
// reproduceren die app/api/ai/categorize/route.ts vroeger inline deed. We
// spiegelen die oude opbouw hier exact (met de sanitize-wrappers wéggelaten —
// die verhuisden naar de route-caller, de string-assemblage zelf is wat we
// vergelijken) en toetsen dat de nieuwe functie er identiek aan is. Divergeert
// de assemblage, dan verandert cloud-gedrag ongemerkt → deze test wordt rood.

function oldInlineUserMessage(batch: CategorizeUserPromptTx[]): string {
  return `Categoriseer de volgende ${batch.length} transacties.\nRetourneer een array van exact ${batch.length} items in dezelfde volgorde.\n\n${batch
    .map((tx, i) => {
      const parts = [
        `beschrijving: ${tx.description ?? ''}`,
        tx.counterparty_name ? `tegenpartij: ${tx.counterparty_name}` : null,
        `bedrag: ${tx.amount > 0 ? '+' : ''}${tx.amount}`,
        tx.date ? `datum: ${tx.date}` : null,
        tx.reference ? `referentie: ${tx.reference}` : null,
      ].filter(Boolean)
      return `${i + 1}. ${parts.join('\n   ')}`
    })
    .join('\n\n')}`
}

const REPRESENTATIVE: CategorizeUserPromptTx[] = [
  { description: 'Albert Heijn 1234', counterparty_name: 'Albert Heijn', amount: -34.5, date: '2026-04-01', reference: 'POS 998' },
  { description: 'Salaris werkgever', counterparty_name: 'ACME BV', amount: 3200, date: '2026-04-25', reference: null },
  // ontbrekende/lege velden — de conditionele regels moeten identiek vallen
  { description: '', counterparty_name: null, amount: -5, date: null, reference: null },
  { description: 'Enkel beschrijving', amount: -1.99 },
]

describe('buildCategorizeUserPrompt — cloud-equivalentie (default)', () => {
  it('is byte-voor-byte gelijk aan de oude inline route-opbouw', () => {
    expect(buildCategorizeUserPrompt(REPRESENTATIVE)).toBe(oldInlineUserMessage(REPRESENTATIVE))
  })

  it('blijft equivalent bij een batch van één en bij lege velden', () => {
    const one: CategorizeUserPromptTx[] = [{ amount: 12.34, description: 'X' }]
    expect(buildCategorizeUserPrompt(one)).toBe(oldInlineUserMessage(one))
  })

  it('bevat geen id-echo of JSON-instructie in het cloud-pad', () => {
    const out = buildCategorizeUserPrompt(REPRESENTATIVE)
    expect(out).not.toContain('t1:')
    expect(out).not.toContain('JSON-array')
  })
})

describe('buildCategorizeUserPrompt — lokaal (idEcho + kort)', () => {
  it('voegt per transactie een batch-id (t1..tN) toe dat het model terugechót', () => {
    const out = buildCategorizeUserPrompt(REPRESENTATIVE, { idEcho: true, kort: true })
    expect(out).toContain(`${batchItemId(0)}:`)
    expect(out).toContain(`${batchItemId(REPRESENTATIVE.length - 1)}:`)
  })

  it('vraagt in de kort-variant GEEN reasoning-veld', () => {
    const out = buildCategorizeUserPrompt(REPRESENTATIVE, { idEcho: true, kort: true })
    expect(out).toContain('budget_slug')
    expect(out).toContain('confidence')
    expect(out).not.toContain('"reasoning"')
    expect(out).toContain('GEEN reasoning-veld')
  })

  it('vraagt in de niet-kort-variant WEL reasoning', () => {
    const out = buildCategorizeUserPrompt(REPRESENTATIVE, { idEcho: true })
    expect(out).toContain('"reasoning"')
  })
})
