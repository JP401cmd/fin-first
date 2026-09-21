import { registerCategory, registerTests } from '../test-registry'
import {
  validateModules,
  getActiveNavModules,
  ALL_MODULES,
  PERSONA_MODULE_PRESETS,
} from '@/lib/module-registry'
import type { ModuleId, PersonaId } from '@/lib/module-registry'
import { isWidgetVisible } from '@/lib/compute-module-access'
import { isNewsOnly, resolveActiveModules } from '@/lib/modules/resolve'
import { homeHrefFor, resolveHomeHref } from '@/lib/home-screen'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'modules'

const tests: TestCase[] = [
  // ── Validatie: lege en ongeldige module sets ──────────────────────────────

  {
    id: 'mod-validate-empty',
    name: 'Lege modules array is ongeldig',
    description: 'Een lege modules array heeft geen basismodule en moet falen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = validateModules([])
      assertEqual(result.valid, false, 'empty modules valid')
      assert(result.errors.length > 0, 'empty modules must have errors')
    },
  },

  {
    id: 'mod-validate-dependency',
    name: 'aandelenregistratie zonder vermogensregistratie is ongeldig',
    description: 'aandelenregistratie heeft een harde afhankelijkheid op vermogensregistratie',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // aandelenregistratie requires vermogensregistratie (hard dependency)
      // but no base module is present either, so two errors expected
      const result = validateModules(['aandelenregistratie'])
      assertEqual(result.valid, false, 'aandelenregistratie without vermogensregistratie valid')
      // Must contain a dependency error mentioning vermogensregistratie
      const hasDependencyError = result.errors.some((e) =>
        e.toLowerCase().includes('vermogensregistratie'),
      )
      assert(hasDependencyError, 'error must reference vermogensregistratie dependency')
    },
  },

  {
    id: 'mod-validate-requires-one-of',
    name: 'inzicht_acties zonder basismodule is ongeldig, met budgetteren geldig',
    description: 'inzicht_acties vereist budgetteren of vermogensregistratie (requiresOneOf)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Without any base module: must be invalid (both base-module rule AND requiresOneOf)
      const withoutBase = validateModules(['inzicht_acties'])
      assertEqual(withoutBase.valid, false, 'inzicht_acties alone valid')

      // With budgetteren: valid (satisfies both base-module rule and requiresOneOf)
      const withBudget = validateModules(['budgetteren', 'inzicht_acties'])
      assertEqual(withBudget.valid, true, 'inzicht_acties + budgetteren valid')
    },
  },

  {
    id: 'mod-validate-toekomstplannen-dep',
    name: 'toekomstplannen zonder basismodule ongeldig, met vermogensregistratie geldig',
    description: 'toekomstplannen vereist budgetteren of vermogensregistratie (requiresOneOf)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Without any base module: must be invalid
      const withoutBase = validateModules(['toekomstplannen'])
      assertEqual(withoutBase.valid, false, 'toekomstplannen alone valid')

      // With vermogensregistratie: valid
      const withAssets = validateModules(['vermogensregistratie', 'toekomstplannen'])
      assertEqual(withAssets.valid, true, 'toekomstplannen + vermogensregistratie valid')
    },
  },

  {
    id: 'mod-validate-valid-minimal',
    name: "['budgetteren'] is een geldige module set",
    description: 'Een array met alleen budgetteren voldoet aan de minimale vereiste',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = validateModules(['budgetteren'])
      assertEqual(result.valid, true, 'budgetteren alone valid')
      assertEqual(result.errors.length, 0, 'budgetteren alone errors')
    },
  },

  {
    id: 'mod-validate-valid-full',
    name: 'ALL_MODULES is een geldige module set',
    description: 'De volledige module set moet altijd de validatieregels doorstaan',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = validateModules(ALL_MODULES)
      assertEqual(result.valid, true, 'ALL_MODULES valid')
      assertEqual(result.errors.length, 0, 'ALL_MODULES errors')
    },
  },

  // ── Navigatie modules ─────────────────────────────────────────────────────

  {
    id: 'mod-nav-only-budget',
    name: "getActiveNavModules(['budgetteren']) geeft alleen ['kern']",
    description: 'Alleen budgetteren actief → alleen kern navigatietab zichtbaar',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const nav = getActiveNavModules(['budgetteren'])
      assertEqual(nav.length, 1, 'nav length for budgetteren only')
      assertEqual(nav[0], 'kern', 'nav[0] for budgetteren only')
    },
  },

  {
    id: 'mod-nav-all',
    name: 'getActiveNavModules(ALL_MODULES) geeft alle drie tabs',
    description: 'Met alle modules actief zijn kern, wil en horizon zichtbaar',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const nav = getActiveNavModules(ALL_MODULES)
      // Must include all three nav tabs in canonical order
      assert(nav.includes('kern'), 'ALL_MODULES nav includes kern')
      assert(nav.includes('wil'), 'ALL_MODULES nav includes wil')
      assert(nav.includes('horizon'), 'ALL_MODULES nav includes horizon')
      assertEqual(nav.length, 3, 'ALL_MODULES nav length')
      // Canonical order: kern, wil, horizon
      assertEqual(nav[0], 'kern', 'nav order: first is kern')
      assertEqual(nav[1], 'wil', 'nav order: second is wil')
      assertEqual(nav[2], 'horizon', 'nav order: third is horizon')
    },
  },

  {
    id: 'mod-nav-no-wil',
    name: 'Zonder inzicht_acties is er geen wil-tab',
    description: 'inzicht_acties is de enige module met navModule wil',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // budgetteren + vermogensregistratie together, but no inzicht_acties
      const nav = getActiveNavModules(['budgetteren', 'vermogensregistratie'])
      assert(!nav.includes('wil'), 'no wil tab without inzicht_acties')
    },
  },

  // ── Startpagina routing ──────────────────────────────────────────────────

  // De landingsroute weegt moduleset én homescherm-keuze samen:
  // `resolveHomeHref` in lib/home-screen.ts (Krant 2A, vervangt getHomePath).
  // Alleen 'nieuws' → /nieuws (productgrens wint van voorkeur); elke andere set
  // volgt `home_screen`. De oude IA (/core, /will, /berichten) en de
  // inzicht_acties-prioriteit bestaan niet meer (canonieke routes: lib/nav-config.ts).
  {
    id: 'mod-home-budget',
    name: "resolveHomeHref(['budgetteren']) === '/overzicht'",
    description: 'Alleen budgetteren actief, geen homescherm-keuze → startpagina is /overzicht',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const path = resolveHomeHref({ active_modules: ['budgetteren'] })
      assertEqual(path, '/overzicht', 'home path for budgetteren')
    },
  },

  {
    id: 'mod-home-assets',
    name: "resolveHomeHref(['vermogensregistratie']) === '/overzicht'",
    description: 'Alleen vermogensregistratie actief, geen homescherm-keuze → startpagina is /overzicht',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const path = resolveHomeHref({ active_modules: ['vermogensregistratie'] })
      assertEqual(path, '/overzicht', 'home path for vermogensregistratie')
    },
  },

  {
    id: 'mod-home-dashboard',
    name: 'resolveHomeHref met inzicht_acties === /overzicht',
    description: 'inzicht_acties heeft geen aparte startpagina meer (/will bestaat niet meer, ADR 0001) — landt op /overzicht zoals elke andere combinatie',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const withInzicht: ModuleId[] = ['budgetteren', 'inzicht_acties']
      assertEqual(resolveHomeHref({ active_modules: withInzicht }), '/overzicht', 'home path with inzicht_acties')

      const withAssets: ModuleId[] = ['vermogensregistratie', 'inzicht_acties']
      assertEqual(resolveHomeHref({ active_modules: withAssets }), '/overzicht', 'home path with inzicht_acties + assets')
    },
  },

  {
    id: 'mod-home-news-only',
    name: "resolveHomeHref(['nieuws']) === '/nieuws', ook tegen home_screen in",
    description: 'Alleen nieuws actief → startpagina is /nieuws, ongeacht een (stale) homescherm-keuze; elke andere set volgt de keuze',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      assertEqual(resolveHomeHref({ active_modules: ['nieuws'] }), '/nieuws', 'home path for news-only')
      // De productgrens wint van de voorkeur.
      assertEqual(
        resolveHomeHref({ active_modules: ['nieuws'], home_screen: 'budget' }),
        '/nieuws',
        'news-only wins over home_screen=budget',
      )

      // nieuws naast een andere module is géén Krant-account.
      const withInzicht: ModuleId[] = ['nieuws', 'budgetteren', 'inzicht_acties']
      assertEqual(resolveHomeHref({ active_modules: withInzicht }), '/overzicht', 'nieuws + inzicht_acties routes to /overzicht')
      const withBudget: ModuleId[] = ['nieuws', 'budgetteren']
      assertEqual(
        resolveHomeHref({ active_modules: withBudget, home_screen: 'budget' }),
        '/overzicht/budget',
        'nieuws + budgetteren volgt home_screen',
      )
    },
  },

  // ── Gedragsbehoud voor bestaande profielen (poort K1, Krant 2A) ──────────
  //
  // Productie op 21 sep 2026: 26 × alle zes modules, 3 × null, 0 × alleen
  // nieuws, 0 × andere subset. Vóór 2A las de shell de kolom niet
  // (`[...ALL_MODULES]`) en volgde de proxy alleen `home_screen`
  // (`homeHrefFor`). Deze cases bewijzen dat elke bestaande waarde exact
  // dezelfde uitkomst geeft als vóór de wijziging.
  {
    id: 'mod-resolve-existing-null',
    name: 'active_modules null → alle modules (zoals vóór 2A)',
    description: 'De 3 null-profielen op productie zien dezelfde moduleset als toen de shell de kolom negeerde',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      assertEqual(JSON.stringify(resolveActiveModules({ active_modules: null })), JSON.stringify(ALL_MODULES), 'null → ALL_MODULES')
      assertEqual(JSON.stringify(resolveActiveModules({})), JSON.stringify(ALL_MODULES), 'kolom afwezig → ALL_MODULES')
      assertEqual(JSON.stringify(resolveActiveModules(null)), JSON.stringify(ALL_MODULES), 'geen profielrij → ALL_MODULES')
    },
  },

  {
    id: 'mod-resolve-existing-all',
    name: 'active_modules = alle zes → alle modules, volgorde-onafhankelijk',
    description: 'De 26 profielen met alle zes modules zien dezelfde moduleset, ongeacht de volgorde in de DB',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      assertEqual(
        JSON.stringify(resolveActiveModules({ active_modules: [...ALL_MODULES] })),
        JSON.stringify(ALL_MODULES),
        'alle zes → ALL_MODULES',
      )
      assertEqual(
        JSON.stringify(resolveActiveModules({ active_modules: [...ALL_MODULES].reverse() })),
        JSON.stringify(ALL_MODULES),
        'alle zes omgekeerd → ALL_MODULES in catalogusvolgorde',
      )
    },
  },

  {
    id: 'mod-resolve-existing-home',
    name: 'Bestaande profielen landen op dezelfde home als vóór 2A',
    description: 'Voor null en alle zes modules is resolveHomeHref gelijk aan homeHrefFor(home_screen) — de proxy-uitkomst vóór de wijziging',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const moduleValues: unknown[] = [null, undefined, [...ALL_MODULES], [...ALL_MODULES].reverse()]
      const homeValues: unknown[] = [null, undefined, 'overzicht', 'budget', 'onbekend']
      for (const active_modules of moduleValues) {
        for (const home_screen of homeValues) {
          assertEqual(
            resolveHomeHref({ active_modules, home_screen }),
            homeHrefFor(home_screen),
            `home voor modules=${JSON.stringify(active_modules)} home_screen=${String(home_screen)}`,
          )
        }
      }
    },
  },

  {
    id: 'mod-resolve-fail-open',
    name: 'Lege of onbekende moduleset valt terug op alle modules',
    description: 'Een lege array of alleen onbekende ids maakt de shell nooit leeg (validateModules([]) is ongeldig, dus nooit een bewuste keuze)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      assertEqual(JSON.stringify(resolveActiveModules({ active_modules: [] })), JSON.stringify(ALL_MODULES), '[] → ALL_MODULES')
      assertEqual(JSON.stringify(resolveActiveModules({ active_modules: ['x', 42] })), JSON.stringify(ALL_MODULES), 'onbekend → ALL_MODULES')
      assertEqual(
        JSON.stringify(resolveActiveModules({ active_modules: ['nieuws', 'x'] })),
        JSON.stringify(['nieuws']),
        'onbekende id weggefilterd, bekende blijft',
      )
      assert(isNewsOnly(resolveActiveModules({ active_modules: ['nieuws'] })), "['nieuws'] is news-only")
      assert(!isNewsOnly(resolveActiveModules({ active_modules: null })), 'null is niet news-only')
    },
  },

  // ── Widget zichtbaarheid ─────────────────────────────────────────────────

  {
    id: 'mod-widget-hidden-module',
    name: 'Budget widget verborgen zonder budgetteren module',
    description: 'Widget budgetten vereist de budgetteren module; zonder die module is het verborgen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // vermogensregistratie active, but NOT budgetteren
      const result = isWidgetVisible('budgetten', ['vermogensregistratie'], [])
      assertEqual(result.visible, false, 'budgetten visible without budgetteren')
      assertEqual(result.reason, 'module_inactive', 'budgetten reason without budgetteren')
    },
  },

  {
    id: 'mod-widget-visible',
    name: 'Budget widget zichtbaar met budgetteren actief',
    description: 'Widget budgetten wordt zichtbaar wanneer de budgetteren module actief is',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // budgetteren active → budgetten widget must be visible
      // budgetten is not mapped to a paid feature, so tier check also passes
      const result = isWidgetVisible('budgetten', ['budgetteren'], [])
      assertEqual(result.visible, true, 'budgetten visible with budgetteren')
      assertEqual(result.reason, 'visible', 'budgetten reason with budgetteren')
    },
  },

  {
    id: 'mod-widget-tier-locked',
    name: 'AI widget verborgen zonder AI abonnement',
    description: 'Widget voorstellen vereist de ai subscription tier naast de inzicht_acties module',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // inzicht_acties module active, but subscriptions is empty (no 'ai' sub)
      const result = isWidgetVisible('voorstellen', ['budgetteren', 'inzicht_acties'], [])
      assertEqual(result.visible, false, 'voorstellen visible without ai subscription')
      assertEqual(result.reason, 'tier_locked', 'voorstellen reason without ai subscription')
    },
  },

  {
    id: 'mod-widget-foundation',
    name: 'Foundation widget meldingen altijd zichtbaar',
    description: 'Widgets die niet in WIDGET_MODULE_MAP staan zijn altijd zichtbaar, ongeacht modules',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // meldingen is a foundation widget — not in WIDGET_MODULE_MAP
      const noModules = isWidgetVisible('meldingen', [], [])
      assertEqual(noModules.visible, true, 'meldingen visible with no modules')
      assertEqual(noModules.reason, 'visible', 'meldingen reason with no modules')

      const withModules = isWidgetVisible('meldingen', ['budgetteren'], [])
      assertEqual(withModules.visible, true, 'meldingen visible with budgetteren')
    },
  },

  // ── Budget-only widget zichtbaarheid ────────────────────────────────────

  {
    id: 'mod-widget-netto-vermogen-hidden-budget-only',
    name: 'netto_vermogen widget verborgen bij budget-only',
    description: 'netto_vermogen vereist vermogensregistratie; bij alleen budgetteren is het verborgen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = isWidgetVisible('netto_vermogen', ['budgetteren'], [])
      assertEqual(result.visible, false, 'netto_vermogen visible with budget-only')
      assertEqual(result.reason, 'module_inactive', 'netto_vermogen reason with budget-only')
    },
  },

  {
    id: 'mod-widget-netto-vermogen-visible-with-vermogen',
    name: 'netto_vermogen widget zichtbaar met vermogensregistratie',
    description: 'netto_vermogen wordt zichtbaar wanneer vermogensregistratie actief is',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = isWidgetVisible('netto_vermogen', ['vermogensregistratie'], [])
      assertEqual(result.visible, true, 'netto_vermogen visible with vermogensregistratie')
    },
  },

  {
    id: 'mod-widget-schulden-hidden-budget-only',
    name: 'schulden widget verborgen bij budget-only',
    description: 'schulden vereist vermogensregistratie; bij alleen budgetteren is het verborgen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = isWidgetVisible('schulden', ['budgetteren'], [])
      assertEqual(result.visible, false, 'schulden visible with budget-only')
      assertEqual(result.reason, 'module_inactive', 'schulden reason with budget-only')
    },
  },

  {
    id: 'mod-widget-vrijheidsvoortgang-hidden-budget-only',
    name: 'vrijheidsvoortgang widget verborgen bij budget-only',
    description: 'vrijheidsvoortgang vereist toekomstplannen; bij alleen budgetteren is het verborgen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = isWidgetVisible('vrijheidsvoortgang', ['budgetteren'], [])
      assertEqual(result.visible, false, 'vrijheidsvoortgang visible with budget-only')
      assertEqual(result.reason, 'module_inactive', 'vrijheidsvoortgang reason with budget-only')
    },
  },

  {
    id: 'mod-widget-fire-visible-budget-toekomst',
    name: 'FIRE widgets zichtbaar met budget + toekomst',
    description: 'FIRE widgets verschijnen wanneer toekomstplannen actief is naast budgetteren',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const modules: ModuleId[] = ['budgetteren', 'toekomstplannen']
      const fire = isWidgetVisible('fire_prognose', modules, [])
      assertEqual(fire.visible, true, 'fire_prognose visible with budget+toekomst')
      const vrijheid = isWidgetVisible('vrijheidsvoortgang', modules, [])
      assertEqual(vrijheid.visible, true, 'vrijheidsvoortgang visible with budget+toekomst')
    },
  },

  {
    id: 'mod-widget-assets-visible-budget-vermogen',
    name: 'assets/schulden widgets zichtbaar met budget + vermogen',
    description: 'assets en schulden widgets verschijnen wanneer vermogensregistratie actief is',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const modules: ModuleId[] = ['budgetteren', 'vermogensregistratie']
      const assets = isWidgetVisible('assets', modules, [])
      assertEqual(assets.visible, true, 'assets visible with budget+vermogen')
      const nw = isWidgetVisible('netto_vermogen', modules, [])
      assertEqual(nw.visible, true, 'netto_vermogen visible with budget+vermogen')
      const schulden = isWidgetVisible('schulden', modules, [])
      assertEqual(schulden.visible, true, 'schulden visible with budget+vermogen')
    },
  },

  // ── Persona presets ──────────────────────────────────────────────────────

  {
    id: 'mod-persona-presets-valid',
    name: 'Alle 4 persona presets zijn geldige module sets',
    description: 'Elke persona preset moet de module validatieregels doorstaan',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const personas = Object.keys(PERSONA_MODULE_PRESETS) as PersonaId[]
      assertEqual(personas.length, 4, 'persona preset count')

      for (const personaId of personas) {
        const modules = PERSONA_MODULE_PRESETS[personaId]
        const result = validateModules(modules)
        assertEqual(
          result.valid,
          true,
          `persona ${personaId} modules valid (errors: ${result.errors.join(', ')})`,
        )
      }
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Module Access',
    description: 'Module-gebaseerde feature scheiding',
    testCount: 0,
  })
  registerTests(tests)
}
