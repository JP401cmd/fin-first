import { describe, it, expect } from 'vitest'
import {
  buildCategorizeSystemPrompt,
  CATEGORIZE_SYSTEM_PROMPT,
  LOCAL_BUDGET_DESC_TRIM_FROM,
  LOCAL_BUDGET_DESC_MAX_CHARS,
  LOCAL_BUDGET_DESC_DROP_FROM,
  type CategorizeBudgetOption,
} from './categorize-system-prompt'

// ── Test-fixture helpers ──────────────────────────────────────────────────────

function budget(
  slug: string,
  name: string,
  parentName: string | null = null,
  type: CategorizeBudgetOption['type'] = 'expense',
  description?: string | null,
): CategorizeBudgetOption {
  return { slug, name, parentName, type, description }
}

// ── Bugrapport-budgetsets ─────────────────────────────────────────────────────
//
// De vier representatieve gevallen uit het bugrapport:
//
// 1. Custom "Eten thuis" onder "Huishouden" (AH-transactie)
// 2. Custom "Nutsvoorzieningen" onder "Vaste lasten" (Vattenfall)
// 3. Subbudgetten "Eten buiten"/"Bezorgd thuis" onder "Leuke dingen" (Thuisbezorgd)
// 4. Hernoemd income-budget "Netto salaris" met slug `netto-salaris`

const BUGSET_1: CategorizeBudgetOption[] = [
  budget('eten-thuis', 'Eten thuis', 'Huishouden'),
  budget('persoonlijke-verzorging', 'Persoonlijke verzorging', 'Huishouden'),
]

const BUGSET_2: CategorizeBudgetOption[] = [
  budget('nutsvoorzieningen', 'Nutsvoorzieningen', 'Vaste lasten'),
  budget('huur', 'Huur', 'Vaste lasten'),
]

const BUGSET_3: CategorizeBudgetOption[] = [
  budget('eten-buiten', 'Eten buiten', 'Leuke dingen'),
  budget('bezorgd-thuis', 'Bezorgd thuis', 'Leuke dingen'),
  budget('entertainment', 'Entertainment', 'Leuke dingen'),
]

const BUGSET_4: CategorizeBudgetOption[] = [
  budget('netto-salaris', 'Netto salaris', null, 'income'),
  budget('vakantiegeld', 'Vakantiegeld', null, 'income'),
]

// ── buildCategorizeSystemPrompt: prompt-inhoud ────────────────────────────────

describe('buildCategorizeSystemPrompt — prompt output', () => {
  it('bevat de slug van elk aangeleverd budget (bugset 1 — custom subbudgetten)', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_1)
    expect(prompt).toContain('eten-thuis')
    expect(prompt).toContain('persoonlijke-verzorging')
  })

  it('bevat de naam van elk aangeleverd budget', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_1)
    expect(prompt).toContain('"Eten thuis"')
    expect(prompt).toContain('"Persoonlijke verzorging"')
  })

  it('bevat de parentName wanneer die aanwezig is (bugset 1)', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_1)
    expect(prompt).toContain('"Huishouden"')
  })

  it('bevat de parentName "Vaste lasten" (bugset 2 — Nutsvoorzieningen)', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_2)
    expect(prompt).toContain('nutsvoorzieningen')
    expect(prompt).toContain('"Vaste lasten"')
  })

  it('bevat alle drie slugs van bugset 3 (Leuke dingen subbudgetten)', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_3)
    expect(prompt).toContain('eten-buiten')
    expect(prompt).toContain('bezorgd-thuis')
    expect(prompt).toContain('entertainment')
  })

  it('bevat de parentName "Leuke dingen" voor alle drie subbudgetten (bugset 3)', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_3)
    // parentName staat drie keer in de promptregels
    const matches = [...prompt.matchAll(/"Leuke dingen"/g)]
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it('bevat de slug netto-salaris met type-label inkomsten (bugset 4 — income budget)', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_4)
    expect(prompt).toContain('netto-salaris')
    expect(prompt).toContain('[inkomsten]')
  })

  it('bevat de income/expense bedragrichting-regel', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_4)
    // Regel 6 gaat over bedragrichting
    expect(prompt).toMatch(/positief.*inkomst|inkomst.*positief/i)
    expect(prompt).toContain("type 'income'")
  })

  it('bevat de "kies exact één aangeboden slug of null" richtlijn', () => {
    const prompt = buildCategorizeSystemPrompt(BUGSET_1)
    expect(prompt).toMatch(/exact.*slug|slug.*aangeboden/i)
    expect(prompt).toContain('null')
  })
})

