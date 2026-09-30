/**
 * Gedeelde engine-checks voor de UAT-Krant-acceptatiecriteria (`krant.ts`).
 *
 * PURE, CLIENT-VEILIGE module — geen vitest/DOM-afhankelijkheden en GEEN
 * server-only imports — zodat dezelfde lijst checks kan draaien onder:
 *  1. `krant.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)`.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-krant.ts`),
 *     die in de browser draait — elke import hier moet client-bundelbaar zijn.
 *
 * Alle checks roepen de ÉCHTE beslisfuncties aan: `lib/modules/krant-grens.ts`
 * (de productgrens), `lib/nav-config.ts#navSurfaceFor` (navigatie per product),
 * `lib/home-screen.ts` (landing + kiesbaar/opslaanbaar), `lib/modules/resolve.ts`
 * (`PRODUCT_PRESETS`), de ⌘K-pagina-index en `buildActionItems` (⌘K-acties). Eén kleine mirror, met
 * bronverwijzing: `horizonAlertsApply = !isKrantProfile(profile)` uit
 * `app/api/notifications/route.ts` (die route is server-only en niet
 * importeerbaar; de beslissing zelf is de échte `isKrantProfile`).
 *
 * `forwardedRequest` (lib/supabase/proxy.ts, de pad-header) wordt hier bewust
 * NIET aangeroepen: die heeft `next/server` nodig en is dus niet
 * client-bundelbaar. Hij is gedekt door lib/supabase/proxy.pathname-header.test.ts.
 */

import { ALL_MODULES, validateModules, type ModuleId } from '@/lib/module-registry'
import { PRODUCT_PRESETS, resolveActiveModules } from '@/lib/modules/resolve'
import {
  KRANT_HOME_HREF,
  isKrantAccount,
  isKrantProfile,
  krantRedirect,
  receivesBriefing,
  shouldMountFin,
} from '@/lib/modules/krant-grens'
import {
  HOME_SCREEN_HREFS,
  HOME_SCREEN_PICKABLE,
  HOME_SCREEN_VALUES,
  resolveHomeHref,
} from '@/lib/home-screen'
import { globalNav, menuNav, navSurfaceFor } from '@/lib/nav-config'
import { filterPagesByModules, getAllPageItems } from '@/lib/command-palette/navigation-index'
import { buildActionItems, type ActionRunContext } from '@/lib/command-palette/actions'
import type { PerspectiveOption } from '@/lib/types/perspective'
import { KRANT_ONBOARDING_PAD } from '@/lib/krant/aanmelden-pad'
import { callbackBestemming, krantOnboardingToegangVoor, krantPresetToegestaan, onboardingPadVoor, productUitParam } from '@/lib/krant/aanmelden'
import { KRANT_ACCEPTANCE } from './krant'
import type { AcceptanceCriterion } from './types'

