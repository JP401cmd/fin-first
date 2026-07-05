import { registerTests } from '../test-registry'
import { assertEqual, assertNotNull, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import { frequencyMatch, categorizeTransaction, type FrequencyMatch } from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'
import { buildBudgetOptions, resolveSlug, type BudgetRow } from '@/app/api/ai/categorize/budget-options'
import { buildCategorizeSystemPrompt } from '@/lib/ai/categorize-system-prompt'
import {
  runCombinedCategorization,
  type AutoCatContext,
  type CombinedAiBatchItem,
  type CombinedAiResult,
  type CombinedTx,
} from '@/lib/auto-categorize'

const CAT = 'kern.categorisatie'

function mockBudget(id: string, name: string, slug: string): Budget {
  return {
    id, name, slug, type: 'expense', parent_id: null, sort_order: 0,
    default_limit: '0', icon: null, color: null, is_income: false,
  } as unknown as Budget
}

function budgetRow(
  id: string,
  name: string,
  slug: string | null,
  budget_type = 'expense',
  parent_id: string | null = null,
  ownership: string | null = 'personal',
): BudgetRow {
  return { id, parent_id, name, slug, budget_type, description: null, ownership }
}

const tests: TestCase[] = [
  // ── Bugrapport-vergrendelingen: AI custom-budget categorisatie fix ────────
  {
    id: 'cat-ai-custom-leaf-in-validset', name: 'Custom leaf-slug in aangeboden set → id gevonden',
    category: CAT,
    description: 'Bug: custom "Eten thuis" (AH) gaf budget_id null omdat slug niet in template-whitelist stond',
    priority: 'critical', estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('p1', 'Huishouden', 'huishouden', 'expense', null),
        budgetRow('c1', 'Eten thuis', 'eten-thuis', 'expense', 'p1'),
      ]
      const { validSlugs, slugToId } = buildBudgetOptions(rows)
      const resolved = resolveSlug('eten-thuis', validSlugs)
      assertNotNull(resolved, 'slug geldig')
      assertEqual(resolved, 'eten-thuis', 'genormaliseerde slug')
      assertEqual(slugToId.get(resolved!), 'c1', 'budget_id gevonden')
    },
  },
  {
    id: 'cat-ai-slug-outside-set-returns-null', name: 'Slug buiten aangeboden set → null',
    category: CAT,
    description: 'Bug: template-slug zoals "uit-eten-horeca" buiten custom set → budget_id null (nette degradatie)',
    priority: 'critical', estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('c1', 'Eten buiten', 'eten-buiten', 'expense', 'p1'),
        budgetRow('c2', 'Bezorgd thuis', 'bezorgd-thuis', 'expense', 'p1'),
      ]
      const { validSlugs } = buildBudgetOptions(rows)
      // Thuisbezorgd-transactie: model retourneert oud template-slug
      const resolved = resolveSlug('uit-eten-horeca', validSlugs)
      assertEqual(resolved, null, 'template-slug buiten custom set → null')
    },
  },
  {
    id: 'cat-ai-parent-not-assignable', name: 'Parent-met-children is geen toewijsdoel',
    category: CAT,
    description: 'Bug: "Leuke dingen" (parent) mag niet als budget_slug worden gekozen — alleen leafs zijn geldig',
    priority: 'critical', estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('p3', 'Leuke dingen', 'leuke-dingen', 'expense', null),
        budgetRow('c4', 'Eten buiten', 'eten-buiten', 'expense', 'p3'),
        budgetRow('c5', 'Bezorgd thuis', 'bezorgd-thuis', 'expense', 'p3'),
      ]
      const { validSlugs } = buildBudgetOptions(rows)
      assertEqual(validSlugs.has('leuke-dingen'), false, 'parent niet in validSlugs')
      assertEqual(validSlugs.has('eten-buiten'), true, 'leaf wel in validSlugs')
      assertEqual(validSlugs.has('bezorgd-thuis'), true, 'leaf wel in validSlugs')
    },
  },
  {
    id: 'cat-ai-shared-wins-slug-collision', name: 'Shared wint bij slug-collisie',
    category: CAT,
    description: 'Bug: eigen personal-rij én gedeeld huishoudbudget met dezelfde slug — shared moet winnen',
    priority: 'high', estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('id-p', 'Boodschappen', 'boodschappen', 'expense', null, 'personal'),
        budgetRow('id-s', 'Boodschappen (gedeeld)', 'boodschappen', 'expense', null, 'shared'),
      ]
      const { slugToId } = buildBudgetOptions(rows)
      assertEqual(slugToId.get('boodschappen'), 'id-s', 'shared id wint')
    },
  },
  {
    id: 'cat-ai-income-budget-netto-salaris', name: 'Hernoemd income-budget netto-salaris opgenomen',
    category: CAT,
    description: 'Bug: hernoemd budget "Netto salaris" met slug netto-salaris gaf budget_id null',
    priority: 'critical', estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('inc1', 'Netto salaris', 'netto-salaris', 'income'),
      ]
      const { validSlugs, slugToId } = buildBudgetOptions(rows)
      const resolved = resolveSlug('netto-salaris', validSlugs)
      assertNotNull(resolved, 'slug geldig')
      assertEqual(slugToId.get('netto-salaris'), 'inc1', 'budget_id gevonden')
    },
  },
  {
    id: 'cat-ai-vattenfall-nutsvoorzieningen', name: 'Nutsvoorzieningen prompt bevat slug+parent',
    category: CAT,
    description: 'Bug: Vattenfall-transactie → custom "Nutsvoorzieningen" onder "Vaste lasten" — slug én parentName aanwezig in prompt',
    priority: 'high', estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('p2', 'Vaste lasten', 'vaste-lasten', 'expense', null),
        budgetRow('c2', 'Nutsvoorzieningen', 'nutsvoorzieningen', 'expense', 'p2'),
      ]
      const { options } = buildBudgetOptions(rows)
      const prompt = buildCategorizeSystemPrompt(options)
      assertNotNull(prompt.includes('nutsvoorzieningen') ? 'ok' : null, 'slug in prompt')
      assertNotNull(prompt.includes('"Vaste lasten"') ? 'ok' : null, 'parentName in prompt')
    },
  },
  {
    id: 'cat-freq-match', name: 'Frequentie match', category: CAT,
    description: 'frequencyMatch vindt bekende tegenpartijen',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const freqMap = new Map<string, FrequencyMatch>([
        ['name:albert heijn', { budget_id: 'b1', count: 15, total: 16, confidence: 0.94 }],
      ])
      const r = frequencyMatch('Albert Heijn Amsterdam', null, freqMap)
      assertNotNull(r, 'match gevonden')
      assertEqual(r!.budget_id, 'b1', 'budget_id')
      assertGreaterThanOrEqual(r!.confidence, 0.90, 'confidence')
    },
  },
  {
    id: 'cat-freq-no-match', name: 'Geen frequentie match', category: CAT,
    description: 'Onbekende tegenpartij retourneert null',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const freqMap = new Map<string, FrequencyMatch>()
      const r = frequencyMatch('Onbekend BV', null, freqMap)
      assertEqual(r, null, 'geen match')
    },
  },
  {
    id: 'cat-categorize', name: 'Categorisatie pipeline', category: CAT,
    description: 'categorizeTransaction matcht via frequentie of slug',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const budgets = [mockBudget('b1', 'Boodschappen', 'boodschappen')]
      const freqMap = new Map<string, FrequencyMatch>([
        ['name:albert heijn', { budget_id: 'b1', count: 15, total: 16, confidence: 0.94 }],
      ])
      const r = categorizeTransaction(
        'Albert Heijn',
        'Albert Heijn BV',
        -45.50,
        budgets as Budget[],
        undefined,
        undefined,
        null,
        freqMap,
      )
      assertNotNull(r, 'categorisatie resultaat')
    },
  },
  // ── Nieuwe vaste-lasten-slugs (fase C template-herziening) ────────────────
  {
    id: 'cat-ai-telefoon-internet-tv-prompt',
    name: 'Nieuwe slug telefoon-internet-tv verschijnt correct in categorisatie-prompt',
    category: CAT,
    description:
      'Fase C: telefoon-internet-tv is een leaf-slug onder vaste-lasten-wonen. ' +
      'buildBudgetOptions + buildCategorizeSystemPrompt moeten de slug én de parentName in de prompt zetten.',
    priority: 'high',
    estimatedDurationMs: 10,
    requiredRole: 'any',
    fn() {
      const rows: BudgetRow[] = [
        budgetRow('p-vaste', 'Vaste lasten wonen & energie', 'vaste-lasten-wonen', 'expense', null),
        budgetRow('c-tel', 'Telefoon, internet & tv', 'telefoon-internet-tv', 'expense', 'p-vaste'),
        budgetRow('c-abo', 'Abonnementen & contributies', 'abonnementen-contributies', 'expense', 'p-vaste'),
      ]
      const { validSlugs, slugToId, options } = buildBudgetOptions(rows)

      // Both slugs must be in the valid set (leafs, not parent)
      assertEqual(validSlugs.has('telefoon-internet-tv'), true, 'telefoon-internet-tv in validSlugs')
      assertEqual(validSlugs.has('abonnementen-contributies'), true, 'abonnementen-contributies in validSlugs')
      // Parent not assignable
      assertEqual(validSlugs.has('vaste-lasten-wonen'), false, 'parent niet in validSlugs')
      // IDs resolve correctly
      assertEqual(slugToId.get('telefoon-internet-tv'), 'c-tel', 'budget_id telefoon-internet-tv')
      assertEqual(slugToId.get('abonnementen-contributies'), 'c-abo', 'budget_id abonnementen-contributies')

      // Prompt includes both slugs and the parent name for context
      const prompt = buildCategorizeSystemPrompt(options)
      assertNotNull(prompt.includes('telefoon-internet-tv') ? 'ok' : null, 'telefoon-internet-tv in prompt')
      assertNotNull(prompt.includes('abonnementen-contributies') ? 'ok' : null, 'abonnementen-contributies in prompt')
      assertNotNull(prompt.includes('"Vaste lasten wonen') ? 'ok' : null, 'parentName in prompt')
    },
  },
  // ── Combined pass: regels → AI → propagatie (Notion-kaart jul 2026) ────────
  {
    id: 'cat-combined-psp-propagatie',
    name: 'Combined pass propageert AI-oordeel over PSP-ruis heen',
    category: CAT,
    description:
      '"CCV*BAKKER 12", "Bakker" en "ZETTLE_*Bakker" zijn één genormaliseerde tegenpartij: ' +
      'precies 1 AI-call, de rest afgeleid — met correct bron-label per voorstel.',
    priority: 'critical',
    estimatedDurationMs: 20,
    requiredRole: 'any',
    async fn() {
      const ctx = combinedCtx()
      let aiCalls = 0
      const resolver = async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
        aiCalls++
        return batch.map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.9, reasoning: 'bakker' }))
      }
      const txs: CombinedTx[] = [
        combinedTx('p1', 'CCV*BAKKER 12'),
        combinedTx('p2', 'Bakker'),
        combinedTx('p3', 'ZETTLE_*Bakker'),
      ]
      const r = await runCombinedCategorization(txs, ctx, resolver)
      assertEqual(aiCalls, 1, 'één AI-call voor één genormaliseerde tegenpartij')
      assertEqual(r.counts.ai, 1, 'één AI-voorstel (representant)')
      assertEqual(r.counts.propagated, 2, 'twee afgeleide voorstellen')
      assertEqual(r.proposals.get('p1')!.source, 'ai', 'bron-label representant = ai')
      assertEqual(r.proposals.get('p2')!.source, 'propagated', 'bron-label sibling = propagated')
    },
  },
  {
    id: 'cat-combined-transfer-uitsluiting',
    name: 'Combined pass houdt eigen-rekening-transfers uit de AI-batch',
    category: CAT,
    description:
      'Een tegenpartij-IBAN in de eigen-IBAN-set wordt een transfer-VOORSTEL (review, niet stil) ' +
      'en bereikt de AI-resolver nooit.',
    priority: 'critical',
    estimatedDurationMs: 20,
    requiredRole: 'any',
    async fn() {
      const ctx = combinedCtx()
      const sentIds: string[] = []
      const resolver = async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
        sentIds.push(...batch.map((b) => b.id))
        return batch.map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.8 }))
      }
      const txs: CombinedTx[] = [
        combinedTx('tr1', null, -100, 'NL00OWN0000000000'),
        combinedTx('u1', 'Onbekend BV', -10),
      ]
      const r = await runCombinedCategorization(txs, ctx, resolver)
      assertEqual(sentIds.includes('tr1'), false, 'transfer niet in AI-batch')
      const tr = r.proposals.get('tr1')!
      assertEqual(tr.source, 'transfer', 'bron-label = transfer')
      assertEqual(tr.isTransfer, true, 'isTransfer-vlag gezet')
      assertEqual(tr.category_source, 'transfer', 'category_source = transfer')
    },
  },
  {
    id: 'cat-combined-geen-dubbel-toewijzing',
    name: 'Combined pass geeft elke transactie hooguit één voorstel',
    category: CAT,
    description:
      'Regel-hit + AI-ronde + propagatie mogen elkaar nooit overschrijven: per transactie ' +
      'precies één voorstel, regel-hits gaan nooit alsnog naar de AI.',
    priority: 'high',
    estimatedDurationMs: 20,
    requiredRole: 'any',
    async fn() {
      const ctx = combinedCtx()
      const sentIds: string[] = []
      const resolver = async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
        sentIds.push(...batch.map((b) => b.id))
        return batch.map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.8 }))
      }
      const txs: CombinedTx[] = [
        combinedTx('r1', 'Albert Heijn'), // trefwoordregel → nooit naar AI
        combinedTx('u1', 'Qwerty'),
        combinedTx('u2', 'Qwerty'),
      ]
      const r = await runCombinedCategorization(txs, ctx, resolver)
      assertEqual(sentIds.includes('r1'), false, 'regel-hit niet in AI-batch')
      assertEqual(sentIds.length, 1, 'één representant voor Qwerty')
      assertEqual(r.proposals.size, 3, 'drie voorstellen, elk precies één')
      assertEqual(r.proposals.get('r1')!.source, 'rule', 'regel-hit behoudt bron rule')
      assertEqual(r.counts.unresolved, 0, 'niets onbehandeld')
    },
  },
]

// Helpers voor de combined-pass-cases hierboven.
function combinedTx(id: string, counterparty: string | null, amount = -10, iban: string | null = null): CombinedTx {
  return { id, description: `betaling ${id}`, counterparty_name: counterparty, counterparty_iban: iban, amount }
}

function combinedCtx(): AutoCatContext {
  return {
    budgets: [mockBudget('food', 'Boodschappen', 'boodschappen')],
    corrections: [],
    freqMap: new Map<string, FrequencyMatch>(),
    ownIbans: new Set(['NL00OWN0000000000']),
    ownNamePatterns: [],
    eigenRekeningBudgetId: 'eigen',
  }
}

export function register(): void {
  registerTests(tests)
}