// ── buildCategorizeSystemPrompt: description ──────────────────────────────────

describe('buildCategorizeSystemPrompt — description veld', () => {
  it('neemt description op als die aanwezig is', () => {
    const budgets: CategorizeBudgetOption[] = [
      budget('boodschappen', 'Boodschappen', 'Huishouden', 'expense', 'Dagelijkse supermarkt'),
    ]
    const prompt = buildCategorizeSystemPrompt(budgets)
    expect(prompt).toContain('Dagelijkse supermarkt')
  })

  it('laat description weg als die null is', () => {
    const budgets: CategorizeBudgetOption[] = [
      budget('boodschappen', 'Boodschappen', 'Huishouden', 'expense', null),
    ]
    const prompt = buildCategorizeSystemPrompt(budgets)
    // geen "— null" of "— undefined" in de promptregel
    expect(prompt).not.toMatch(/— null/)
    expect(prompt).not.toMatch(/— undefined/)
  })

  it('laat description weg als die een lege string is', () => {
    const budgets: CategorizeBudgetOption[] = [
      budget('boodschappen', 'Boodschappen', 'Huishouden', 'expense', '  '),
    ]
    const prompt = buildCategorizeSystemPrompt(budgets)
    expect(prompt).not.toMatch(/—\s+$/)
  })
})

// ── buildCategorizeSystemPrompt: lege lijst → fallback ───────────────────────

describe('buildCategorizeSystemPrompt — lege budgetlijst', () => {
  it('geeft de statische fallback terug bij een lege array', () => {
    const prompt = buildCategorizeSystemPrompt([])
    expect(prompt).toBe(CATEGORIZE_SYSTEM_PROMPT)
  })

  it('geeft de statische fallback terug bij undefined/null cast', () => {
    // @ts-expect-error — bewust testen van runtime-edge-case
    const prompt = buildCategorizeSystemPrompt(null)
    expect(prompt).toBe(CATEGORIZE_SYSTEM_PROMPT)
  })
})

// ── buildCategorizeSystemPrompt: type-labels ──────────────────────────────────

describe('buildCategorizeSystemPrompt — type-labels', () => {
  it('vermeldt [inkomsten] voor income-budgetten', () => {
    const prompt = buildCategorizeSystemPrompt([budget('salaris', 'Salaris', null, 'income')])
    expect(prompt).toContain('[inkomsten]')
  })

  it('vermeldt [uitgave] voor expense-budgetten', () => {
    const prompt = buildCategorizeSystemPrompt([budget('boodschappen', 'Boodschappen', null, 'expense')])
    expect(prompt).toContain('[uitgave]')
  })

  it('vermeldt [sparen] voor savings-budgetten', () => {
    const prompt = buildCategorizeSystemPrompt([budget('noodfonds', 'Noodfonds', null, 'savings')])
    expect(prompt).toContain('[sparen]')
  })

  it('vermeldt [schuld] voor debt-budgetten', () => {
    const prompt = buildCategorizeSystemPrompt([budget('lening', 'Persoonlijke lening', null, 'debt')])
    expect(prompt).toContain('[schuld]')
  })
})

// ── buildCategorizeSystemPrompt: top-level budget (geen parent) ───────────────

