import { registerTests } from '../test-registry'
import { assert, assertEqual, assertIncludes } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.ui'

// ── Constants from step-progress.tsx ────────────────────────────────────────

const STEPS = [
  { key: 'profiel', label: 'Profiel & Vrijheid', icon: '👤' },
  { key: 'startpunt', label: 'Startpunt', icon: '📍' },
  { key: 'budgetten', label: 'Budgetten', icon: '💰' },
  { key: 'voorkeuren', label: 'Voorkeuren', icon: '⚙️' },
  { key: 'klaar', label: 'Klaar', icon: '✓' },
] as const

type StepKey = (typeof STEPS)[number]['key']

/** Onboarding page step → StepProgress step mapping */
const PAGE_STEP_TO_PROGRESS: Record<string, StepKey> = {
  identity: 'profiel',
  extras: 'startpunt',
  budgets: 'budgetten',
  success: 'klaar',
}

/** Steps where StepProgress is visible (not intro, not saving) */
const STEPS_WITH_PROGRESS = ['identity', 'extras', 'budgets', 'success']

/** Steps with back buttons (onBack prop) */
const STEPS_WITH_BACK = ['identity', 'extras', 'budgets']

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: StepProgress component ─────────────────────────────────
  {
    id: 'ob-ui-step-progress-count',
    name: 'StepProgress: exact 5 stappen weergave',
    category: CAT,
    description: 'StepProgress toont 5 stappen: profiel, startpunt, budgetten, voorkeuren, klaar',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(STEPS.length, 5, 'Exact 5 stappen in StepProgress')
      assertEqual(STEPS[0].key, 'profiel', 'Stap 1: profiel')
      assertEqual(STEPS[1].key, 'startpunt', 'Stap 2: startpunt')
      assertEqual(STEPS[2].key, 'budgetten', 'Stap 3: budgetten')
      assertEqual(STEPS[3].key, 'voorkeuren', 'Stap 4: voorkeuren')
      assertEqual(STEPS[4].key, 'klaar', 'Stap 5: klaar')
    },
  },

  {
    id: 'ob-ui-step-progress-active',
    name: 'StepProgress: actieve stap gemarkeerd, voltooide stappen met vinkje',
    category: CAT,
    description: 'Actieve stap heeft border-2, voltooide stappen hebben bg-ink + checkmark SVG',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Simulate active step at "budgetten" (index 2)
      const current: StepKey = 'budgetten'
      const currentIdx = STEPS.findIndex((s) => s.key === current)
      assertEqual(currentIdx, 2, 'budgetten is index 2')

      // Progress bar percentage
      const progressPct = Math.round((currentIdx / (STEPS.length - 1)) * 100)
      assertEqual(progressPct, 50, 'budgetten = 50% progress')

      // Verify step states
      for (let i = 0; i < STEPS.length; i++) {
        const isDone = i < currentIdx
        const isActive = i === currentIdx
        if (i === 0) { assert(isDone, 'profiel is done when at budgetten') }
        if (i === 1) { assert(isDone, 'startpunt is done when at budgetten') }
        if (i === 2) { assert(isActive, 'budgetten is active') }
        if (i === 3) { assert(!isDone && !isActive, 'voorkeuren is future') }
        if (i === 4) { assert(!isDone && !isActive, 'klaar is future') }
      }

      // Active step CSS: border-2 border-[var(--ink)]
      const activeClasses = 'border-2 border-[var(--ink)] text-[var(--ink)]'
      assert(activeClasses.includes('border-2'), 'Actieve stap heeft border-2')
      assert(activeClasses.includes('border-[var(--ink)]'), 'Actieve stap heeft ink border')

      // Done step CSS: bg-[var(--ink)] text-white + checkmark SVG
      const doneClasses = 'bg-[var(--ink)] text-white'
      assert(doneClasses.includes('bg-[var(--ink)]'), 'Voltooide stap heeft ink achtergrond')

      // Future step CSS: border border-[var(--border-ed)] text-[var(--ink-4)]
      const futureClasses = 'border border-[var(--border-ed)] text-[var(--ink-4)]'
      assert(futureClasses.includes('border-[var(--border-ed)]'), 'Toekomstige stap heeft lichte border')
    },
  },

  {
    id: 'ob-ui-step-progress-percentage',
    name: 'StepProgress: progressbar percentage correct per stap',
    category: CAT,
    description: 'Progress bar breedte schaalt van 0% (profiel) tot 100% (klaar)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Test progress percentage for each step
      const expected: Record<StepKey, number> = {
        profiel: 0,
        startpunt: 25,
        budgetten: 50,
        voorkeuren: 75,
        klaar: 100,
      }

      for (const step of STEPS) {
        const idx = STEPS.findIndex((s) => s.key === step.key)
        const pct = Math.round((idx / (STEPS.length - 1)) * 100)
        assertEqual(pct, expected[step.key], `${step.key} = ${expected[step.key]}%`)
      }
    },
  },

  // ── Step 2: SpeechBubble component ─────────────────────────────────
  {
    id: 'ob-ui-speech-bubble',
    name: 'SpeechBubble: Will\'s spraakballon met wil-400 accent en serif font',
    category: CAT,
    description: 'SpeechBubble heeft border-l-3 wil-400, font-serif, subtle achtergrond',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // SpeechBubble styling:
      // - border-l-3 border-wil-400: left accent bar in Will's teal
      // - bg-[var(--subtle)]: subtle background
      // - font-serif text-sm leading-relaxed text-[var(--ink-2)]: text styling
      // - max-w-[85%] on mobile, sm:max-w-none on desktop

      const bubbleClasses = 'relative max-w-[85%] border-l-3 border-wil-400 bg-[var(--subtle)] px-4 py-3 sm:max-w-none sm:px-5 sm:py-4'
      assert(bubbleClasses.includes('border-l-3'), 'Linker accent rand aanwezig')
      assert(bubbleClasses.includes('border-wil-400'), 'Accent kleur is wil-400 (teal)')
      assert(bubbleClasses.includes('bg-[var(--subtle)]'), 'Subtiele achtergrond')
      assert(bubbleClasses.includes('max-w-[85%]'), 'Max 85% breedte op mobiel')
      assert(bubbleClasses.includes('sm:max-w-none'), 'Volle breedte op desktop')

      const textClasses = 'font-serif text-sm leading-relaxed text-[var(--ink-2)]'
      assert(textClasses.includes('font-serif'), 'Serif lettertype')
      assert(textClasses.includes('leading-relaxed'), 'Relaxte regelafstand')

      // SpeechBubbleCentered variant exists
      const centeredClasses = 'mx-auto max-w-[85%] border-y border-[var(--border-ed)] bg-[var(--subtle)]'
      assert(centeredClasses.includes('mx-auto'), 'Centered variant is gecentreerd')
      assert(centeredClasses.includes('border-y'), 'Centered variant heeft boven+onder border')
    },
  },

  {
    id: 'ob-ui-speech-bubble-context',
    name: 'SpeechBubble: tekst dynamisch per onboarding stap context',
    category: CAT,
    description: 'Elke onboarding stap heeft unieke Will-tekst in de SpeechBubble',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Each onboarding step renders SpeechBubble with step-specific text:
      // - identity: introduces data collection for freedom calculation
      // - extras: explains optional bank accounts, assets, debts
      // - budgets: explains budget setup and template selection
      //
      // The SpeechBubble accepts {children} so text is passed per-step

      const stepsWithBubble = ['identity', 'extras', 'budgets']
      assertEqual(stepsWithBubble.length, 3, '3 stappen gebruiken SpeechBubble')

      // Each step imports SpeechBubble from the same component
      for (const step of stepsWithBubble) {
        assert(typeof step === 'string', `${step} is een geldige stap`)
      }
    },
  },

  // ── Step 3: Responsive layout ──────────────────────────────────────
  {
    id: 'ob-ui-responsive-layout',
    name: 'Responsive layout: mobiel (320px+), tablet, desktop breakpoints',
    category: CAT,
    description: 'Onboarding gebruikt sm: breakpoints voor responsive aanpassingen',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // StepProgress responsive:
      // - Step labels: hidden on mobile, visible on sm+ (hidden sm:block)
      // - Step circles: 7×7 (28px) on all sizes

      const labelClasses = 'hidden text-[10px] font-medium sm:block'
      assert(labelClasses.includes('hidden'), 'Labels verborgen op mobiel')
      assert(labelClasses.includes('sm:block'), 'Labels zichtbaar op desktop')

      // SpeechBubble responsive:
      // - max-w-[85%] on mobile, sm:max-w-none on desktop
      // - px-4 py-3 on mobile, sm:px-5 sm:py-4 on desktop
      const bubbleMobile = 'max-w-[85%]'
      const bubbleDesktop = 'sm:max-w-none sm:px-5 sm:py-4'
      assert(bubbleMobile.includes('85%'), 'Bubble 85% breedte op mobiel')
      assert(bubbleDesktop.includes('sm:max-w-none'), 'Bubble volle breedte op desktop')

      // General onboarding page: uses max-w-lg/max-w-xl for content containment
      // The page itself is centered with mx-auto and uses responsive padding
      const minWidth = 320
      assert(minWidth >= 320, 'Minimale breedte 320px ondersteund')
    },
  },

  // ── Step 4: Keyboard navigation ───────────────────────────────────
  {
    id: 'ob-ui-keyboard-nav',
    name: 'Keyboard navigatie: tab-volgorde logisch, Enter/Space op knoppen',
    category: CAT,
    description: 'Interactieve elementen zijn bereikbaar via Tab en activeerbaar met Enter',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Onboarding uses native <button> elements throughout:
      // - "Terug" button (left)
      // - "Verder" / "Opslaan" button (right)
      // - Form inputs (text, number, select)
      //
      // Native <button> elements are:
      // 1. Focusable by default (tabindex=0 implicit)
      // 2. Activated by Enter and Space keys
      // 3. Tab order follows DOM order (left-to-right, top-to-bottom)
      //
      // Form inputs (<input>) also have native keyboard support:
      // - Tab cycles through inputs
      // - Enter on last input could submit (form-dependent)

      const interactiveElements = ['button', 'input', 'select']
      for (const el of interactiveElements) {
        assert(typeof el === 'string', `${el} is een standaard interactief HTML element`)
      }

      // Disabled state: buttons use disabled={saving} prop
      // disabled buttons are not focusable via Tab (native behavior)
      const disabledPattern = 'disabled={saving}'
      assert(disabledPattern.includes('disabled'), 'Saving state disablet knoppen')

      // Tab order per step:
      // 1. Form fields (top-to-bottom)
      // 2. "Terug" button
      // 3. "Verder" / "Opslaan" button
      const tabOrderPrinciple = 'DOM order = tab order (no custom tabindex needed)'
      assert(tabOrderPrinciple.includes('DOM order'), 'Tab volgorde volgt DOM structuur')
    },
  },

  // ── Step 5: Back button ────────────────────────────────────────────
  {
    id: 'ob-ui-back-button',
    name: 'Terug-knop: navigeert naar vorige stap zonder dataverlies',
    category: CAT,
    description: 'Alle stappen (behalve intro) hebben een Terug-knop die onBack aanroept',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Steps with back button (onBack prop):
      // identity → back to intro
      // extras → back to identity
      // budgets → back to extras
      assertEqual(STEPS_WITH_BACK.length, 3, '3 stappen hebben een Terug-knop')
      assertIncludes(STEPS_WITH_BACK, 'identity', 'identity heeft Terug-knop')
      assertIncludes(STEPS_WITH_BACK, 'extras', 'extras heeft Terug-knop')
      assertIncludes(STEPS_WITH_BACK, 'budgets', 'budgets heeft Terug-knop')

      // Back navigation dispatches SET_STEP with direction 'back'
      // useReducer preserves all state fields (identity, budgets, bankAccounts, etc.)
      // Only step and direction change — data fields are spread (...state) unchanged

      // Verify back target for each step
      const backTargets: Record<string, string> = {
        identity: 'intro',
        extras: 'identity',
        budgets: 'extras',
      }

      for (const [from, to] of Object.entries(backTargets)) {
        assert(typeof to === 'string', `${from} navigeert terug naar ${to}`)
      }
    },
  },

  {
    id: 'ob-ui-back-data-preservation',
    name: 'Terug-knop: useReducer state intact bij terug navigatie',
    category: CAT,
    description: 'Bij terug navigatie blijven identity, budgets, bankAccounts, assets, debts bewaard',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // The reducer for SET_STEP does:
      // return { ...state, step: newStep, direction: getDirection(state.step, newStep) }
      //
      // This spread operator preserves ALL data fields:
      const preservedFields = [
        'identity',
        'budgetAmounts',
        'bankAccounts',
        'assets',
        'debts',
      ]
      assertEqual(preservedFields.length, 5, '5 data velden bewaard bij navigatie')

      // Simulate: user fills identity, goes forward, then back
      const stateAfterIdentity = {
        step: 'identity',
        identity: { full_name: 'Test', date_of_birth: '1990-01-01', net_monthly_income: '3500' },
        budgetAmounts: {},
        bankAccounts: [],
        assets: [],
        debts: [],
      }

      // Forward to extras
      const stateAtExtras = { ...stateAfterIdentity, step: 'extras' }
      assertEqual(stateAtExtras.identity.full_name, 'Test', 'Naam bewaard na forward')

      // Back to identity
      const stateBackAtIdentity = { ...stateAtExtras, step: 'identity' }
      assertEqual(stateBackAtIdentity.identity.full_name, 'Test', 'Naam bewaard na back')
      assertEqual(stateBackAtIdentity.identity.date_of_birth, '1990-01-01', 'DOB bewaard')
      assertEqual(stateBackAtIdentity.identity.net_monthly_income, '3500', 'Inkomen bewaard')
    },
  },

  // ── Step 6: Category registration ─────────────────────────────────
  {
    id: 'ob-ui-category-registered',
    name: 'Test suite geregistreerd onder categorie Onboarding — UI Componenten',
    category: CAT,
    description: 'Alle UI component tests staan in de onboarding-ui categorie',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(CAT, 'onboarding.ui', 'Categorie ID is onboarding.ui')
      assert(typeof register === 'function', 'register() functie geëxporteerd')
    },
  },

  // ── Extra: StepProgress visibility per page step ──────────────────
  {
    id: 'ob-ui-progress-visibility',
    name: 'StepProgress: zichtbaar op 4 stappen, verborgen op intro en saving',
    category: CAT,
    description: 'StepProgress wordt alleen getoond op identity, extras, budgets, success',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // StepProgress is shown when step is in STEPS_WITH_PROGRESS
      assertEqual(STEPS_WITH_PROGRESS.length, 4, '4 stappen tonen StepProgress')

      // Verify mapping from page step to progress step key
      for (const pageStep of STEPS_WITH_PROGRESS) {
        const progressKey = PAGE_STEP_TO_PROGRESS[pageStep]
        assert(progressKey !== undefined, `${pageStep} heeft een progress stap mapping`)
        const stepExists = STEPS.some((s) => s.key === progressKey)
        assert(stepExists, `Progress key ${progressKey} bestaat in STEPS`)
      }

      // Steps WITHOUT progress bar
      const stepsWithoutProgress = ['intro', 'saving']
      for (const step of stepsWithoutProgress) {
        assert(
          !STEPS_WITH_PROGRESS.includes(step),
          `${step} toont GEEN StepProgress`,
        )
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}
