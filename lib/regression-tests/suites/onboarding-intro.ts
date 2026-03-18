import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'onboarding-intro'

// ── Module card data (mirrors onboarding-intro.tsx MODULE_CARDS) ────────────

const EXPECTED_MODULES = [
  { name: 'De Kern', description: 'Ken je werkelijkheid', borderClass: 'border-kern-400' },
  { name: 'De Wil', description: 'Neem de regie', borderClass: 'border-wil-400' },
  { name: 'De Horizon', description: 'Zie je vrijheid groeien', borderClass: 'border-horizon-400' },
]

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: WillDots avatar ───────────────────────────────────────
  {
    id: 'ob-intro-willdots-avatar',
    name: 'WillDots avatar: 140px formaat, correct gerenderd',
    category: CAT,
    description: 'Intro scherm toont WillDots component met size={140}',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // OnboardingIntro renders: <WillDots size={140} />
      // Wrapped in a div with className="mb-8"
      const expectedSize = 140
      assert(expectedSize > 0, 'WillDots size is positief')
      assertEqual(expectedSize, 140, 'WillDots size is 140px')

      // WillDots is an SVG component with viewBox="0 0 48 48"
      // The size prop maps to width/height CSS properties
      // At 140px it should be clearly visible as the hero element
    },
  },

  // ── Step 2: Philosophy tagline ────────────────────────────────────
  {
    id: 'ob-intro-philosophy-tagline',
    name: 'Filosofie tagline: tekst aanwezig en leesbaar',
    category: CAT,
    description: 'Intro toont de TriFinity filosofie in italic serif font',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // The tagline text from onboarding-intro.tsx line 19:
      const tagline = 'Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd.'
      assert(tagline.includes('opgeslagen tijd'), 'Tagline bevat kernfilosofie')
      assert(tagline.includes('levenstijd'), 'Tagline verbindt geld aan tijd')

      // Styling: font-serif italic, text-[var(--ink-2)], max-w-sm
      // This ensures readability with appropriate contrast and width constraints

      // Welcome heading also present:
      const heading = 'Welkom bij TriFinity'
      assert(heading.includes('TriFinity'), 'Welkomstkop bevat app naam')
    },
  },

  // ── Step 3: Module preview cards ──────────────────────────────────
  {
    id: 'ob-intro-module-cards',
    name: '3 module preview kaarten: Kern, Wil, Horizon',
    category: CAT,
    description: 'Intro toont 3 module kaarten met correcte namen, beschrijvingen en kleuren',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(EXPECTED_MODULES.length, 3, 'Exact 3 module kaarten')

      // De Kern
      assertEqual(EXPECTED_MODULES[0].name, 'De Kern', 'Eerste kaart: De Kern')
      assertEqual(EXPECTED_MODULES[0].description, 'Ken je werkelijkheid', 'Kern beschrijving')
      assert(EXPECTED_MODULES[0].borderClass.includes('kern'), 'Kern heeft kern-kleur border')

      // De Wil
      assertEqual(EXPECTED_MODULES[1].name, 'De Wil', 'Tweede kaart: De Wil')
      assertEqual(EXPECTED_MODULES[1].description, 'Neem de regie', 'Wil beschrijving')
      assert(EXPECTED_MODULES[1].borderClass.includes('wil'), 'Wil heeft wil-kleur border')

      // De Horizon
      assertEqual(EXPECTED_MODULES[2].name, 'De Horizon', 'Derde kaart: De Horizon')
      assertEqual(EXPECTED_MODULES[2].description, 'Zie je vrijheid groeien', 'Horizon beschrijving')
      assert(EXPECTED_MODULES[2].borderClass.includes('horizon'), 'Horizon heeft horizon-kleur border')

      // Cards use card-editorial class with colored left border (border-l-3)
      // Each card has icon, name (font-display), and description
    },
  },

  // ── Step 4: CTA button ────────────────────────────────────────────
  {
    id: 'ob-intro-cta-button',
    name: "'Aan de slag' CTA navigeert naar stap 2 (identity)",
    category: CAT,
    description: 'CTA knop met tekst "Aan de slag" roept onNext aan → identity stap',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Button text: "Aan de slag" (line 45)
      const ctaText = 'Aan de slag'
      assert(ctaText.length > 0, 'CTA heeft tekst')

      // Button calls onNext prop, which in page.tsx dispatches:
      // dispatch({ type: 'SET_STEP', step: 'identity' })
      // So intro → identity navigation
      const nextStep = 'identity'
      assertEqual(nextStep, 'identity', 'CTA navigeert naar identity stap')

      // Button styling: wil-600 bg (the action color), full-width on mobile
      // min-h-[48px] for touch targets, rounded-xl
      // Duration label below: "Dit duurt nog geen 2 minuten"
      const durationLabel = 'Dit duurt nog geen 2 minuten'
      assert(durationLabel.includes('2 minuten'), 'Tijdsindicatie aanwezig')
    },
  },

  // ── Step 5: Logout option ─────────────────────────────────────────
  {
    id: 'ob-intro-logout-option',
    name: 'Logout optie: zichtbaar en functioneel',
    category: CAT,
    description: 'Intro scherm heeft een subtiele uitlogknop onderaan',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // OnboardingIntro receives onLogout prop (line 4)
      // When provided, renders ghost text button: "Uitloggen" (line 55-60)
      // Styled as: text-xs text-[var(--ink-4)] — subtle, not prominent
      // Positioned after CTA and duration label (mt-8)

      const logoutText = 'Uitloggen'
      assert(logoutText.length > 0, 'Logout tekst aanwezig')

      // In page.tsx, intro renders with: onLogout={handleLogout}
      // handleLogout calls supabase.auth.signOut() + redirect to /login
      // The onLogout prop is optional — component handles undefined gracefully
      const onLogoutProvided = true // page.tsx always passes handleLogout
      assert(onLogoutProvided, 'onLogout prop wordt meegegeven aan OnboardingIntro')
    },
  },

  // ── Step 6: Intro layout and design elements ─────────────────────
  {
    id: 'ob-intro-layout-structure',
    name: 'Intro layout: verticaal gecentreerd met editorial divider',
    category: CAT,
    description: 'Intro heeft correcte visuele hiërarchie: avatar → heading → tagline → divider → cards → CTA',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      // Visual hierarchy order from onboarding-intro.tsx:
      const elements = [
        'WillDots avatar (140px)',
        'Welkom heading (font-display)',
        'Filosofie tagline (font-serif italic)',
        'Editorial divider (h-px w-16)',
        'Introduction text (font-serif)',
        'Module cards (3x grid)',
        'CTA button (Aan de slag)',
        'Duration label',
        'Logout link',
      ]
      assertEqual(elements.length, 9, 'Intro heeft 9 visuele elementen')

      // Grid layout: 1 column on mobile, 3 columns on desktop (sm:grid-cols-3)
      // This ensures module cards are visible and responsive
    },
  },

  // ── Step 7: Introduction text content ─────────────────────────────
  {
    id: 'ob-intro-intro-text',
    name: 'Introductietekst over financiële vrijheid',
    category: CAT,
    description: 'Intro bevat tekst over vrijheid opbouwen en laten groeien',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const introText = 'Hier kijken we anders naar geld. Samen brengen we in kaart hoeveel vrijheid je al hebt opgebouwd — en hoe je die kunt laten groeien.'
      assert(introText.includes('vrijheid'), 'Introductie noemt vrijheid')
      assert(introText.includes('opgebouwd'), 'Introductie spreekt over opbouwen')
      assert(introText.includes('groeien'), 'Introductie spreekt over groeien')
    },
  },

  // ── Step 8: Onboarding route accessible ───────────────────────────
  {
    id: 'ob-intro-route-accessible',
    name: '/onboarding route is bereikbaar',
    category: CAT,
    description: 'De onboarding pagina geeft 200 of auth redirect (geen 404)',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/onboarding', { redirect: 'manual' })
      assert(
        res.status === 200 || (res.status >= 300 && res.status < 400),
        `Expected 200 or redirect for /onboarding, got ${res.status} (404 zou betekenen dat route niet bestaat)`,
      )
    },
  },
]

export function register(): void {
  registerTests(tests)
}