describe('buildCategorizeSystemPrompt — top-level budget', () => {
  it('bevat geen (onder "...") clause wanneer parentName null is', () => {
    const prompt = buildCategorizeSystemPrompt([
      budget('noodfonds', 'Noodfonds', null, 'savings'),
    ])
    // De promptregel moet de slug bevatten maar geen parenthesis-clausule
    const line = prompt.split('\n').find((l) => l.includes('noodfonds'))
    expect(line).toBeDefined()
    expect(line).not.toMatch(/\(onder/)
  })

  it('bevat de (onder "...") clause wanneer parentName aanwezig is', () => {
    const prompt = buildCategorizeSystemPrompt([
      budget('eten-thuis', 'Eten thuis', 'Huishouden'),
    ])
    const line = prompt.split('\n').find((l) => l.includes('eten-thuis'))
    expect(line).toContain('(onder "Huishouden")')
  })
})

// ── Snoeigrens op het LOKALE pad (taak 4) ─────────────────────────────────────
//
// Het budgetblok groeit lineair met het aantal leaf-budgetten en deelt op het
// lokale pad één venster van 8192 tokens met de transacties. De toelichtingen
// worden daarom bij een grote lijst ingekort en uiteindelijk weggelaten — de
// budgetREGELS zelf nooit (een weggelaten budget is niet meer kiesbaar).

describe('buildCategorizeSystemPrompt — snoeigrens lokaal pad', () => {
  const LANGE_TOELICHTING =
    'Alle dagelijkse supermarktuitgaven, inclusief drogisterij, huisdierbenodigdheden en incidentele bloemen'

  function lijst(n: number): CategorizeBudgetOption[] {
    return Array.from({ length: n }, (_, i) =>
      budget(`budget-${i}`, `Budget ${i}`, 'Huishouden', 'expense', LANGE_TOELICHTING),
    )
  }

  it('laat het CLOUD-pad ongemoeid, ook bij een zeer grote budgetlijst', () => {
    const groot = lijst(LOCAL_BUDGET_DESC_DROP_FROM + 10)
    // Default (geen opts) én expliciet lokaal:false moeten identiek zijn aan
    // wat de route altijd al bouwde: volledige toelichtingen.
    expect(buildCategorizeSystemPrompt(groot)).toContain(LANGE_TOELICHTING)
    expect(buildCategorizeSystemPrompt(groot, { lokaal: false })).toBe(buildCategorizeSystemPrompt(groot))
  })

  it('lokaal onder de drempel: toelichtingen blijven volledig', () => {
    const prompt = buildCategorizeSystemPrompt(lijst(LOCAL_BUDGET_DESC_TRIM_FROM), { lokaal: true })
    expect(prompt).toContain(LANGE_TOELICHTING)
  })

  it('lokaal boven de trim-drempel: toelichtingen ingekort, budgetregels intact', () => {
    const budgetten = lijst(LOCAL_BUDGET_DESC_TRIM_FROM + 1)
    const prompt = buildCategorizeSystemPrompt(budgetten, { lokaal: true })

    expect(prompt).not.toContain(LANGE_TOELICHTING)
    expect(prompt).toContain(LANGE_TOELICHTING.slice(0, 30)) // kop blijft
    expect(prompt).toContain('…')
    // Elk budget is nog steeds kiesbaar: slug, naam, hoofdbudget en type blijven.
    for (const b of budgetten) expect(prompt).toContain(b.slug)
    expect(prompt).toContain('(onder "Huishouden")')
    expect(prompt).toContain('[uitgave]')

    // Geen enkele toelichting langer dan de limiet (+ beletselteken).
    for (const line of prompt.split('\n').filter((l) => l.startsWith('- budget-'))) {
      const desc = line.split(' — ')[1] ?? ''
      expect(desc.length).toBeLessThanOrEqual(LOCAL_BUDGET_DESC_MAX_CHARS + 1)
    }
  })

  it('lokaal boven de drop-drempel: toelichtingen helemaal weg', () => {
    const budgetten = lijst(LOCAL_BUDGET_DESC_DROP_FROM + 1)
    const prompt = buildCategorizeSystemPrompt(budgetten, { lokaal: true })

    expect(prompt).not.toContain(LANGE_TOELICHTING.slice(0, 30))
    expect(prompt.split('\n').filter((l) => l.startsWith('- budget-')).every((l) => !l.includes(' — '))).toBe(true)
    for (const b of budgetten) expect(prompt).toContain(b.slug)
  })

  it('snoeien krimpt de prompt merkbaar bij een grote lijst', () => {
    const budgetten = lijst(200)
    const lokaal = buildCategorizeSystemPrompt(budgetten, { lokaal: true })
    const cloud = buildCategorizeSystemPrompt(budgetten)
    expect(lokaal.length).toBeLessThan(cloud.length * 0.6)
  })

  it('budgetten zonder toelichting veranderen niet door de snoeigrens', () => {
    const zonder = Array.from({ length: LOCAL_BUDGET_DESC_DROP_FROM + 5 }, (_, i) =>
      budget(`b-${i}`, `B ${i}`, null, 'expense', null),
    )
    expect(buildCategorizeSystemPrompt(zonder, { lokaal: true })).toBe(buildCategorizeSystemPrompt(zonder))
  })
})