export interface KrantEngineCheck {
  /** 'WF-KRANT-NN' */
  workflow: string
  /** 'UAT-KRANT-NN' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte beslisfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in krant.ts en levert zijn `expected` — gooit als
 *  krant.ts niet meer in sync is, of het criterium geen 'exact' meer is. */
function expectedOf(workflow: string): string {
  const found: AcceptanceCriterion | undefined = KRANT_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — krant.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in krant.ts (kind=${found.assertion.kind}).`)
  }
  return String(found.assertion.expected)
}

const KRANT: readonly ModuleId[] = ['nieuws']
/** Een account zonder moduleset (`active_modules = null`) — zoals de helper hem oplost. */
const ZONDER_MODULES = resolveActiveModules({ active_modules: null })
/** Een subset die niet precies ['nieuws'] is. */
const SUBSET = resolveActiveModules({ active_modules: ['nieuws', 'budgetteren'] })

/** `null` als letterlijke tekst, zodat de actual-string leesbaar vergelijkt. */
const s = (v: unknown): string => (v === null ? 'null' : String(v))

/** Een ⌘K-actiecontext met drie perspectieven (zelfde vorm als in nav-checks.ts). */
function actionCtx(): ActionRunContext {
  const perspectives: PerspectiveOption[] = [
    { id: 'personal', label: 'Persoonlijk', description: 'Persoonlijk' },
    { id: 'household', label: 'Huishouden', description: 'Gezamenlijke cijfers' },
    { id: 'partner', label: 'Partner', description: 'Cijfers van je partner' },
  ]
  return {
    router: { push: () => {} },
    closePalette: () => {},
    togglePrivacy: () => {},
    privacyMasked: false,
    toggleDisplayMode: () => {},
    displayMode: 'full',
    toggleEuroView: () => {},
    euroView: 'nominal',
    toggleHomeScreen: () => {},
    homeScreen: 'overzicht',
    triggerPricesSync: () => {},
    currentPerspective: 'personal',
    availablePerspectives: perspectives,
    setPerspective: () => {},
  }
}

/** Mirror van `horizonAlertsApply` in app/api/notifications/route.ts (GET, blok horizon-meldingen). */
function horizonAlertsApply(profile: { active_modules?: unknown } | null): boolean {
  return !isKrantProfile(profile)
}

// ── Checks — één per 'exact'-workflow in KRANT_ACCEPTANCE ──────────────────

export const KRANT_ENGINE_CHECKS: KrantEngineCheck[] = [
  {
    workflow: 'WF-KRANT-01',
    scenarioId: 'UAT-KRANT-01',
    label: 'Landing (resolveHomeHref): de productgrens wint van de homescherm-voorkeur',
    run: () => {
      const expected = expectedOf('WF-KRANT-01')
      const krantHomeOverzicht = resolveHomeHref({ active_modules: ['nieuws'], home_screen: 'overzicht' })
      const krantHomeBudget = resolveHomeHref({ active_modules: ['nieuws'], home_screen: 'budget' })
      const krantHomeNieuws = resolveHomeHref({ active_modules: ['nieuws'], home_screen: 'nieuws' })
      const geheelHomeBudget = resolveHomeHref({ active_modules: [...ALL_MODULES], home_screen: 'budget' })
      const zonderModules = resolveHomeHref({ active_modules: null, home_screen: null })
      return {
        expected,
        actual: `krantHomeOverzicht=${krantHomeOverzicht}; krantHomeBudget=${krantHomeBudget}; krantHomeNieuws=${krantHomeNieuws}; geheelHomeBudget=${geheelHomeBudget}; zonderModules=${zonderModules}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-02',
    scenarioId: 'UAT-KRANT-02',
    label: 'Server-redirect (krantRedirect): paden buiten de grens en een ontbrekende pad-header → /nieuws',
    run: () => {
      const expected = expectedOf('WF-KRANT-02')
      const r = (p: string | null) => s(krantRedirect(p, KRANT, false))
      return {
        expected,
        actual: `overzicht=${r('/overzicht')}; toekomst=${r('/toekomst')}; mijn=${r('/mijn')}; mijnProfiel=${r('/mijn/profiel')}; berichten=${r('/berichten')}; rapportages=${r('/rapportages')}; nieuwsX=${r('/nieuwsX')}; zonderHeader=${r(null)}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-04',
    scenarioId: 'UAT-KRANT-04',
    label: 'Grensroutes (krantRedirect): geen redirect, geen lus, query/slash onschadelijk',
    run: () => {
      const expected = expectedOf('WF-KRANT-04')
      const r = (p: string) => s(krantRedirect(p, KRANT, false))
      return {
        expected,
        actual: `nieuws=${r(KRANT_HOME_HREF)}; nieuwsOnder=${r('/nieuws/archief')}; mijnAccount=${r('/mijn/account')}; mijnAccountSlash=${r('/mijn/account/')}; mijnNotificaties=${r('/mijn/notificaties')}; nieuwsMetQuery=${r('/nieuws?editie=3#top')}; nieuwsprofiel=${r('/mijn/nieuwsprofiel')}; krantMeer=${r('/krant/meer')}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-05',
    scenarioId: 'UAT-KRANT-05',
    label: 'Beheer (krantRedirect met isSuperadmin): open voor een superadmin, dicht voor een gewone gebruiker',
    run: () => {
      const expected = expectedOf('WF-KRANT-05')
      const superadminBeheer = s(krantRedirect('/beheer', KRANT, true))
      const superadminBeheerSub = s(krantRedirect('/beheer/uat', KRANT, true))
      const superadminBeheerX = s(krantRedirect('/beheerX', KRANT, true))
      const gebruikerBeheer = s(krantRedirect('/beheer', KRANT, false))
      return {
        expected,
        actual: `superadminBeheer=${superadminBeheer}; superadminBeheerSub=${superadminBeheerSub}; superadminBeheerX=${superadminBeheerX}; gebruikerBeheer=${gebruikerBeheer}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-06',
    scenarioId: 'UAT-KRANT-06',
    label: 'Zijbalk (navSurfaceFor): leeg hoofdmenu, Mijn → /mijn/account, in "overige" alleen de Krant',
    run: () => {
      const expected = expectedOf('WF-KRANT-06')
      const nav = navSurfaceFor(KRANT)
      // De "overige"-hrefs van de zijbalk (OVERIGE_BASE in components/app/shell/sidebar.tsx)
      // plus de hoofdroutes; de zijbalk filtert ze met precies deze isVisible.
      return {
        expected,
        actual: `isKrant=${nav.isKrant}; hoofdmenu=${nav.menu.length}; mijnHref=${nav.mijn.href}; krant=${nav.isVisible('/nieuws')}; tips=${nav.isVisible('/overzicht/tips')}; berichten=${nav.isVisible('/berichten')}; rapportages=${nav.isVisible('/rapportages')}; toekomst=${nav.isVisible('/toekomst')}; overzicht=${nav.isVisible('/overzicht')}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-07',
    scenarioId: 'UAT-KRANT-07',
    label: 'Nav-sheet, Mijn-tak en ⌘K-pagina\'s (navSurfaceFor + filterPagesByModules): alleen binnen de grens',
    run: () => {
      const expected = expectedOf('WF-KRANT-07')
      const nav = navSurfaceFor(KRANT)
      const overalBeschikbaar = nav.globalNav.map((i) => i.href ?? `action:${i.action}`).join(',')
      const vraagFin = nav.globalNav.some((i) => i.action === 'open-chat')
      const mijnOnderdelen = (nav.mijn.children ?? []).map((c) => c.href).join(',')
      const mijnHub = nav.isVisible('/mijn')
      // Dezelfde twee filters als components/command-palette/command-palette.tsx
      // (allPages): eerst op modules, dan op de grens. Beheer voor een superadmin
      // komt daar ná dit filter bij (getAdminPageItems) en hoort hier dus niet in.
      const paletPaginas = filterPagesByModules(getAllPageItems(), [...KRANT])
        .filter((p) => !p.href || nav.isVisible(p.href))
        .map((p) => p.href ?? '')
        .join(',')
      // Met drie beschikbare perspectieven, zodat een lekkende perspectief-actie zichtbaar wordt.
      const paletActies = buildActionItems(actionCtx(), KRANT)
        .map((a) => a.id)
        .join(',')
      return {
        expected,
        actual: `overalBeschikbaar=${overalBeschikbaar}; vraagFin=${vraagFin}; mijnOnderdelen=${mijnOnderdelen}; mijnHub=${mijnHub}; paletPaginas=${paletPaginas}; paletActies=${paletActies}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-09',
    scenarioId: 'UAT-KRANT-09',
    label: 'Briefingmail (receivesBriefing) en horizon-meldingen (isKrantProfile): niet voor een Krant-account',
    run: () => {
      const expected = expectedOf('WF-KRANT-09')
      const krant = { active_modules: ['nieuws'] }
      const geheel = { active_modules: [...ALL_MODULES] }
      return {
        expected,
        actual: `krantBriefing=${receivesBriefing(krant)}; zonderModulesBriefing=${receivesBriefing({ active_modules: null })}; geheelBriefing=${receivesBriefing(geheel)}; krantHorizonMeldingen=${horizonAlertsApply(krant)}; geheelHorizonMeldingen=${horizonAlertsApply(geheel)}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-11',
    scenarioId: 'UAT-KRANT-11',
    label: 'Productkeuze (PRODUCT_PRESETS) + kiesbaar vs. opslaanbaar homescherm (HOME_SCREEN_PICKABLE/VALUES)',
    run: () => {
      const expected = expectedOf('WF-KRANT-11')
      const { krant, geheel } = PRODUCT_PRESETS
      return {
        expected,
        actual: `krantModules=${krant.modules.join(',')}; krantHome=${krant.homeScreen}; geheelModules=${geheel.modules.length}; geheelHome=${geheel.homeScreen}; krantPresetGeldig=${validateModules([...krant.modules]).valid}; geheelPresetGeldig=${validateModules([...geheel.modules]).valid}; kiesbaar=${HOME_SCREEN_PICKABLE.join(',')}; opslaanbaar=${HOME_SCREEN_VALUES.join(',')}; nieuwsHref=${HOME_SCREEN_HREFS.nieuws}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-12',
    scenarioId: 'UAT-KRANT-12',
    label: 'Regressie: null, alle zes en een subset zien exact het gedrag van vóór Krant 2B',
    run: () => {
      const expected = expectedOf('WF-KRANT-12')
      const zonderModulesRedirect = s(krantRedirect('/overzicht', ZONDER_MODULES, false))
      const alleZesRedirect = s(krantRedirect('/toekomst', ALL_MODULES, false))
      const subsetRedirect = s(krantRedirect('/overzicht/budget', SUBSET, false))
      const subsetIsKrant = isKrantAccount(SUBSET)
      // Identiteit, geen deep-equal: de Geheel-navigatie IS de oude lijst.
      const zonderModulesMenuOngewijzigd = navSurfaceFor(ZONDER_MODULES).menu === menuNav
      const alleZesGlobalNavOngewijzigd = navSurfaceFor(ALL_MODULES).globalNav === globalNav
      const alleZesMijnHref = navSurfaceFor(ALL_MODULES).mijn.href
      const alleZesActies = buildActionItems(actionCtx(), ALL_MODULES).map((a) => a.id)
      const alleZesPerspectiefActies = alleZesActies.filter((id) => id.startsWith('action:perspective-')).length
      const alleZesHomeschermActie = alleZesActies.includes('action:toggle-home-screen')
      return {
        expected,
        actual: `zonderModulesRedirect=${zonderModulesRedirect}; alleZesRedirect=${alleZesRedirect}; subsetRedirect=${subsetRedirect}; subsetIsKrant=${subsetIsKrant}; zonderModulesMenuOngewijzigd=${zonderModulesMenuOngewijzigd}; alleZesGlobalNavOngewijzigd=${alleZesGlobalNavOngewijzigd}; alleZesMijnHref=${alleZesMijnHref}; zonderModulesFin=${shouldMountFin(ZONDER_MODULES)}; alleZesFin=${shouldMountFin(ALL_MODULES)}; subsetFin=${shouldMountFin(SUBSET)}; alleZesBriefing=${receivesBriefing({ active_modules: [...ALL_MODULES] })}; alleZesPerspectiefActies=${alleZesPerspectiefActies}; alleZesHomeschermActie=${alleZesHomeschermActie}`,
      }
    },
  },
  // ── Krant 2C (ADR 0192) — beide vlagstanden als argument; de vlag zelf verandert niet ──
  {
    workflow: 'WF-KRANT-17',
    scenarioId: 'UAT-KRANT-17',
    label: 'Aanmelden via de Krant-ingang (krantPresetToegestaan, productUitParam, callbackBestemming)',
    run: () => {
      const expected = expectedOf('WF-KRANT-17')
      const p = (onboardingCompleted: boolean, inBeta: boolean) => krantPresetToegestaan({ onboardingCompleted, inBeta })
      return {
        expected,
        actual: `versBinnenBeta=${p(false, true)}; versBuitenBeta=${p(false, false)}; bestaandBinnenBeta=${p(true, true)}; bestaandBuitenBeta=${p(true, false)}; productKrant=${s(productUitParam('krant'))}; productOnbekend=${s(productUitParam('budget'))}; bestemmingGezet=${callbackBestemming(KRANT_ONBOARDING_PAD, true)}; bestemmingGeweigerd=${callbackBestemming(KRANT_ONBOARDING_PAD, false)}; bestemmingAnders=${callbackBestemming('/overzicht', false)}`,
      }
    },
  },
  {
    workflow: 'WF-KRANT-20',
    scenarioId: 'UAT-KRANT-20',
    label: 'Achter de gesloten vlag (krantOnboardingToegangVoor, onboardingPadVoor)',
    run: () => {
      const expected = expectedOf('WF-KRANT-20')
      const krantVers = { active_modules: ['nieuws'], onboarding_completed: false }
      const t = (profiel: Parameters<typeof krantOnboardingToegangVoor>[0], inBeta: boolean) => krantOnboardingToegangVoor(profiel, inBeta)
      return {
        expected,
        actual: `dichtGewoon=${t(krantVers, false)}; dichtSuperadmin=${t(krantVers, true)}; openGewoon=${t(krantVers, true)}; openAfgerond=${t({ ...krantVers, onboarding_completed: true }, true)}; openGeheel=${t({ active_modules: [...ALL_MODULES], onboarding_completed: false }, true)}; padSuperadminKrant=${onboardingPadVoor({ role: 'superadmin', active_modules: ['nieuws'] })}; padGeheel=${onboardingPadVoor({ role: 'superadmin', active_modules: [...ALL_MODULES] })}`,
      }
    },
  },
]
